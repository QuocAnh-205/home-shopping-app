import { faHeadset, faMoneyBillWave, faRotateLeft, faTruckFast } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

const ITEMS = [
  { icon: faTruckFast, title: 'Giao nhanh 2 giờ', sub: 'Nội thành, miễn phí mọi đơn' },
  { icon: faRotateLeft, title: 'Đổi trả 30 ngày', sub: 'Lỗi là đổi, không cần lý do' },
  { icon: faMoneyBillWave, title: 'Thanh toán COD', sub: 'Kiểm tra hàng rồi mới trả tiền' },
  { icon: faHeadset, title: 'Hỗ trợ 8h – 21h', sub: 'Tư vấn tận tâm mỗi ngày' },
];

export function TrustBar() {
  return (
    <section className="trust" aria-label="Cam kết dịch vụ">
      {ITEMS.map((i) => (
        <div className="trust-item" key={i.title}>
          <span className="ico" aria-hidden>
            <FontAwesomeIcon icon={i.icon} />
          </span>
          <div>
            <strong>{i.title}</strong>
            <span>{i.sub}</span>
          </div>
        </div>
      ))}
    </section>
  );
}
