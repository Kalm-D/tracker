"""Đọc nhóm đối chứng DNSE bằng khóa chỉ trong RAM; không ghi khóa vào báo cáo."""
import contextlib
from datetime import datetime, timedelta, timezone
import io
import json
import logging
import os
import shutil
from pathlib import Path
import time
import tracker_data_exporter as exporter


def main():
    """Giữ dữ liệu thử ngoài public và chỉ báo cáo độ phủ/phiên, không in phản hồi nguồn."""
    logging.disable(logging.CRITICAL)
    root = Path(__file__).resolve().parents[1]
    folder = root / 'work/dnse-private-probe' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')
    folder.mkdir(parents=True, exist_ok=True)
    report = {'source': 'DNSE', 'scope': 'five-symbol-private-probe', 'readOnly': True, 'ready': False, 'checks': []}
    try:
        if not os.environ.get('DNSE_API_KEY') or not os.environ.get('DNSE_API_SECRET'):
            raise ValueError('Thiếu khóa trong tiến trình.')
        node = Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
        binary = str(node) if node.is_file() else shutil.which('node')
        if not binary:
            raise RuntimeError('NODE_BINARY_MISSING')
        os.environ['TRACKER_NODE_BINARY'] = binary
        report['stage'] = 'calendar'
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            end = exporter.market_session()['expectedSession']
            start = (datetime.fromisoformat(end) - timedelta(days=636)).date().isoformat()
            report['stage'] = 'dnse_listing'
            universe = {item['ticker']: item for item in exporter.fetch_universe_from_vnstock('ALL', 'DNSE')}
            report.update(expectedSession=end, universeCount=len(universe))
            frames = []
            for ticker in ('VNINDEX', 'MBB', 'FPT', 'PVS', 'ACV'):
                report['stage'] = 'dnse_ohlcv_' + ticker
                time.sleep(3.6)
                raw = exporter.fetch_ohlcv_with_retry(ticker, start, end, 'DNSE', ticker == 'VNINDEX', 1, 70)
                frame = exporter.normalize_ohlcv_df(raw, ticker, 'INDEX' if ticker == 'VNINDEX' else universe[ticker]['exchange'], 'Chưa phân loại', 320)
                valid = len(frame) == 320 and frame['date'].iloc[-1] == end
                report['checks'].append({'ticker': ticker, 'rows': len(frame), 'lastDate': frame['date'].iloc[-1] if len(frame) else None, 'sameSession320': bool(valid)})
                frames.append(frame)
            exporter.import_pandas().concat(frames, ignore_index=True).to_csv(folder / 'market.csv', index=False, encoding='utf-8-sig')
            report['ready'] = all(item['sameSession320'] for item in report['checks'])
            report['stage'] = 'complete'
    except BaseException as error:
        report['error'] = exporter.safe_error(error)
    report['checkedAt'] = datetime.now(timezone.utc).isoformat()
    # Không tự coi 5 mã là đủ điều kiện bootstrap toàn danh mục.
    report['fullUniverseValidated'] = False
    destination = root.parents[1] / 'outputs/DNSE_PRIVATE_LIVE.json'
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return 0 if report['ready'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
