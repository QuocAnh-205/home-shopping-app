'use client';

import {
  faArrowLeft,
  faBagShopping,
  faCircleCheck,
  faLocationDot,
  faLock,
  faMinus,
  faPhone,
  faPlus,
  faReceipt,
  faSpinner,
  faTrashCan,
  faTriangleExclamation,
  faTruckFast,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { apiFetch, notifyCartChanged, useSession } from '@/lib/client-api';
import { formatAddress, formatPrice, shortId, type Address, type Cart, type Order } from '@/lib/types';

const MAX_PER_ITEM = 99;

const toShipTo = (a: Address) => ({ address: `${a.fullName}, ${formatAddress(a)}`, phone: a.phone });

export default function CartPage() {
  const router = useRouter();
  const { session, ready } = useSession();
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Order | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [shipTo, setShipTo] = useState({ address: '', phone: '' });
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
    // Sổ địa chỉ: điền sẵn địa chỉ mặc định (người dùng vẫn sửa tay được)
    apiFetch<Address[]>('/account/addresses')
      .then((list) => {
        setAddresses(list);
        const def = list.find((a) => a.isDefault);
        if (def) setShipTo((cur) => (cur.address || cur.phone ? cur : toShipTo(def)));
      })
      .catch(() => setAddresses([]));
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
    setSubmitting(true);
    setError(null);
    try {
      const order = await apiFetch<Order>('/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey.current },
        body: JSON.stringify({ shippingAddress: shipTo.address.trim(), phone: shipTo.phone.trim() }),
      });
      setPlaced(order);
      idempotencyKey.current = crypto.randomUUID();
      setCart({ items: [], totalItems: 0, totalAmount: 0 });
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
      <section className="panel success">
        <span className="success-ico" aria-hidden>
          <FontAwesomeIcon icon={faCircleCheck} />
        </span>
        <h1 className="page-title">Đặt hàng thành công!</h1>
        <p>
          Mã đơn <strong>#{shortId(placed.id)}</strong> · Tổng thanh toán <span className="price">{formatPrice(placed.totalAmount)}</span>
        </p>
        <p className="muted">Chúng tôi sẽ gọi xác nhận qua số {placed.phone} trong ít phút.</p>
        <div className="row row-center">
          <Link className="btn" href={`/orders/${placed.id}`}>
            <FontAwesomeIcon icon={faReceipt} /> Theo dõi đơn hàng
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
      <h1 className="page-title">
        <FontAwesomeIcon icon={faBagShopping} /> Giỏ hàng
        {cart && cart.totalItems > 0 && <span className="muted small">({cart.totalItems} sản phẩm)</span>}
      </h1>
      {error && (
        <p className="alert" role="alert">
          <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
        </p>
      )}
      {!cart ? (
        <div className="skeleton">
          <FontAwesomeIcon icon={faSpinner} spin /> Đang tải giỏ hàng…
        </div>
      ) : cart.items.length === 0 ? (
        <EmptyState icon={faBagShopping} title="Giỏ hàng của bạn đang trống">
          <p>Khám phá hàng trăm món đồ gia dụng đang chờ bạn.</p>
          <Link className="btn" href="/#products">
            Bắt đầu mua sắm
          </Link>
        </EmptyState>
      ) : (
        <div className="cart-layout">
          <div className="stack">
            <ul className="cart-list">
              {cart.items.map((i) => (
                <li key={i.productId} className={`cart-item ${pending === i.productId ? 'is-pending' : ''}`}>
                  <Link href={`/products/${i.slug}`} className="cart-thumb">
                    {i.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="product-img" src={i.imageUrl} alt={i.name} width={96} height={80} loading="lazy" />
                    )}
                  </Link>
                  <div className="cart-item-info">
                    <Link href={`/products/${i.slug}`} className="cart-item-name">
                      {i.name}
                    </Link>
                    <span className="muted small">{formatPrice(i.unitPrice)} / sản phẩm</span>
                    {!i.available && (
                      <span className="badge badge-danger">
                        <FontAwesomeIcon icon={faTriangleExclamation} /> Không đủ hàng, vui lòng giảm số lượng
                      </span>
                    )}
                  </div>
                  <div className="qty">
                    <button
                      type="button"
                      disabled={pending !== null || i.quantity <= 1}
                      onClick={() => setQuantity(i.productId, i.quantity - 1)}
                      aria-label={`Giảm số lượng ${i.name}`}
                    >
                      <FontAwesomeIcon icon={faMinus} />
                    </button>
                    <span className="qty-value">{i.quantity}</span>
                    <button
                      type="button"
                      disabled={pending !== null || i.quantity >= MAX_PER_ITEM}
                      onClick={() => setQuantity(i.productId, i.quantity + 1)}
                      aria-label={`Tăng số lượng ${i.name}`}
                    >
                      <FontAwesomeIcon icon={faPlus} />
                    </button>
                  </div>
                  <div className="cart-item-right">
                    <strong>{formatPrice(i.lineTotal)}</strong>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={pending !== null}
                      onClick={() => remove(i.productId)}
                      aria-label={`Xóa ${i.name}`}
                    >
                      <FontAwesomeIcon icon={faTrashCan} /> Xóa
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <Link className="link" href="/#products">
              <FontAwesomeIcon icon={faArrowLeft} /> Tiếp tục mua sắm
            </Link>
          </div>

          <aside className="panel checkout">
            <h2 className="panel-title">
              <span className="fa-icon-wrap">
                <FontAwesomeIcon icon={faReceipt} />
              </span>
              Thanh toán
            </h2>
            <dl className="summary">
              <dt>Tạm tính ({cart.totalItems} sản phẩm)</dt>
              <dd>{formatPrice(cart.totalAmount)}</dd>
              <dt>
                <FontAwesomeIcon icon={faTruckFast} /> Phí vận chuyển
              </dt>
              <dd className="ok">Miễn phí</dd>
              <dt className="total">Tổng cộng</dt>
              <dd className="total price">{formatPrice(cart.totalAmount)}</dd>
            </dl>
            <form className="form" onSubmit={checkout}>
              {addresses.length > 0 && (
                <label className="field">
                  Chọn từ sổ địa chỉ
                  <select
                    className="input"
                    defaultValue={addresses.find((a) => a.isDefault)?.id ?? ''}
                    onChange={(e) => {
                      const a = addresses.find((x) => x.id === e.target.value);
                      if (a) setShipTo(toShipTo(a));
                    }}
                  >
                    {addresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.isDefault ? '★ ' : ''}
                        {a.fullName} · {a.district}, {a.province}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field">
                <span className="field-head">
                  Địa chỉ nhận hàng
                  <Link className="link small" href="/account?tab=address">
                    {addresses.length ? 'Quản lý địa chỉ' : 'Lưu vào sổ địa chỉ'}
                  </Link>
                </span>
                <textarea
                  className="input"
                  name="address"
                  value={shipTo.address}
                  onChange={(e) => setShipTo({ ...shipTo, address: e.target.value })}
                  rows={3}
                  placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành"
                  minLength={10}
                  maxLength={500}
                  autoComplete="street-address"
                  required
                />
              </label>
              <label className="field">
                Số điện thoại
                <span className="input-wrap">
                  <FontAwesomeIcon icon={faPhone} />
                  <input
                    className="input"
                    name="phone"
                    value={shipTo.phone}
                    onChange={(e) => setShipTo({ ...shipTo, phone: e.target.value })}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="0901 234 567"
                    pattern="(\+84|0)[0-9 .\-]{9,13}"
                    required
                  />
                </span>
              </label>
              <button className="btn btn-lg btn-block" type="submit" disabled={submitting || blocked || pending !== null}>
                <FontAwesomeIcon icon={submitting ? faSpinner : faLocationDot} spin={submitting} />
                {submitting ? 'Đang đặt hàng…' : 'Đặt hàng · Thanh toán khi nhận'}
              </button>
            </form>
            <p className="secure-note">
              <FontAwesomeIcon icon={faLock} /> Thông tin của bạn được mã hóa và bảo mật
            </p>
          </aside>
        </div>
      )}
    </section>
  );
}
