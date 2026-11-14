"""Đóng gói staging, giữ provenance và cách ly OHLCV sai theo policy được duyệt."""
import argparse
import csv
import gzip
import json
import math
from datetime import date, datetime, timezone
from pathlib import Path


def number(value):
    """Không biến giá trị thiếu hoặc NaN thành số 0."""
    n = float(str(value).replace(',', ''))
    if not math.isfinite(n):
        raise ValueError('Số không hữu hạn')
    return n


def pack(input_path, source, kind='EOD', quarantine=False, export_quality=None):
    grouped, seen, invalid, providers = {}, set(), [], set()
    with Path(input_path).open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        required = {'ticker', 'date', 'open', 'high', 'low', 'close', 'volume', 'source_provider'}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError('CSV thiếu trường bắt buộc hoặc nguồn thực.')
        for raw in reader:
            ticker, day = raw['ticker'].strip().upper(), raw['date'].strip()
            date.fromisoformat(day)
            if not ticker or (ticker, day) in seen:
                raise ValueError('Mã trống hoặc trùng mã/phiên')
            seen.add((ticker, day))
            provider = raw['source_provider'].strip().upper()
            providers.add(provider)
            try:
                o, h, low, c, v = [number(raw[k]) for k in ['open', 'high', 'low', 'close', 'volume']]
                valid = low > 0 and v >= 0 and low <= min(o, c) and h >= max(o, c) and h >= low
            except (ValueError, TypeError):
                valid = False
            if not valid:
                if not quarantine:
                    raise ValueError('OHLCV không hợp lệ: ' + ticker + ' ' + day)
                invalid.append({'ticker': ticker, 'date': day, 'reason': 'INVALID_OHLCV', 'raw': raw})
                continue
            item = grouped.setdefault(ticker, {'ticker': ticker, 'exchange': raw.get('exchange') or 'UNKNOWN', 'sector': raw.get('sector') or 'Chưa phân loại', 'sourceProvider': provider, 'rows': []})
            if item['sourceProvider'] != provider:
                raise ValueError('Trộn provider trong cùng mã')
            item['rows'].append([day, o, h, low, c, v])
    symbols = [grouped[t] for t in sorted(grouped)]
    for s in symbols:
        s['rows'].sort(key=lambda r: r[0])
    if not symbols:
        raise ValueError('Không có dữ liệu hợp lệ')
    coverage = {'attempted': len(grouped), 'failedTickers': []}
    if export_quality:
        with Path(export_quality).open(encoding='utf-8-sig', newline='') as f:
            rows = list(csv.DictReader(f))
        coverage = {'attempted': len(rows), 'failedTickers': [r['ticker'] for r in rows if int(r.get('rows') or 0) == 0]}
    meta = {'schema': 'shared-market-v1', 'generatedAt': datetime.now(timezone.utc).isoformat(), 'asOf': max(r[0] for s in symbols for r in s['rows']), 'source': source, 'sourceProviders': sorted(providers), 'snapshotKind': kind, 'timezone': 'Asia/Ho_Chi_Minh', 'isDemo': False, 'symbolCount': len(symbols), 'rowCount': sum(len(s['rows']) for s in symbols), 'coverage': coverage, 'quarantinedRows': len(invalid), 'adjustmentMode': 'unknown', 'priceUnit': 'VND', 'volumeUnit': 'cổ phiếu'}
    return {'meta': meta, 'symbols': symbols}, invalid


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--source', default='Vnstock / KBS')
    parser.add_argument('--snapshot-kind', choices=['EOD', 'INTRADAY'], default='EOD')
    parser.add_argument('--quarantine-invalid', action='store_true')
    parser.add_argument('--quality-output')
    parser.add_argument('--export-quality')
    args = parser.parse_args()
    payload, invalid = pack(args.input, args.source, args.snapshot_kind, args.quarantine_invalid, args.export_quality)
    if invalid and not args.quality_output:
        raise ValueError('Cách ly dữ liệu cần --quality-output để giữ bằng chứng')
    raw = json.dumps(payload, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    temp = out.with_name(out.name + '.tmp')
    temp.write_bytes(gzip.compress(raw, mtime=0) if out.suffix == '.gz' else raw)
    temp.replace(out)
    if args.quality_output:
        q = Path(args.quality_output)
        q.parent.mkdir(parents=True, exist_ok=True)
        q.write_text(json.dumps({'quarantined': invalid, 'meta': payload['meta']}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(payload['meta'], ensure_ascii=True))


if __name__ == '__main__':
    main()
