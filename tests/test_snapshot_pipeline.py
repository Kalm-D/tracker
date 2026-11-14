"""Kiểm tra pack/quarantine và provenance bằng fixture, không truy cập nguồn giá."""
import csv
import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('packer', Path(__file__).parents[1] / 'tracker-tools/pack_market_data.py')
packer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packer)


class SnapshotTests(unittest.TestCase):
    def test_quarantine_preserves_valid_numbers_and_requires_explicit_policy(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / 'input.csv'
            p.write_text('ticker,date,open,high,low,close,volume,source_provider\nFPT,2026-10-30,10,12,9,11,100,KBS\nMBB,2026-10-30,10,8,9,11,100,KBS\n', encoding='utf-8')
            with self.assertRaises(ValueError):
                packer.pack(p, 'Vnstock / KBS')
            payload, invalid = packer.pack(p, 'Vnstock / KBS', quarantine=True)
            self.assertEqual(payload['symbols'][0]['rows'][0], ['2026-10-30', 10, 12, 9, 11, 100])
            self.assertEqual(len(invalid), 1)
            self.assertEqual(payload['meta']['sourceProviders'], ['KBS'])

    def test_duplicate_and_missing_numbers_are_not_silently_overwritten(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / 'input.csv'
            line = 'FPT,2026-10-30,10,12,9,11,100,KBS\n'
            p.write_text('ticker,date,open,high,low,close,volume,source_provider\n' + line * 2, encoding='utf-8')
            with self.assertRaises(ValueError):
                packer.pack(p, 'source', quarantine=True)
            for value in ['', 'NaN', 'None']:
                with self.assertRaises((ValueError, TypeError)):
                    packer.number(value)
