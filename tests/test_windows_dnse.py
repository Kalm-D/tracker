"""Hồi quy khóa Windows: không plaintext, DPAPI đúng user và từ chối input thiếu."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('windows_dnse', Path(__file__).parents[1]/'tracker-tools/windows_dnse.py')
windows = importlib.util.module_from_spec(spec)
spec.loader.exec_module(windows)


class WindowsKeysTests(unittest.TestCase):
    def test_input_thieu_sai_loai_hoac_them_truong_bi_chan(self):
        for values in ({}, {'DNSE_API_KEY': 'fixture'}, dict.fromkeys(windows.FIELDS, None), {**dict.fromkeys(windows.FIELDS, 'fixture-value-valid-length'), 'extra': 'invalid'}):
            with self.assertRaises(ValueError):
                windows.validate(values)

    @unittest.skipUnless(os.name == 'nt', 'DPAPI chỉ chạy trên Windows')
    def test_dpapi_roundtrip_va_file_khong_chua_khoa_ro(self):
        values = {key: 'fixture-private-'+key for key in windows.FIELDS}
        raw = json.dumps(values).encode()
        encrypted = windows.crypt(raw)
        self.assertNotIn(b'fixture-private', encrypted)
        self.assertEqual(windows.crypt(encrypted, decrypt=True), raw)
        with tempfile.TemporaryDirectory() as folder, patch.object(windows, 'PRIVATE', Path(folder)), patch.object(windows, 'private_folder'), patch.object(windows, 'node_binary', return_value='fixture-node.exe'):
            pending = windows.save_pending(values)
            self.assertNotIn(b'fixture-private', pending.read_bytes())
            env = windows.environment(pending)
            self.assertEqual(env['DNSE_API_KEY'], values['DNSE_API_KEY'])
            text = subprocess.check_output([sys.executable, '-c', "print('Dữ liệu tiếng Việt')"], env=env, encoding='utf-8')
            self.assertEqual(text.strip(), 'Dữ liệu tiếng Việt')
            for field in windows.FIELDS:
                env.pop(field, None)

    @unittest.skipUnless(os.name == 'nt', 'DPAPI chỉ chạy trên Windows')
    def test_ciphertext_sai_bi_tu_choi_khong_tra_plaintext(self):
        with self.assertRaises(RuntimeError):
            windows.crypt(b'fixture-khong-phai-dpapi', decrypt=True)
