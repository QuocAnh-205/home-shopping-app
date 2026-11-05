import { ApiError, getToken } from './client-api';
import type { AdminOrder, Page, Product, Role } from './types';

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  role: Role;
  lockedAt: string | null;
  lockedReason: string | null;
  createdAt: string;
  deleted: boolean;
  hasPassword: boolean;
  providers: string[];
  orderCount: number;
  reviewCount: number;
  totalSpent: string;
}

export interface UserCounts {
  total: number;
  customers: number;
  admins: number;
  locked: number;
  new30d: number;
  deleted: number;
}

export interface AdminUserPage extends Page<AdminUser> {
  counts: UserCounts;
}

export interface AdminUserDetail extends AdminUser {
  gender: string | null;
  dateOfBirth: string | null;
  updatedAt: string;
  stats: { completedOrders: number; cancelledOrders: number; pendingOrders: number; lastOrderAt: string | null; averageOrder: string };
  addresses: { id: string; fullName: string; phone: string; full: string; type: string; isDefault: boolean }[];
  recentOrders: { id: string; status: AdminOrder['status']; totalAmount: string; createdAt: string; itemCount: number }[];
  recentReviews: { id: string; rating: number; comment: string; createdAt: string; product: { name: string; slug: string } }[];
}

export interface AdminProduct extends Product {
  isActive: boolean;
}

export interface AdminProductPage extends Page<AdminProduct> {
  counts: { all: number; active: number; hidden: number; out: number; low: number };
}

export interface AdminOrderPage extends Page<AdminOrder & { user: AdminOrder['user'] & { phone: string | null } }> {
  summary: { count: number; amount: string };
}

export interface AdminCategory {
  id: number;
  name: string;
  slug: string;
  productCount: number;
  activeCount: number;
  stock: number;
  soldCount: number;
}

export interface Subscriber {
  id: number;
  email: string;
  createdAt: string;
}

export interface SubscriberPage extends Page<Subscriber> {
  counts: { all: number; last30d: number };
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata: unknown;
  createdAt: string;
  actor: { id: string; email: string; fullName: string } | null;
}

export const ACTION_LABEL: Record<string, string> = {
  'order.status': 'Đổi trạng thái đơn',
  'product.create': 'Tạo sản phẩm',
  'product.update': 'Sửa sản phẩm',
  'product.stock': 'Cập nhật tồn kho',
  'product.image': 'Đổi ảnh sản phẩm',
  'product.hide': 'Ẩn sản phẩm',
  'product.show': 'Hiện sản phẩm',
  'product.delete': 'Xóa sản phẩm',
  'category.create': 'Tạo danh mục',
  'category.update': 'Sửa danh mục',
  'category.delete': 'Xóa danh mục',
  'user.role': 'Đổi quyền',
  'user.lock': 'Khóa tài khoản',
  'user.unlock': 'Mở khóa tài khoản',
  'user.logout_all': 'Đăng xuất mọi thiết bị',
  'review.delete': 'Gỡ đánh giá',
  'newsletter.delete': 'Xóa người nhận tin',
};

export const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Quản trị viên', CUSTOMER: 'Khách hàng' };

/** Bỏ các tham số rỗng để URL gọn và backend không nhận chuỗi rỗng */
export function toQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  return qs.toString();
}

/** Tải file CSV từ API admin (cần Bearer token nên không dùng <a href> trực tiếp được) */
export async function downloadCsv(path: string, fallbackName: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' });
  if (!res.ok) throw new ApiError(res.status, 'Không xuất được file, vui lòng thử lại');
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
}

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}
