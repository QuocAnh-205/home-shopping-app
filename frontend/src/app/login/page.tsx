import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = { title: 'Đăng nhập' };

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense fallback={<div className="skeleton">Đang tải…</div>}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
