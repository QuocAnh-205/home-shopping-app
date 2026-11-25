import { isInternalReadRequest, isPrivateAddress } from './internal-request';

describe('isPrivateAddress', () => {
  it.each(['10.0.0.5', '172.18.0.4', '172.31.255.1', '192.168.1.2', '127.0.0.1', '::1', '::ffff:172.18.0.5', 'fd00::1'])('%s is internal', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(['13.214.14.196', '172.32.0.1', '172.15.0.1', '8.8.8.8', '::ffff:1.2.3.4', '2001:db8::1', 'not-an-ip', undefined])('%s is NOT internal', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe('isInternalReadRequest (miễn giới hạn tần suất cho SSR nội bộ)', () => {
  const ssr = { method: 'GET', headers: { accept: 'application/json' }, socket: { remoteAddress: '::ffff:172.18.0.7' } };

  it('frontend SSR (GET, mạng nội bộ, không qua Nginx) được miễn', () => {
    expect(isInternalReadRequest(ssr)).toBe(true);
    expect(isInternalReadRequest({ ...ssr, method: 'HEAD' })).toBe(true);
  });

  it('request của khách đi qua Nginx (luôn có X-Forwarded-For) vẫn bị đếm', () => {
    expect(isInternalReadRequest({ ...ssr, headers: { 'x-forwarded-for': '113.161.1.1' } })).toBe(false);
    expect(isInternalReadRequest({ ...ssr, headers: { 'x-real-ip': '113.161.1.1' } })).toBe(false);
  });

  it('ghi dữ liệu (đăng nhập, đặt hàng) không bao giờ được miễn, kể cả từ nội bộ', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(isInternalReadRequest({ ...ssr, method })).toBe(false);
  });

  it('IP công cộng không có header vẫn bị đếm', () => {
    expect(isInternalReadRequest({ ...ssr, socket: { remoteAddress: '13.214.14.196' } })).toBe(false);
  });
});
