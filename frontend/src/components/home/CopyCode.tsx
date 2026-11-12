'use client';

import { faCheck, faCopy } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState } from 'react';

/** Nút sao chép mã voucher (dán ở trang thanh toán) */
export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`hero-voucher-btn${copied ? ' is-copied' : ''}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
        } catch {
          /* trình duyệt chặn clipboard: vẫn hiện mã để khách tự nhập */
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      aria-label={`Sao chép mã ${code}`}
    >
      <FontAwesomeIcon icon={copied ? faCheck : faCopy} /> {copied ? 'Đã chép' : code}
    </button>
  );
}
