'use client';

import {
  faArrowLeft,
  faBan,
  faBoxOpen,
  faCalendar,
  faCartPlus,
  faClockRotateLeft,
  faCreditCard,
  faLocationDot,
  faPhone,
  faReceipt,
  faSpinner,
  faTriangleExclamation,
  faTruckFast,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, use, useCallback, useEffect, useState } from 'react';
import { LineItems } from '@/components/LineItems';
import { PaymentPanel } from '@/components/PaymentPanel';
import { RequireAuth } from '@/components/RequireAuth';
import { ReturnPanel } from '@/components/ReturnPanel';
import { STATUS_ICON, StatusBadge } from '@/components/StatusBadge';
import { apiFetch, notifyCartChanged } from '@/lib/client-api';
import {
  CANCEL_REASONS,
  ORDER_FLOW,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  STATUS_LABEL,
  formatDate,
  formatPrice,
  formatShortDay,
  shortId,
  type ActorType,
  type Order,
} from '@/lib/types';

const UUID_RE = /^[0-9a-f-]{36}$/i;
const ACTOR_LABEL: Record<ActorType, string> = { CUSTOMER: 'Bạn', ADMIN: 'Cửa hàng', SYSTEM: 'Hệ thống' };
const CUSTOMER_CANCELLABLE = ['AWAITING_PAYMENT', 'PENDING'];

function OrderDetail({ id }: { id: string }) {
  const router = useRouter();
  const justPlaced = useSearchParams().get('placed') === '1';
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState<string>(CANCEL_REASONS[0]);

  const load = useCallback(() => {
    apiFetch<Order>(`/orders/${id}`)
      .then(setOrder)
      .catch((err: Error) => setError(err.message));
  }, [id]);

  useEffect(load, [load]);

  async function act(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      setOrder(await apiFetch<Order>(`/orders/${id}/${path}`, { method: 'POST', body: body ? JSON.stringify(body) : undefined }));
      setCancelling(false);
    } catch (err) {
      setError((err as Error).message);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function buyAgain() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ added: number; skipped: { name: string; reason: string }[] }>(`/orders/${id}/buy-again`, { method: 'POST' });
      notifyCartChanged();
      if (res.added > 0) {
        router.push('/cart');
        return;
      }
      setNotice(`Không thêm được sản phẩm nào: ${res.skipped.map((s) => `${s.name} (${s.reason.toLowerCase()})`).join(', ')}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !order) {
    return (
      <p className="alert">
        <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
      </p>
    );
  }
  if (!order) {
    return (
      <div className="skeleton">
        <FontAwesomeIcon icon={faSpinner} spin /> Đang tải đơn hàng…
      </div>
    );
  }

  const step = ORDER_FLOW.indexOf(order.status);
  const offFlow = step === -1 && order.status !== 'AWAITING_PAYMENT';
  const canCancel = CUSTOMER_CANCELLABLE.includes(order.status);
  const canConfirm = order.status === 'SHIPPING' || order.status === 'DELIVERED';
  const subtotal = order.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  return (
    <>
      <div className="page-head">
        <h1 className="page-title" style={{ margin: 0 }}>
          <FontAwesomeIcon icon={faReceipt} /> Đơn hàng #{shortId(order.id)}
        </h1>
        <StatusBadge status={order.status} transferClaimed={Boolean(order.transferClaimedAt)} />
      </div>
      {error && (
        <p className="alert">
          <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
        </p>
      )}
      {notice && <p className="alert alert-info">{notice}</p>}
      {justPlaced && order.status === 'PENDING' && (
        <p className="alert alert-ok" role="status">
          <FontAwesomeIcon icon={faBoxOpen} /> Đặt hàng thành công! Cửa hàng sẽ xác nhận đơn trong thời gian sớm nhất.
        </p>
      )}

      {order.status === 'AWAITING_PAYMENT' && <PaymentPanel order={order} onChanged={load} />}

      <div className="panel" style={{ marginBottom: 20 }}>
        {offFlow ? (
          <p className="alert" style={{ margin: 0 }}>
            <FontAwesomeIcon icon={order.status === 'CANCELLED' ? faBan : STATUS_ICON[order.status]} /> {STATUS_LABEL[order.status]}
            {order.cancelReason && ` · Lý do: ${order.cancelReason}`}
            {order.status === 'CANCELLED' && '. Sản phẩm đã được hoàn lại kho.'}
          </p>
        ) : (
          <ol className="timeline" aria-label="Tiến trình đơn hàng" style={{ margin: 0 }}>
            {ORDER_FLOW.map((s, i) => (
              <li key={s} className={i <= step ? 'done' : undefined} aria-current={i === step ? 'step' : undefined}>
                <span className="dot">
                  <FontAwesomeIcon icon={STATUS_ICON[s]} />
                </span>
                {STATUS_LABEL[s]}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="cart-layout">
        <div className="stack">
          <div className="panel">
            <LineItems
              items={order.items.map((i) => ({
                key: i.id,
                name: i.productName,
                slug: i.productSlug,
                // Ảnh snapshot lúc đặt: ảnh tĩnh /images/... hiển thị trực tiếp
                imageUrl: i.imageKey?.startsWith('/images/') ? i.imageKey : null,
                unitPrice: i.unitPrice,
                quantity: i.quantity,
              }))}
            />
            <dl className="summary order-totals">
              <dt>Tổng tiền hàng</dt>
              <dd>{formatPrice(order.subtotal || subtotal)}</dd>
              <dt>Phí vận chuyển</dt>
              <dd>{formatPrice(order.shippingFee)}</dd>
              {order.shippingDiscount > 0 && (
                <>
                  <dt>Giảm phí vận chuyển{order.shippingVoucherCode && ` (${order.shippingVoucherCode})`}</dt>
                  <dd className="ok">−{formatPrice(order.shippingDiscount)}</dd>
                </>
              )}
              {order.discountAmount > 0 && (
                <>
                  <dt>Voucher {order.voucherCode}</dt>
                  <dd className="ok">−{formatPrice(order.discountAmount)}</dd>
                </>
              )}
              {order.coinsUsed > 0 && (
                <>
                  <dt>Dùng xu</dt>
                  <dd className="ok">−{formatPrice(order.coinsUsed)}</dd>
                </>
              )}
              <dt className="total">Tổng cộng</dt>
              <dd className="total price">{formatPrice(order.totalAmount)}</dd>
            </dl>
          </div>

          <ReturnPanel order={order} onChanged={load} />

          <div className="panel">
            <h2 className="panel-title">
              <span className="fa-icon-wrap">
                <FontAwesomeIcon icon={faClockRotateLeft} />
              </span>
              Lịch sử đơn hàng
            </h2>
            <ol className="order-history" id="order-history">
              {[...order.history].reverse().map((h, i) => (
                <li key={`${h.createdAt}-${i}`} className={i === 0 ? 'current' : undefined}>
                  <time>{formatDate(h.createdAt)}</time>
                  <div>
                    <strong>{h.fromStatus === h.toStatus && h.toStatus === 'AWAITING_PAYMENT' ? 'Đã báo chuyển khoản' : STATUS_LABEL[h.toStatus]}</strong>
                    <span className="muted small"> · {ACTOR_LABEL[h.actorType]}</span>
                    {h.note && <div className="muted small">{h.note}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <aside className="panel stack">
          <h2 className="panel-title" style={{ margin: 0 }}>
            <span className="fa-icon-wrap">
              <FontAwesomeIcon icon={faTruckFast} />
            </span>
            Thông tin giao hàng
          </h2>
          <dl className="summary" style={{ margin: 0 }}>
            <dt>
              <FontAwesomeIcon icon={faCalendar} fixedWidth /> Ngày đặt
            </dt>
            <dd>{formatDate(order.createdAt)}</dd>
            <dt>
              <FontAwesomeIcon icon={faPhone} fixedWidth /> Người nhận
            </dt>
            <dd>
              {order.recipientName && `${order.recipientName} · `}
              {order.phone}
            </dd>
            {order.estimatedDeliveryFrom && order.estimatedDeliveryTo && !['CANCELLED', 'DELIVERED', 'COMPLETED', 'RETURNED'].includes(order.status) && (
              <>
                <dt>
                  <FontAwesomeIcon icon={faTruckFast} fixedWidth /> Dự kiến giao
                </dt>
                <dd>
                  {formatShortDay(order.estimatedDeliveryFrom.slice(0, 10))} – {formatShortDay(order.estimatedDeliveryTo.slice(0, 10))}
                </dd>
              </>
            )}
            <dt>
              <FontAwesomeIcon icon={faCreditCard} fixedWidth /> Thanh toán
            </dt>
            <dd>
              {PAYMENT_METHOD_LABEL[order.paymentMethod]}
              <div className="muted small">{PAYMENT_STATUS_LABEL[order.paymentStatus]}</div>
            </dd>
          </dl>
          <p className="address" style={{ margin: 0 }}>
            <FontAwesomeIcon icon={faLocationDot} />
            {order.shippingAddress}
          </p>
          {order.note && <p className="muted small">Lời nhắn: {order.note}</p>}

          {canConfirm && (
            <button className="btn btn-block" disabled={busy} onClick={() => act('received')}>
              {busy ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faBoxOpen} />} Đã nhận được hàng
            </button>
          )}

          {canCancel &&
            (cancelling ? (
              <div className="confirm stack">
                <label className="field">
                  <span>Lý do hủy đơn</span>
                  <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
                    {CANCEL_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="row">
                  <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => act('cancel', { reason })}>
                    {busy && <FontAwesomeIcon icon={faSpinner} spin />} Xác nhận hủy
                  </button>
                  <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setCancelling(false)}>
                    Không
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn btn-ghost btn-block" onClick={() => setCancelling(true)}>
                <FontAwesomeIcon icon={faBan} /> Hủy đơn hàng
              </button>
            ))}

          {!canCancel && (
            <button className="btn btn-ghost btn-block" disabled={busy} onClick={buyAgain}>
              <FontAwesomeIcon icon={faCartPlus} /> Mua lại
            </button>
          )}
        </aside>
      </div>
      <p style={{ marginTop: 20 }}>
        <Link className="link" href="/orders">
          <FontAwesomeIcon icon={faArrowLeft} /> Tất cả đơn hàng
        </Link>
      </p>
    </>
  );
}

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  if (!UUID_RE.test(id)) {
    return (
      <p className="alert">
        <FontAwesomeIcon icon={faTriangleExclamation} /> Mã đơn hàng không hợp lệ
      </p>
    );
  }
  return (
    <section>
      <RequireAuth>
        <Suspense fallback={null}>
          <OrderDetail id={id} />
        </Suspense>
      </RequireAuth>
    </section>
  );
}
