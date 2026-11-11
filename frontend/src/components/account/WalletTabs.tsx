'use client';

import { faCircleCheck, faCoins, faSpinner, faTicket, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/client-api';
import { formatDate, shortId, type CoinSummary, type CoinTxType, type Voucher } from '@/lib/types';

type VoucherTab = 'wallet' | 'all';

/** Kho voucher: voucher đã lưu (ví) + mọi voucher đang có, lưu bằng 1 chạm hoặc nhập mã */
export function VoucherWalletTab() {
  const [tab, setTab] = useState<VoucherTab>('wallet');
  const [items, setItems] = useState<Voucher[] | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    setItems(null);
    apiFetch<Voucher[]>(tab === 'wallet' ? '/vouchers/wallet' : '/vouchers/mine')
      .then(setItems)
      .catch((err: Error) => setMsg({ ok: false, text: err.message }));
  }, [tab]);
  useEffect(load, [load]);

  async function save(voucherCode: string) {
    setMsg(null);
    try {
      const v = await apiFetch<Voucher>('/vouchers/save', { method: 'POST', body: JSON.stringify({ code: voucherCode }) });
      setMsg({ ok: true, text: `Đã lưu voucher ${v.code} vào ví` });
      setCode('');
      load();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  }

  return (
    <section className="panel acc-panel">
      <header className="acc-head">
        <h2>Kho voucher</h2>
        <p className="muted">Lưu voucher để dùng ở trang thanh toán – mỗi đơn dùng 1 voucher giảm giá + 1 voucher vận chuyển</p>
      </header>

      <form
        className="row voucher-code-form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (code.trim()) void save(code.trim().toUpperCase());
        }}
      >
        <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Nhập mã voucher tại đây" maxLength={32} aria-label="Mã voucher" />
        <button className="btn" disabled={!code.trim()}>
          Lưu
        </button>
      </form>
      {msg && (
        <p className={msg.ok ? 'alert alert-ok' : 'alert'} role="status">
          <FontAwesomeIcon icon={msg.ok ? faCircleCheck : faTriangleExclamation} /> {msg.text}
        </p>
      )}

      <div className="order-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'wallet'} className={tab === 'wallet' ? 'active' : undefined} onClick={() => setTab('wallet')}>
          Voucher của tôi
        </button>
        <button role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'active' : undefined} onClick={() => setTab('all')}>
          Tất cả voucher
        </button>
      </div>

      {!items ? (
        <div className="skeleton">
          <FontAwesomeIcon icon={faSpinner} spin /> Đang tải voucher…
        </div>
      ) : items.length === 0 ? (
        <div className="acc-empty">
          <FontAwesomeIcon icon={faTicket} size="2x" className="muted" />
          <strong>{tab === 'wallet' ? 'Ví voucher đang trống' : 'Hiện chưa có voucher nào'}</strong>
          {tab === 'wallet' && (
            <button className="link-btn" onClick={() => setTab('all')}>
              Xem các voucher đang có
            </button>
          )}
        </div>
      ) : (
        <ul className="voucher-grid">
          {items.map((v) => (
            <li key={v.id} className={`voucher-ticket ${v.type === 'FREESHIP' ? 'is-ship' : ''}`}>
              <span className="voucher-stub" aria-hidden>
                <FontAwesomeIcon icon={faTicket} />
                <small>{v.type === 'FREESHIP' ? 'Vận chuyển' : 'Giảm giá'}</small>
              </span>
              <span className="voucher-main">
                <strong>{v.name}</strong>
                <span className="small">{v.summary}</span>
                <code className="small">{v.code}</code>
                {v.usedPercent !== null && (
                  <span className="voucher-usage" title={`Đã dùng ${v.usedPercent}%`}>
                    <span style={{ width: `${v.usedPercent}%` }} />
                  </span>
                )}
                <span className="muted small">HSD: {formatDate(v.endsAt)}</span>
              </span>
              <span className="voucher-cta">
                {tab === 'all' && !v.saved ? (
                  <button className="btn btn-sm" onClick={() => save(v.code)}>
                    Lưu
                  </button>
                ) : (
                  <Link className="btn btn-ghost btn-sm" href="/cart">
                    Dùng ngay
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const COIN_LABEL: Record<CoinTxType, string> = {
  EARN_ORDER: 'Thưởng đơn hàng',
  EARN_REVIEW: 'Thưởng đánh giá',
  SPEND_ORDER: 'Dùng cho đơn hàng',
  REFUND_ORDER: 'Hoàn xu',
  REVOKE_ORDER: 'Thu hồi xu',
};

/** Xu: số dư, quy tắc tích / dùng, lịch sử giao dịch */
export function CoinsTab() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CoinSummary | null>(null);
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');

  useEffect(() => {
    apiFetch<CoinSummary>(`/coins?page=${page}`)
      .then(setData)
      .catch(() => setData(null));
  }, [page]);

  if (!data) {
    return (
      <section className="panel acc-panel">
        <div className="skeleton">
          <FontAwesomeIcon icon={faSpinner} spin /> Đang tải ví xu…
        </div>
      </section>
    );
  }
  const items = data.items.filter((t) => filter === 'all' || (filter === 'in' ? t.amount > 0 : t.amount < 0));

  return (
    <section className="panel acc-panel">
      <div className="coins-hero">
        <span className="coins-icon" aria-hidden>
          <FontAwesomeIcon icon={faCoins} />
        </span>
        <div>
          <strong className="coins-balance">{data.balance.toLocaleString('vi-VN')} xu</strong>
          <span className="muted small">= {data.balance.toLocaleString('vi-VN')}₫ khi thanh toán</span>
        </div>
      </div>
      <ul className="coins-rules">
        <li>Nhận {data.rules.earnPercent}% giá trị đơn khi đơn hoàn thành</li>
        <li>+{data.rules.reviewReward} xu khi đánh giá sản phẩm đã mua lần đầu</li>
        <li>Dùng tối đa {data.rules.maxUsePercent}% giá trị đơn ở trang thanh toán</li>
      </ul>

      <div className="order-tabs" role="tablist">
        {(
          [
            ['all', 'Tất cả lịch sử'],
            ['in', 'Đã nhận'],
            ['out', 'Đã dùng'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={filter === id} className={filter === id ? 'active' : undefined} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="acc-empty">
          <strong>Chưa có giao dịch xu</strong>
          <p className="muted">Hoàn thành đơn hàng hoặc đánh giá sản phẩm để nhận xu.</p>
        </div>
      ) : (
        <ul className="coin-list">
          {items.map((t) => (
            <li key={t.id}>
              <span className={t.amount > 0 ? 'coin-badge in' : 'coin-badge out'} aria-hidden>
                <FontAwesomeIcon icon={faCoins} />
              </span>
              <span className="coin-info">
                <strong>{COIN_LABEL[t.type]}</strong>
                <span className="muted small">
                  {t.note}
                  {t.orderId && (
                    <>
                      {' · '}
                      <Link className="link" href={`/orders/${t.orderId}`}>
                        #{shortId(t.orderId)}
                      </Link>
                    </>
                  )}
                </span>
                <time className="muted small">{formatDate(t.createdAt)}</time>
              </span>
              <strong className={t.amount > 0 ? 'coin-amount ok' : 'coin-amount'}>
                {t.amount > 0 ? '+' : ''}
                {t.amount.toLocaleString('vi-VN')}
              </strong>
            </li>
          ))}
        </ul>
      )}
      {data.totalPages > 1 && (
        <nav className="pagination">
          <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Trước
          </button>
          <span className="muted">
            Trang {page}/{data.totalPages}
          </span>
          <button className="btn btn-ghost btn-sm" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>
            Sau
          </button>
        </nav>
      )}
    </section>
  );
}
