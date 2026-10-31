/** Skeleton hiển thị ngay khi chuyển trang trong lúc server render dữ liệu */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Đang tải">
      <div className="skeleton-card" style={{ height: 220, marginBottom: 24 }} />
      <div className="grid">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="skeleton-card" />
        ))}
      </div>
    </div>
  );
}
