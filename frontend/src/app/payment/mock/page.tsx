'use client';

import { faCircleCheck, faCircleXmark, faFlask, faSpinner, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { formatPrice, shortId } from '@/lib/types';

/**
 * Trang cổng thanh toán GIẢ LẬP (chỉ khi cửa hàng chưa cấu hình khóa VNPay/MoMo thật).
 * Bấm nút = server cổng gửi IPN về backend; backend kiểm chữ ký link, đối chiếu số tiền rồi mới cập nhật đơn.
 */
function MockGateway() {
  const params = useSearchParams();
  const method = params.get('method') ?? '';
  const ref = params.get('ref') ?? '';
  const amount = Number(params.get('amount'));
  const order = params.get('order') ?? '';
  const sig = params.get('sig') ?? '';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish(result: 'success' | 'failed') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/payments/mock/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, txnRef: ref, amount, result, sig }),
      });
      if (!res.ok) throw new Error('Liên kết thanh toán không hợp lệ hoặc đã hết hạn');
      window.location.assign(`/payment/result?order=${order}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <section className="panel mock-gateway">
      <p className="badge badge-outline">
        <FontAwesomeIcon icon={faFlask} /> Môi trường thử nghiệm (sandbox) – không trừ tiền thật
      </p>
      <h1 className="page-title">Cổng {method === 'MOMO' ? 'MoMo' : 'VNPay'}</h1>
      <dl className="summary">
        <dt>Đơn hàng</dt>
        <dd>#{order ? shortId(order) : '—'}</dd>
        <dt>Mã giao dịch</dt>
        <dd>
          <code>{ref}</code>
        </dd>
        <dt className="total">Số tiền</dt>
        <dd className="total price">{Number.isFinite(amount) ? formatPrice(amount) : '—'}</dd>
      </dl>
      {error && (
        <p className="alert" role="alert">
          <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
        </p>
      )}
      <div className="row">
        <button className="btn btn-lg" disabled={busy} onClick={() => finish('success')}>
          {busy ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faCircleCheck} />} Thanh toán thành công
        </button>
        <button className="btn btn-lg btn-ghost" disabled={busy} onClick={() => finish('failed')}>
          <FontAwesomeIcon icon={faCircleXmark} /> Hủy / thất bại
        </button>
      </div>
    </section>
  );
}

export default function MockGatewayPage() {
  return (
    <Suspense fallback={null}>
      <MockGateway />
    </Suspense>
  );
}
