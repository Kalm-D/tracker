"""Đọc Vietcap cho nghiên cứu cá nhân; không phụ thuộc SDK hoặc tự đổi nguồn."""
import hashlib
import json
import math
import os
import re
import socket
import tempfile
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

VN = ZoneInfo('Asia/Ho_Chi_Minh')
BASE = 'https://trading.vietcap.com.vn/api/'
EXCHANGES = {'HOSE': 'HOSE', 'HSX': 'HOSE', 'HNX': 'HNX', 'UPCOM': 'UPCOM'}


class VietcapError(RuntimeError):
    """Lỗi có cấu trúc, không đưa phản hồi thô vào log."""
    def __init__(self, code, kind='invalid'):
        super().__init__(code)
        self.code, self.kind, self.retryable = code, kind, False


def closed_cutoff(now=None):
    """Chỉ đọc đến ngày lịch trước hôm nay, tránh mọi nến đang chạy."""
    return ((now or datetime.now(timezone.utc)).astimezone(VN).date() - timedelta(days=1)).isoformat()


@contextmanager
def export_lock(folder):
    """Khóa hệ điều hành tự nhả khi tiến trình đóng, tránh tải trùng."""
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    with (folder / 'export.lock').open('a+b') as handle:
        handle.seek(0, os.SEEK_END)
        if handle.tell() == 0:
            handle.write(b'0')
            handle.flush()
        handle.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            raise VietcapError('VCI_EXPORT_ALREADY_RUNNING', 'policy') from None
        try:
            yield
        finally:
            handle.seek(0)
            if os.name == 'nt':
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


class VietcapClient:
    """Một yêu cầu mỗi mã, cache trong ngày và tối đa hai lần thử lại."""
    def __init__(self, cache_dir=None, opener=None, sleep=time.sleep, now=None, interval=3.6, session_cutoff=None):
        self.cache_dir = Path(cache_dir) if cache_dir else None
        self.opener = opener or urllib.request.urlopen
        self.sleep, self.now, self.interval = sleep, now or (lambda: datetime.now(timezone.utc)), interval
        self.last_request = None
        self.session_cutoff = session_cutoff
        self.http_calls = 0
        self.cache_hits = 0

    def _read(self, route, payload, validate):
        today = self.now().astimezone(VN).date().isoformat()
        key = hashlib.sha256(json.dumps([today, route, payload], sort_keys=True).encode()).hexdigest()
        cache = self.cache_dir / (key + '.json') if self.cache_dir else None
        if cache and cache.exists():
            try:
                stored = json.loads(cache.read_text(encoding='utf-8'))
                stamp = datetime.fromisoformat(stored['fetchedAt'])
                if stamp.tzinfo and stamp <= self.now() and stamp.astimezone(VN).date().isoformat() == today:
                    parsed = validate(stored['data'])
                    self.cache_hits += 1
                    return parsed
            except (ValueError, KeyError, TypeError, OSError, VietcapError):
                pass
        raw = json.dumps(payload).encode() if payload is not None else None
        request = urllib.request.Request(BASE + route, data=raw,
            headers={'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Tracker-Personal-Research/1.0'},
            method='POST' if raw is not None else 'GET')
        for attempt in range(3):
            if self.last_request is not None:
                self.sleep(max(0, self.interval - (time.monotonic() - self.last_request)))
            self.last_request = time.monotonic()
            self.http_calls += 1
            try:
                with self.opener(request, timeout=25) as response:
                    content = response.read(16 * 1024 * 1024 + 1)
                if len(content) > 16 * 1024 * 1024:
                    raise VietcapError('VCI_RESPONSE_TOO_LARGE')
                try:
                    data = json.loads(content)
                except (ValueError, UnicodeError):
                    raise VietcapError('VCI_INVALID_JSON') from None
                parsed = validate(data)
                if cache:
                    cache.parent.mkdir(parents=True, exist_ok=True)
                    handle, temporary = tempfile.mkstemp(dir=cache.parent, suffix='.tmp')
                    try:
                        with os.fdopen(handle, 'w', encoding='utf-8') as file:
                            json.dump({'fetchedAt': self.now().isoformat(), 'data': data}, file)
                        os.replace(temporary, cache)
                    finally:
                        Path(temporary).unlink(missing_ok=True)
                return parsed
            except urllib.error.HTTPError as exc:
                if exc.code in (401, 403):
                    raise VietcapError('VCI_ACCESS_DENIED', 'policy') from None
                retryable = exc.code == 429 or 500 <= exc.code <= 599
                delay = 70.0
                if exc.code == 429 and exc.headers and exc.headers.get('Retry-After'):
                    from email.utils import parsedate_to_datetime
                    value = exc.headers['Retry-After']
                    try:
                        delay = max(delay, float(value) if value.isdigit() else (parsedate_to_datetime(value) - self.now()).total_seconds())
                    except (ValueError, TypeError, OverflowError):
                        raise VietcapError('VCI_RETRY_AFTER_INVALID', 'policy') from None
                if not retryable or attempt == 2 or delay > 300:
                    raise VietcapError('VCI_HTTP_' + str(exc.code), 'policy' if exc.code == 429 else 'network') from None
                self.sleep(delay)
            except (urllib.error.URLError, TimeoutError, socket.timeout):
                if attempt == 2:
                    raise VietcapError('VCI_NETWORK_UNAVAILABLE', 'network') from None
                self.sleep(70)

    def listings(self, symbols=None):
        """Lấy sàn từ danh mục nguồn; không suy đoán theo mã."""
        def validate(data):
            if not isinstance(data, list) or not data:
                raise VietcapError('VCI_LISTING_SCHEMA')
            result, seen = [], set()
            for item in data:
                if not isinstance(item, dict):
                    raise VietcapError('VCI_LISTING_SCHEMA')
                ticker = item.get('symbol', '')
                if symbols is not None and ticker not in symbols:
                    continue
                if item.get('type') != 'STOCK' or not isinstance(ticker, str) or not re.fullmatch(r'[A-Z0-9]{3}', ticker):
                    continue
                exchange = EXCHANGES.get(str(item.get('board', '')).upper())
                if exchange is None or ticker in seen:
                    raise VietcapError('VCI_LISTING_EXCHANGE_OR_DUPLICATE')
                result.append({'ticker': ticker, 'exchange': exchange, 'sector': ''})
                seen.add(ticker)
            if not result:
                raise VietcapError('VCI_LISTING_EMPTY')
            return result
        return self._read('price/symbols/getAll', None, validate)

    def reference(self):
        """Giữ mã đang niêm yết, DELISTED và metadata chưa xác minh riêng."""
        def validate(data):
            if not isinstance(data, list) or not data:
                raise VietcapError('VCI_LISTING_SCHEMA')
            result = {'active': [], 'inactive': [], 'unverified': []}
            seen = set()
            for item in data:
                if not isinstance(item, dict):
                    raise VietcapError('VCI_LISTING_SCHEMA')
                ticker = item.get('symbol', '')
                if item.get('type') != 'STOCK' or not isinstance(ticker, str) or not re.fullmatch(r'[A-Z0-9]{3}', ticker):
                    continue
                if ticker in seen:
                    raise VietcapError('VCI_LISTING_EXCHANGE_OR_DUPLICATE')
                seen.add(ticker)
                board = str(item.get('board', '')).upper()
                record = {'ticker': ticker, 'exchange': EXCHANGES.get(board), 'source_board': board, 'sector': ''}
                result['active' if record['exchange'] else 'inactive' if board == 'DELISTED' else 'unverified'].append(record)
            if not result['active']:
                raise VietcapError('VCI_LISTING_EMPTY')
            for group in result.values():
                group.sort(key=lambda item: item['ticker'])
            return result
        return self._read('price/symbols/getAll', None, validate)

    def history(self, symbol, start, end, count_back=320, is_index=False, clip_window=False):
        """Giá raw VND/cổ phiếu hoặc điểm chỉ số, không làm tròn."""
        import pandas as pd
        if (is_index and symbol != 'VNINDEX') or (not is_index and not re.fullmatch(r'[A-Z0-9]{3}', symbol)):
            raise VietcapError('VCI_SYMBOL_INVALID', 'input')
        try:
            first = date.fromisoformat(start)
            cutoff = date.fromisoformat(self.session_cutoff or closed_cutoff(self.now()))
            if cutoff > self.now().astimezone(VN).date():
                raise ValueError('cutoff tương lai')
            last = min(date.fromisoformat(end), cutoff)
        except (ValueError, TypeError):
            raise VietcapError('VCI_DATE_INVALID', 'input') from None
        if first > last or not isinstance(count_back, int) or not 1 <= count_back <= 2000:
            raise VietcapError('VCI_WINDOW_INVALID', 'input')
        until = int(datetime.combine(last + timedelta(days=1), datetime.min.time(), VN).timestamp()) - 1
        payload = {'timeFrame': 'ONE_DAY', 'symbols': [symbol], 'to': until, 'countBack': count_back}

        def validate(data):
            if data == []:
                raise VietcapError('VCI_OHLCV_EMPTY')
            if not isinstance(data, list) or len(data) != 1 or not isinstance(data[0], dict) or data[0].get('symbol') != symbol:
                raise VietcapError('VCI_OHLCV_EMPTY_OR_SYMBOL')
            item = data[0]
            fields = ('t', 'o', 'h', 'l', 'c', 'v')
            if any(not isinstance(item.get(k), list) for k in fields):
                raise VietcapError('VCI_OHLCV_SCHEMA')
            if not item['t'] or len({len(item[k]) for k in fields}) != 1 or len(item['t']) > count_back:
                raise VietcapError('VCI_OHLCV_LENGTH')
            try:
                if any(isinstance(value, bool) for key in fields for value in item[key]):
                    raise ValueError('boolean')
                stamps = pd.to_numeric(pd.Series(item['t']), errors='raise')
                if not stamps.map(math.isfinite).all() or (stamps <= 0).any():
                    raise ValueError('timestamp')
                milliseconds = stamps > 1e12
                if milliseconds.any() and not milliseconds.all():
                    raise ValueError('timestamp_unit')
                dates = pd.to_datetime(stamps, unit='ms' if milliseconds.all() else 's', utc=True).dt.tz_convert(VN).dt.strftime('%Y-%m-%d')
                frame = pd.DataFrame({'time': dates, **{name: pd.to_numeric(pd.Series(item[key]), errors='raise') for name, key in zip(('open', 'high', 'low', 'close', 'volume'), fields[1:])}})
            except (ValueError, TypeError, OverflowError):
                raise VietcapError('VCI_OHLCV_VALUES') from None
            numbers = frame[['open', 'high', 'low', 'close', 'volume']]
            if (not numbers.map(math.isfinite).all().all() or frame['time'].duplicated().any()
                or (numbers[['open', 'high', 'low', 'close']] <= 0).any().any() or (frame['volume'] < 0).any()
                or (frame['high'] < frame[['open', 'low', 'close']].max(axis=1)).any()
                or (frame['low'] > frame[['open', 'high', 'close']].min(axis=1)).any()
                or (not clip_window and (frame['time'] < first.isoformat()).any()) or (frame['time'] > last.isoformat()).any()):
                raise VietcapError('VCI_OHLCV_INVALID')
            before_window = int((frame['time'] < first.isoformat()).sum())
            if clip_window:
                frame = frame.loc[frame['time'] >= first.isoformat()]
                if frame.empty:
                    raise VietcapError('VCI_OHLCV_EMPTY')
            frame = frame.sort_values('time').reset_index(drop=True)
            if is_index and self.session_cutoff and frame['time'].iloc[-1] != last.isoformat():
                raise VietcapError('VCI_BENCHMARK_DELAYED', 'data_delay')
            frame.attrs.update(tracker_source='VCI', tracker_price_scale=1, sdk_profile='direct-v1',
                price_unit='INDEX_POINTS' if is_index else 'VND', adjustment_mode='unknown', request_end=last.isoformat(), rows_before_window=before_window)
            return frame
        return self._read('chart/OHLCChart/gap-chart', payload, validate)
