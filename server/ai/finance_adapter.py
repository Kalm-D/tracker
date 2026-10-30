"""Bộ đọc cố định cho BCTC/PDF; không thực thi mã do model cung cấp."""
import contextlib
import io
import json
import re
import sys


def table_records(frame):
    """Giữ đủ chỉ tiêu của các kỳ gần nhất, hỗ trợ cả bảng dài và bảng rộng."""
    frame = frame.copy()
    frame.columns = [' | '.join(map(str, c)) if isinstance(c, tuple) else str(c) for c in frame.columns]
    quarterly = sorted([c for c in frame.columns if re.fullmatch(r'\d{4}-Q[1-4]', c)], reverse=True)
    if quarterly:
        metadata = [c for c in frame.columns if c not in quarterly]
        truncated = len(frame) > 200
        frame = frame[metadata + quarterly[:4]].head(200)
    elif 'period' in frame.columns and 'value' in frame.columns:
        periods = frame['period'].dropna().astype(str).drop_duplicates().sort_values(ascending=False).head(4)
        frame = frame[frame['period'].astype(str).isin(periods)]
        truncated = len(frame) > 200
        frame = frame.head(200)
    else:
        order = [c for name in ['yearreport', 'lengthreport'] for c in frame.columns if c.lower().split(' | ')[-1] == name]
        if order:
            frame = frame.sort_values(order, ascending=False)
        truncated = False
        frame = frame.head(4)
    return json.loads(frame.to_json(orient='records', date_format='iso')), truncated


def read_finance(ticker, factory=None):
    """Một bảng lỗi không xóa các bảng còn lại đã đọc thành công."""
    if factory is None:
        from vnstock import Finance
        factory = Finance
    finance = factory(source='VCI', symbol=ticker, period='quarter')
    tables, errors, truncated = {}, {}, {}
    for method in ['income_statement', 'balance_sheet', 'cash_flow', 'ratio']:
        try:
            frame = getattr(finance, method)()
            if frame is None or frame.empty:
                tables[method] = []
                errors[method] = 'Nguồn chưa trả dữ liệu cho bảng này.'
            else:
                tables[method], truncated[method] = table_records(frame)
        except Exception:
            tables[method] = []
            errors[method] = 'Bảng này chưa khả dụng theo nguồn hoặc quyền tài khoản; các bảng khác vẫn được giữ.'
    if not any(tables.values()):
        raise ValueError('Không có bảng tài chính khả dụng')
    periods = {name: sorted([key for key in rows[0] if re.fullmatch(r'\d{4}-Q[1-4]', key)], reverse=True) if rows else [] for name, rows in tables.items()}
    newest = max((value[0] for name, value in periods.items() if value and name != 'ratio'), default=None)
    ordinal = lambda value: int(value[:4]) * 4 + int(value[-1])
    stale = [name for name, value in periods.items() if value and newest and ordinal(newest) - ordinal(value[0]) > 4]
    for name in stale:
        errors[name] = 'Bảng này chỉ có kỳ ' + periods[name][0] + ', cũ hơn BCTC ' + newest + '; chỉ hiển thị lịch sử, không dùng cho định giá hiện tại.'
    return {'ticker': ticker, 'source': 'Vnstock / VCI', 'period': 'quarter', 'tables': tables,
            'tableErrors': errors, 'tablePeriods': periods, 'staleTables': stale, 'truncated': truncated, 'publicationDate': None,
            'pointInTimeVerified': False, 'unit': 'Giữ nguyên tên cột/đơn vị nguồn; chưa suy đoán hoặc quy đổi đơn vị.'}


def main(req):
    if req.get('type') == 'pdf':
        import base64
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(base64.b64decode(req['data'])))
        if reader.is_encrypted:
            raise ValueError('PDF được mã hóa')
        text = '\n'.join(page.extract_text() or '' for page in reader.pages[:30])
        return {'text': text[:40000], 'pages': len(reader.pages), 'pagesRead': min(30, len(reader.pages)),
                'truncated': len(reader.pages) > 30 or len(text) > 40000}
    ticker = req.get('ticker', '')
    if len(ticker) != 3 or not ticker.isalnum() or not ticker.isupper():
        raise ValueError('Mã không hợp lệ')
    return read_finance(ticker)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    try:
        req = json.loads(sys.stdin.read(12_000_000))
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            data = main(req)
        result = {'ok': True, 'data': data}
    except ModuleNotFoundError:
        result = {'ok': False, 'code': 'FINANCE_DEPENDENCY_MISSING', 'message': 'Máy chủ chưa cài đủ thư viện đọc BCTC/PDF. Cần sửa bước build backend.'}
    except BaseException:
        result = {'ok': False, 'code': 'FINANCE_SOURCE_UNAVAILABLE', 'message': 'Nguồn BCTC chưa trả dữ liệu khả dụng; cần kiểm tra quyền nguồn và kết nối. Tin tức và kỹ thuật vẫn sử dụng được.'}
    print(json.dumps(result, ensure_ascii=False, allow_nan=False))
