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


if __name__ == '__main__':
    unittest.main()
