'use client';

import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faChevronLeft, faChevronRight, faCircleCheck, faSpinner, faTriangleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Phân trang dùng chung cho mọi bảng quản trị */
export function Pager({ page, totalPages, total, unit, onPage }: { page: number; totalPages: number; total: number; unit: string; onPage: (p: number) => void }) {
  if (totalPages <= 1) return <p className="muted small admin-total">{total} {unit}</p>;
  return (
    <nav className="pagination" aria-label="Phân trang">
      <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <FontAwesomeIcon icon={faChevronLeft} /> Trước
      </button>
      <span className="muted">
        Trang {page}/{totalPages} · {total} {unit}
      </span>
      <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        Sau <FontAwesomeIcon icon={faChevronRight} />
      </button>
    </nav>
  );
}

/** Ô số liệu nhỏ ở đầu mỗi trang quản trị; bấm được để lọc nhanh */
export function StatTile({ icon, tone, label, value, active, onClick }: { icon: IconDefinition; tone: string; label: string; value: ReactNode; active?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <span className={`kpi-ico ${tone}`}>
        <FontAwesomeIcon icon={icon} />
      </span>
      <span>
        <span className="muted small">{label}</span>
        <strong>{value}</strong>
      </span>
    </>
  );
  return onClick ? (
    <button type="button" className={`stat-tile${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active}>
      {body}
    </button>
  ) : (
    <div className="stat-tile">{body}</div>
  );
}

export function Notice({ message, onClose }: { message: { ok: boolean; text: string } | null; onClose?: () => void }) {
  if (!message) return null;
  return (
    <p className={`alert ${message.ok ? 'alert-ok' : ''}`} role={message.ok ? 'status' : 'alert'}>
      <FontAwesomeIcon icon={message.ok ? faCircleCheck : faTriangleExclamation} /> <span style={{ flex: 1 }}>{message.text}</span>
      {onClose && (
        <button className="link-btn" onClick={onClose} aria-label="Đóng thông báo">
          <FontAwesomeIcon icon={faXmark} />
        </button>
      )}
    </p>
  );
}

export function Loading({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div className="skeleton">
      <FontAwesomeIcon icon={faSpinner} spin /> {label}
    </div>
  );
}

/** Hộp thoại native <dialog>: có sẵn focus trap, phím Esc, backdrop */
export function AdminDialog({ title, open, onClose, wide, children, footer }: { title: string; open: boolean; onClose: () => void; wide?: boolean; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog ref={ref} className={`dialog${wide ? ' dialog-wide' : ''}`} onClose={onClose} aria-label={title}>
      <header className="dialog-head">
        <h3>{title}</h3>
        <button type="button" className="btn-icon" onClick={onClose} aria-label="Đóng">
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </header>
      <div className="dialog-body">{open && children}</div>
      {footer && <footer className="dialog-foot">{footer}</footer>}
    </dialog>
  );
}

/** Nút cần bấm 2 lần cho thao tác nguy hiểm (không dùng window.confirm để không chặn trình duyệt) */
export function ConfirmButton({ label, confirmLabel, icon, onConfirm, disabled, className = 'btn btn-ghost btn-sm' }: { label: string; confirmLabel: string; icon: IconDefinition; onConfirm: () => Promise<void> | void; disabled?: boolean; className?: string }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={`${className}${armed ? ' btn-armed' : ''}`}
      disabled={disabled || busy}
      onClick={async () => {
        if (!armed) return setArmed(true);
        setBusy(true);
        try {
          await onConfirm();
        } finally {
          setBusy(false);
          setArmed(false);
        }
      }}
    >
      <FontAwesomeIcon icon={busy ? faSpinner : icon} spin={busy} /> {armed ? confirmLabel : label}
    </button>
  );
}

/** Trì hoãn giá trị ô tìm kiếm để không gọi API mỗi lần gõ phím */
export function useDebounced<T>(value: T, delay = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
