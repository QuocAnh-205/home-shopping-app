'use client';

import {
  faArrowLeft,
  faBagShopping,
  faLock,
  faMinus,
  faPlus,
  faReceipt,
  faSpinner,
  faTicket,
  faTrashCan,
  faTriangleExclamation,
  faTruckFast,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { apiFetch, notifyCartChanged, useSession } from '@/lib/client-api';
import { formatPrice, type Cart } from '@/lib/types';

const MAX_PER_ITEM = 99;

export default function CartPage() {
  const router = useRouter();
  const { session, ready } = useSession();
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  // Sản phẩm được tick để mua (như Shopee); mặc định chọn mọi sản phẩm còn đủ hàng
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [touched, setTouched] = useState(false);

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
    void load();
  }, [ready, session, load, router]);

  // Đồng bộ lựa chọn khi giỏ thay đổi: bỏ sản phẩm đã xóa / hết hàng; lần đầu chọn tất cả
  useEffect(() => {
    if (!cart) return;
    const ok = new Set(cart.items.filter((i) => i.available).map((i) => i.productId));
    setSelected((cur) => (touched ? new Set([...cur].filter((id) => ok.has(id))) : ok));
  }, [cart, touched]);

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

  const toggle = (id: string) => {
    setTouched(true);
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectable = useMemo(() => cart?.items.filter((i) => i.available) ?? [], [cart]);
  const allSelected = selectable.length > 0 && selectable.every((i) => selected.has(i.productId));
  const toggleAll = () => {
    setTouched(true);
    setSelected(allSelected ? new Set() : new Set(selectable.map((i) => i.productId)));
  };

  const chosen = cart?.items.filter((i) => selected.has(i.productId)) ?? [];
  const chosenCount = chosen.reduce((n, i) => n + i.quantity, 0);
  const chosenTotal = chosen.reduce((s, i) => s + i.lineTotal, 0);

  function checkout() {
    router.push(`/checkout?items=${chosen.map((i) => i.productId).join(',')}`);
  }

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
            <label className="checkbox cart-select-all">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={selectable.length === 0} /> Chọn tất cả ({selectable.length})
            </label>
            <ul className="cart-list">
              {cart.items.map((i) => (
                <li key={i.productId} className={`cart-item ${pending === i.productId ? 'is-pending' : ''}`}>
                  <input
                    type="checkbox"
                    className="cart-check"
                    checked={selected.has(i.productId)}
                    disabled={!i.available}
                    onChange={() => toggle(i.productId)}
                    aria-label={`Chọn ${i.name}`}
                  />
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
                    <button type="button" className="btn btn-ghost btn-sm" disabled={pending !== null} onClick={() => remove(i.productId)} aria-label={`Xóa ${i.name}`}>
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
              Tóm tắt
            </h2>
            <dl className="summary">
              <dt>Đã chọn ({chosenCount} sản phẩm)</dt>
              <dd>{formatPrice(chosenTotal)}</dd>
              <dt>
                <FontAwesomeIcon icon={faTruckFast} /> Phí vận chuyển
              </dt>
              <dd className="muted small">Tính ở bước thanh toán</dd>
              <dt>
                <FontAwesomeIcon icon={faTicket} /> Voucher
              </dt>
              <dd className="muted small">Chọn ở bước thanh toán</dd>
              <dt className="total">Tạm tính</dt>
              <dd className="total price">{formatPrice(chosenTotal)}</dd>
            </dl>
            <button className="btn btn-lg btn-block" disabled={chosen.length === 0 || pending !== null} onClick={checkout}>
              Mua hàng ({chosen.length})
            </button>
            <p className="secure-note">
              <FontAwesomeIcon icon={faLock} /> Giá và phí vận chuyển được tính lại chính xác ở bước thanh toán
            </p>
          </aside>

          {/* Điện thoại: thanh tổng tiền + nút Mua hàng dính đáy (giống app TMĐT) */}
          <div className="mobile-actionbar">
            <label className="checkbox mobile-actionbar-all">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={selectable.length === 0} /> Tất cả
            </label>
            <span className="mobile-actionbar-total">
              <small>Tổng thanh toán</small>
              <strong className="price">{formatPrice(chosenTotal)}</strong>
            </span>
            <button className="btn btn-lg" disabled={chosen.length === 0 || pending !== null} onClick={checkout}>
              Mua hàng ({chosen.length})
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
