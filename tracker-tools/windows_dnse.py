"""Khóa cục bộ được DPAPI bảo vệ theo tài khoản Windows; tiến trình chỉ đọc DNSE."""
import argparse
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT/'work/dnse-windows'
CONFIG = PRIVATE/'credentials.dpapi'
FIELDS = ('DNSE_API_KEY', 'DNSE_API_SECRET', 'SUPABASE_SERVICE_ROLE_KEY')


def node_binary():
    """Ưu tiên runtime ổn định đã có; không tự tải phần mềm mới."""
    cached = Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
    found = str(cached) if cached.is_file() else shutil.which('node')
    if not found:
        raise RuntimeError('WINDOWS_NODE_MISSING')
    return found


def validate(values):
    """Kiểm tra hợp đồng đầu vào, không ghi khóa hoặc nội dung khóa vào lỗi."""
    if set(values) != set(FIELDS) or any(not isinstance(values[k], str) or not values[k].strip() for k in FIELDS):
        raise ValueError('WINDOWS_KEYS_MISSING')
    if len(values['SUPABASE_SERVICE_ROLE_KEY']) < 20:
        raise ValueError('WINDOWS_STORAGE_KEY_INVALID')
    return {key: values[key].strip() for key in FIELDS}


def crypt(data, decrypt=False):
    """DPAPI CurrentUser, không dùng cờ cho phép tài khoản khác trên máy giải mã."""
    if os.name != 'nt':
        raise RuntimeError('WINDOWS_REQUIRED')
    class Blob(ctypes.Structure):
        _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_ubyte))]
    buffer = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)))
    destination = Blob()
    library = ctypes.WinDLL('crypt32', use_last_error=True)
    function = library.CryptUnprotectData if decrypt else library.CryptProtectData
    function.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    function.restype = wintypes.BOOL
    if not function(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(destination)):
        raise RuntimeError('WINDOWS_DPAPI_FAILED')
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.LocalFree.argtypes, kernel.LocalFree.restype = [ctypes.c_void_p], ctypes.c_void_p
    try:
        return ctypes.string_at(destination.data, destination.size)
    finally:
        kernel.LocalFree(destination.data)


def private_folder():
    """Chỉ hạn chế quyền trên thư mục do bộ cập nhật sở hữu, không sửa thư mục khác."""
    PRIVATE.mkdir(parents=True, exist_ok=True)
    if not PRIVATE.resolve().is_relative_to((ROOT/'work').resolve()):
        raise RuntimeError('WINDOWS_PRIVATE_PATH_INVALID')
    command = '[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value'
    sid = subprocess.check_output(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', command], text=True, creationflags=subprocess.CREATE_NO_WINDOW).strip()
    if not sid.startswith('S-1-'):
        raise RuntimeError('WINDOWS_IDENTITY_FAILED')
    subprocess.run(['icacls.exe', str(PRIVATE), '/inheritance:r', '/grant:r', '*'+sid+':(OI)(CI)F'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)


def save_pending(values):
    """Chỉ ghi ciphertext; bản khóa tốt được thay sau khi kiểm tra thật thành công."""
    values = validate(values)
    private_folder()
    fd, file = tempfile.mkstemp(prefix='credentials-', suffix='.pending', dir=PRIVATE)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(crypt(json.dumps(values).encode()))
    return Path(file)


def environment(config=CONFIG):
    """Giải mã ngay trước khi chạy; không chuyển giá trị khóa vào command line."""
    config = Path(config).resolve()
    if config.parent != PRIVATE.resolve() or config.suffix not in ('.dpapi', '.pending'):
        raise RuntimeError('WINDOWS_CONFIG_PATH_INVALID')
    values = validate(json.loads(crypt(config.read_bytes(), decrypt=True)))
    env = os.environ.copy()
    env.update(values)
    env['TRACKER_PYTHON'] = str(Path(sys.executable).with_name('python.exe'))
    env['TRACKER_NODE_BINARY'] = node_binary()
    env['PYTHONUTF8'] = '1'
    env['PYTHONIOENCODING'] = 'utf-8'
    return env


def execute(action, config=CONFIG):
    """Node chỉ xuất báo cáo an toàn; không lưu stdout/stderr thô của SDK."""
    env = environment(config)
    try:
        result = subprocess.run([node_binary(), str(ROOT/'tools/run-windows-dnse.cjs'), action], cwd=ROOT, env=env,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, encoding='utf-8',
                                creationflags=subprocess.CREATE_NO_WINDOW)
        return result.returncode, result.stdout
    finally:
        for field in FIELDS:
            env.pop(field, None)


def setup_gui():
    """Chủ máy tự nhập và lưu khóa; agent không điền hoặc đọc các ô nhập."""
    import threading
    import tkinter as tk
    from tkinter import ttk
    window = tk.Tk()
    window.title('Tracker - Cập nhật DNSE trên Windows')
    window.geometry('650x530')
    panel = ttk.Frame(window, padding=22)
    panel.pack(fill='both', expand=True)
    ttk.Label(panel, text='Cấu hình cập nhật giá cho iPhone', font=('', 15, 'bold')).pack(anchor='w')
    ttk.Label(panel, text='Nhập một lần trên máy này. Windows mã hóa khóa theo tài khoản của bạn.\nCác khóa trong GitHub không thể đọc ngược để chuyển về máy.', wraplength=600).pack(anchor='w', pady=12)
    entries = {}
    for key, label in zip(FIELDS, ('DNSE API Key', 'DNSE API Secret', 'Supabase service_role (cùng khóa đã lưu trên GitHub)')):
        ttk.Label(panel, text=label).pack(anchor='w')
        entry = ttk.Entry(panel, show='*', width=75)
        entry.pack(fill='x', pady=(4, 11))
        entries[key] = entry
    ttk.Label(panel, text='Lịch: 16:17, thứ Hai–Sáu, và kiểm tra bù khi đăng nhập Windows.\nMáy cần bật, đã đăng nhập và có mạng. Chỉ dùng kho private, không đưa khóa lên web.', wraplength=600).pack(anchor='w', pady=8)
    status = tk.StringVar(value='Bấm nút dưới sau khi nhập đủ ba khóa.')
    ttk.Label(panel, textvariable=status, wraplength=600).pack(anchor='w', pady=8)
    state = {'busy': False, 'result': None}

    def work(values):
        pending, stage = None, 'encrypt'
        try:
            pending = save_pending(values)
            stage = 'verify'
            code, _ = execute('--check', pending)
            if code:
                raise RuntimeError('WINDOWS_VERIFY_FAILED')
            os.replace(pending, CONFIG)
            pending = None
            stage = 'schedule'
            command = ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', str(ROOT/'tools/install-windows-dnse.ps1'), '-PythonPath', str(Path(sys.executable).with_name('pythonw.exe'))]
            subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
            subprocess.Popen([str(Path(sys.executable).with_name('pythonw.exe')), str(Path(__file__)), '--run'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
            state['result'] = True
            (PRIVATE/'setup-status.json').write_text(json.dumps({'configured': True, 'scheduleInstalled': True}), encoding='utf-8')
        except Exception as error:
            state['result'] = type(error).__name__
            if PRIVATE.is_dir():
                (PRIVATE/'setup-status.json').write_text(json.dumps({'configured': False, 'failedStage': stage, 'errorType': type(error).__name__}), encoding='utf-8')
        finally:
            if pending:
                pending.unlink(missing_ok=True)
            values.clear()

    def poll():
        if state['result'] is None:
            window.after(600, poll)
        elif state['result'] is True:
            status.set('Đã kiểm tra nguồn/kho riêng, lưu khóa và cài lịch. Đang tải danh mục. Có thể đóng cửa sổ và báo “Đã cấu hình Windows”.')
            for entry in entries.values():
                entry.delete(0, 'end')
            state['busy'] = False
        else:
            status.set('Chưa hoàn tất: kiểm tra lại ba khóa hoặc báo tôi kiểm tra quyền cài lịch. Khóa không xuất hiện trong log.')
            state['busy'] = False
            button.configure(state='normal')

    def configure():
        if state['busy']:
            return
        values = {key: entry.get() for key, entry in entries.items()}
        try:
            validate(values)
        except ValueError:
            status.set('Cần nhập đủ DNSE API Key, API Secret và Supabase service_role; không chọn anon.')
            return
        state.update(busy=True, result=None)
        button.configure(state='disabled')
        status.set('Đang kiểm tra DNSE và kho riêng; chờ khoảng một phút. Không đóng cửa sổ lúc này.')
        threading.Thread(target=work, args=(values,), daemon=True).start()
        window.after(600, poll)
    button = ttk.Button(panel, text='Kiểm tra, lưu khóa và bật cập nhật Windows', command=configure)
    button.pack(fill='x', pady=5)
    window.protocol('WM_DELETE_WINDOW', lambda: None if state['busy'] else window.destroy())
    window.mainloop()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--setup', action='store_true')
    parser.add_argument('--run', action='store_true')
    args = parser.parse_args()
    if args.setup:
        setup_gui()
        return 0
    if args.run:
        code, _ = execute('--run')
        return code
    return 2


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        raise SystemExit(1) from None
