"""Phân ngành ICB cấp 3 cho dữ liệu dùng chung; không sửa giá và khối lượng."""
import argparse
import gzip
import json
import math
from datetime import datetime, timezone, timedelta
from pathlib import Path

UNKNOWN = 'Chưa phân loại'
CACHE = Path('public/data/sectors.json')


def valid_sector(value):
    return isinstance(value, str) and value.strip() not in ('', UNKNOWN, 'nan', 'None')


def build_map(frame):
    """Chỉ lấy một cấp phân ngành nhất quán, không trộn cấp ICB."""
    import pandas as pd
    required = {'symbol', 'icb_level', 'icb_name'}
    if not required.issubset(frame.columns):
        raise ValueError('Nguồn VCI đổi cấu trúc bảng ngành')
    rows = frame[pd.to_numeric(frame['icb_level'], errors='coerce').eq(3)].copy()
    rows = rows[rows['icb_name'].map(valid_sector)]
    rows['symbol'] = rows['symbol'].astype(str).str.strip().str.upper()
    return rows.drop_duplicates('symbol').set_index('symbol')['icb_name'].str.strip().to_dict()


def load_sectors(force=False, metadata=None):
    """Dùng cache ICB đã có với ngày nguồn thật trong giai đoạn đối chiếu DNSE."""
    cached = {}
    if CACHE.exists():
        try:
            cached = json.loads(CACHE.read_text(encoding='utf-8'))
            if not isinstance(cached.get('sectors'), dict):
                raise ValueError('Cache ngành thiếu bảng mã')
            stamp = datetime.fromisoformat(cached['updatedAt'])
            if stamp.tzinfo is None or stamp > datetime.now(timezone.utc):
                raise ValueError('Cache ngành có ngày không hợp lệ')
        except (ValueError, KeyError, TypeError):
            cached = {}
    available = bool(cached.get('sectors'))
    state = 'MISSING'
    if available:
        state = 'FRESH' if datetime.now(timezone.utc) - stamp < timedelta(days=7) else 'STALE'
    info = {'sectorSource': cached.get('source', 'UNKNOWN'),
            'sectorSourceUpdatedAt': cached.get('updatedAt'), 'sectorDataStatus': state,
            'sectorMissingReason': 'Chưa đối chiếu phân ngành DNSE với hợp đồng ICB cấp 3; mã thiếu giữ Chưa phân loại.'}
    if metadata is not None:
        metadata.update(info)
    print(f"Phân ngành cache: {state}; ngày nguồn {info['sectorSourceUpdatedAt'] or 'MISSING'}. " + info['sectorMissingReason'])
    if force:
        raise RuntimeError('R4 chưa có nguồn ICB mới đã kiểm chứng để force refresh.')
    return {ticker: name for ticker, name in cached.get('sectors', {}).items() if valid_sector(name)}


def enrich(payload, sectors, metadata=None):
    """Ghép ngành theo mã; volume vẫn là khối lượng của ngày trên mỗi dòng."""
    symbols = payload.get('symbols', [])
    if not symbols:
        raise ValueError('Snapshot không có danh sách mã')
    classified = missing = volume_rows = missing_volume = 0
    for item in symbols:
        ticker = str(item.get('ticker', '')).strip().upper()
        if item.get('exchange') == 'INDEX' or ticker.endswith('INDEX'):
            item['sector'] = 'Chỉ số'
        elif valid_sector(sectors.get(ticker)):
            item['sector'] = sectors[ticker]
            classified += 1
        elif valid_sector(item.get('sector')):
            classified += 1
        else:
            item['sector'] = UNKNOWN
            missing += 1
        for row in item.get('rows', []):
            if len(row) > 5 and isinstance(row[5], (int, float)) and math.isfinite(row[5]) and row[5] >= 0:
                volume_rows += 1
            else:
                missing_volume += 1
    payload.setdefault('meta', {}).update({'sectorClassification': 'ICB cấp 3', 'sectorSource': 'Vnstock / VCI', 'sectorEnrichedAt': datetime.now(timezone.utc).isoformat(), 'classifiedSymbols': classified, 'unclassifiedSymbols': missing, 'volumeUnit': 'cổ phiếu', 'volumeDescription': 'Khối lượng do nguồn giá trả về cho ngày tương ứng; không phải tỷ lệ volume.', 'validVolumeRows': volume_rows, 'missingVolumeRows': missing_volume})
    payload['meta'].update(metadata or {'sectorSource': 'UNKNOWN', 'sectorSourceUpdatedAt': None, 'sectorDataStatus': 'MISSING'})
    return payload


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--snapshot', action='append', help='Chỉ enrich file staging được chỉ định')
    args = parser.parse_args()
    metadata = {}
    sectors = load_sectors(force=args.force, metadata=metadata)
    for path in ([Path(p) for p in args.snapshot] if args.snapshot else [Path('public/data/market.json.gz'), Path('public/data/market.json')]):
        if not path.exists():
            continue
        raw = gzip.decompress(path.read_bytes()).decode('utf-8') if path.suffix == '.gz' else path.read_text(encoding='utf-8')
        payload = enrich(json.loads(raw), sectors, metadata)
        data = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        temp = path.with_name(path.name + '.tmp')
        temp.write_bytes(gzip.compress(data, mtime=0) if path.suffix == '.gz' else data)
        temp.replace(path)
        print(path, json.dumps(payload['meta'], ensure_ascii=False))


if __name__ == '__main__':
    main()
