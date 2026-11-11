'use client';

import { faPlus, faTicket } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { formatDateTime } from '@/lib/admin';
import { apiFetch } from '@/lib/client-api';
import { formatPrice, type VoucherType } from '@/lib/types';
import { Loading, Notice } from './ui';

interface AdminVoucher {
  id: string;
  code: string;
  name: string;
  type: VoucherType;
  value: number;
  maxDiscount: number | null;
  minOrderValue: number;
  startsAt: string;
  endsAt: string;
  usageLimit: number | null;
  usedCount: number;
  perUserLimit: number;
  isActive: boolean;
  isPublic: boolean;
}

const TYPE_LABEL: Record<VoucherType, string> = { PERCENT: 'Giảm %', FIXED: 'Giảm tiền', FREESHIP: 'Miễn phí ship' };

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

function describe(v: AdminVoucher): string {
  if (v.type === 'PERCENT') return `${v.value}%${v.maxDiscount ? ` (tối đa ${formatPrice(v.maxDiscount)})` : ''}`;
  if (v.type === 'FIXED') return formatPrice(v.value);
  return v.value ? `Tối đa ${formatPrice(v.value)}` : 'Toàn bộ phí ship';
}

/** Quản lý voucher: tạo, bật/tắt, xem lượt đã dùng */
export function VouchersAdmin() {
  const [rows, setRows] = useState<AdminVoucher[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [type, setType] = useState<VoucherType>('PERCENT');

  const load = useCallback(() => {
    apiFetch<AdminVoucher[]>('/admin/vouchers')
      .then(setRows)
      .catch((err: Error) => setMsg({ ok: false, text: err.message }));
  }, []);
  useEffect(load, [load]);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) => (f.get(k) ? Number(f.get(k)) : undefined);
    try {
      await apiFetch('/admin/vouchers', {
        method: 'POST',
        body: JSON.stringify({
          code: f.get('code'),
          name: f.get('name'),
          type,
          value: num('value') ?? 0,
          maxDiscount: type === 'PERCENT' ? (num('maxDiscount') ?? null) : null,
          minOrderValue: num('minOrderValue') ?? 0,
          usageLimit: num('usageLimit') ?? null,
          perUserLimit: num('perUserLimit') ?? 1,
          startsAt: new Date(String(f.get('startsAt'))).toISOString(),
          endsAt: new Date(String(f.get('endsAt'))).toISOString(),
          isPublic: f.get('isPublic') === 'on',
        }),
      });
      setMsg({ ok: true, text: 'Đã tạo voucher' });
      setCreating(false);
      load();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  }

  async function toggle(v: AdminVoucher) {
    try {
      await apiFetch(`/admin/vouchers/${v.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !v.isActive }) });
      load();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  }

  const now = new Date();
  return (
    <div className="stack">
      <Notice message={msg} onClose={() => setMsg(null)} />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <p className="muted small" style={{ margin: 0 }}>
          Mỗi đơn dùng tối đa 1 voucher giảm giá + 1 voucher vận chuyển. Lượt dùng được trả lại khi đơn bị hủy.
        </p>
        <button className="btn btn-sm" onClick={() => setCreating((c) => !c)}>
          <FontAwesomeIcon icon={faPlus} /> Tạo voucher
        </button>
      </div>

      {creating && (
        <form className="panel form form-grid" onSubmit={create}>
          <label className="field">
            Mã (A-Z, 0-9)
            <input className="input" name="code" required pattern="[A-Za-z0-9]{4,32}" style={{ textTransform: 'uppercase' }} />
          </label>
          <label className="field">
            Tên hiển thị
            <input className="input" name="name" required minLength={3} maxLength={120} />
          </label>
          <label className="field">
            Loại
            <select className="input" value={type} onChange={(e) => setType(e.target.value as VoucherType)}>
              {(Object.keys(TYPE_LABEL) as VoucherType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {type === 'PERCENT' ? 'Phần trăm (1–100)' : type === 'FIXED' ? 'Số tiền giảm (₫)' : 'Giảm ship tối đa (₫, 0 = miễn toàn bộ)'}
            <input className="input" name="value" type="number" min={type === 'FREESHIP' ? 0 : 1} max={type === 'PERCENT' ? 100 : undefined} required />
          </label>
          {type === 'PERCENT' && (
            <label className="field">
              Giảm tối đa (₫)
              <input className="input" name="maxDiscount" type="number" min={1} />
            </label>
          )}
          <label className="field">
            Đơn tối thiểu (₫)
            <input className="input" name="minOrderValue" type="number" min={0} defaultValue={0} />
          </label>
          <label className="field">
            Tổng lượt (trống = không giới hạn)
            <input className="input" name="usageLimit" type="number" min={1} />
          </label>
          <label className="field">
            Lượt / người
            <input className="input" name="perUserLimit" type="number" min={1} max={100} defaultValue={1} />
          </label>
          <label className="field">
            Bắt đầu
            <input className="input" name="startsAt" type="datetime-local" required defaultValue={toLocalInput(now)} />
          </label>
          <label className="field">
            Kết thúc
            <input className="input" name="endsAt" type="datetime-local" required defaultValue={toLocalInput(new Date(now.getTime() + 30 * 86_400_000))} />
          </label>
          <label className="checkbox span-2">
            <input type="checkbox" name="isPublic" defaultChecked /> Hiện trong kho voucher (bỏ chọn = mã riêng, khách phải nhập tay)
          </label>
          <div className="span-2 row">
            <button className="btn">Lưu voucher</button>
          </div>
        </form>
      )}

      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState icon={faTicket} title="Chưa có voucher">
          <p>Tạo voucher đầu tiên để khách áp dụng ở trang thanh toán.</p>
        </EmptyState>
      ) : (
        <div className="panel table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Loại</th>
                <th>Mức giảm</th>
                <th className="num">Đơn tối thiểu</th>
                <th>Hiệu lực</th>
                <th className="num">Đã dùng</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => {
                const expired = new Date(v.endsAt) <= now;
                return (
                  <tr key={v.id}>
                    <td>
                      <code>{v.code}</code>
                      <div className="muted small">
                        {v.name}
                        {!v.isPublic && ' · mã riêng'}
                      </div>
                    </td>
                    <td>{TYPE_LABEL[v.type]}</td>
                    <td>{describe(v)}</td>
                    <td className="num">{formatPrice(v.minOrderValue)}</td>
                    <td className="small">
                      {formatDateTime(v.startsAt)} → {formatDateTime(v.endsAt)}
                    </td>
                    <td className="num">
                      {v.usedCount}
                      {v.usageLimit ? ` / ${v.usageLimit}` : ''}
                    </td>
                    <td>
                      {expired ? (
                        <span className="muted small">Hết hạn</span>
                      ) : (
                        <button className={v.isActive ? 'btn btn-sm' : 'btn btn-ghost btn-sm'} onClick={() => toggle(v)}>
                          {v.isActive ? 'Đang bật' : 'Đang tắt'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
