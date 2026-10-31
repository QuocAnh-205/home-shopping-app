'use client';

import { faCheck, faEye, faEyeSlash, faLock, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState } from 'react';

const RULES = [
  { test: (p: string) => p.length >= 8, label: 'Ít nhất 8 ký tự' },
  { test: (p: string) => /[a-z]/.test(p), label: 'Có chữ thường' },
  { test: (p: string) => /[A-Z]/.test(p), label: 'Có chữ hoa' },
  { test: (p: string) => /\d/.test(p), label: 'Có chữ số' },
];
const LEVEL = ['Rất yếu', 'Yếu', 'Trung bình', 'Khá', 'Mạnh'];

/** Khớp chính sách mật khẩu của backend (StrongPassword) */
export function isStrongPassword(p: string): boolean {
  return RULES.every((r) => r.test(p)) && p.length <= 72;
}

interface Props {
  name: string;
  label: string;
  autoComplete: string;
  value: string;
  onChange: (v: string) => void;
  showStrength?: boolean;
  minLength?: number;
}

export function PasswordField({ name, label, autoComplete, value, onChange, showStrength = false, minLength = 1 }: Props) {
  const [visible, setVisible] = useState(false);
  const passed = RULES.filter((r) => r.test(value)).length + (value.length >= 12 ? 1 : 0);
  const score = Math.min(4, passed);

  return (
    <label className="field">
      {label}
      <span className="input-wrap">
        <FontAwesomeIcon icon={faLock} />
        <input
          className="input"
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={72}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="reveal" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
          <FontAwesomeIcon icon={visible ? faEyeSlash : faEye} />
        </button>
      </span>
      {showStrength && value.length > 0 && (
        <div className="pw-strength" aria-live="polite">
          <div className={`pw-meter level-${score}`}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={i < score ? 'on' : undefined} />
            ))}
          </div>
          <small>Độ mạnh: {LEVEL[score]}</small>
          <ul className="pw-rules">
            {RULES.map((r) => (
              <li key={r.label} className={r.test(value) ? 'ok' : undefined}>
                <FontAwesomeIcon icon={r.test(value) ? faCheck : faXmark} /> {r.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </label>
  );
}
