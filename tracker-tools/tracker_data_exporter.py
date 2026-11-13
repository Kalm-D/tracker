#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tracker Data Exporter
-------------------------
Tạo file CSV lịch sử giá OHLCV để import vào Tracker v2.x.

Bản R4 dùng Vnstock 6 và nguồn DNSE tường minh để đối chiếu.
- Khóa nguồn được đọc từ cấu hình riêng tư của SDK.
- Nến cổ phiếu có đơn vị nghìn đồng; benchmark có đơn vị điểm.
- Bỏ nến chưa đóng và dừng khi danh mục nguồn không khả dụng.
- CSV và các phép tính đã nghiệm thu giữ hợp đồng hiện hành.

CSV xuất ra có cột chuẩn:
    ticker,exchange,sector,date,open,high,low,close,volume,value
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import os
import sys
import tempfile
import time
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple
from zoneinfo import ZoneInfo

DEFAULT_INDEXES = ["VNINDEX"]
EXCHANGE_ALLOWLIST = {"HOSE", "HNX", "UPCOM", "UPCoM"}
OHLCV_DATE_COLUMNS = ("date", "time", "tradingdate", "trading_date")


def eprint(*args: object) -> None:
    print(*args, file=sys.stderr)


def market_session(now=None):
    """Dùng nguyên lịch/cutoff Data Quality Layer, không sao chép ngưỡng vào Python."""
    binary = os.environ.get('TRACKER_NODE_BINARY') or shutil.which('node')
    if not binary:
        raise RuntimeError('R7 cần Node để dùng lịch Data Quality Layer đã nghiệm thu.')
    policy = Path(__file__).resolve().parents[1] / 'public/shared/data-quality.js'
    code = "const Q=require(process.argv[1]),now=new Date(process.argv[2]),c=Q.clock(now),a=Q.assess({asOf:c.expectedSession,isDemo:false,snapshotKind:'EOD'},now); if(a.reasonCodes.includes('CALENDAR_UNVERIFIED'))process.exit(2); console.log(JSON.stringify({expectedSession:c.expectedSession,calendarVersion:Q.CALENDAR.version}));"
    response = subprocess.run([binary, '-e', code, str(policy), (now or datetime.now(timezone.utc)).isoformat()], check=True, capture_output=True, text=True, timeout=10)
    return json.loads(response.stdout)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export OHLCV CSV cho Tracker")
    parser.add_argument("--sessions", type=int, default=320, help="Số phiên gần nhất muốn giữ trong CSV. Nên >= 252; mặc định 320.")
    parser.add_argument("--calendar-days", type=int, default=0, help="Số ngày lịch sử theo lịch dương để tải. 0 = tự ước lượng theo sessions.")
    parser.add_argument("--output", default=None, help="Đường dẫn CSV đầu ra; VCI chỉ ghi trong work/vci-personal.")
    parser.add_argument("--errors-output", default=None, help="File ghi các mã lỗi/không tải được.")
    parser.add_argument("--quality-output", default=None, help="File báo cáo ngày dữ liệu từng mã.")
    parser.add_argument("--symbols", default="", help="Danh sách mã cách nhau bằng dấu phẩy. Bỏ trống = tự lấy universe từ Vnstock.")
    parser.add_argument("--symbols-file", default="", help="File .txt/.csv chứa danh sách mã, mỗi dòng một mã hoặc cột ticker/symbol/code.")
    parser.add_argument("--exchange", default="ALL", choices=["ALL", "HOSE", "HNX", "UPCOM"], help="Chỉ tải một sàn: HOSE, HNX hoặc UPCOM. Mặc định ALL = toàn bộ.")
    parser.add_argument("--limit", type=int, default=0, help="Giới hạn số mã cổ phiếu để test. 0 = không giới hạn.")
    parser.add_argument("--sleep", type=float, default=3.6, help="Nghỉ giữa mỗi mã; đối chiếu giới hạn của tài khoản DNSE trước khi tải rộng.")
    parser.add_argument("--retries", type=int, default=20, help="Số lần thử lại khi gặp rate limit/lỗi tạm thời cho mỗi mã.")
    parser.add_argument("--retry-sleep", type=float, default=70.0, help="Số giây chờ khi gặp rate limit trước khi thử lại.")
    parser.add_argument("--save-every", type=int, default=5, help="Lưu file CSV tạm sau mỗi N mã tải thành công. 0 = chỉ lưu cuối cùng.")
    parser.add_argument("--resume", action="store_true", help="Nếu file output đã có dữ liệu, bỏ qua các mã đã tải để chạy tiếp.")
    parser.add_argument("--source", default="DNSE", choices=["DNSE", "VCI"], help="DNSE qua SDK 6 hoặc VCI trực tiếp để dùng cá nhân trên máy Owner.")
    parser.add_argument('--personal-universe', action='store_true', help='R7: chỉ tạo candidate toàn danh mục VCI trên máy Owner, không thay bản đang dùng.')
    parser.add_argument("--no-index", action="store_true", help="Không tải VNINDEX.")
    parser.add_argument("--min-rows", type=int, default=210, help="Số dòng tối thiểu/mã để coi là đủ dùng cho Tracker.")
    args = parser.parse_args()
    if args.personal_universe and args.source != 'VCI':
        parser.error('--personal-universe chỉ dùng nguồn VCI.')
    if args.personal_universe:
        folder = Path(__file__).resolve().parents[1] / 'work/vci-universe' / (market_session()['expectedSession'] + '-s' + str(args.sessions))
    else:
        folder = Path(__file__).resolve().parents[1] / 'work/vci-personal' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f') if args.source == 'VCI' else Path('data')
    args.output = args.output or str(folder / ('market.csv' if args.source == 'VCI' else 'tracker_prices_250_sessions.csv'))
    args.errors_output = args.errors_output or str(folder / 'export_errors.csv')
    args.quality_output = args.quality_output or str(folder / 'export_quality.csv')
    return args


def import_pandas():
    try:
        import pandas as pd  # type: ignore
        return pd
    except Exception as exc:  # pragma: no cover
        raise RuntimeError("Thiếu pandas. Hãy chạy: pip install pandas") from exc


def import_vnstock():
    try:
        import vnstock
        if not vnstock.__version__.startswith('6.'):
            raise RuntimeError('R4 cần Vnstock thế hệ 6 trong môi trường riêng.')
        return True
    except Exception as exc:  # pragma: no cover
        raise RuntimeError("Chưa có bộ SDK R4. Cài từ tracker-tools/requirements.txt trong venv riêng.") from exc


def normalize_ticker(value: object) -> str:
    return str(value or "").strip().upper()


def is_plain_stock_ticker(ticker: str) -> bool:
    """Chỉ giữ cổ phiếu cơ sở 3 ký tự chữ/số, loại chứng quyền/quỹ/phái sinh như CFPT2518, E1VFVN30."""
    return bool(re.fullmatch(r"[A-Z0-9]{3}", normalize_ticker(ticker)))


def normalize_exchange(value: object) -> str:
    text = str(value or "").strip().upper()
    if text in {"UPCOM", "UPCOMINDEX", "UPCO", "UPC"}:
        return "UPCOM"
    if text in {"HNX", "HASTC"}:
        return "HNX"
    if text in {"HOSE", "HSX", "HOCHIMINH", "HOSTC"}:
        return "HOSE"
    return text


def read_symbols_file(path: str) -> List[Dict[str, str]]:
    if not path:
        return []
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Không tìm thấy symbols-file: {path}")
    text = p.read_text(encoding="utf-8-sig")
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return []
    if "," in lines[0] and any(h.lower() in lines[0].lower() for h in ["ticker", "symbol", "code"]):
        pd = import_pandas()
        df = pd.read_csv(p)
        return normalize_universe_df(df)
    return [{"ticker": normalize_ticker(line.split(",")[0]), "exchange": "", "sector": ""} for line in lines]


def normalize_universe_df(df) -> List[Dict[str, str]]:
    cols = {str(c).lower().strip(): c for c in df.columns}
    ticker_col = first_existing(cols, ["ticker", "symbol", "code", "organ_code", "organCode"])
    exchange_col = first_existing(cols, ["exchange", "floor", "comgroupcode", "comGroupCode", "stock_exchange", "board"])
    sector_col = first_existing(cols, ["sector", "industry", "industry_name", "industryName", "icb_name", "icbName"])
    if ticker_col is None:
        return []
    items: List[Dict[str, str]] = []
    for _, row in df.iterrows():
        ticker = normalize_ticker(row.get(ticker_col, ""))
        if not ticker or not is_plain_stock_ticker(ticker):
            continue
        exchange = normalize_exchange(row.get(exchange_col, "") if exchange_col else "")
        sector = str(row.get(sector_col, "") if sector_col else "").strip()
        items.append({"ticker": ticker, "exchange": exchange, "sector": sector})
    seen = set()
    unique = []
    for item in items:
        if item["ticker"] not in seen:
            seen.add(item["ticker"])
            unique.append(item)
    return unique


def first_existing(cols: Dict[str, str], names: Iterable[str]) -> Optional[str]:
    lower_names = [n.lower() for n in names]
    for n in lower_names:
        if n in cols:
            return cols[n]
    # loose match
    for key, original in cols.items():
        if key in lower_names:
            return original
    return None


def get_universe(symbols_arg: str, symbols_file: str, limit: int, exchange_filter: str, source: str = 'DNSE') -> List[Dict[str, str]]:
    if symbols_arg.strip():
        items = [{"ticker": normalize_ticker(x), "exchange": "", "sector": ""} for x in symbols_arg.split(",") if normalize_ticker(x)]
    elif symbols_file:
        items = read_symbols_file(symbols_file)
    else:
        items = fetch_universe_from_vnstock(exchange_filter, source)
    if source == 'DNSE' and (symbols_arg.strip() or symbols_file):
        authoritative = {item['ticker']: item for item in fetch_universe_from_vnstock('ALL', source)}
        for item in items:
            listed = authoritative.get(item['ticker'])
            if listed is None:
                raise ValueError('Mã yêu cầu không có trong danh mục DNSE.')
            if item.get('exchange') and normalize_exchange(item['exchange']) != listed['exchange']:
                raise ValueError('Sàn trong file mã khác danh mục DNSE.')
            item['exchange'] = listed['exchange']
    if not items:
        raise RuntimeError('Universe trống; dừng tải để tránh công bố tập mã thiếu.')
    # Chỉ giữ cổ phiếu cơ sở có đúng 3 ký tự chữ/số; loại chứng quyền, ETF, quỹ, phái sinh.
    before_stock_only = len(items)
    items = [x for x in items if is_plain_stock_ticker(x.get("ticker", ""))]
    removed = before_stock_only - len(items)
    if removed:
        print(f"Stock-only filter: đã loại {removed} mã không phải cổ phiếu cơ sở 3 ký tự chữ/số.")
    # Loại index nếu lẫn trong danh sách cổ phiếu.
    items = [x for x in items if x["ticker"] not in {"VNINDEX", "VN30", "HNXINDEX", "UPCOMINDEX"}]
    exchange_filter = normalize_exchange(exchange_filter)
    if exchange_filter != "ALL":
        if source == 'DNSE':
            items = [item for item in items if item['exchange'] == exchange_filter]
            if not items:
                raise ValueError('Không có mã thuộc sàn yêu cầu trong danh mục DNSE.')
        with_exchange = [x for x in items if normalize_exchange(x.get("exchange", "")) == exchange_filter]
        # Nếu lấy universe từ file/symbol thủ công và không có cột exchange, không tự loại hết; chỉ gắn nhãn theo sàn người dùng chọn.
        if with_exchange:
            items = with_exchange
        else:
            for x in items:
                if not normalize_exchange(x.get("exchange", "")):
                    x["exchange"] = exchange_filter
    if limit and limit > 0:
        items = items[:limit]
    return items


def fetch_universe_from_vnstock(exchange_filter: str = "ALL", source: str = "DNSE") -> List[Dict[str, str]]:
    """Đọc danh mục DNSE một lần, không dùng danh sách mẫu khi nguồn lỗi."""
    import_vnstock()
    from vnstock import Reference
    if source.upper() != 'DNSE':
        raise ValueError('R4 chỉ đối chiếu nguồn DNSE.')
    exchange = normalize_exchange(exchange_filter)
    frame = Reference('dnse').equity.list(exchange=None if exchange == 'ALL' else exchange, compat='v6')
    items = normalize_universe_df(frame)
    if any(item['exchange'] not in {'HOSE', 'HNX', 'UPCOM'} for item in items):
        raise ValueError('Danh mục DNSE thiếu sàn xác thực; dừng để tránh gắn sàn theo suy đoán.')
    return items


def fetch_ohlcv(symbol: str, start: str, end: str, source: str, is_index: bool = False):
    """Lấy nến DNSE, giữ độ chính xác của nguồn và khai báo đơn vị tường minh."""
    import_vnstock()
    from vnstock import Market
    if source.upper() != 'DNSE':
        raise ValueError('R4 chỉ đối chiếu nguồn DNSE.')
    market = Market('dnse')
    asset = market.index(symbol) if is_index else market.equity(symbol)
    frame = asset.ohlcv(start=start, end=end, interval='1D', floating=None, compat='v6')
    if str(frame.attrs.get('source', '')).lower() != 'dnse':
        raise ValueError('SDK không xác nhận provenance DNSE.')
    if len(frame):
        dates = import_pandas().to_datetime(frame['time']).dt.strftime('%Y-%m-%d')
        if dates.isna().any() or dates.duplicated().any() or dates.lt(start).any() or dates.gt(end).any():
            raise ValueError('DNSE trả ngày thiếu, trùng hoặc ngoài cửa sổ yêu cầu.')
    frame.attrs['tracker_source'] = 'DNSE'
    frame.attrs['tracker_price_scale'] = 1 if is_index else 1000
    return frame


def sdk_quality_fields(pd, frame):
    """Tóm tắt ngày SDK trả về trước khi lọc OHLCV, không sửa DataFrame."""
    fields = {"source_provider": "", "sdk_last_date": ""}
    if frame is None or not len(frame):
        return fields

    provider = frame.attrs.get("tracker_source")
    if isinstance(provider, str) and provider != "UNKNOWN" and re.fullmatch(r"[A-Z][A-Z0-9_-]{0,15}", provider):
        fields["source_provider"] = provider
    if provider in {'DNSE', 'VCI'}:
        fields.update(sdk_profile=frame.attrs.get('sdk_profile', 'v6'), sdk_last_bar_partial=bool(frame.attrs.get('last_bar_partial')),
                      price_scale=frame.attrs.get('tracker_price_scale'))
        if provider == 'VCI':
            fields.update(price_unit=frame.attrs.get('price_unit'), adjustment_mode=frame.attrs.get('adjustment_mode'), rows_before_window=frame.attrs.get('rows_before_window', 0))

    cols = {str(column).lower().strip(): column for column in frame.columns}
    date_col = first_existing(cols, OHLCV_DATE_COLUMNS)
    if date_col is None:
        return fields
    try:
        dates = pd.to_datetime(frame[date_col]).dt.strftime("%Y-%m-%d").dropna()
        if not dates.empty:
            fields["sdk_last_date"] = dates.max()
    except (AttributeError, TypeError, ValueError, OverflowError):
        # Trình chuẩn hóa bên dưới vẫn quyết định có chấp nhận dữ liệu hay không.
        pass
    return fields


def normalize_ohlcv_df(df, symbol: str, exchange: str, sector: str, sessions: int):
    pd = import_pandas()
    if df is None or len(df) == 0:
        return pd.DataFrame()
    data = df.copy()
    if df.attrs.get('tracker_source') == 'DNSE' and df.attrs.get('last_bar_partial'):
        dates = pd.to_datetime(data['time'])
        data = data.loc[dates.ne(dates.max())]
    cols = {str(c).lower().strip(): c for c in data.columns}
    date_col = first_existing(cols, OHLCV_DATE_COLUMNS)
    open_col = first_existing(cols, ["open", "open_price", "o"])
    high_col = first_existing(cols, ["high", "high_price", "h"])
    low_col = first_existing(cols, ["low", "low_price", "l"])
    close_col = first_existing(cols, ["close", "close_price", "c", "price"])
    volume_col = first_existing(cols, ["volume", "match_volume", "vol", "total_volume"])
    value_col = first_existing(cols, ["value", "match_value", "trading_value", "total_value"])
    required = [date_col, open_col, high_col, low_col, close_col, volume_col]
    if any(c is None for c in required):
        raise ValueError(f"Thiếu cột OHLCV. Columns={list(data.columns)}")
    out = pd.DataFrame({
        "source_provider": df.attrs.get("tracker_source", "UNKNOWN"),
        "ticker": symbol,
        "exchange": exchange or "UNKNOWN",
        "sector": sector or "Chưa phân loại",
        "date": pd.to_datetime(data[date_col]).dt.strftime("%Y-%m-%d"),
        "open": pd.to_numeric(data[open_col], errors="coerce"),
        "high": pd.to_numeric(data[high_col], errors="coerce"),
        "low": pd.to_numeric(data[low_col], errors="coerce"),
        "close": pd.to_numeric(data[close_col], errors="coerce"),
        "volume": pd.to_numeric(data[volume_col], errors="coerce"),
    })
    # Chuẩn hóa đơn vị giá về VND/cp.
    # Một số nguồn dữ liệu Việt Nam/vnstock/VCI trả giá theo nghìn đồng/cp,
    # ví dụ FPT = 118 thay vì 118000. Nếu không nhân 1000, GTGD TB20 sẽ
    # bị thấp hơn 1000 lần và bộ lọc thanh khoản có thể về 0.
    median_close = out["close"].dropna().median()
    price_scale = df.attrs.get('tracker_price_scale')
    if price_scale is None:
        price_scale = 1000 if pd.notna(median_close) and 0 < float(median_close) < 1000 else 1
    if price_scale != 1:
        for col in ["open", "high", "low", "close"]:
            out[col] = out[col] * price_scale

    # Tính lại value bằng OHLC đã chuẩn hóa để tránh lệch đơn vị giữa value và close.
    out["value"] = out["close"] * out["volume"]
    out = out.dropna(subset=["date", "open", "high", "low", "close", "volume"])
    out = out.drop_duplicates(subset=["ticker", "date"]).sort_values("date")
    if sessions > 0 and len(out) > sessions:
        out = out.tail(sessions)
    return out



def is_rate_limit_message(text: str) -> bool:
    """Nhận diện lỗi rate limit từ Vnstock hoặc API bên dưới."""
    lowered = (text or "").lower()
    keywords = [
        "rate limit", "request limit", "too many requests", "maximum api request",
        "giới hạn", "gioi han", "đạt tối đa", "dat toi da", "wait to retry",
    ]
    return any(k in lowered for k in keywords)


def fetch_ohlcv_with_retry(symbol: str, start: str, end: str, source: str, is_index: bool, retries: int, retry_sleep: float):
    """Tải dữ liệu cho một mã, tự chờ nếu gặp rate limit.

    Một số phiên bản vnstock có thể dùng sys.exit khi bị rate limit. Vì vậy cần
    bắt SystemExit để script không chết giữa chừng.
    """
    last_error = None
    for attempt in range(1, max(1, retries + 1) + 1):
        try:
            return fetch_ohlcv(symbol, start, end, source, is_index=is_index)
        except KeyboardInterrupt:
            raise
        except BaseException as exc:  # bắt cả SystemExit từ thư viện bên dưới
            last_error = exc
            rate_limited = getattr(exc, 'retryable', False) or is_rate_limit_message(str(exc)) or isinstance(exc, SystemExit)
            if getattr(exc, 'kind', '') in {'credential', 'auth', 'input', 'policy', 'unsupported'}:
                raise
            if rate_limited and attempt <= retries:
                print(f"    Rate limit/lỗi tạm thời ở {symbol}. Chờ {int(retry_sleep)} giây rồi thử lại ({attempt}/{retries})...")
                time.sleep(retry_sleep)
                continue
            raise
    raise RuntimeError(f"Không tải được {symbol} sau {retries} lần thử. Lỗi cuối: {last_error}")


def safe_error(error):
    """Chỉ ghi loại và mã lỗi, giữ khóa/URL/header của SDK ngoài log và CSV."""
    code = getattr(error, 'code', '') or ''
    valid_code = isinstance(code, str) and re.fullmatch(r'[A-Z][A-Z0-9_]{0,80}', code)
    return type(error).__name__ + (f' ({code})' if valid_code else '')


def save_export_files(pd, frames, errors, quality, output: Path, errors_output: Path, quality_output: Path) -> None:
    """Lưu dữ liệu hiện có ra đĩa để không mất tiến độ nếu script dừng giữa chừng."""
    if frames:
        all_df = pd.concat(frames, ignore_index=True)
        all_df = all_df.drop_duplicates(subset=["ticker", "date"], keep="last").sort_values(["ticker", "date"])
        all_df.to_csv(output, index=False, encoding="utf-8-sig")
    pd.DataFrame(errors).to_csv(errors_output, index=False, encoding="utf-8-sig")
    pd.DataFrame(quality).drop_duplicates(subset=["ticker"], keep="last").to_csv(quality_output, index=False, encoding="utf-8-sig")

def run_vietcap(args) -> int:
    """Chỉ một lượt cập nhật danh mục cá nhân được chạy cùng lúc."""
    from vietcap_adapter import export_lock
    with export_lock(Path(__file__).resolve().parents[1] / 'work/vci-personal'):
        return _run_vietcap(args)


def _run_vietcap(args) -> int:
    """Xuất danh mục cá nhân; chỉ thay CSV đích khi toàn bộ tập yêu cầu đạt."""
    from vietcap_adapter import VietcapClient, closed_cutoff
    pd = import_pandas()
    local_root = (Path(__file__).resolve().parents[1] / 'work/vci-personal').resolve()
    paths = [Path(value).resolve() for value in (args.output, args.errors_output, args.quality_output)]
    if len(set(paths)) != 3 or any(not path.is_relative_to(local_root) for path in paths):
        raise ValueError('VCI chỉ ghi ba file riêng trong work/vci-personal, không ghi dữ liệu công khai.')
    if not (args.symbols or args.symbols_file) or args.resume:
        raise ValueError('VCI cần danh mục cá nhân --symbols/--symbols-file; dùng cache EOD thay --resume.')
    if args.symbols and args.symbols_file:
        raise ValueError('Chỉ chọn một cách nhập danh mục cá nhân.')
    if not 1 <= args.min_rows <= args.sessions <= 2000 or args.sleep < 0 or args.limit < 0 or args.calendar_days < 0:
        raise ValueError('Số phiên, số dòng tối thiểu hoặc nhịp đọc không hợp lệ.')
    requested = [{'ticker': normalize_ticker(t), 'exchange': '', 'sector': ''} for t in args.symbols.split(',') if t.strip()] if args.symbols else read_symbols_file(args.symbols_file)
    if not requested or any(not is_plain_stock_ticker(item['ticker']) for item in requested):
        raise ValueError('Danh mục cá nhân rỗng hoặc có mã không hợp lệ.')
    if len({item['ticker'] for item in requested}) != len(requested):
        raise ValueError('Danh mục cá nhân có mã trùng.')
    client = VietcapClient(cache_dir=local_root / 'cache', interval=max(3.6, args.sleep))
    authoritative = {item['ticker']: item for item in client.listings({item['ticker'] for item in requested})}
    universe = []
    for item in requested:
        source = authoritative.get(item['ticker'])
        if source is None or (item.get('exchange') and normalize_exchange(item['exchange']) != source['exchange']):
            raise ValueError('Mã hoặc sàn trong danh mục cá nhân không khớp danh mục VCI.')
        if args.exchange == 'ALL' or source['exchange'] == args.exchange:
            universe.append(source)
    if args.limit:
        universe = universe[:args.limit]
    if not universe:
        raise ValueError('Không có mã thuộc sàn được chọn.')
    from sector_data import load_sectors
    sector_map = load_sectors()
    tasks = ([] if args.no_index else [('VNINDEX', 'INDEX', 'Chỉ số', True)]) + [(item['ticker'], item['exchange'], sector_map.get(item['ticker'], 'Chưa phân loại'), False) for item in universe]
    end = closed_cutoff()
    start = (datetime.fromisoformat(end).date() - timedelta(days=args.calendar_days or int(args.sessions * 1.8 + 60))).isoformat()
    frames, quality = [], []
    for symbol, exchange, sector, is_index in tasks:
        started = datetime.now(timezone.utc).isoformat()
        raw = client.history(symbol, start, end, args.sessions, is_index)
        frame = normalize_ohlcv_df(raw, symbol, exchange, sector, args.sessions)
        if len(frame) < args.min_rows:
            raise ValueError('VCI thiếu số phiên tối thiểu; giữ nguyên CSV đích.')
        frames.append(frame)
        quality.append({'ticker': symbol, 'rows': len(frame), 'first_date': frame['date'].iloc[0], 'last_date': frame['date'].iloc[-1], 'status': 'ok',
            'fetch_started_utc': started, 'fetch_finished_utc': datetime.now(timezone.utc).isoformat(), 'requested_end': end, **sdk_quality_fields(pd, raw)})
        print(f"VCI {symbol}: {len(frame)} phiên, đến {frame['date'].iloc[-1]}")
    if len({entry['last_date'] for entry in quality}) != 1:
        raise ValueError('VCI khác ngày cuối giữa các mã; giữ nguyên CSV đích và báo chậm dữ liệu.')
    staged = []
    try:
        tables = [pd.concat(frames, ignore_index=True).sort_values(['ticker', 'date']), pd.DataFrame(columns=['ticker', 'issue', 'detail']), pd.DataFrame(quality)]
        for path, table in zip(paths, tables):
            path.parent.mkdir(parents=True, exist_ok=True)
            handle, name = tempfile.mkstemp(dir=path.parent, suffix='.tmp')
            os.close(handle)
            staged.append(Path(name))
            table.to_csv(name, index=False, encoding='utf-8-sig')
        # CSV giá được thay cuối cùng; lỗi tải/chuẩn hóa không chạm snapshot tốt.
        for index in (1, 2, 0):
            os.replace(staged[index], paths[index])
    finally:
        for path in staged:
            path.unlink(missing_ok=True)
    print(f'Dữ liệu cá nhân: {paths[0]}')
    print(f'HTTP: {client.http_calls}; cache: {client.cache_hits}. Tập con {len(universe)} cổ phiếu, không đại diện toàn thị trường.')
    return 0


def run_vietcap_universe(args) -> int:
    """Thu thập candidate có checkpoint; giữ mã thiếu phiên ngoài tập tính D2."""
    from vietcap_adapter import VietcapClient, closed_cutoff, export_lock, VietcapError
    pd = import_pandas()
    root = (Path(__file__).resolve().parents[1] / 'work/vci-universe').resolve()
    paths = [Path(p).resolve() for p in (args.output, args.errors_output, args.quality_output)]
    if len(set(paths)) != 3 or any(not p.is_relative_to(root) for p in paths):
        raise ValueError('R7 chỉ ghi candidate trong work/vci-universe.')
    if args.symbols or args.symbols_file or args.no_index or args.exchange != 'ALL' or args.limit < 0 or not 1 <= args.sessions <= 2000 or args.sleep < 0 or args.calendar_days < 0:
        raise ValueError('Chế độ toàn danh mục yêu cầu ALL, VNINDEX và cửa sổ hợp lệ.')
    folder = paths[0].parent
    folder.mkdir(parents=True, exist_ok=True)

    def atomic_json(path, value):
        handle, name = tempfile.mkstemp(dir=path.parent, suffix='.tmp')
        try:
            with os.fdopen(handle, 'w', encoding='utf-8') as file:
                json.dump(value, file, ensure_ascii=False, allow_nan=False)
            os.replace(name, path)
        finally:
            Path(name).unlink(missing_ok=True)

    with export_lock(Path(__file__).resolve().parents[1] / 'work/vci-personal'):
        session = market_session()
        end = session['expectedSession']
        client = VietcapClient(cache_dir=Path(__file__).resolve().parents[1] / 'work/vci-personal/cache', interval=max(3.6, args.sleep), session_cutoff=end)
        reference = client.reference()
        start = (datetime.fromisoformat(end).date() - timedelta(days=args.calendar_days or int(args.sessions * 1.8 + 60))).isoformat()
        reference_hash = hashlib.sha256(json.dumps(reference, sort_keys=True).encode()).hexdigest()
        context = {'source': 'VCI', 'requestedEnd': end, 'sessions': args.sessions, 'referenceHash': reference_hash, 'limit': args.limit, 'calendarVersion': session['calendarVersion']}
        manifest = folder / 'run.json'
        if manifest.exists() and json.loads(manifest.read_text(encoding='utf-8')).get('context') != context:
            raise ValueError('Checkpoint khác ngày, cửa sổ hoặc danh mục; chọn thư mục mới.')
        atomic_json(folder / 'reference.json', reference)
        active = reference['active'][:args.limit] if args.limit else reference['active']
        tasks = [('VNINDEX', 'INDEX', 'Chỉ số', True)] + [(item['ticker'], item['exchange'], 'Chưa phân loại', False) for item in active]
        frames, quality, errors = [], [], []
        benchmark_date, fatal = None, False
        for index, (symbol, exchange, sector, is_index) in enumerate(tasks, 1):
            q = {'ticker': symbol, 'rows': 0, 'first_date': '', 'last_date': '', 'status': 'missing', 'requested_end': end,
                'fetch_started_utc': datetime.now(timezone.utc).isoformat(), 'source_provider': '', 'error_code': ''}
            try:
                raw = client.history(symbol, start, end, args.sessions, is_index, clip_window=True)
                frame = normalize_ohlcv_df(raw, symbol, exchange, sector, args.sessions)
                if len(frame) != len(raw) or frame.empty:
                    raise VietcapError('VCI_NORMALIZATION_ROW_LOSS')
                if is_index:
                    benchmark_date = frame['date'].iloc[-1]
                frames.append(frame)
                q.update(sdk_quality_fields(pd, raw))
                q.update(rows=len(frame), first_date=frame['date'].iloc[0], last_date=frame['date'].iloc[-1],
                    status='ok' if frame['date'].iloc[-1] == benchmark_date else 'different_session',
                    history_status='requested_history_available' if len(frame) >= args.sessions else 'short_history')
            except (VietcapError, ValueError) as error:
                code = getattr(error, 'code', 'VCI_NORMALIZATION_FAILED')
                q.update(status='missing' if code == 'VCI_OHLCV_EMPTY' else 'delayed' if getattr(error, 'kind', '') == 'data_delay' else 'invalid' if getattr(error, 'kind', '') == 'invalid' else 'fetch_error', error_code=code)
                errors.append({'ticker': symbol, 'issue': q['status'], 'detail': code})
                fatal = is_index or getattr(error, 'kind', '') in {'policy', 'network', 'auth', 'credential'}
            finally:
                q['fetch_finished_utc'] = datetime.now(timezone.utc).isoformat()
            quality.append(q)
            progress = {'context': context, 'completed': index, 'total': len(tasks), 'rows': sum(len(frame) for frame in frames),
                'httpCalls': client.http_calls, 'cacheHits': client.cache_hits, 'errors': len(errors), 'complete': index == len(tasks) and not fatal,
                'updatedAt': datetime.now(timezone.utc).isoformat(), 'candidateOnly': True}
            atomic_json(manifest, progress)
            if index % 20 == 0 or fatal or q['status'] != 'ok' or index == len(tasks):
                print(f"R7 {index}/{len(tasks)} · {symbol} · {q['status']} · HTTP {client.http_calls} · cache {client.cache_hits}", flush=True)
            if fatal:
                break
        # Chỉ candidate riêng được ghi; không thay active hoặc snapshot R6 đã nghiệm thu.
        save_export_files(pd, frames, errors, quality, paths[0], paths[1], paths[2])
        print(f'R7 candidate: {paths[0]}', flush=True)
        print(f'Danh mục {len(active)}; đã thử {len(quality) - 1} cổ phiếu; lỗi {len(errors)}; dữ liệu chỉ để kiểm định.', flush=True)
        return 1 if fatal or not benchmark_date else 0


def main() -> int:
    args = parse_args()
    if getattr(args, 'personal_universe', False):
        return run_vietcap_universe(args)
    if args.source == 'VCI':
        return run_vietcap(args)
    pd = import_pandas()
    import_vnstock()

    today = datetime.now(ZoneInfo('Asia/Ho_Chi_Minh')).date()
    calendar_days = args.calendar_days or int(args.sessions * 1.8 + 60)
    start = (today - timedelta(days=calendar_days)).isoformat()
    end = today.isoformat()

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    errors_output = Path(args.errors_output)
    errors_output.parent.mkdir(parents=True, exist_ok=True)
    quality_output = Path(args.quality_output)
    quality_output.parent.mkdir(parents=True, exist_ok=True)

    universe = get_universe(args.symbols, args.symbols_file, args.limit, args.exchange, args.source)
    from sector_data import load_sectors
    sector_map = load_sectors()
    for item in universe:
        item['sector'] = sector_map.get(item['ticker'], item.get('sector') or 'Chưa phân loại')
    tasks: List[Tuple[str, str, str, bool]] = []
    if not args.no_index:
        tasks.extend((idx, "INDEX", "Chỉ số", True) for idx in DEFAULT_INDEXES)
    tasks.extend((item["ticker"], item.get("exchange", ""), item.get("sector", ""), False) for item in universe)

    print(f"Tracker Data Exporter v1.8")
    print(f"Sàn đang tải: {args.exchange}")
    print(f"Khoảng thời gian tải: {start} → {end}")
    print(f"Số phiên giữ lại/mã: {args.sessions}")
    print(f"Số mã/chỉ số cần tải: {len(tasks)}")
    print("Bắt đầu tải dữ liệu...\n")

    frames = []
    errors = []
    quality = []
    completed = set()
    if args.resume and output.exists():
        try:
            existing = pd.read_csv(output)
            if args.source == 'DNSE':
                if 'source_provider' not in existing or not existing['source_provider'].eq('DNSE').all():
                    raise ValueError('Không resume CSV khác nguồn DNSE.')
                previous_quality = pd.read_csv(quality_output)
                task_tickers = {task[0] for task in tasks}
                valid = previous_quality.loc[
                    previous_quality['requested_end'].eq(end)
                    & previous_quality['status'].eq('ok')
                    & previous_quality['source_provider'].eq('DNSE')
                    & previous_quality['ticker'].isin(task_tickers)
                ]
                existing = existing.loc[existing['ticker'].isin(valid['ticker'])]
                counts = existing.groupby('ticker').size()
                valid = valid.loc[valid['ticker'].isin(counts[counts >= args.min_rows].index)]
                existing = existing.loc[existing['ticker'].isin(valid['ticker'])]
                quality.extend(valid.to_dict('records'))
            if len(existing) and "ticker" in existing.columns:
                existing["ticker"] = existing["ticker"].astype(str).str.upper().str.strip()
                completed = set(existing["ticker"].dropna().unique())
                frames.append(existing)
                print(f"Resume: tìm thấy {len(completed)} mã/chỉ số đã có trong {output}. Sẽ bỏ qua các mã này.")
        except Exception as exc:
            print(f"Không đọc được file resume hiện có: {exc}. Sẽ tải lại từ đầu.")

    success_since_save = 0
    for i, (symbol, exchange, sector, is_index) in enumerate(tasks, start=1):
        if symbol in completed:
            print(f"[{i}/{len(tasks)}] SKIP {symbol:>8}  đã có trong file output")
            continue
        fetch_quality = {
            "fetch_started_utc": datetime.now(timezone.utc).isoformat(),
            "fetch_finished_utc": "",
            "requested_end": end,
            "source_provider": "",
            "sdk_last_date": "",
        }
        try:
            try:
                raw = fetch_ohlcv_with_retry(symbol, start, end, args.source, is_index=is_index, retries=args.retries, retry_sleep=args.retry_sleep)
            finally:
                fetch_quality["fetch_finished_utc"] = datetime.now(timezone.utc).isoformat()
            fetch_quality.update(sdk_quality_fields(pd, raw))
            df = normalize_ohlcv_df(raw, symbol, exchange, sector, args.sessions)
            if len(df) < args.min_rows:
                errors.append({"ticker": symbol, "issue": "too_few_rows", "detail": f"{len(df)} rows"})
            if len(df):
                frames.append(df)
                quality.append({"ticker": symbol, "rows": len(df), "first_date": df["date"].iloc[0], "last_date": df["date"].iloc[-1], "status": "ok" if len(df) >= args.min_rows else "too_few_rows", **fetch_quality})
                print(f"[{i}/{len(tasks)}] OK  {symbol:>8}  rows={len(df):>4}  last={df['date'].iloc[-1]}")
                success_since_save += 1
                if args.save_every > 0 and success_since_save >= args.save_every:
                    save_export_files(pd, frames, errors, quality, output, errors_output, quality_output)
                    print(f"    Đã lưu tạm tiến độ vào {output}")
                    success_since_save = 0
            else:
                errors.append({"ticker": symbol, "issue": "empty", "detail": "no rows"})
                quality.append({"ticker": symbol, "rows": 0, "first_date": "", "last_date": "", "status": "empty", **fetch_quality})
                print(f"[{i}/{len(tasks)}] ERR {symbol:>8}  empty")
        except KeyboardInterrupt:
            print("\nNgười dùng đã dừng script. Đang lưu tiến độ hiện có...")
            save_export_files(pd, frames, errors, quality, output, errors_output, quality_output)
            raise
        except BaseException as exc:
            errors.append({"ticker": symbol, "issue": "fetch_error", "detail": safe_error(exc)})
            quality.append({"ticker": symbol, "rows": 0, "first_date": "", "last_date": "", "status": "fetch_error", **fetch_quality})
            print(f"[{i}/{len(tasks)}] ERR {symbol:>8}  {safe_error(exc)}")
            if getattr(exc, 'kind', '') in {'credential', 'auth', 'policy', 'unsupported'}:
                save_export_files(pd, frames, errors, quality, output, errors_output, quality_output)
                return 1
        if args.sleep > 0 and i < len(tasks):
            time.sleep(args.sleep)

    if frames:
        save_export_files(pd, frames, errors, quality, output, errors_output, quality_output)
        all_df = pd.read_csv(output)
        print(f"\nĐã xuất CSV: {output.resolve()}")
        print(f"Tổng dòng: {len(all_df):,}")
        print(f"Tổng mã/chỉ số có dữ liệu: {all_df['ticker'].nunique():,}")
    else:
        print("\nKhông có dữ liệu nào được xuất.")
        save_export_files(pd, frames, errors, quality, output, errors_output, quality_output)

    print(f"Báo cáo lỗi: {errors_output.resolve()}")
    print(f"Báo cáo chất lượng export: {quality_output.resolve()}")
    return 0 if frames and not errors else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        eprint('Exporter dừng an toàn: ' + safe_error(error))
        raise SystemExit(1) from None



