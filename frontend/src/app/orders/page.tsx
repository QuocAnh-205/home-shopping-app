'use client';

import { faBoxOpen, faChevronRight, faReceipt, faSpinner, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { RequireAuth } from '@/components/RequireAuth';
import { STATUS_ICON, StatusBadge } from '@/components/StatusBadge';
import { apiFetch, useSession } from '@/lib/client-api';
import { formatDate, formatPrice, shortId, type Order } from '@/lib/types';

function OrderList() {
  const { session } = useSession();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    apiFetch<Order[]>('/orders')
      .then(setOrders)
      .catch((err: Error) => setError(err.message));
  }, [session]);

  if (error) {
    return (
      <p className="alert">
        <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
      </p>
    );
  }
  if (!orders) {
    return (
      <div className="skeleton">
        <FontAwesomeIcon icon={faSpinner} spin /> Đang tải đơn hàng…
      </div>
    );
  }
  if (orders.length === 0) {
    return (
      <EmptyState icon={faBoxOpen} title="Bạn chưa có đơn hàng nào">
        <p>Đơn hàng sẽ xuất hiện ở đây sau khi bạn đặt mua.</p>
        <Link className="btn" href="/#products">
          Mua sắm ngay
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className="order-cards">
      {orders.map((o) => (
        <Link key={o.id} href={`/orders/${o.id}`} className="order-card">
          <span className="ico" aria-hidden>
            <FontAwesomeIcon icon={STATUS_ICON[o.status]} />
          </span>
          <span className="meta">
            <strong>
              #{shortId(o.id)} · <span className="price">{formatPrice(o.totalAmount)}</span>
            </strong>
            <span>
              {formatDate(o.createdAt)} · {o.items.map((i) => `${i.product.name} ×${i.quantity}`).join(', ')}
            </span>
          </span>
          <StatusBadge status={o.status} />
          <FontAwesomeIcon icon={faChevronRight} className="muted" />
        </Link>
      ))}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <section>
      <h1 className="page-title">
        <FontAwesomeIcon icon={faReceipt} /> Đơn hàng của tôi
      </h1>
      <RequireAuth>
        <OrderList />
      </RequireAuth>
    </section>
  );
}
