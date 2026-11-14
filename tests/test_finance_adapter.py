"""Kiểm thử phục hồi nguồn tài chính, không gọi API trong CI."""
import importlib.util
import io
import json
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
import pandas as pd

spec = importlib.util.spec_from_file_location('finance_adapter', Path(__file__).parents[1] / 'server/ai/finance_adapter.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class FinanceAdapterTests(unittest.TestCase):
    def test_nguon_chua_cau_hinh_khong_goi_sdk_hoac_tra_so_gia(self):
        with patch.dict(sys.modules, {'vnstock': None}):
            with self.assertRaises(module.FinanceSourceUnavailableError):
                module.read_finance('FPT')

    def test_cli_phan_biet_chua_co_nguon_voi_thieu_dependency(self):
        result = subprocess.run([sys.executable, '-X', 'utf8', str(Path(module.__file__))],
                                input=json.dumps({'ticker': 'FPT'}), text=True, encoding='utf-8',
                                capture_output=True, timeout=10, check=True)
        payload = json.loads(result.stdout)
        self.assertFalse(payload['ok'])
        self.assertEqual(payload['code'], 'FINANCE_SOURCE_UNAVAILABLE')
        self.assertIn('cấu hình', payload['message'])
        self.assertNotIn('tables', payload)

    def test_pdf_van_doc_duoc_khi_chua_cau_hinh_nguon_bctc(self):
        import base64
        from pypdf import PdfWriter
        buffer = io.BytesIO()
        writer = PdfWriter()
        writer.add_blank_page(width=100, height=100)
        writer.write(buffer)
        payload = module.main({'type': 'pdf', 'data': base64.b64encode(buffer.getvalue()).decode()})
        self.assertEqual(payload['pages'], 1)
        self.assertEqual(payload['pagesRead'], 1)
        self.assertEqual(payload['text'], '')

    def test_ratio_error_preserves_three_statement_tables(self):
        class Finance:
            def __init__(self, **kwargs): pass
            def income_statement(self): return pd.DataFrame([{'yearReport': 2026, 'Revenue (Bn. VND)': 100}])
            balance_sheet = income_statement
            cash_flow = income_statement
            def ratio(self): raise PermissionError('Nội dung lỗi không được lộ')
        result = module.read_finance('MSR', Finance)
        self.assertEqual(result['tables']['income_statement'][0]['Revenue (Bn. VND)'], 100)
        self.assertEqual(len(result['tables']['balance_sheet']), 1)
        self.assertEqual(result['tables']['ratio'], [])
        self.assertNotIn('Nội dung lỗi', str(result))

    def test_long_report_keeps_all_metrics_of_latest_periods(self):
        frame = pd.DataFrame([{'period': period, 'name': name, 'value': 1, 'unit': 'VND'} for period in ['2025Q3', '2025Q4', '2026Q1', '2026Q2', '2026Q3'] for name in ['Doanh thu', 'Lợi nhuận', 'Tài sản']])
        rows, _ = module.table_records(frame)
        self.assertEqual(len(rows), 12)
        self.assertEqual({r['period'] for r in rows}, {'2025Q4', '2026Q1', '2026Q2', '2026Q3'})

    def test_transposed_items_keep_all_metrics_and_latest_four_quarters(self):
        frame = pd.DataFrame([{'item': name, 'item_en': name, 'item_id': name, **{period: i for i, period in enumerate(['2025-Q1', '2025-Q2', '2025-Q3', '2025-Q4', '2026-Q1', '2026-Q2', '2026-Q3'])}} for name in ['Sales', 'Profit', 'Assets', 'Debt', 'Equity', 'Cash flow']])
        rows, truncated = module.table_records(frame)
        self.assertEqual(len(rows), 6)
        self.assertFalse(truncated)
        self.assertEqual(list(rows[0]), ['item', 'item_en', 'item_id', '2026-Q3', '2026-Q2', '2026-Q1', '2025-Q4'])
        self.assertEqual(rows[-1]['2026-Q3'], 6)

    def test_progress_keeps_earlier_tables_and_final_is_complete(self):
        seen = []
        class Finance:
            def __init__(self, **kwargs): pass
            def income_statement(self): return pd.DataFrame([{'item': 'Doanh thu', '2026-Q3': 100}])
            balance_sheet = income_statement
            cash_flow = income_statement
            ratio = income_statement
        result = module.read_finance('MSR', Finance, on_progress=seen.append)
        self.assertEqual(len(seen), 4)
        self.assertEqual(seen[0]['tables']['income_statement'][0]['2026-Q3'], 100)
        self.assertEqual(seen[0]['tables']['cash_flow'], [])
        self.assertTrue(seen[0]['collectionIncomplete'])
        self.assertIn('cash_flow', seen[0]['tableErrors'])
        self.assertFalse(result['collectionIncomplete'])
        self.assertEqual(result['tables']['cash_flow'][0]['2026-Q3'], 100)

    def test_wide_report_sorts_latest_quarters_without_unit_conversion(self):
        frame = pd.DataFrame([{'yearReport': 2025, 'lengthReport': 4, 'Revenue (Bn. VND)': 5}, {'yearReport': 2026, 'lengthReport': 2, 'Revenue (Bn. VND)': 7}])
        rows, _ = module.table_records(frame)
        self.assertEqual(rows[0]['yearReport'], 2026)
        self.assertEqual(rows[0]['Revenue (Bn. VND)'], 7)

if __name__ == '__main__': unittest.main()
