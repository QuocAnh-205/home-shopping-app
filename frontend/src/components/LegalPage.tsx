import Link from 'next/link';
import type { ReactNode } from 'react';

const LINKS = [
  { href: '/privacy', label: 'Chính sách bảo mật' },
  { href: '/terms', label: 'Điều khoản sử dụng' },
  { href: '/data-deletion', label: 'Xóa dữ liệu người dùng' },
];

/** Khung chung cho các trang pháp lý (Google/Facebook yêu cầu khi công khai ứng dụng đăng nhập) */
export function LegalPage({ title, updated, path, children }: { title: string; updated: string; path: string; children: ReactNode }) {
  return (
    <section className="legal">
      <nav className="legal-nav" aria-label="Chính sách">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={l.href === path ? 'chip active' : 'chip'} aria-current={l.href === path ? 'page' : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
      <article className="panel legal-body">
        <h1>{title}</h1>
        <p className="muted small">Cập nhật lần cuối: {updated}</p>
        {children}
      </article>
    </section>
  );
}
