"""Kiểm định hợp đồng DNSE và cache ngành bằng fixture, không gọi nguồn thật."""
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import pandas as pd


def load_tool(name):
    file = Path(__file__).parents[1] / 'tracker-tools' / (name + '.py')
    spec = importlib.util.spec_from_file_location(name, file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


exporter = load_tool('tracker_data_exporter')
sector = load_tool('sector_data')


def sdk_frame():
    frame = pd.DataFrame({'time': pd.to_datetime(['2026-11-09 07:00', '2026-11-10 07:00']).tz_localize('Asia/Ho_Chi_Minh'),
                          'open': [10., 11.], 'high': [12., 13.], 'low': [9., 10.],
                          'close': [11., 12.], 'volume': [120., 220.]})
    frame.attrs.update(source='dnse', last_bar_partial=False)
    return frame


class DnseAdapterTests(unittest.TestCase):
    def fetch(self, frame, is_index=False):
        market = Mock()
        market.equity.return_value.ohlcv.return_value = frame
        market.index.return_value.ohlcv.return_value = frame
        sdk = SimpleNamespace(__version__='6.0.0', Market=Mock(return_value=market))
        ticker = 'VNINDEX' if is_index else 'FPT'
        with patch.dict(sys.modules, {'vnstock': sdk}):
            result = exporter.fetch_ohlcv(ticker, '2026-11-01', '2026-11-10', 'DNSE', is_index)
        sdk.Market.assert_called_once_with('dnse')
        asset = market.index if is_index else market.equity
        asset.assert_called_once_with(ticker)
        asset.return_value.ohlcv.assert_called_once_with(start='2026-11-01', end='2026-11-10',
                                                       interval='1D', floating=None, compat='v6')
        return result

    def test_api_giu_do_chinh_xac_va_khai_bao_don_vi(self):
        for is_index in (False, True):
            with self.subTest(is_index=is_index):
                frame = self.fetch(sdk_frame(), is_index)
                self.assertEqual(frame.attrs['tracker_source'], 'DNSE')
                self.assertEqual(frame.attrs['tracker_price_scale'], 1 if is_index else 1000)

    def test_nguon_khac_hoac_thieu_provenance_bi_tu_choi(self):
        for source in ('ssi', None):
            frame = sdk_frame()
            frame.attrs['source'] = source
            with self.subTest(source=source), self.assertRaises(ValueError):
                self.fetch(frame)

    def test_ngay_trung_ngoai_cua_so_va_thieu_bi_tu_choi(self):
        for dates in (['2026-11-10', '2026-11-10'], ['2026-10-31', '2026-11-10'],
                      ['2026-11-10', '2026-11-11'], ['2026-11-10', None]):
            frame = sdk_frame()
            frame['time'] = pd.to_datetime(dates)
            with self.subTest(dates=dates), self.assertRaises(ValueError):
                self.fetch(frame)

    def test_gia_co_phieu_lon_va_chi_so_nho_khong_bi_suy_doan_don_vi(self):
        for is_index, close, expected in ((False, 1234.567, 1234567.), (True, 150.123, 150.123)):
            frame = sdk_frame()
            frame['close'] = close
            frame = self.fetch(frame, is_index)
            normalized = exporter.normalize_ohlcv_df(frame, 'ZZU', 'INDEX' if is_index else 'HOSE', '', 320)
            self.assertAlmostEqual(normalized.iloc[-1]['close'], expected)
            self.assertAlmostEqual(normalized.iloc[-1]['value'], expected * 220)

    def test_bo_nen_chua_dong_giu_dau_vet_sdk(self):
        frame = self.fetch(sdk_frame())
        frame.attrs['last_bar_partial'] = True
        evidence = exporter.sdk_quality_fields(pd, frame)
        normalized = exporter.normalize_ohlcv_df(frame, 'FPT', 'HOSE', '', 320)
        self.assertEqual(evidence['sdk_last_date'], '2026-11-10')
        self.assertEqual(normalized['date'].tolist(), ['2026-11-09'])

    def test_danh_muc_mot_lan_khong_dung_ma_mau(self):
        reference = Mock()
        reference.equity.list.return_value = pd.DataFrame({'symbol': ['FPT', 'PVS', 'ACV'], 'exchange': ['HOSE', 'HNX', 'UPCOM']})
        sdk = SimpleNamespace(__version__='6.0.0', Reference=Mock(return_value=reference))
        with patch.dict(sys.modules, {'vnstock': sdk}):
            rows = exporter.get_universe('', '', 0, 'ALL', 'DNSE')
        sdk.Reference.assert_called_once_with('dnse')
        reference.equity.list.assert_called_once_with(exchange=None, compat='v6')
        self.assertEqual([row['ticker'] for row in rows], ['FPT', 'PVS', 'ACV'])
        with patch.object(exporter, 'fetch_universe_from_vnstock', return_value=[]), self.assertRaises(RuntimeError):
            exporter.get_universe('', '', 0, 'ALL', 'DNSE')

    def test_thieu_san_khong_suy_doan_theo_ticker(self):
        reference = Mock()
        reference.equity.list.return_value = pd.DataFrame({'symbol': ['FPT'], 'exchange': [None]})
        sdk = SimpleNamespace(__version__='6.0.0', Reference=Mock(return_value=reference))
        with patch.dict(sys.modules, {'vnstock': sdk}), self.assertRaises(ValueError):
            exporter.fetch_universe_from_vnstock()

    def test_ma_nhap_tay_dung_san_xac_thuc_va_khong_tao_ma_ngoai_nguon(self):
        listed = [{'ticker': 'FPT', 'exchange': 'HOSE', 'sector': ''},
                  {'ticker': 'PVS', 'exchange': 'HNX', 'sector': ''}]
        with patch.object(exporter, 'fetch_universe_from_vnstock', return_value=listed) as fetch:
            result = exporter.get_universe('FPT,PVS', '', 0, 'ALL')
            self.assertEqual([item['exchange'] for item in result], ['HOSE', 'HNX'])
            fetch.assert_called_once_with('ALL', 'DNSE')
            with self.assertRaises(ValueError):
                exporter.get_universe('ZZU', '', 0, 'ALL')
            with self.assertRaises(ValueError):
                exporter.get_universe('FPT', '', 0, 'HNX')

    def test_retry_loi_tam_thoi_va_khong_retry_loi_khoa(self):
        class SourceError(Exception):
            retryable = True
            kind = 'network'

        class CredentialError(Exception):
            retryable = True
            kind = 'credential'

        for error, expected in ((SourceError('loi'), 2), (CredentialError('secret-rieng'), 1)):
            with (patch.object(exporter, 'fetch_ohlcv', side_effect=[error, sdk_frame()]) as fetch,
                  patch.object(exporter.time, 'sleep') as sleep, redirect_stdout(io.StringIO())):
                if expected == 1:
                    with self.assertRaises(CredentialError):
                        exporter.fetch_ohlcv_with_retry('FPT', '', '', 'DNSE', False, 2, 70)
                else:
                    exporter.fetch_ohlcv_with_retry('FPT', '', '', 'DNSE', False, 2, 70)
                self.assertEqual(fetch.call_count, expected)
                self.assertEqual(sleep.call_count, expected - 1)
        self.assertEqual(exporter.safe_error(CredentialError('secret-rieng')), 'CredentialError')
        error = CredentialError('secret-rieng')
        error.code = 401
        self.assertEqual(exporter.safe_error(error), 'CredentialError')

    def test_cli_csv_va_resume_giu_metadata_khong_tai_gia_lap_lai(self):
        reference = Mock()
        reference.equity.list.return_value = pd.DataFrame({'symbol': ['FPT', 'PVS'], 'exchange': ['HOSE', 'HNX']})
        market = Mock()
        market.equity.return_value.ohlcv.side_effect = lambda **kwargs: sdk_frame()
        market.index.return_value.ohlcv.side_effect = lambda **kwargs: sdk_frame()
        sdk = SimpleNamespace(__version__='6.0.0', Market=Mock(return_value=market), Reference=Mock(return_value=reference))
        sectors = SimpleNamespace(load_sectors=lambda: {})
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'market.csv'
            quality = Path(folder) / 'quality.csv'
            args = ['exporter', '--symbols', 'FPT,PVS', '--source', 'DNSE', '--min-rows', '1',
                    '--sleep', '0', '--output', str(output), '--quality-output', str(quality),
                    '--errors-output', str(Path(folder) / 'errors.csv')]
            with (patch.dict(sys.modules, {'vnstock': sdk, 'sector_data': sectors}),
                  patch.object(sys, 'argv', args), redirect_stdout(io.StringIO())):
                self.assertEqual(exporter.main(), 0)
            first = pd.read_csv(output)
            self.assertEqual(set(first['source_provider']), {'DNSE'})
            self.assertEqual(set(first['exchange']), {'HOSE', 'HNX', 'INDEX'})
            self.assertEqual(len(first), 6)
            self.assertEqual(sdk.Market.call_count, 3)
            with (patch.dict(sys.modules, {'vnstock': sdk, 'sector_data': sectors}),
                  patch.object(sys, 'argv', args + ['--resume']), redirect_stdout(io.StringIO())):
                self.assertEqual(exporter.main(), 0)
            pd.testing.assert_frame_equal(first, pd.read_csv(output))
            self.assertEqual(sdk.Market.call_count, 3)
            self.assertEqual(len(pd.read_csv(quality)), 3)


class SectorCacheTests(unittest.TestCase):
    def test_cache_cu_giu_ngay_nguon_khong_ghi_de(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'sectors.json'
            stamp = (datetime.now(timezone.utc) - timedelta(days=8)).isoformat()
            file.write_text(json.dumps({'source': 'Vnstock / VCI', 'updatedAt': stamp, 'sectors': {'FPT': 'Cong nghe'}}), encoding='utf-8')
            before = file.read_bytes()
            metadata = {}
            with patch.object(sector, 'CACHE', file), redirect_stdout(io.StringIO()):
                sectors = sector.load_sectors(metadata=metadata)
            result = sector.enrich({'symbols': [{'ticker': 'FPT', 'exchange': 'HOSE', 'rows': []},
                                                {'ticker': 'ZZU', 'exchange': 'HOSE', 'rows': []}]}, sectors, metadata)
            self.assertEqual(file.read_bytes(), before)
            self.assertEqual(result['meta']['sectorSourceUpdatedAt'], stamp)
            self.assertEqual(result['meta']['sectorDataStatus'], 'STALE')
            self.assertEqual(result['meta']['unclassifiedSymbols'], 1)
            self.assertEqual(result['symbols'][1]['sector'], sector.UNKNOWN)

    def test_cache_thieu_hoac_hong_khong_ngan_doc_gia(self):
        for content in (None, '{}', '{"sectors":[]}'):
            with self.subTest(content=content), tempfile.TemporaryDirectory() as folder:
                file = Path(folder) / 'sectors.json'
                if content:
                    file.write_text(content, encoding='utf-8')
                metadata = {}
                with patch.object(sector, 'CACHE', file), redirect_stdout(io.StringIO()):
                    self.assertEqual(sector.load_sectors(metadata=metadata), {})
                self.assertEqual(metadata['sectorDataStatus'], 'MISSING')


if __name__ == '__main__':
    unittest.main()
