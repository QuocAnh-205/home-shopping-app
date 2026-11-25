import { faHeadset, faMoneyBillWave, faRotateLeft, faTruckFast } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { POLICY, SITE } from '@/lib/site';

const ITEMS = [
  { icon: faTruckFast, title: 'Giao nhanh toàn quốc', sub: POLICY.freeShipShort },
  { icon: faRotateLeft, title: POLICY.returns, sub: 'Yêu cầu ngay trong Đơn mua' },
  { icon: faMoneyBillWave, title: 'Thanh toán linh hoạt', sub: 'COD, VNPay, MoMo, VietQR' },
  { icon: faHeadset, title: `Hỗ trợ ${SITE.supportHoursShort}`, sub: `Hotline ${SITE.hotline}` },
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
