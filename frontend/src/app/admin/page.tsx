'use client';

import { useState } from 'react';
import { Dashboard } from '@/components/admin/Dashboard';
import { OrdersAdmin } from '@/components/admin/OrdersAdmin';
import { ProductsAdmin } from '@/components/admin/ProductsAdmin';
import { RequireAuth } from '@/components/RequireAuth';

const TABS = [
  { id: 'dashboard', label: '📊 Tổng quan' },
  { id: 'orders', label: '📦 Đơn hàng' },
  { id: 'products', label: '🏷️ Sản phẩm' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('dashboard');

  return (
    <section>
      <h1 className="page-title">Quản trị</h1>
      <RequireAuth role="ADMIN">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'orders' && <OrdersAdmin />}
        {tab === 'products' && <ProductsAdmin />}
      </RequireAuth>
    </section>
  );
}
