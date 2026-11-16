"""Hồi quy nguồn KBS bằng fixture; không gọi API, không sửa công thức."""
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError

ROOT = Path(__file__).parents[1]


def tool(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'tracker-tools' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


kbs = tool('kbs_adapter')
exporter = tool('tracker_data_exporter')


def history(symbol='FPT'):
    return {'symbol': symbol, 'data_day': [{'t': '2026-11-12T07:00:00', 'o': 10215, 'h': 10275,
                                          'l': 10105, 'c': 10245, 'v': 1234}]}


class KbsTests(unittest.TestCase):
    def client(self, data):
        client = kbs.KbsClient(sleep=Mock())
        client.read = Mock(return_value=data)
        return client

    def test_legacy_precision_and_vnd_normalization(self):
        frame = self.client(history()).history('FPT', '2026-11-01', '2026-11-13')
        out = exporter.normalize_ohlcv_df(frame, 'FPT', 'HOSE', '', 320)
        self.assertEqual(frame.attrs['tracker_source'], 'KBS')
        self.assertEqual(frame['close'].iloc[0], 10.24)
        self.assertEqual(out['close'].iloc[0], 10240)
        self.assertEqual(out['value'].iloc[0], 10240 * 1234)

    def test_index_does_not_scale_to_thousands(self):
        frame = self.client(history('VNINDEX')).history('VNINDEX', '2026-11-01', '2026-11-13', is_index=True)
        self.assertEqual(frame['close'].iloc[0], 10245)
        self.assertEqual(frame.attrs['tracker_price_scale'], 1)

    def test_symbol_and_benchmark_validation(self):
        for symbol, index in [('FPT/../../x', False), ('VN30', True)]:
            with self.assertRaisesRegex(kbs.KbsError, 'SYMBOL_INVALID'):
                self.client(history()).history(symbol, '2026-11-01', '2026-11-13', is_index=index)

    def test_empty_wrong_symbol_and_bad_schema(self):
        for data in [history('MBB'), {'symbol': 'FPT', 'data_day': []}, []]:
            with self.assertRaises(kbs.KbsError):
                self.client(data).history('FPT', '2026-11-01', '2026-11-13')

    def test_invalid_bar_duplicate_future_and_nan(self):
        for edit in [lambda d: d['data_day'][0].update(h=1),
                     lambda d: d['data_day'].append(d['data_day'][0]),
                     lambda d: d['data_day'][0].update(t='2026-11-16T07:00:00'),
                     lambda d: d['data_day'][0].update(c=float('nan')),
                     lambda d: d['data_day'][0].update(v=True)]:
            data = history()
            edit(data)
            with self.assertRaisesRegex(kbs.KbsError, 'VALUES'):
                self.client(data).history('FPT', '2026-11-01', '2026-11-13')

    def test_authoritative_exchange_and_no_fake_fallback(self):
        rows = [{'symbol': 'FPT', 'type': 'stock', 'exchange': 'HSX'},
                {'symbol': 'CFPT1234', 'type': 'warrant', 'exchange': 'HSX'}]
        self.assertEqual(self.client(rows).listings(), [{'ticker': 'FPT', 'exchange': 'HOSE', 'sector': ''}])
        for data in [[], rows + [rows[0]], [{'symbol': 'FPT', 'type': 'stock', 'exchange': '??'}]]:
            with self.assertRaises(kbs.KbsError):
                self.client(data).listings()

    def test_get_uses_real_endpoint_and_no_sdk(self):
        opener = Mock(return_value=io.BytesIO(json.dumps(history()).encode()))
        client = kbs.KbsClient(opener=opener)
        frame = client.history('FPT', '2026-11-01', '2026-11-13')
        self.assertEqual(len(frame), 1)
        self.assertIn('/stocks/FPT/data_day?sdate=01-11-2026&edate=13-11-2026', opener.call_args.args[0].full_url)

    def test_access_denied_does_not_retry_or_fallback(self):
        opener = Mock(side_effect=HTTPError('https://test', 403, 'denied', {}, None))
        with self.assertRaisesRegex(kbs.KbsError, 'ACCESS_DENIED'):
            kbs.KbsClient(opener=opener, sleep=Mock()).read('test')
        self.assertEqual(opener.call_count, 1)

    def test_retry_after_is_respected_and_bounded(self):
        opener = Mock(side_effect=[HTTPError('https://test', 429, 'limit', {'Retry-After': '120'}, None), io.BytesIO(b'[]')])
        sleep = Mock()
        self.assertEqual(kbs.KbsClient(opener=opener, sleep=sleep).read('test'), [])
        self.assertIn(120, [call.args[0] for call in sleep.call_args_list])
        with self.assertRaisesRegex(kbs.KbsError, 'RATE_LIMIT'):
            kbs.KbsClient(opener=Mock(side_effect=HTTPError('https://test', 429, 'limit', {'Retry-After': '500'}, None)), sleep=Mock()).read('test')

    def test_exporter_kbs_bypasses_vnstock(self):
        frame = self.client(history()).history('FPT', '2026-11-01', '2026-11-13')
        client = Mock()
        client.history.return_value = frame
        client.listings.return_value = [{'ticker': 'FPT', 'exchange': 'HOSE', 'sector': ''}]
        with patch.object(exporter, '_kbs_client', client), patch.object(exporter, 'import_vnstock', side_effect=AssertionError('Không được gọi SDK')):
            self.assertIs(exporter.fetch_ohlcv('FPT', '2026-11-01', '2026-11-13', 'KBS'), frame)
            self.assertEqual(exporter.get_universe('FPT', '', 0, 'ALL', 'KBS')[0]['exchange'], 'HOSE')


if __name__ == '__main__':
    unittest.main()
