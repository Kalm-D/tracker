"""Hồi quy probe mạng: giữ host cố định, bỏ IP nội bộ và không dùng credential."""
import importlib.util
from pathlib import Path
import socket
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('probe_dnse_network', Path(__file__).parents[1]/'tools/probe-dnse-network.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class NetworkTests(unittest.TestCase):
    def test_dns_loi_khong_lo_thong_bao_riêng(self):
        with patch.object(probe.socket, 'getaddrinfo', side_effect=OSError('private-message')):
            report = probe.probe()
        self.assertEqual(report, [{'phase': 'dns', 'error': 'OSError', 'reachable': False}])

    def test_khong_ket_noi_dia_chi_noi_bo(self):
        with patch.object(probe.socket, 'getaddrinfo', return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('127.0.0.1',443))]), patch.object(probe.socket, 'socket') as connection:
            self.assertEqual(probe.probe(), [])
        connection.assert_not_called()
