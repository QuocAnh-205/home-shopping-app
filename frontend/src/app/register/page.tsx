import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { RegisterForm } from '@/components/auth/RegisterForm';

export const metadata: Metadata = { title: 'Đăng ký tài khoản' };

export default function RegisterPage() {
  return (
    <AuthShell image="/images/site/cat-phong-ngu.webp">
      <Suspense fallback={<div className="skeleton">Đang tải…</div>}>
        <RegisterForm />
      </Suspense>
    </AuthShell>
  );
}
