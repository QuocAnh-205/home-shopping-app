export function StockBadge({ stock }: { stock: number }) {
  if (stock <= 0) return <span className="badge badge-danger">Hết hàng</span>;
  if (stock <= 5) return <span className="badge badge-warn">Chỉ còn {stock}</span>;
  return <span className="badge badge-ok">Còn hàng</span>;
}
