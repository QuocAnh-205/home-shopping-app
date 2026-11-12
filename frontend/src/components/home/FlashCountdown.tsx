'use client';

import { useEffect, useState } from 'react';

/** Số giây còn lại tới 24:00 giờ Việt Nam (Flash Sale theo ngày) */
function secondsToMidnightVN(now = Date.now()): number {
  const vn = new Date(now + 7 * 3600_000);
  const end = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() + 1) - 7 * 3600_000;
  return Math.max(0, Math.floor((end - now) / 1000));
}

const pad = (n: number) => String(n).padStart(2, '0');

export function FlashCountdown() {
  // Render server: chưa biết giờ máy khách → hiện khung trống cùng kích thước, tránh lệch hydration
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(secondsToMidnightVN());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  const parts = left === null ? ['--', '--', '--'] : [Math.floor(left / 3600), Math.floor((left % 3600) / 60), left % 60].map(pad);
  return (
    <span className="flash-clock" role="timer" aria-label="Thời gian còn lại của Flash Sale hôm nay">
      {parts.map((p, i) => (
        <span key={i} className="flash-clock-cell">
          {p}
        </span>
      ))}
    </span>
  );
}
