'use client';

import { faCircleCheck, faClock, faHourglassHalf, faMagnifyingGlass, faShieldHalved, faSpinner, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/client-api';
import { POLICY, SITE } from '@/lib/site';
import { formatDay, formatWarranty } from '@/lib/types';

type WarrantyState = 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'NOT_DELIVERED' | 'NO_WARRANTY';

interface WarrantyResult {
  orderCode: string;
  orderedAt: string;
  deliveredAt: string | null;
  status: string;
  items: {
    productName: string;
    productSlug: string;
    quantity: number;
    warrantyMonths: number | null;
    startsAt: string | null;
    expiresAt: string | null;
    daysLeft: number | null;
    state: WarrantyState;
  }[];
}

const STATE: Record<WarrantyState, { label: string; tone: string; icon: typeof faCircleCheck }> = {
  ACTIVE: { label: 'Còn bảo hành', tone: 'badge-ok', icon: faCircleCheck },
  EXPIRING: { label: 'Sắp hết hạn', tone: 'badge-warn', icon: faHourglassHalf },
  EXPIRED: { label: 'Hết bảo hành', tone: 'badge-danger', icon: faTriangleExclamation },
  NOT_DELIVERED: { label: 'Chưa kích hoạt (chưa giao)', tone: 'badge-warn', icon: faClock },
  NO_WARRANTY: { label: 'Không áp dụng bảo hành', tone: '', icon: faShieldHalved },
};

function Lookup() {
  const params = useSearchParams();
  const [code, setCode] = useState(params.get('order') ?? '');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WarrantyResult | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await apiFetch<WarrantyResult>('/warranty/lookup', { method: 'POST', body: JSON.stringify({ orderCode: code, phone }) }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="warranty-layout">
      <form className="panel warranty-form" onSubmit={submit}>
        <h2 className="panel-title">
          <FontAwesomeIcon icon={faMagnifyingGlass} /> Nhập thông tin đơn hàng
        </h2>
        <label className="field">
          Mã đơn hàng
          <input
            className="input"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Ví dụ: 3D2290DE"
            maxLength={40}
            autoCapitalize="characters"
            spellCheck={false}
          />
          <small className="muted">8 ký tự in trên trang Đơn mua / email xác nhận (dấu # có thể bỏ qua)</small>
        </label>
        <label className="field">
          Số điện thoại nhận hàng
          <input className="input" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xx xxx xxx" inputMode="tel" maxLength={15} />
        </label>
        <button className="btn btn-block" disabled={busy}>
          {busy ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faShieldHalved} />} Tra cứu bảo hành
        </button>
        {error && (
          <p className="alert" role="alert">
            <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
          </p>
        )}
        <p className="muted small">
          {POLICY.warranty}. Thời hạn tính từ ngày nhận hàng. Cần hỗ trợ: {POLICY.support}.
        </p>
      </form>

      <div className="warranty-result" aria-live="polite">
        {!result ? (
          <div className="panel warranty-hint">
            <FontAwesomeIcon icon={faShieldHalved} className="warranty-hint-ico" />
            <h2>Bảo hành điện tử – không cần giữ phiếu giấy</h2>
            <p className="muted">
              Mỗi đơn hàng tại {SITE.name} được kích hoạt bảo hành tự động khi giao thành công. Nhập mã đơn và số điện thoại để xem từng thiết bị còn bảo
              hành tới ngày nào.
            </p>
          </div>
        ) : (
          <div className="panel">
            <div className="warranty-head">
              <div>
                <h2>Đơn #{result.orderCode}</h2>
                <p className="muted small">
                  Đặt ngày {formatDay(result.orderedAt)}
                  {result.deliveredAt ? ` · Giao ngày ${formatDay(result.deliveredAt)}` : ' · Chưa giao'}
                </p>
              </div>
            </div>
            <ul className="warranty-items">
              {result.items.map((i) => {
                const st = STATE[i.state];
                return (
                  <li key={i.productSlug + i.productName}>
                    <div>
                      <Link className="link" href={`/products/${i.productSlug}`}>
                        {i.productName}
                      </Link>
                      <span className="muted small">
                        {' '}
                        × {i.quantity} · Bảo hành {formatWarranty(i.warrantyMonths) ?? 'không áp dụng'}
                      </span>
                    </div>
                    <div className="warranty-state">
                      <span className={`badge ${st.tone}`}>
                        <FontAwesomeIcon icon={st.icon} /> {st.label}
                      </span>
                      {i.expiresAt && (
                        <span className="small">
                          Đến <strong>{formatDay(i.expiresAt)}</strong>
                          {i.daysLeft ? ` · còn ${i.daysLeft} ngày` : ''}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WarrantyPage() {
  return (
    <section>
      <h1 className="page-title">
        <FontAwesomeIcon icon={faShieldHalved} /> Tra cứu bảo hành điện tử
      </h1>
      <Suspense fallback={null}>
        <Lookup />
      </Suspense>
    </section>
  );
}
