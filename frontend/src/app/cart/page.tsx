'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { apiFetch, notifyCartChanged, useSession } from '@/lib/client-api';
import { formatPrice, shortId, type Cart, type Order } from '@/lib/types';

const MAX_PER_ITEM = 99;

export default function CartPage() {
  const router = useRouter();
  const { session, ready } = useSession();
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Order | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  // Một Idempotency-Key cho mỗi lần "ý định đặt hàng": bấm 2 lần hay retry vẫn chỉ tạo 1 đơn
  const idempotencyKey = useRef<string>('');

  const load = useCallback(async () => {
    try {
      setCart(await apiFetch<Cart>('/cart'));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      router.replace('/login?next=/cart');
      return;
    }
    idempotencyKey.current ||= crypto.randomUUID();
    void load();
  }, [ready, session, load, router]);

  async function mutate(productId: string, request: () => Promise<Cart>) {
    setPending(productId);
    setError(null);
    try {
      setCart(await request());
      notifyCartChanged();
    } catch (err) {
      setError((err as Error).message);
      await load();
    } finally {
      setPending(null);
    }
  }

  const setQuantity = (productId: string, quantity: number) =>
    mutate(productId, () => apiFetch<Cart>('/cart/items', { method: 'PUT', body: JSON.stringify({ productId, quantity }) }));

  const remove = (productId: string) => mutate(productId, () => apiFetch<Cart>(`/cart/items/${productId}`, { method: 'DELETE' }));

  async function checkout(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSubmitting(true);
    setError(null);
    try {
      const order = await apiFetch<Order>('/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey.current },
        body: JSON.stringify({ shippingAddress: form.get('address'), phone: form.get('phone') }),
      });
      setPlaced(order);
      idempotencyKey.current = crypto.randomUUID();
      setCart({ items: [], totalItems: 0, totalAmount: '0.00' });
      notifyCartChanged();
    } catch (err) {
      setError((err as Error).message);
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  if (placed) {
    return (
      <section className="panel center success">
        <span className="success-icon" aria-hidden>
          ✅
        </span>
        <h1>Đặt hàng thành công!</h1>
        <p>
          Mã đơn <strong>#{shortId(placed.id)}</strong> · Tổng thanh toán <span className="price">{formatPrice(placed.totalAmount)}</span>
        </p>
        <p className="muted">Chúng tôi sẽ gọi xác nhận qua số {placed.phone} trong ít phút.</p>
        <div className="row-gap">
          <Link className="btn" href={`/orders/${placed.id}`}>
            Xem đơn hàng
          </Link>
          <Link className="btn btn-ghost" href="/">
            Tiếp tục mua sắm
          </Link>
        </div>
      </section>
    );
  }

  const blocked = cart?.items.some((i) => !i.available) ?? false;

  return (
    <section>
      <h1 className="page-title">Giỏ hàng</h1>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {!cart ? (
        <div className="skeleton" aria-busy>
          Đang tải giỏ hàng…
        </div>
      ) : cart.items.length === 0 ? (
        <div className="empty">
          <span aria-hidden>🛒</span>
          <p>Giỏ hàng của bạn đang trống.</p>
          <Link className="btn" href="/">
            Bắt đầu mua sắm
          </Link>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="panel">
            <ul className="cart-list">
              {cart.items.map((i) => (
                <li key={i.productId} className={`cart-item ${pending === i.productId ? 'is-pending' : ''}`}>
                  <div className="cart-item-info">
                    <Link href={`/products/${i.slug}`} className="cart-item-name">
                      {i.name}
                    </Link>
                    <span className="muted small">{formatPrice(i.unitPrice)} / sản phẩm</span>
                    {!i.available && <span className="badge badge-danger">Không đủ hàng, vui lòng giảm số lượng</span>}
                  </div>
                  <div className="qty">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={pending !== null || i.quantity <= 1}
                      onClick={() => setQuantity(i.productId, i.quantity - 1)}
                      aria-label={`Giảm số lượng ${i.name}`}
                    >
                      −
                    </button>
                    <span className="qty-value">{i.quantity}</span>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={pending !== null || i.quantity >= MAX_PER_ITEM}
                      onClick={() => setQuantity(i.productId, i.quantity + 1)}
                      aria-label={`Tăng số lượng ${i.name}`}
                    >
                      +
                    </button>
                  </div>
                  <strong className="cart-item-total">{formatPrice(i.lineTotal)}</strong>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    disabled={pending !== null}
                    onClick={() => remove(i.productId)}
                    aria-label={`Xóa ${i.name}`}
                  >
                    🗑
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <aside className="panel checkout">
            <h2>Thanh toán</h2>
            <dl className="summary">
              <dt>Tạm tính ({cart.totalItems} sản phẩm)</dt>
              <dd>{formatPrice(cart.totalAmount)}</dd>
              <dt>Phí vận chuyển</dt>
              <dd className="ok">Miễn phí</dd>
              <dt className="total">Tổng cộng</dt>
              <dd className="total price">{formatPrice(cart.totalAmount)}</dd>
            </dl>
            <form className="form" onSubmit={checkout}>
              <label>
                <span>Địa chỉ nhận hàng</span>
                <textarea className="input" name="address" rows={3} placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành" minLength={10} maxLength={500} required />
              </label>
              <label>
                <span>Số điện thoại</span>
                <input className="input" name="phone" type="tel" inputMode="tel" placeholder="0901234567" pattern="(\+84|0)[0-9]{9,10}" required />
              </label>
              <button className="btn btn-lg" type="submit" disabled={submitting || blocked || pending !== null}>
                {submitting ? 'Đang đặt hàng…' : 'Đặt hàng (COD)'}
              </button>
            </form>
          </aside>
        </div>
      )}
    </section>
  );
}
