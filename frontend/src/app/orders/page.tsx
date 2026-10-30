'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RequireAuth } from '@/components/RequireAuth';
import { StatusBadge } from '@/components/StatusBadge';
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

  if (error) return <p className="alert">{error}</p>;
  if (!orders) return <div className="skeleton">Đang tải đơn hàng…</div>;
  if (orders.length === 0) {
    return (
      <div className="empty">
        <span aria-hidden>📦</span>
        <p>Bạn chưa có đơn hàng nào.</p>
        <Link className="btn" href="/">
          Mua sắm ngay
        </Link>
      </div>
    );
  }

  return (
    <div className="panel table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Mã đơn</th>
            <th>Ngày đặt</th>
            <th>Sản phẩm</th>
            <th>Tổng tiền</th>
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <Link className="link" href={`/orders/${o.id}`}>
                  #{shortId(o.id)}
                </Link>
              </td>
              <td>{formatDate(o.createdAt)}</td>
              <td className="truncate">
                {o.items.map((i) => `${i.product.name} ×${i.quantity}`).join(', ')}
              </td>
              <td className="price">{formatPrice(o.totalAmount)}</td>
              <td>
                <StatusBadge status={o.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <section>
      <h1 className="page-title">Đơn hàng của tôi</h1>
      <RequireAuth>
        <OrderList />
      </RequireAuth>
    </section>
  );
}
