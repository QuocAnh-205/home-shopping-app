'use client';

import { faBoxOpen, faChevronRight, faReceipt, faSpinner, faStore, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { RequireAuth } from '@/components/RequireAuth';
import { StatusBadge } from '@/components/StatusBadge';
import { apiFetch, useSession } from '@/lib/client-api';
import { formatDate, formatPrice, shortId, type Order } from '@/lib/types';

/** Tab "Đơn mua" kiểu Shopee (khớp ORDER_TABS ở backend) */
const TABS = [
  { key: '', label: 'Tất cả' },
  { key: 'awaiting_payment', label: 'Chờ thanh toán' },
  { key: 'to_ship', label: 'Vận chuyển' },
  { key: 'shipping', label: 'Chờ giao hàng' },
  { key: 'completed', label: 'Hoàn thành' },
  { key: 'cancelled', label: 'Đã hủy' },
  { key: 'return', label: 'Trả hàng/Hoàn tiền' },
] as const;

const PREVIEW_ITEMS = 2;

/** Nút hành động chính hiển thị ở chân thẻ đơn (cả thẻ là link sang chi tiết) */
function primaryAction(o: Order): { label: string; strong: boolean } {
  if (o.status === 'AWAITING_PAYMENT') return { label: o.transferClaimedAt ? 'Xem trạng thái' : 'Thanh toán ngay', strong: !o.transferClaimedAt };
  if (o.status === 'SHIPPING') return { label: 'Đã nhận hàng', strong: true };
  if (o.status === 'DELIVERED') return { label: 'Đánh giá / Hoàn thành', strong: true };
  if (o.status === 'COMPLETED' || o.status === 'CANCELLED') return { label: 'Mua lại', strong: false };
  return { label: 'Xem chi tiết', strong: false };
}

function OrderCard({ o }: { o: Order }) {
  const shown = o.items.slice(0, PREVIEW_ITEMS);
  const more = o.items.length - shown.length;
  const qty = o.items.reduce((n, i) => n + i.quantity, 0);
  const action = primaryAction(o);
  return (
    <Link href={`/orders/${o.id}`} className="order-card">
      <div className="order-card-head">
        <span className="order-card-shop">
          <FontAwesomeIcon icon={faStore} /> Home Shopping
        </span>
        <StatusBadge status={o.status} transferClaimed={Boolean(o.transferClaimedAt)} />
      </div>
      <ul className="order-card-items">
        {shown.map((i) => (
          <li key={i.id}>
            {i.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={i.imageUrl} alt="" width={64} height={64} loading="lazy" />
            ) : (
              <span className="order-card-thumb" aria-hidden />
            )}
            <span className="order-card-name">
              {i.productName}
              <span className="muted small">x{i.quantity}</span>
            </span>
            <span className="order-card-price">{formatPrice(i.unitPrice)}</span>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="order-card-more muted small">Xem thêm {more} sản phẩm khác</p>}
      <div className="order-card-foot">
        <span className="muted small">
          #{shortId(o.id)} · {formatDate(o.createdAt)}
        </span>
        <span>
          <span className="muted small">{qty} sản phẩm · Thành tiền: </span>
          <strong className="price">{formatPrice(o.totalAmount)}</strong>
        </span>
      </div>
      <div className="order-card-actions">
        <span className={action.strong ? 'btn btn-sm' : 'btn btn-sm btn-ghost'}>
          {action.label} <FontAwesomeIcon icon={faChevronRight} />
        </span>
      </div>
    </Link>
  );
}

function OrderList() {
  const router = useRouter();
  const params = useSearchParams();
  const { session } = useSession();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initial = params.get('tab') ?? '';
  const [tab, setTab] = useState<string>(TABS.some((t) => t.key === initial) ? initial : '');
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session) return;
    setOrders(null);
    setError(null);
    apiFetch<Order[]>(tab ? `/orders?tab=${tab}` : '/orders')
      .then(setOrders)
      .catch((err: Error) => setError(err.message));
  }, [session, tab]);

  // Tab đang chọn luôn nằm trong tầm nhìn khi thanh tab cuộn ngang (điện thoại)
  useEffect(() => {
    tabsRef.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [tab]);

  function choose(key: string) {
    setTab(key);
    router.replace(key ? `/orders?tab=${key}` : '/orders', { scroll: false });
  }

  return (
    <>
      <div className="order-tabs" role="tablist" aria-label="Lọc đơn hàng" ref={tabsRef}>
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'active' : undefined} onClick={() => choose(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {error ? (
        <p className="alert">
          <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
        </p>
      ) : !orders ? (
        <div className="skeleton">
          <FontAwesomeIcon icon={faSpinner} spin /> Đang tải đơn hàng…
        </div>
      ) : orders.length === 0 ? (
        <EmptyState icon={faBoxOpen} title={tab ? 'Chưa có đơn hàng nào ở mục này' : 'Bạn chưa có đơn hàng nào'}>
          <p>Đơn hàng sẽ xuất hiện ở đây sau khi bạn đặt mua.</p>
          <Link className="btn" href="/#products">
            Mua sắm ngay
          </Link>
        </EmptyState>
      ) : (
        <div className="order-cards">
          {orders.map((o) => (
            <OrderCard key={o.id} o={o} />
          ))}
        </div>
      )}
    </>
  );
}

export default function OrdersPage() {
  return (
    <section>
      <h1 className="page-title">
        <FontAwesomeIcon icon={faReceipt} /> Đơn mua
      </h1>
      <RequireAuth>
        <Suspense
          fallback={
            <div className="skeleton">
              <FontAwesomeIcon icon={faSpinner} spin /> Đang tải đơn hàng…
            </div>
          }
        >
          <OrderList />
        </Suspense>
      </RequireAuth>
    </section>
  );
}
