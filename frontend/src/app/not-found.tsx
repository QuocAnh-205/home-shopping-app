import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="panel" style={{ marginTop: 32, textAlign: 'center' }}>
      <h1>404 - Không tìm thấy trang</h1>
      <p className="muted">Sản phẩm có thể đã ngừng kinh doanh hoặc đường dẫn không đúng.</p>
      <Link className="btn" href="/">
        Về trang chủ
      </Link>
    </section>
  );
}
