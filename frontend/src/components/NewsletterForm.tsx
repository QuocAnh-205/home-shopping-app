'use client';

import { faCircleCheck, faPaperPlane, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/client-api';

export function NewsletterForm() {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get('email') ?? '');
    setState('busy');
    setError(null);
    try {
      await apiFetch('/newsletter/subscribe', { method: 'POST', body: JSON.stringify({ email }) });
      setState('done');
    } catch (err) {
      setError((err as Error).message);
      setState('idle');
    }
  }

  if (state === 'done') {
    return (
      <p className="newsletter-done" role="status">
        <FontAwesomeIcon icon={faCircleCheck} /> Cảm ơn bạn! Hãy kiểm tra email để nhận ưu đãi chào mừng.
      </p>
    );
  }

  return (
    <form className="newsletter-form" onSubmit={submit}>
      <input className="input" type="email" name="email" required maxLength={254} placeholder="Nhập email của bạn" aria-label="Email nhận bản tin" />
      <button className="btn" disabled={state === 'busy'}>
        <FontAwesomeIcon icon={state === 'busy' ? faSpinner : faPaperPlane} spin={state === 'busy'} /> Đăng ký
      </button>
      {error && <small className="newsletter-error">{error}</small>}
    </form>
  );
}
