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


def load_sectors(force=False):
    cached = {}
    if CACHE.exists():
        try:
            cached = json.loads(CACHE.read_text(encoding='utf-8'))
            stamp = datetime.fromisoformat(cached['updatedAt'])
            if not force and datetime.now(timezone.utc) - stamp < timedelta(days=7):
                return cached['sectors']
        except (ValueError, KeyError, TypeError):
            cached = {}
    try:
        from vnstock import Listing
        sectors = build_map(Listing(source='VCI').symbols_by_industries())
        if len(sectors) < 500:
            raise ValueError('Bảng phân ngành trả về quá ít mã')
        # Giữ phân loại cũ cho các mã mà nguồn tạm thiếu.
        merged = {**cached.get('sectors', {}), **sectors}
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps({'source': 'Vnstock / VCI', 'classification': 'ICB cấp 3', 'updatedAt': datetime.now(timezone.utc).isoformat(), 'sectors': merged}, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f'Đã cập nhật phân ngành ICB cấp 3: {len(sectors)} mã từ nguồn VCI.')
        return merged
    except (Exception, SystemExit) as exc:
        if cached.get('sectors'):
            print(f'Nguồn ngành tạm lỗi; giữ bảng ngành cũ: {type(exc).__name__}')
            return cached['sectors']
        raise RuntimeError('Chưa lấy được bảng ngành và chưa có bản dự phòng') from exc


def enrich(payload, sectors):
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
    return payload


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    sectors = load_sectors(force=args.force)
    for path in [Path('public/data/market.json.gz'), Path('public/data/market.json')]:
        if not path.exists():
            continue
        raw = gzip.decompress(path.read_bytes()).decode('utf-8') if path.suffix == '.gz' else path.read_text(encoding='utf-8')
        payload = enrich(json.loads(raw), sectors)
        data = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        path.write_bytes(gzip.compress(data, mtime=0) if path.suffix == '.gz' else data)
        print(path, json.dumps(payload['meta'], ensure_ascii=False))


if __name__ == '__main__':
    main()
