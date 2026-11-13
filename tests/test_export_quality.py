"""Chạy exporter và packer trên dữ liệu giả, với toàn bộ SDK được thay bằng fixture."""
from argparse import Namespace
from contextlib import redirect_stdout
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import csv
import importlib.util
import io
import sys
import tempfile
import unittest

import pandas as pd


def load_tool(name):
    file = Path(__file__).parents[1] / 'tracker-tools' / f'{name}.py'
    spec = importlib.util.spec_from_file_location(name, file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


exporter = load_tool('tracker_data_exporter')
packer = load_tool('pack_market_data')


def sdk_frame(last='2026-11-06', last_volume=220):
    frame = pd.DataFrame({'time': ['2026-11-04 07:00:00', last + ' 07:00:00'],
                          'open': [10, 11], 'high': [12, 13], 'low': [9, 10],
                          'close': [11, 12], 'volume': [120, last_volume]})
    frame.attrs['tracker_source'] = 'KBS'
    return frame


def csv_rows(path):
    with path.open(encoding='utf-8-sig', newline='') as file:
        return list(csv.DictReader(file))


class ExportQualityTests(unittest.TestCase):
    def run_fixture(self, payload):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        folder = Path(temp.name)
        args = Namespace(output=folder/'market.csv', errors_output=folder/'errors.csv',
                         quality_output=folder/'quality.csv', calendar_days=636, sessions=320,
                         symbols=None, symbols_file=None, limit=None, exchange='ALL', no_index=True,
                         resume=False, source='KBS', retries=20, retry_sleep=70, min_rows=1,
                         save_every=1, sleep=0)
        universe = [{'ticker': 'MBB', 'exchange': 'HOSE'}]
        sector = SimpleNamespace(load_sectors=lambda: {})
        with (patch.object(exporter, 'parse_args', return_value=args),
              patch.object(exporter, 'import_pandas', return_value=pd),
              patch.object(exporter, 'import_vnstock'),
              patch.object(exporter, 'get_universe', return_value=universe),
              patch.object(exporter, 'fetch_ohlcv_with_retry') as fetch,
              patch.dict(sys.modules, {'sector_data': sector}), redirect_stdout(io.StringIO())):
            if isinstance(payload, Exception):
                fetch.side_effect = payload
            else:
                fetch.return_value = payload
            status = exporter.main()
        self.assertEqual(fetch.call_count, 1)
        [quality] = csv_rows(args.quality_output)
        self.assertEqual(quality['requested_end'], fetch.call_args.args[2])
        started = datetime.fromisoformat(quality['fetch_started_utc'])
        finished = datetime.fromisoformat(quality['fetch_finished_utc'])
        self.assertEqual(started.tzinfo, timezone.utc)
        self.assertEqual(finished.tzinfo, timezone.utc)
        self.assertLessEqual(started, finished)
        return status, quality, args

    def test_du_phien_va_giu_gia(self):
        status, quality, args = self.run_fixture(sdk_frame())
        self.assertEqual(status, 0)
        self.assertEqual((quality['source_provider'], quality['sdk_last_date'], quality['last_date']),
                         ('KBS', '2026-11-06', '2026-11-06'))
        rows = csv_rows(args.output)
        self.assertEqual(len(rows), 2)
        self.assertEqual([float(rows[-1][key]) for key in ('open','high','low','close','volume','value')],
                         [11000, 13000, 10000, 12000, 220, 2640000])

    def test_sdk_co_phien_nhung_normalizer_loai_hang_thieu(self):
        _, quality, _ = self.run_fixture(sdk_frame(last_volume=float('nan')))
        self.assertEqual((quality['sdk_last_date'], quality['last_date'], quality['rows']),
                         ('2026-11-06', '2026-11-04', '1'))

    def test_sdk_ket_thuc_som(self):
        _, quality, _ = self.run_fixture(sdk_frame(last='2026-11-05'))
        self.assertEqual((quality['sdk_last_date'], quality['last_date']), ('2026-11-05', '2026-11-05'))

    def test_sdk_rong_hoac_loi(self):
        for fixture, expected in [(pd.DataFrame(), 'empty'), (RuntimeError('Lỗi giả'), 'fetch_error')]:
            with self.subTest(expected=expected):
                status, quality, args = self.run_fixture(fixture)
                self.assertEqual(status, 1)
                self.assertEqual(quality['status'], expected)
                self.assertEqual(quality['sdk_last_date'], '')
                self.assertEqual(quality['source_provider'], '')
                self.assertFalse(args.output.exists())

    def test_ngay_khong_doc_duoc_van_giu_loi_cu(self):
        frame = sdk_frame()
        frame.loc[1, 'time'] = 'KHONG-PHAI-NGAY'
        status, quality, _ = self.run_fixture(frame)
        self.assertEqual(status, 1)
        self.assertEqual((quality['source_provider'], quality['sdk_last_date'], quality['status']),
                         ('KBS', '', 'fetch_error'))

    def test_packer_doc_ca_hai_schema(self):
        _, quality, args = self.run_fixture(sdk_frame())
        old = args.output.parent/'old-quality.csv'
        fields = ['ticker','rows','first_date','last_date','status']
        with old.open('w', encoding='utf-8', newline='') as file:
            writer = csv.DictWriter(file, fieldnames=fields, extrasaction='ignore')
            writer.writeheader()
            writer.writerow(quality)
        before, old_invalid = packer.pack(args.output, 'Vnstock / KBS', export_quality=old)
        after, new_invalid = packer.pack(args.output, 'Vnstock / KBS', export_quality=args.quality_output)
        before['meta'].pop('generatedAt')
        after['meta'].pop('generatedAt')
        self.assertEqual(before, after)
        self.assertEqual(old_invalid, new_invalid)


class VietcapExportTests(unittest.TestCase):
    def setup_run(self):
        root = Path(__file__).parents[1] / 'work/vci-personal'
        root.mkdir(parents=True, exist_ok=True)
        temp = tempfile.TemporaryDirectory(dir=root)
        self.addCleanup(temp.cleanup)
        folder = Path(temp.name)
        args = Namespace(source='VCI', output=folder/'market.csv', errors_output=folder/'errors.csv',
            quality_output=folder/'quality.csv', symbols='FPT', symbols_file='', exchange='ALL',
            no_index=False, resume=False, sessions=320, min_rows=2, calendar_days=636, limit=0, sleep=3.6)
        from unittest.mock import Mock
        client = Mock(http_calls=3, cache_hits=0)
        client.listings.return_value = [{'ticker': 'FPT', 'exchange': 'HOSE', 'sector': ''}]
        def history(symbol, *a):
            frame = sdk_frame()
            frame['close'] = [500.25, 600.75]
            frame['open'] = [500, 600]
            frame['high'] = [700, 800]
            frame['low'] = [400, 500]
            frame.attrs.update(tracker_source='VCI', tracker_price_scale=1, sdk_profile='direct-v1',
                price_unit='INDEX_POINTS' if symbol == 'VNINDEX' else 'VND', adjustment_mode='unknown')
            return frame
        client.history.side_effect = history
        module = SimpleNamespace(VietcapClient=lambda **kw: client, closed_cutoff=lambda: '2026-11-12')
        return args, client, module

    def run_args(self, args, module):
        with (patch.object(exporter, 'parse_args', return_value=args),
              patch.object(exporter, 'import_vnstock', side_effect=AssertionError('Không được gọi SDK')),
              patch.dict(sys.modules, {'vietcap_adapter': module, 'vnstock': None,
                  'sector_data': SimpleNamespace(load_sectors=lambda: {})}), redirect_stdout(io.StringIO())):
            return exporter.main()

    def test_csv_va_provenance_vnd_diem_khong_can_sdk(self):
        args, client, module = self.setup_run()
        self.assertEqual(self.run_args(args, module), 0)
        rows = csv_rows(args.output)
        self.assertEqual(len(rows), 4)
        self.assertEqual({r['source_provider'] for r in rows}, {'VCI'})
        self.assertEqual([float(r['close']) for r in rows], [500.25, 600.75, 500.25, 600.75])
        quality = csv_rows(args.quality_output)
        self.assertEqual({r['price_unit'] for r in quality}, {'VND', 'INDEX_POINTS'})
        self.assertEqual({r['sdk_profile'] for r in quality}, {'direct-v1'})
        self.assertEqual({r['requested_end'] for r in quality}, {'2026-11-12'})
        self.assertEqual(client.history.call_count, 2)

    def test_loi_va_khac_phien_khong_ghi_de_snapshot_tot(self):
        for failure in ('network', 'too_short', 'different_date'):
            with self.subTest(failure=failure):
                args, client, module = self.setup_run()
                args.output.write_bytes(b'SNAPSHOT_TOT')
                original = client.history.side_effect
                def history(symbol, *a):
                    frame = original(symbol, *a)
                    if symbol == 'FPT':
                        if failure == 'network':
                            raise RuntimeError('Lỗi nguồn')
                        if failure == 'too_short':
                            frame = frame.iloc[:1]
                        if failure == 'different_date':
                            frame.loc[1, 'time'] = '2026-11-05 07:00:00'
                    return frame
                client.history.side_effect = history
                with self.assertRaises((RuntimeError, ValueError)):
                    self.run_args(args, module)
                self.assertEqual(args.output.read_bytes(), b'SNAPSHOT_TOT')
                self.assertFalse(args.quality_output.exists())

    def test_thieu_metadata_va_sai_san_dung_truoc_khi_tai_gia(self):
        args, client, module = self.setup_run()
        args.symbols = 'MBB'
        with self.assertRaises(ValueError):
            self.run_args(args, module)
        client.history.assert_not_called()

    def test_khong_ghi_du_lieu_vao_thu_muc_public(self):
        args, client, module = self.setup_run()
        args.output = Path(__file__).parents[1]/'public/data/market.json'
        with self.assertRaises(ValueError):
            self.run_args(args, module)
        client.listings.assert_not_called()

    def test_bat_buoc_danh_muc_ca_nhan_va_khong_resume_nguon_cu(self):
        for setting in ('empty', 'resume', 'duplicate'):
            args, client, module = self.setup_run()
            if setting == 'empty':
                args.symbols = ''
            elif setting == 'resume':
                args.resume = True
            else:
                args.symbols = 'FPT,FPT'
            with self.assertRaises(ValueError):
                self.run_args(args, module)
            client.listings.assert_not_called()


if __name__ == '__main__':
    unittest.main()
