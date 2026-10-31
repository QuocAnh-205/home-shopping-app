import { faCircleCheck, faCircleXmark, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

export function StockBadge({ stock }: { stock: number }) {
  if (stock <= 0) {
    return (
      <span className="badge badge-danger">
        <FontAwesomeIcon icon={faCircleXmark} /> Hết hàng
      </span>
    );
  }
  if (stock <= 5) {
    return (
      <span className="badge badge-warn">
        <FontAwesomeIcon icon={faTriangleExclamation} /> Chỉ còn {stock} sản phẩm
      </span>
    );
  }
  return (
    <span className="badge badge-ok">
      <FontAwesomeIcon icon={faCircleCheck} /> Còn hàng
    </span>
  );
}
