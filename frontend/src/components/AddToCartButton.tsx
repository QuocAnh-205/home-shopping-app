'use client';

import { faBagShopping, faCircleCheck, faMinus, faPlus, faSpinner, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch, getToken, notifyCartChanged } from '@/lib/client-api';
import type { Cart } from '@/lib/types';

const MAX_PER_ITEM = 99;

export function AddToCartButton({ productId, stock }: { productId: string; stock: number }) {
  const router = useRouter();
  const max = Math.min(stock, MAX_PER_ITEM);
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

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
      <p className="alert">
        <FontAwesomeIcon icon={faTriangleExclamation} /> Sản phẩm tạm hết hàng, vui lòng quay lại sau.
      </p>
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
        <button className="btn btn-lg" onClick={add} disabled={busy}>
          <FontAwesomeIcon icon={busy ? faSpinner : faBagShopping} spin={busy} />
          {busy ? 'Đang thêm…' : 'Thêm vào giỏ hàng'}
        </button>
      </div>
      {status && (
        <p className={status.ok ? 'alert alert-ok' : 'alert'} role="status">
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
