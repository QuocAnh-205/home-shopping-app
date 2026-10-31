'use client';

import { faTable, faChartArea } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useId, useRef, useState, type PointerEvent } from 'react';
import { STATUS_LABEL, formatPrice, type DailyRevenue, type OrderStatus } from '@/lib/types';

const compactVnd = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });
const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Bước chia trục "đẹp" (1, 2, 5 × 10^n) cho ~4 vạch */
function niceMax(max: number, ticks = 4): { top: number; step: number } {
  if (max <= 0) return { top: 1, step: 0.25 };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  return { top: step * ticks, step };
}

/**
 * Doanh thu theo ngày: 1 chuỗi → không cần chú giải (tiêu đề đã gọi tên).
 * Đường 2px + vùng tô 10%, lưới mảnh, crosshair + tooltip bám theo ngày gần con trỏ, có chế độ bảng.
 */
export function RevenueChart({ data }: { data: DailyRevenue[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const gradId = useId();

  const W = 720;
  const H = 260;
  const pad = { l: 56, r: 16, t: 16, b: 28 };
  const values = data.map((d) => Number(d.revenue));
  const { top, step } = niceMax(Math.max(...values, 0));
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, data.length - 1);
  const y = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = `${line}L${x(values.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const peak = values.indexOf(Math.max(...values));

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (data.length - 1));
    setHover(Math.min(data.length - 1, Math.max(0, i)));
  }

  const h = hover !== null ? data[hover] : null;

  return (
    <div className="chart">
      <div className="chart-tools">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          <FontAwesomeIcon icon={asTable ? faChartArea : faTable} /> {asTable ? 'Xem biểu đồ' : 'Xem dạng bảng'}
        </button>
      </div>
      {asTable ? (
        <div className="table-wrap chart-table">
          <table className="table">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Doanh thu</th>
                <th>Số đơn</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.day}>
                  <td>{dayLabel(d.day)}</td>
                  <td className="num">{formatPrice(d.revenue)}</td>
                  <td className="num">{d.orders}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-plot">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Doanh thu ${data.length} ngày, cao nhất ${formatPrice(values[peak] ?? 0)} ngày ${dayLabel(data[peak]?.day ?? '')}`}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-line)" stopOpacity="0.16" />
                <stop offset="100%" stopColor="var(--chart-line)" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line className="chart-grid" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
                <text className="chart-tick" x={pad.l - 8} y={y(t) + 4} textAnchor="end">
                  {t === 0 ? '0' : compactVnd.format(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) =>
              i % 5 === 4 || i === data.length - 1 ? (
                <text key={d.day} className="chart-tick" x={x(i)} y={H - 8} textAnchor="middle">
                  {dayLabel(d.day)}
                </text>
              ) : null,
            )}
            <path d={area} fill={`url(#${gradId})`} />
            <path d={line} className="chart-line" />
            {/* Nhãn chọn lọc: chỉ đánh dấu ngày cao nhất */}
            {values[peak] > 0 && (
              <g>
                <circle cx={x(peak)} cy={y(values[peak])} r={4} className="chart-dot" />
                <text className="chart-label" x={x(peak)} y={y(values[peak]) - 10} textAnchor="middle">
                  {compactVnd.format(values[peak])}
                </text>
              </g>
            )}
            {h && hover !== null && (
              <g>
                <line className="chart-crosshair" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={y(0)} />
                <circle cx={x(hover)} cy={y(values[hover])} r={5} className="chart-dot" />
              </g>
            )}
          </svg>
          {h && hover !== null && (
            <div className="chart-tooltip" style={{ left: `${(x(hover) / W) * 100}%` }} role="status">
              <strong>{formatPrice(h.revenue)}</strong>
              <span>
                {dayLabel(h.day)} · {h.orders} đơn
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Đường xu hướng nhỏ trong thẻ KPI (không trục, không nhãn) */
export function Sparkline({ values }: { values: number[] }) {
  const W = 160;
  const H = 40;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${((i / Math.max(1, values.length - 1)) * W).toFixed(1)},${(H - 3 - (v / max) * (H - 6)).toFixed(1)}`);
  return (
    <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} aria-hidden preserveAspectRatio="none">
      <polyline points={pts.join(' ')} />
    </svg>
  );
}

export const STATUS_ORDER: OrderStatus[] = ['PENDING', 'PAID', 'SHIPPING', 'COMPLETED', 'CANCELLED'];

/**
 * Cơ cấu đơn theo trạng thái: thanh phân đoạn (1 tổng chia phần) + chú giải liệt kê tên, số, tỷ lệ.
 * Màu đã kiểm tra bằng validate_palette (CVD/tương phản) cho cả nền sáng & tối; nhãn luôn đi kèm màu.
 */
export function StatusBreakdown({ counts }: { counts: Record<OrderStatus, number> }) {
  const total = STATUS_ORDER.reduce((s, k) => s + counts[k], 0);
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  return (
    <div className="status-breakdown">
      <div className="seg-bar" role="img" aria-label={STATUS_ORDER.map((s) => `${STATUS_LABEL[s]} ${counts[s]}`).join(', ')}>
        {STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => (
          <span key={s} className={`seg seg-${s.toLowerCase()}`} style={{ flexGrow: counts[s] }} title={`${STATUS_LABEL[s]}: ${counts[s]} đơn (${pct(counts[s])}%)`}>
            {pct(counts[s]) >= 12 ? `${pct(counts[s])}%` : ''}
          </span>
        ))}
      </div>
      <ul className="seg-legend">
        {STATUS_ORDER.map((s) => (
          <li key={s}>
            <span className={`swatch seg-${s.toLowerCase()}`} aria-hidden />
            <span className="seg-name">{STATUS_LABEL[s]}</span>
            <strong>{counts[s]}</strong>
            <span className="muted small">{pct(counts[s])}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Thanh ngang so sánh độ lớn (1 màu); giá trị ở đầu thanh, thanh ≤ 24px, đầu bo 4px */
export function HBars({ rows }: { rows: { key: string; label: string; value: number; display: string; sub?: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.key} title={`${r.label}: ${r.display}${r.sub ? ` · ${r.sub}` : ''}`}>
          <span className="hbar-label">
            {r.label}
            {r.sub && <small className="muted"> · {r.sub}</small>}
          </span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ width: `${Math.max(r.value > 0 ? 2 : 0, (r.value / max) * 100)}%` }} />
          </span>
          <span className="hbar-value">{r.display}</span>
        </li>
      ))}
    </ul>
  );
}
