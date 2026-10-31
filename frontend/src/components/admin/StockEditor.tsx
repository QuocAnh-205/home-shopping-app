'use client';

import { faFloppyDisk, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/client-api';

export function StockEditor({ productId, stock, onSaved }: { productId: string; stock: number; onSaved: () => void }) {
  const [value, setValue] = useState(String(stock));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/products/${productId}/stock`, { method: 'PATCH', body: JSON.stringify({ stock: Number(value) }) });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={save}>
      <input
        className="input input-sm"
        type="number"
        min={0}
        max={1_000_000}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Tồn kho"
        required
      />
      <button className="btn btn-sm" disabled={busy || value === String(stock)}>
        <FontAwesomeIcon icon={busy ? faSpinner : faFloppyDisk} spin={busy} />
        Lưu
      </button>
      {error && <span className="small danger">{error}</span>}
    </form>
  );
}
