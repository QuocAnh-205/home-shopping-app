'use client';

import {
  faBoxOpen,
  faClockRotateLeft,
  faEnvelopeOpenText,
  faFolderTree,
  faGauge,
  faReceipt,
  faRotateLeft,
  faStar,
  faTags,
  faTicket,
  faUsers,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useState } from 'react';
import { AuditLogAdmin } from '@/components/admin/AuditLogAdmin';
import { CategoriesAdmin } from '@/components/admin/CategoriesAdmin';
import { Dashboard } from '@/components/admin/Dashboard';
import { NewsletterAdmin } from '@/components/admin/NewsletterAdmin';
import { OrdersAdmin } from '@/components/admin/OrdersAdmin';
import { ProductsAdmin } from '@/components/admin/ProductsAdmin';
import { ReturnsAdmin } from '@/components/admin/ReturnsAdmin';
import { ReviewsAdmin } from '@/components/admin/ReviewsAdmin';
import { UsersAdmin } from '@/components/admin/UsersAdmin';
import { VouchersAdmin } from '@/components/admin/VouchersAdmin';
import { RequireAuth } from '@/components/RequireAuth';

const TABS = [
  { id: 'dashboard', label: 'Tổng quan', icon: faGauge },
  { id: 'orders', label: 'Đơn hàng', icon: faReceipt },
  { id: 'returns', label: 'Trả hàng/Hoàn tiền', icon: faRotateLeft },
  { id: 'vouchers', label: 'Voucher', icon: faTicket },
  { id: 'products', label: 'Sản phẩm', icon: faTags },
  { id: 'categories', label: 'Danh mục', icon: faFolderTree },
  { id: 'users', label: 'Người dùng', icon: faUsers },
  { id: 'reviews', label: 'Đánh giá', icon: faStar },
  { id: 'newsletter', label: 'Bản tin', icon: faEnvelopeOpenText },
  { id: 'audit', label: 'Nhật ký', icon: faClockRotateLeft },
] as const;
type Tab = (typeof TABS)[number]['id'];

const isTab = (v: string): v is Tab => TABS.some((t) => t.id === v);

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [orderQuery, setOrderQuery] = useState('');

  // Đồng bộ tab với #hash → tải lại trang / chia sẻ link vẫn mở đúng tab
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.slice(1);
      if (isTab(h)) setTab(h);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  function open(next: Tab) {
    setTab(next);
    if (next !== 'orders') setOrderQuery('');
    window.history.replaceState(null, '', next === 'dashboard' ? window.location.pathname : `#${next}`);
  }

  return (
    <section>
      <h1 className="page-title">
        <FontAwesomeIcon icon={faBoxOpen} /> Quản trị cửa hàng
      </h1>
      <RequireAuth role="ADMIN">
        <div className="tabs admin-tabs" role="tablist" aria-label="Khu vực quản trị">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => open(t.id)}>
              <FontAwesomeIcon icon={t.icon} /> {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel">
          {tab === 'dashboard' && <Dashboard onOpenOrders={() => open('orders')} />}
          {tab === 'orders' && <OrdersAdmin initialQuery={orderQuery} />}
          {tab === 'returns' && <ReturnsAdmin />}
          {tab === 'vouchers' && <VouchersAdmin />}
          {tab === 'products' && <ProductsAdmin />}
          {tab === 'categories' && <CategoriesAdmin />}
          {tab === 'users' && (
            <UsersAdmin
              onOpenOrders={(email) => {
                setOrderQuery(email);
                setTab('orders');
                window.history.replaceState(null, '', '#orders');
              }}
            />
          )}
          {tab === 'reviews' && <ReviewsAdmin />}
          {tab === 'newsletter' && <NewsletterAdmin />}
          {tab === 'audit' && <AuditLogAdmin />}
        </div>
      </RequireAuth>
    </section>
  );
}
