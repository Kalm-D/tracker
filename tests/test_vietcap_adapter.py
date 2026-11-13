"""Hợp đồng Vietcap với fixture nhân tạo; không gọi mạng hoặc SDK."""
import copy
import importlib.util
import io
import json
import sys
import tempfile
import unittest
import urllib.error
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import Mock

file = Path(__file__).parents[1] / 'tracker-tools/vietcap_adapter.py'
spec = importlib.util.spec_from_file_location('vietcap_adapter', file)
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
NOW = datetime(2026, 11, 13, 2, tzinfo=timezone.utc)


def bars(symbol='FPT', milliseconds=False):
    dates = [datetime(2026, 11, day, tzinfo=timezone.utc).timestamp() for day in (11, 12)]
    return [{'symbol': symbol, 't': [x * (1000 if milliseconds else 1) for x in dates],
        'o': [500.25, 600.75], 'h': [700, 800], 'l': [400, 500], 'c': [650.5, 700.5], 'v': [100, 0]}]


def response(data):
    return io.BytesIO(json.dumps(data).encode())


class VietcapAdapterTests(unittest.TestCase):
    def client(self, data=None, **kwargs):
        opener = kwargs.pop('opener', None) or Mock(side_effect=lambda *a, **k: response(data if data is not None else bars()))
        return adapter.VietcapClient(opener=opener, now=lambda: NOW, sleep=kwargs.pop('sleep', Mock()), **kwargs)

    def history(self, client):
        return client.history('FPT', '2026-11-01', '2026-11-13', 320)

    def test_nghin_dong_khong_bi_ap_dung_cho_raw_vnd(self):
        client = self.client()
        frame = self.history(client)
        self.assertEqual(frame['close'].tolist(), [650.5, 700.5])
        self.assertEqual(frame.attrs['tracker_price_scale'], 1)
        self.assertEqual(frame.attrs['price_unit'], 'VND')
        self.assertEqual(frame.attrs['adjustment_mode'], 'unknown')
        request = client.opener.call_args.args[0]
        payload = json.loads(request.data)
        self.assertEqual(payload['symbols'], ['FPT'])
        self.assertEqual(payload['to'], int(datetime(2026, 11, 12, 17, tzinfo=timezone.utc).timestamp()) - 1)
        self.assertNotIn('Authorization', request.headers)

    def test_giay_mili_giay_va_thu_tu_khong_doi_gia(self):
        seconds = self.history(self.client())
        for milliseconds, reverse in [(True, False), (False, True)]:
            data = bars(milliseconds=milliseconds)
            if reverse:
                for key in ('t', 'o', 'h', 'l', 'c', 'v'):
                    data[0][key].reverse()
            actual = self.history(self.client(data))
            self.assertTrue(actual.equals(seconds))

    def test_index_giu_don_vi_diem(self):
        frame = self.client(bars('VNINDEX')).history('VNINDEX', '2026-11-01', '2026-11-12', is_index=True)
        self.assertEqual(frame.attrs['price_unit'], 'INDEX_POINTS')
        self.assertEqual(frame['close'].iloc[-1], 700.5)

    def test_tu_choi_200_rong_sai_ma_va_schema(self):
        variants = [[], {}, bars('MBB')]
        for key in ('t', 'o', 'h', 'l', 'c', 'v'):
            missing = bars()
            missing[0].pop(key)
            variants.append(missing)
        unequal = bars()
        unequal[0]['v'].pop()
        variants.append(unequal)
        for data in variants:
            with self.subTest(data=data):
                with self.assertRaises(adapter.VietcapError):
                    self.history(self.client(data))

    def test_tu_choi_du_lieu_sai_khong_sua_ngam(self):
        variants = []
        for key, value in [('o', float('nan')), ('c', float('inf')), ('v', -1), ('c', -1), ('c', True), ('h', 10), ('l', 900), ('t', 'bad')]:
            data = bars()
            data[0][key][0] = value
            variants.append(data)
        duplicate = bars()
        duplicate[0]['t'][1] = duplicate[0]['t'][0]
        variants.append(duplicate)
        mixed = bars()
        mixed[0]['t'][1] *= 1000
        variants.append(mixed)
        partial = bars()
        partial[0]['t'][1] += 86400
        variants.append(partial)
        for data in variants:
            with self.subTest(data=data):
                with self.assertRaises(adapter.VietcapError):
                    self.history(self.client(data))

    def test_dau_vao_sai_khong_goi_mang(self):
        client = self.client()
        for symbol, start, end, count in [('FPT/..', '2026-11-01', '2026-11-12', 320), ('FPT', 'bad', '2026-11-12', 320), ('FPT', '2026-11-13', '2026-11-12', 320), ('FPT', '2026-11-01', '2026-11-12', 0)]:
            with self.assertRaises(adapter.VietcapError):
                client.history(symbol, start, end, count)
        client.opener.assert_not_called()

    def test_cutoff_cuoi_tuan_va_ngay_nghi_khong_doan_phien(self):
        self.assertEqual(adapter.closed_cutoff(datetime(2026, 11, 16, 2, tzinfo=timezone.utc)), '2026-11-15')
        self.assertEqual(adapter.closed_cutoff(datetime(2026, 9, 2, 2, tzinfo=timezone.utc)), '2026-09-01')
        # Tuổi dữ liệu/phiên dự kiến vẫn do Data Quality Layer hiện hành xác định.

    def test_cache_cung_ngay_va_xac_thuc_lai_cache(self):
        with tempfile.TemporaryDirectory() as folder:
            client = self.client(cache_dir=folder)
            self.history(client)
            self.history(client)
            self.assertEqual((client.http_calls, client.cache_hits), (1, 1))
            cache = next(Path(folder).glob('*.json'))
            stored = json.loads(cache.read_text())
            stored['data'] = []
            cache.write_text(json.dumps(stored))
            self.history(client)
            self.assertEqual(client.http_calls, 2)

    def test_khong_cache_phan_hoi_loi(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(adapter.VietcapError):
                self.history(self.client([], cache_dir=folder))
            self.assertEqual(list(Path(folder).glob('*')), [])

    def test_cache_het_ngay_phai_doc_lai_lich_su(self):
        with tempfile.TemporaryDirectory() as folder:
            client = self.client(cache_dir=folder)
            self.history(client)
            client.now = lambda: NOW + timedelta(days=1)
            self.history(client)
            self.assertEqual((client.http_calls, client.cache_hits), (2, 0))

    def test_khoa_chong_chay_trung_va_tu_nha_sau_loi(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(ValueError):
                with adapter.export_lock(folder):
                    with self.assertRaises(adapter.VietcapError) as error:
                        with adapter.export_lock(folder):
                            self.fail('Không được lấy khóa lần hai')
                    self.assertEqual(error.exception.code, 'VCI_EXPORT_ALREADY_RUNNING')
                    raise ValueError('Lượt tải thất bại')
            with adapter.export_lock(folder):
                pass

    def test_danh_muc_xac_thuc_san(self):
        listings = [{'symbol': 'FPT', 'type': 'STOCK', 'board': 'HSX'}, {'symbol': 'PVS', 'type': 'STOCK', 'board': 'HNX'}, {'symbol': 'ACV', 'type': 'STOCK', 'board': 'UPCOM'}, {'symbol': 'CFPT2601', 'type': 'CW', 'board': 'HSX'}]
        actual = self.client(listings).listings()
        self.assertEqual([x['exchange'] for x in actual], ['HOSE', 'HNX', 'UPCOM'])
        for data in [[], listings + [listings[0]], [{'symbol': 'FPT', 'type': 'STOCK', 'board': None}]]:
            with self.assertRaises(adapter.VietcapError):
                self.client(data).listings()

    def test_403_khong_retry_hoac_ne_tranh(self):
        opener = Mock(side_effect=urllib.error.HTTPError('https://source', 403, 'Forbidden', {}, None))
        with self.assertRaises(adapter.VietcapError) as error:
            self.history(self.client(opener=opener))
        self.assertEqual(error.exception.kind, 'policy')
        self.assertEqual(opener.call_count, 1)

    def test_danh_muc_ca_nhan_khong_nhan_san_delisted(self):
        data = [{'symbol': 'FPT', 'type': 'STOCK', 'board': 'HSX'}, {'symbol': 'ZZZ', 'type': 'STOCK', 'board': 'DELISTED'}]
        self.assertEqual(self.client(data).listings({'FPT'})[0]['exchange'], 'HOSE')
        with self.assertRaises(adapter.VietcapError):
            self.client(data).listings({'ZZZ'})

    def test_429_ton_trong_retry_after_va_gioi_han(self):
        for retry_after, expected_calls in [('90', 3), ('600', 1)]:
            opener = Mock(side_effect=urllib.error.HTTPError('https://source', 429, 'Rate limited', {'Retry-After': retry_after}, None))
            sleep = Mock()
            with self.assertRaises(adapter.VietcapError):
                self.history(self.client(opener=opener, sleep=sleep))
            self.assertEqual(opener.call_count, expected_calls)
            if expected_calls > 1:
                self.assertEqual(sum(call.args[0] == 90 for call in sleep.call_args_list), 2)

    def test_timeout_thu_lai_huu_han(self):
        opener = Mock(side_effect=TimeoutError())
        with self.assertRaises(adapter.VietcapError) as error:
            self.history(self.client(opener=opener))
        self.assertEqual(error.exception.code, 'VCI_NETWORK_UNAVAILABLE')
        self.assertEqual(opener.call_count, 3)

    def test_json_loi_khong_duoc_chap_nhan(self):
        opener = Mock(side_effect=lambda *a, **k: io.BytesIO(b'not-json'))
        with self.assertRaises(adapter.VietcapError):
            self.history(self.client(opener=opener))


if __name__ == '__main__':
    unittest.main()
