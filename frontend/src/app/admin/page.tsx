'use client';

import { faBoxOpen, faGauge, faReceipt, faStar, faTags } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState } from 'react';
import { Dashboard } from '@/components/admin/Dashboard';
import { OrdersAdmin } from '@/components/admin/OrdersAdmin';
import { ProductsAdmin } from '@/components/admin/ProductsAdmin';
import { ReviewsAdmin } from '@/components/admin/ReviewsAdmin';
import { RequireAuth } from '@/components/RequireAuth';

const TABS = [
  { id: 'dashboard', label: 'Tổng quan', icon: faGauge },
  { id: 'orders', label: 'Đơn hàng', icon: faReceipt },
  { id: 'products', label: 'Sản phẩm', icon: faTags },
  { id: 'reviews', label: 'Đánh giá', icon: faStar },
] as const;
type Tab = (typeof TABS)[number]['id'];

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('dashboard');

  return (
    <section>
      <h1 className="page-title">
        <FontAwesomeIcon icon={faBoxOpen} /> Quản trị cửa hàng
      </h1>
      <RequireAuth role="ADMIN">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
              <FontAwesomeIcon icon={t.icon} /> {t.label}
            </button>
          ))}
        </div>
        {tab === 'dashboard' && <Dashboard onOpenOrders={() => setTab('orders')} />}
        {tab === 'orders' && <OrdersAdmin />}
        {tab === 'products' && <ProductsAdmin />}
        {tab === 'reviews' && <ReviewsAdmin />}
      </RequireAuth>
    </section>
  );
}
