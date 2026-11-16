"""Đọc nguồn KBS hiện hữu bằng HTTP; giữ đơn vị/làm tròn SDK cũ, không tự đổi nguồn."""
import json
import math
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone

BASE = 'https://kbbuddywts.kbsec.com.vn/iis-server/investment/'


class KbsError(RuntimeError):
    """Mã lỗi an toàn, không in phản hồi thô hoặc tự chuyển provider."""
    def __init__(self, code, kind='invalid'):
        super().__init__(code)
        self.code, self.kind, self.retryable = code, kind, False


class KbsClient:
    def __init__(self, opener=None, sleep=time.sleep, interval=3.6):
        self.opener, self.sleep, self.interval = opener or urllib.request.urlopen, sleep, interval
        self.last_request = None

    def read(self, route):
        for attempt in range(3):
            if self.last_request is not None:
                self.sleep(max(0, self.interval - (time.monotonic() - self.last_request)))
            self.last_request = time.monotonic()
            request = urllib.request.Request(BASE + route, headers={'Accept': 'application/json', 'User-Agent': 'Tracker-ReadOnly-Research/1.0'})
            try:
                with self.opener(request, timeout=25) as response:
                    raw = response.read(16 * 1024 * 1024 + 1)
                if len(raw) > 16 * 1024 * 1024:
                    raise KbsError('KBS_RESPONSE_TOO_LARGE')
                return json.loads(raw)
            except urllib.error.HTTPError as error:
                if error.code in (401, 403):
                    raise KbsError('KBS_ACCESS_DENIED', 'policy') from None
                if error.code == 429:
                    delay = 70
                    retry_after = error.headers.get('Retry-After') if error.headers else None
                    if retry_after:
                        try:
                            delay = max(delay, float(retry_after))
                        except ValueError:
                            from email.utils import parsedate_to_datetime
                            try:
                                delay = max(delay, (parsedate_to_datetime(retry_after) - datetime.now(timezone.utc)).total_seconds())
                            except (ValueError, TypeError):
                                raise KbsError('KBS_RETRY_AFTER_INVALID', 'policy') from None
                    if not math.isfinite(delay) or delay > 300 or attempt == 2:
                        raise KbsError('KBS_RATE_LIMIT', 'policy') from None
                    self.sleep(delay)
                elif 500 <= error.code < 600 and attempt < 2:
                    self.sleep(70)
                else:
                    raise KbsError('KBS_HTTP_' + str(error.code), 'network') from None
            except (urllib.error.URLError, TimeoutError):
                if attempt == 2:
                    raise KbsError('KBS_NETWORK_UNAVAILABLE', 'network') from None
                self.sleep(70)
            except (ValueError, UnicodeError):
                raise KbsError('KBS_INVALID_JSON') from None

    def listings(self):
        data = self.read('stock/search/data')
        rows = data.get('data') if isinstance(data, dict) else data
        if not isinstance(rows, list) or not rows:
            raise KbsError('KBS_LISTING_EMPTY')
        result, seen = [], set()
        for item in rows:
            if not isinstance(item, dict):
                raise KbsError('KBS_LISTING_SCHEMA')
            ticker = item.get('symbol', '')
            if item.get('type') != 'stock' or not isinstance(ticker, str) or not re.fullmatch(r'[A-Z0-9]{3}', ticker):
                continue
            board = {'HSX': 'HOSE', 'HOSE': 'HOSE', 'HNX': 'HNX', 'UPCOM': 'UPCOM'}.get(str(item.get('exchange', '')).upper())
            if board is None or ticker in seen:
                raise KbsError('KBS_LISTING_EXCHANGE_OR_DUPLICATE')
            seen.add(ticker)
            result.append({'ticker': ticker, 'exchange': board, 'sector': ''})
        if not result:
            raise KbsError('KBS_LISTING_EMPTY')
        return sorted(result, key=lambda item: item['ticker'])

    def history(self, symbol, start, end, is_index=False):
        import pandas as pd
        if not isinstance(symbol, str) or not (symbol == 'VNINDEX' if is_index else re.fullmatch(r'[A-Z0-9]{3}', symbol)):
            raise KbsError('KBS_SYMBOL_INVALID', 'input')
        first, last = date.fromisoformat(start), date.fromisoformat(end)
        if first > last:
            raise KbsError('KBS_WINDOW_INVALID', 'input')
        route = ('index/' if is_index else 'stocks/') + symbol + '/data_day?'
        route += urllib.parse.urlencode({'sdate': first.strftime('%d-%m-%Y'), 'edate': last.strftime('%d-%m-%Y')})
        data = self.read(route)
        if not isinstance(data, dict) or data.get('symbol') != symbol or not isinstance(data.get('data_day'), list):
            raise KbsError('KBS_HISTORY_SCHEMA_OR_SYMBOL')
        rows = data['data_day']
        if not rows:
            raise KbsError('KBS_HISTORY_EMPTY')
        columns = {'t': 'time', 'o': 'open', 'h': 'high', 'l': 'low', 'c': 'close', 'v': 'volume'}
        if any(not isinstance(row, dict) or not set(columns).issubset(row) for row in rows):
            raise KbsError('KBS_HISTORY_SCHEMA')
        if any(isinstance(row[key], bool) for row in rows for key in columns):
            raise KbsError('KBS_HISTORY_VALUES')
        try:
            frame = pd.DataFrame(rows)[list(columns)].rename(columns=columns)
            frame['time'] = pd.to_datetime(frame['time'], errors='raise')
            numbers = frame[['open', 'high', 'low', 'close', 'volume']].apply(pd.to_numeric, errors='raise')
            days = frame['time'].dt.strftime('%Y-%m-%d')
            if (days.duplicated().any() or days.lt(start).any() or days.gt(end).any()
                or not numbers.map(math.isfinite).all().all() or numbers.isna().any().any()
                or numbers[['open', 'high', 'low', 'close']].le(0).any().any() or numbers['volume'].lt(0).any()
                or numbers['high'].lt(numbers[['open', 'low', 'close']].max(axis=1)).any()
                or numbers['low'].gt(numbers[['open', 'high', 'close']].min(axis=1)).any()):
                raise ValueError('Hợp đồng nến sai')
            frame[numbers.columns] = numbers
        except (ValueError, TypeError, OverflowError):
            raise KbsError('KBS_HISTORY_VALUES') from None
        # Tái hiện Quote.history mặc định floating=2 trong SDK 4.0.9 đã dùng trước đây.
        price = ['open', 'high', 'low', 'close']
        frame[price] = (frame[price] / (1 if is_index else 1000)).round(2)
        frame = frame.sort_values('time').reset_index(drop=True)
        frame.attrs.update(tracker_source='KBS', tracker_price_scale=1 if is_index else 1000,
                           sdk_profile='direct-kbs-legacy-floating2', adjustment_mode='unknown')
        return frame
