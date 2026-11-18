"""Kiểm tra đường mạng tới đúng API DNSE; không dùng khóa hoặc đọc body giá."""
import ipaddress
import json
import socket
import ssl

HOST = 'openapi.dnse.com.vn'


def probe():
    """Thử tối đa một địa chỉ public mỗi họ IP, luôn kiểm tra chứng chỉ TLS."""
    results, seen = [], set()
    try:
        addresses = socket.getaddrinfo(HOST, 443, type=socket.SOCK_STREAM)
    except OSError as error:
        return [{'phase': 'dns', 'error': type(error).__name__, 'reachable': False}]
    for family, socktype, protocol, _, address in addresses:
        if family in seen or not ipaddress.ip_address(address[0]).is_global:
            continue
        seen.add(family)
        item = {'family': 'IPv4' if family == socket.AF_INET else 'IPv6',
                'address': address[0], 'phase': 'tcp', 'reachable': False}
        try:
            with socket.socket(family, socktype, protocol) as raw:
                raw.settimeout(6)
                raw.connect(address)
                item['phase'] = 'tls'
                with ssl.create_default_context().wrap_socket(raw, server_hostname=HOST) as connection:
                    item['phase'] = 'http'
                    connection.sendall(('GET /market/instruments?page=1&pageSize=1 HTTP/1.1\r\n'
                                        'Host: ' + HOST + '\r\nConnection: close\r\n'
                                        'User-Agent: Tracker-Network-Health\r\n\r\n').encode())
                    # Chỉ lấy status line, không tải body hoặc dữ liệu thị trường.
                    line = connection.makefile('rb').readline(128).decode('ascii', errors='replace')
                    item['status'] = int(line.split()[1])
                    item['reachable'] = 100 <= item['status'] <= 599
        except (OSError, ValueError, IndexError) as error:
            item['error'] = type(error).__name__
        results.append(item)
    return results


if __name__ == '__main__':
    print(json.dumps({'host': HOST, 'credentialsUsed': False, 'bodyRead': False, 'checks': probe()}))
