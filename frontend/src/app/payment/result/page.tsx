'use client';

import { faCircleCheck, faCircleXmark, faReceipt, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { RequireAuth } from '@/components/RequireAuth';
import { apiFetch } from '@/lib/client-api';
import { formatPrice, shortId, type Order, type PaymentInfo } from '@/lib/types';

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Trang cổng thanh toán chuyển khách về (return URL). Trang này CHỈ HIỂN THỊ: trạng thái đơn chỉ đổi khi backend
 * nhận IPN có chữ ký từ server cổng. Vì IPN có thể đến chậm vài giây nên trang hỏi lại backend định kỳ.
 */
function Result() {
  const orderId = useSearchParams().get('order') ?? '';
  const [order, setOrder] = useState<Order | null>(null);
  const [latest, setLatest] = useState<PaymentInfo | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (!UUID_RE.test(orderId)) return;
    let stop = false;
    async function poll(n: number) {
      const [o, payments] = await Promise.all([
        apiFetch<Order>(`/orders/${orderId}`).catch(() => null),
        apiFetch<PaymentInfo[]>(`/orders/${orderId}/payments`).catch(() => []),
      ]);
      if (stop) return;
      setOrder(o);
      setLatest(payments[0] ?? null);
      setTries(n);
      const settled = !o || o.paymentStatus !== 'UNPAID' || o.status !== 'AWAITING_PAYMENT' || (payments[0] && payments[0].status !== 'PENDING');
      if (!settled && n < 15) setTimeout(() => poll(n + 1), 2000);
    }
    void poll(0);
    return () => {
      stop = true;
    };
  }, [orderId]);

  if (!UUID_RE.test(orderId)) return <p className="alert">Thiếu mã đơn hàng</p>;
  if (!order) {
    return (
      <div className="skeleton">
        <FontAwesomeIcon icon={faSpinner} spin /> Đang kiểm tra kết quả thanh toán…
      </div>
    );
  }

  const paid = order.paymentStatus === 'PAID';
  const waiting = !paid && order.status === 'AWAITING_PAYMENT' && (!latest || latest.status === 'PENDING') && tries < 15;
  return (
    <section className="panel success">
      <span className="success-ico" aria-hidden style={paid ? undefined : { color: waiting ? 'var(--info)' : 'var(--danger)' }}>
        <FontAwesomeIcon icon={paid ? faCircleCheck : waiting ? faSpinner : faCircleXmark} spin={waiting} />
      </span>
      <h1 className="page-title">{paid ? 'Thanh toán thành công!' : waiting ? 'Đang chờ xác nhận từ cổng thanh toán…' : 'Thanh toán chưa thành công'}</h1>
      <p>
        Đơn <strong>#{shortId(order.id)}</strong> · {formatPrice(order.totalAmount)}
      </p>
      {!paid && !waiting && order.status === 'AWAITING_PAYMENT' && <p className="muted">Bạn có thể thanh toán lại hoặc đổi phương thức trước khi hết thời gian giữ hàng.</p>}
      <div className="row row-center">
        <Link className="btn" href={`/orders/${order.id}`}>
          <FontAwesomeIcon icon={faReceipt} /> {paid ? 'Xem đơn hàng' : 'Về đơn hàng'}
        </Link>
        <Link className="btn btn-ghost" href="/">
          Tiếp tục mua sắm
        </Link>
      </div>
    </section>
  );
}

export default function PaymentResultPage() {
  return (
    <section>
      <RequireAuth>
        <Suspense fallback={null}>
          <Result />
        </Suspense>
      </RequireAuth>
    </section>
  );
}
