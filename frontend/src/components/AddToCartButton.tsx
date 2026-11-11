'use client';

import { faBagShopping, faCartPlus, faCircleCheck, faMinus, faPlus, faSpinner, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch, getToken, notifyCartChanged } from '@/lib/client-api';
import { formatPrice, type Cart } from '@/lib/types';

const MAX_PER_ITEM = 99;

export function AddToCartButton({ productId, stock, price }: { productId: string; stock: number; price?: number | string }) {
  const router = useRouter();
  const max = Math.min(stock, MAX_PER_ITEM);
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Thông báo "Đã thêm vào giỏ" tự ẩn (trên điện thoại nó nổi trên thanh mua hàng)
  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), status.ok ? 3500 : 6000);
    return () => clearTimeout(t);
  }, [status]);

  /** "Mua ngay": sang thẳng trang thanh toán, không thêm vào giỏ */
  function buyNow() {
    const target = `/checkout?buy=${productId}&qty=${quantity}`;
    if (!getToken()) {
      router.push('/login?next=' + encodeURIComponent(target));
      return;
    }
    router.push(target);
  }

  async function add() {
    if (!getToken()) {
      router.push('/login?next=' + encodeURIComponent(window.location.pathname));
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      // API giỏ hàng lưu số lượng tuyệt đối → cộng dồn với số lượng đang có trong giỏ
      const cart = await apiFetch<Cart>('/cart');
      const current = cart.items.find((i) => i.productId === productId)?.quantity ?? 0;
      const target = Math.min(current + quantity, max);
      if (target === current) {
        setStatus({ ok: false, text: `Giỏ hàng đã có tối đa ${current} sản phẩm này` });
        return;
      }
      await apiFetch('/cart/items', { method: 'PUT', body: JSON.stringify({ productId, quantity: target }) });
      notifyCartChanged();
      setStatus({ ok: true, text: `Đã thêm vào giỏ (hiện có ${target})` });
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (stock <= 0) {
    return (
      <>
        <p className="alert">
          <FontAwesomeIcon icon={faTriangleExclamation} /> Sản phẩm tạm hết hàng, vui lòng quay lại sau.
        </p>
        <div className="mobile-actionbar" aria-hidden>
          <button className="btn btn-lg btn-block" disabled>
            Tạm hết hàng
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="buy-row">
        <div className="qty">
          <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1} aria-label="Giảm số lượng">
            <FontAwesomeIcon icon={faMinus} />
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            value={quantity}
            aria-label="Số lượng"
            onChange={(e) => setQuantity(Math.max(1, Math.min(Number(e.target.value) || 1, max)))}
          />
          <button type="button" onClick={() => setQuantity((q) => Math.min(max, q + 1))} disabled={quantity >= max} aria-label="Tăng số lượng">
            <FontAwesomeIcon icon={faPlus} />
          </button>
        </div>
        <button className="btn btn-lg btn-ghost" onClick={add} disabled={busy}>
          <FontAwesomeIcon icon={busy ? faSpinner : faCartPlus} spin={busy} />
          {busy ? 'Đang thêm…' : 'Thêm vào giỏ hàng'}
        </button>
        <button className="btn btn-lg" onClick={buyNow} disabled={busy}>
          <FontAwesomeIcon icon={faBagShopping} /> Mua ngay
        </button>
      </div>
      {/* Điện thoại: thanh mua hàng dính đáy màn hình (ngón cái bấm được ngay, không phải cuộn lên) */}
      <div className="mobile-actionbar">
        <button type="button" className="mobile-actionbar-cart" onClick={add} disabled={busy} aria-label="Thêm vào giỏ hàng">
          <FontAwesomeIcon icon={busy ? faSpinner : faCartPlus} spin={busy} />
          <span>Thêm vào giỏ</span>
        </button>
        <button type="button" className="btn btn-lg mobile-actionbar-main" onClick={buyNow} disabled={busy}>
          <span>Mua ngay</span>
          {price !== undefined && <small>{formatPrice(Number(price) * quantity)}</small>}
        </button>
      </div>
      {status && (
        <p className={`${status.ok ? 'alert alert-ok' : 'alert'} buy-status`} role="status">
          <FontAwesomeIcon icon={status.ok ? faCircleCheck : faTriangleExclamation} />
          <span>
            {status.text}
            {status.ok && (
              <>
                {' · '}
                <Link href="/cart">Xem giỏ hàng</Link>
              </>
            )}
          </span>
        </p>
      )}
    </>
  );
}
