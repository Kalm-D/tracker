"""Fixed read-only Vnstock/PDF adapter. No model-supplied code is executed."""
import contextlib
import io
import json
import sys
sys.stdout.reconfigure(encoding="utf-8")

def main():
    req = json.loads(sys.stdin.read(12_000_000))
    if req.get('type') == 'pdf':
        import base64
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(base64.b64decode(req['data'])))
        if reader.is_encrypted:
            raise ValueError('PDF được mã hóa')
        text = '\n'.join(page.extract_text() or '' for page in reader.pages[:30])
        return {'text': text[:40000], 'pages': len(reader.pages), 'pagesRead': min(30, len(reader.pages)), 'truncated': len(reader.pages) > 30 or len(text) > 40000}
    ticker = req.get('ticker', '')
    if len(ticker) != 3 or not ticker.isalnum() or not ticker.isupper():
        raise ValueError('Mã không hợp lệ')
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        from vnstock import Finance
        finance = Finance(source='VCI', symbol=ticker, period='quarter')
        tables = {}
        for method in ['income_statement', 'balance_sheet', 'cash_flow', 'ratio']:
            frame = getattr(finance, method)()
            if frame is None or frame.empty:
                tables[method] = []
                continue
            frame = frame.head(4).copy()
            frame.columns = [' | '.join(map(str, c)) if isinstance(c, tuple) else str(c) for c in frame.columns]
            tables[method] = json.loads(frame.to_json(orient='records', date_format='iso'))
    if not any(tables.values()):
        raise ValueError('Nguồn không trả báo cáo tài chính')
    return {'ticker': ticker, 'source': 'Vnstock / VCI', 'period': 'quarter', 'tables': tables, 'publicationDate': None, 'pointInTimeVerified': False, 'unit': 'Giữ nguyên tên cột/đơn vị của nguồn, không tự chuyển đổi.'}

try:
    print(json.dumps({'ok': True, 'data': main()}, ensure_ascii=False, allow_nan=False))
except BaseException as exc:
    print(json.dumps({'ok': False, 'error': type(exc).__name__, 'message': 'Không đọc được nguồn. Kiểm tra thư viện, quyền nguồn và quota; không có số liệu thay thế.'}))
