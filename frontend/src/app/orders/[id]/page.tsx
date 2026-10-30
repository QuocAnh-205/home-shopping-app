'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { RequireAuth } from '@/components/RequireAuth';
import { StatusBadge } from '@/components/StatusBadge';
import { apiFetch } from '@/lib/client-api';
import { STATUS_LABEL, formatDate, formatPrice, shortId, type Order, type OrderStatus } from '@/lib/types';

const FLOW: OrderStatus[] = ['PENDING', 'PAID', 'SHIPPING', 'COMPLETED'];
const UUID_RE = /^[0-9a-f-]{36}$/i;

function OrderDetail({ id }: { id: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(() => {
    apiFetch<Order>(`/orders/${id}`)
      .then(setOrder)
      .catch((err: Error) => setError(err.message));
  }, [id]);

  useEffect(load, [load]);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      setOrder(await apiFetch<Order>(`/orders/${id}/cancel`, { method: 'POST' }));
      setConfirming(false);
    } catch (err) {
      setError((err as Error).message);
      load();
    } finally {
      setBusy(false);
    }
  }

  if (error && !order) return <p className="alert">{error}</p>;
  if (!order) return <div className="skeleton">Đang tải đơn hàng…</div>;

  const step = FLOW.indexOf(order.status);

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Đơn hàng #{shortId(order.id)}</h1>
        <StatusBadge status={order.status} />
      </div>
      {error && <p className="alert">{error}</p>}

      {order.status === 'CANCELLED' ? (
        <p className="alert">Đơn hàng đã hủy. Sản phẩm đã được hoàn lại kho.</p>
      ) : (
        <ol className="timeline" aria-label="Tiến trình đơn hàng">
          {FLOW.map((s, i) => (
            <li key={s} className={i <= step ? 'done' : undefined} aria-current={i === step ? 'step' : undefined}>
              {STATUS_LABEL[s]}
            </li>
          ))}
        </ol>
      )}

      <div className="cart-layout">
        <div className="panel table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th>Đơn giá</th>
                <th>SL</th>
                <th>Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link className="link" href={`/products/${i.product.slug}`}>
                      {i.product.name}
                    </Link>
                  </td>
                  <td>{formatPrice(i.unitPrice)}</td>
                  <td>{i.quantity}</td>
                  <td>{formatPrice(Number(i.unitPrice) * i.quantity)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Tổng cộng</td>
                <td className="price">{formatPrice(order.totalAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <aside className="panel">
          <h2>Giao hàng</h2>
          <dl className="summary">
            <dt>Ngày đặt</dt>
            <dd>{formatDate(order.createdAt)}</dd>
            <dt>Cập nhật</dt>
            <dd>{formatDate(order.updatedAt)}</dd>
            <dt>Điện thoại</dt>
            <dd>{order.phone}</dd>
          </dl>
          <p className="address">{order.shippingAddress}</p>
          {order.status === 'PENDING' &&
            (confirming ? (
              <div className="confirm">
                <p>Bạn chắc chắn muốn hủy đơn này?</p>
                <div className="row-gap">
                  <button className="btn btn-danger" disabled={busy} onClick={cancel}>
                    {busy ? 'Đang hủy…' : 'Xác nhận hủy'}
                  </button>
                  <button className="btn btn-ghost" disabled={busy} onClick={() => setConfirming(false)}>
                    Không
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn btn-ghost btn-block" onClick={() => setConfirming(true)}>
                Hủy đơn hàng
              </button>
            ))}
        </aside>
      </div>
      <p>
        <Link className="link" href="/orders">
          ← Tất cả đơn hàng
        </Link>
      </p>
    </>
  );
}

export default function OrderPage({ params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) return <p className="alert">Mã đơn hàng không hợp lệ</p>;
  return (
    <section>
      <RequireAuth>
        <OrderDetail id={params.id} />
      </RequireAuth>
    </section>
  );
}
