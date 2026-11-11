import { faHeadset, faMoneyBillWave, faRotateLeft, faTruckFast } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

const ITEMS = [
  { icon: faTruckFast, title: 'Giao nhanh toàn quốc', sub: 'Miễn phí ship đơn từ 500K' },
  { icon: faRotateLeft, title: 'Trả hàng 15 ngày', sub: 'Yêu cầu ngay trong Đơn mua' },
  { icon: faMoneyBillWave, title: 'COD & online', sub: 'Kiểm tra hàng rồi trả tiền, hoặc VNPay / MoMo' },
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
