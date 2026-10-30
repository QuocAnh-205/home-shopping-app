'use client';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="panel" style={{ marginTop: 32, textAlign: 'center' }}>
      <h1>Đã có lỗi xảy ra</h1>
      <p className="muted">Hệ thống đang bận, vui lòng thử lại sau ít phút.</p>
      <button className="btn" onClick={reset}>
        Thử lại
      </button>
    </section>
  );
}
