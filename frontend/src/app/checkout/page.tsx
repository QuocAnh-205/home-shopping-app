'use client';

import {
  faArrowLeft,
  faCircleCheck,
  faCoins,
  faCreditCard,
  faLocationDot,
  faLock,
  faMoneyBillWave,
  faQrcode,
  faSpinner,
  faTicket,
  faTriangleExclamation,
  faTruckFast,
  faWallet,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LineItems } from '@/components/LineItems';
import { RequireAuth } from '@/components/RequireAuth';
import { ApiError, apiFetch, notifyCartChanged } from '@/lib/client-api';
import {
  formatPrice,
  formatShortDay,
  type Address,
  type CheckoutPreview,
  type CheckoutVoucherOption,
  type Order,
  type PaymentInfo,
  type PaymentMethod,
} from '@/lib/types';

const METHOD_ICON: Record<PaymentMethod, IconDefinition> = {
  COD: faMoneyBillWave,
  VNPAY: faCreditCard,
  MOMO: faWallet,
  VIETQR: faQrcode,
};

interface Choice {
  useCoins?: boolean;
  addressId?: string;
  voucherCode?: string;
  shippingVoucherCode?: string;
  paymentMethod: PaymentMethod;
  note?: string;
}

function VoucherPicker({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: CheckoutVoucherOption[];
  value: string | null;
  onChange: (code: string | undefined) => void;
}) {
  const [code, setCode] = useState('');
  return (
    <div className="voucher-picker">
      <h3>
        <FontAwesomeIcon icon={faTicket} /> {title}
      </h3>
      {options.length === 0 && <p className="muted small">Chưa có voucher phù hợp</p>}
      <ul>
        {options.map((v) => (
          <li key={v.code} className={`voucher-card ${v.applicable ? '' : 'is-disabled'} ${value === v.code ? 'is-selected' : ''}`}>
            <label>
              <input
                type="radio"
                name={title}
                checked={value === v.code}
                disabled={!v.applicable}
                onChange={() => onChange(v.code)}
                onClick={() => value === v.code && onChange(undefined)}
              />
              <span>
                <strong>{v.name}</strong> <code>{v.code}</code>
                <span className="muted small">{v.summary}</span>
                {v.applicable ? (
                  <span className="ok small">Giảm {formatPrice(v.discount)}</span>
                ) : (
                  <span className="small" style={{ color: 'var(--warn)' }}>
                    {v.reason}
                  </span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) onChange(code.trim().toUpperCase());
        }}
      >
        <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Nhập mã voucher" maxLength={32} aria-label={`Nhập mã ${title.toLowerCase()}`} />
        <button className="btn btn-ghost btn-sm" disabled={!code.trim()}>
          Áp dụng
        </button>
      </form>
    </div>
  );
}

function Checkout() {
  const router = useRouter();
  const params = useSearchParams();
  const selection = useMemo(() => {
    const buy = params.get('buy');
    if (buy) return { items: [{ productId: buy, quantity: Math.max(1, Math.min(99, Number(params.get('qty')) || 1)) }] };
    const ids = params.get('items')?.split(',').filter(Boolean);
    return ids?.length ? { cartProductIds: ids } : {};
  }, [params]);

  const [choice, setChoice] = useState<Choice>({ paymentMethod: 'COD' });
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  // 1 Idempotency-Key cho mỗi "ý định đặt hàng": bấm 2 lần / mạng gửi lại vẫn chỉ tạo 1 đơn
  const idempotencyKey = useRef('');

  const refresh = useCallback(
    async (next: Choice) => {
      setError(null);
      try {
        const p = await apiFetch<CheckoutPreview>('/checkout/preview', { method: 'POST', body: JSON.stringify({ ...selection, ...next }) });
        setPreview(p);
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [selection],
  );

  useEffect(() => {
    idempotencyKey.current ||= crypto.randomUUID();
    void refresh(choice);
    apiFetch<Address[]>('/account/addresses')
      .then(setAddresses)
      .catch(() => setAddresses([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const update = (patch: Partial<Choice>) => {
    const next = { ...choice, ...patch };
    setChoice(next);
    void refresh(next);
  };

  async function place() {
    if (!preview) return;
    setPlacing(true);
    setError(null);
    setNotice(null);
    try {
      const order = await apiFetch<Order>('/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey.current },
        body: JSON.stringify({ ...selection, ...choice, expectedTotal: preview.pricing.total }),
      });
      notifyCartChanged();
      if (order.status === 'AWAITING_PAYMENT') {
        // Đơn đã tạo & giữ hàng; lấy link cổng thanh toán. Lỗi cổng → về trang đơn để "Thanh toán lại"
        try {
          const payment = await apiFetch<PaymentInfo | null>(`/orders/${order.id}/payments`, { method: 'POST', body: '{}' });
          if (payment?.payUrl) {
            window.location.assign(payment.payUrl);
            return;
          }
        } catch {
          /* hiển thị nút thanh toán lại ở trang đơn */
        }
      }
      router.replace(`/orders/${order.id}?placed=1`);
    } catch (err) {
      const e = err as ApiError;
      if (['PRICE_CHANGED', 'OUT_OF_STOCK', 'VOUCHER_EXHAUSTED', 'VOUCHER_USER_LIMIT', 'COINS_INSUFFICIENT'].includes(e.code ?? '')) {
        // Bảng giá đã cũ: tải lại để khách xem con số mới rồi bấm đặt lại (key mới vì nội dung đơn đã khác)
        idempotencyKey.current = crypto.randomUUID();
        setNotice(e.message);
        await refresh(choice);
      } else {
        setError(e.message);
      }
    } finally {
      setPlacing(false);
    }
  }

  if (error && !preview) {
    return (
      <div className="stack">
        <p className="alert">
          <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
        </p>
        <Link className="link" href="/cart">
          <FontAwesomeIcon icon={faArrowLeft} /> Về giỏ hàng
        </Link>
      </div>
    );
  }
  if (!preview) {
    return (
      <div className="skeleton">
        <FontAwesomeIcon icon={faSpinner} spin /> Đang tính tiền…
      </div>
    );
  }

  const { pricing, shipping, address } = preview;
  return (
    <div className="cart-layout checkout-page">
      <div className="stack">
        <section className="panel">
          <h2 className="panel-title">
            <FontAwesomeIcon icon={faLocationDot} /> Địa chỉ nhận hàng
          </h2>
          {address ? (
            <div className="address" style={{ margin: 0, display: 'block' }}>
              <strong>
                {address.fullName} · {address.phone}
              </strong>
              <div>{[address.street, address.ward, address.province].join(', ')}</div>
            </div>
          ) : (
            <p className="muted">Bạn chưa có địa chỉ nhận hàng.</p>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            {addresses.length > 1 && (
              <select className="input" value={choice.addressId ?? address?.id ?? ''} onChange={(e) => update({ addressId: e.target.value })} aria-label="Chọn địa chỉ">
                {addresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.isDefault ? '★ ' : ''}
                    {a.fullName} · {a.ward}, {a.province}
                  </option>
                ))}
              </select>
            )}
            <Link className="link small" href="/account?tab=address">
              {address ? 'Quản lý sổ địa chỉ' : 'Thêm địa chỉ'}
            </Link>
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">Sản phẩm ({preview.items.reduce((n, i) => n + i.quantity, 0)})</h2>
          <LineItems
            items={preview.items.map((i) => ({
              key: i.productId,
              name: i.name,
              slug: i.slug,
              imageUrl: i.imageUrl,
              unitPrice: i.unitPrice,
              quantity: i.quantity,
              note: i.available ? null : i.stock > 0 ? `Chỉ còn ${i.stock}` : 'Hết hàng',
              tag: i.bulky ? 'Cồng kềnh · lắp đặt tận nơi' : null,
            }))}
          />
          <label className="field" style={{ marginTop: 12 }}>
            Lời nhắn cho shop
            <input className="input" maxLength={255} placeholder="Ví dụ: giao giờ hành chính" value={choice.note ?? ''} onChange={(e) => setChoice({ ...choice, note: e.target.value })} />
          </label>
        </section>

        {shipping && (
          <section className="panel">
            <h2 className="panel-title">
              <FontAwesomeIcon icon={faTruckFast} /> Vận chuyển
            </h2>
            <p style={{ margin: 0 }}>
              {shipping.bulkyFee >= shipping.fee ? 'Giao hàng cồng kềnh + lắp đặt' : 'Giao nhanh'} · {formatPrice(shipping.fee)} · Nhận hàng dự kiến {formatShortDay(shipping.estimatedDelivery.from)} – {formatShortDay(shipping.estimatedDelivery.to)}
            </p>
            {shipping.bulkyFee > 0 && (
              <p className="bulky-note small">
                Gồm phụ phí hàng cồng kềnh {formatPrice(shipping.bulkyFee)} (xe tải nhỏ, 2 kỹ thuật viên mang lên tận phòng và lắp đặt miễn phí) – phần này
                không áp dụng miễn phí vận chuyển.
              </p>
            )}
            {shipping.freeShipEligible && shipping.bulkyFee >= shipping.fee ? null : shipping.freeShipEligible ? (
              <p className="ok small">
                <FontAwesomeIcon icon={faCircleCheck} /> {shipping.bulkyFee > 0 ? 'Miễn phí phần vận chuyển hàng thường' : 'Đơn được miễn phí vận chuyển'}
              </p>
            ) : (
              shipping.freeShipThreshold > 0 && <p className="muted small">Mua thêm {formatPrice(shipping.amountToFreeShip)} để được miễn phí vận chuyển</p>
            )}
          </section>
        )}

        <section className="panel voucher-section">
          <VoucherPicker title="Voucher giảm giá" options={preview.vouchers.discount} value={preview.vouchers.voucherCode ?? choice.voucherCode ?? null} onChange={(c) => update({ voucherCode: c })} />
          <VoucherPicker
            title="Voucher vận chuyển"
            options={preview.vouchers.shipping}
            value={preview.vouchers.shippingVoucherCode ?? choice.shippingVoucherCode ?? null}
            onChange={(c) => update({ shippingVoucherCode: c })}
          />
          {preview.vouchers.errors.map((e) => (
            <p key={e.code} className="alert" style={{ margin: 0 }}>
              <FontAwesomeIcon icon={faTriangleExclamation} /> {e.code}: {e.reason}{' '}
              <button
                className="link-btn"
                onClick={() => update(e.code === choice.voucherCode ? { voucherCode: undefined } : { shippingVoucherCode: undefined })}
              >
                Bỏ chọn
              </button>
            </p>
          ))}
        </section>
      </div>

      <aside className="panel checkout">
        <h2 className="panel-title">Phương thức thanh toán</h2>
        <div className="pay-methods" role="radiogroup">
          {preview.paymentMethods.map((m) => (
            <label key={m.method} className={`pay-method ${choice.paymentMethod === m.method ? 'is-selected' : ''} ${m.available ? '' : 'is-disabled'}`}>
              <input type="radio" name="payment" checked={choice.paymentMethod === m.method} disabled={!m.available} onChange={() => update({ paymentMethod: m.method })} />
              <FontAwesomeIcon icon={METHOD_ICON[m.method]} fixedWidth />
              <span>
                {m.label}
                {!m.available && m.reason && <span className="muted small"> · {m.reason}</span>}
              </span>
            </label>
          ))}
        </div>

        {preview.coins.balance > 0 && (
          <label className="coins-toggle">
            <span>
              <FontAwesomeIcon icon={faCoins} className="acc-nav-coin" /> Dùng {preview.coins.usable.toLocaleString('vi-VN')} xu
              <span className="muted small"> (có {preview.coins.balance.toLocaleString('vi-VN')} xu)</span>
            </span>
            <span className="coins-toggle-right">
              <span className="ok small">−{formatPrice(preview.coins.usable)}</span>
              <input
                type="checkbox"
                className="switch"
                checked={Boolean(choice.useCoins)}
                disabled={preview.coins.usable === 0}
                onChange={(e) => update({ useCoins: e.target.checked })}
                aria-label="Dùng xu"
              />
            </span>
          </label>
        )}

        <dl className="summary">
          <dt>Tổng tiền hàng</dt>
          <dd>{formatPrice(pricing.subtotal)}</dd>
          <dt>Phí vận chuyển</dt>
          <dd>{formatPrice(pricing.shippingFee)}</dd>
          {pricing.shippingDiscount > 0 && (
            <>
              <dt>Giảm phí vận chuyển</dt>
              <dd className="ok">−{formatPrice(pricing.shippingDiscount)}</dd>
            </>
          )}
          {pricing.discount > 0 && (
            <>
              <dt>Voucher giảm giá</dt>
              <dd className="ok">−{formatPrice(pricing.discount)}</dd>
            </>
          )}
          {pricing.coinsUsed > 0 && (
            <>
              <dt>Dùng xu</dt>
              <dd className="ok">−{formatPrice(pricing.coinsUsed)}</dd>
            </>
          )}
          <dt className="total">Tổng thanh toán</dt>
          <dd className="total price">{formatPrice(pricing.total)}</dd>
        </dl>
        {pricing.saved > 0 && <p className="ok small">Tiết kiệm {formatPrice(pricing.saved)}</p>}
        {preview.coins.earnEstimate > 0 && (
          <p className="muted small">
            <FontAwesomeIcon icon={faCoins} className="acc-nav-coin" /> Nhận {preview.coins.earnEstimate.toLocaleString('vi-VN')} xu khi đơn hoàn thành
          </p>
        )}

        {notice && (
          <p className="alert alert-info" role="status">
            {notice}. Bảng giá đã được cập nhật, vui lòng kiểm tra lại rồi đặt hàng.
          </p>
        )}
        {error && (
          <p className="alert" role="alert">
            <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
          </p>
        )}
        {preview.issues
          .filter((i) => !i.code.startsWith('VOUCHER'))
          .map((i) => (
            <p key={i.code + (i.productId ?? '')} className="alert" style={{ margin: 0 }}>
              <FontAwesomeIcon icon={faTriangleExclamation} /> {i.message}
            </p>
          ))}

        <button className="btn btn-lg btn-block" disabled={!preview.canPlaceOrder || placing} onClick={place}>
          {placing && <FontAwesomeIcon icon={faSpinner} spin />} {choice.paymentMethod === 'COD' ? 'Đặt hàng' : 'Đặt hàng & thanh toán'}
        </button>
        <p className="secure-note">
          <FontAwesomeIcon icon={faLock} /> Giá được kiểm tra lại khi đặt hàng; nếu có thay đổi bạn sẽ được báo trước khi tạo đơn
        </p>
      </aside>

      {/* Điện thoại: tổng thanh toán + nút Đặt hàng luôn trong tầm tay */}
      <div className="mobile-actionbar">
        <span className="mobile-actionbar-total">
          <small>Tổng thanh toán</small>
          <strong className="price">{formatPrice(pricing.total)}</strong>
          {pricing.saved > 0 && <small className="ok">Tiết kiệm {formatPrice(pricing.saved)}</small>}
        </span>
        <button className="btn btn-lg" disabled={!preview.canPlaceOrder || placing} onClick={place}>
          {placing && <FontAwesomeIcon icon={faSpinner} spin />} Đặt hàng
        </button>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <section>
      <h1 className="page-title">Thanh toán</h1>
      <RequireAuth>
        <Suspense
          fallback={
            <div className="skeleton">
              <FontAwesomeIcon icon={faSpinner} spin /> Đang tải…
            </div>
          }
        >
          <Checkout />
        </Suspense>
      </RequireAuth>
    </section>
  );
}
