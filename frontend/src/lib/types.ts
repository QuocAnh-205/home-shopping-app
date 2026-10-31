export type Role = 'CUSTOMER' | 'ADMIN';
export type OrderStatus = 'PENDING' | 'PAID' | 'SHIPPING' | 'COMPLETED' | 'CANCELLED';

export interface Category {
  id: number;
  name: string;
  slug: string;
  productCount: number;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: string;
  stock: number;
  isHot: boolean;
  categoryId: number;
  category: { id: number; name: string; slug: string };
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type ProductPage = Page<Product>;

export interface CartLine {
  productId: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  available: boolean;
}

export interface Cart {
  items: CartLine[];
  totalItems: number;
  totalAmount: string;
}

export interface OrderItem {
  id: number;
  productId: string;
  quantity: number;
  unitPrice: string;
  product: { name: string; slug: string };
}

export interface Order {
  id: string;
  status: OrderStatus;
  totalAmount: string;
  shippingAddress: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

export interface AdminOrder extends Order {
  user: { id: string; email: string; fullName: string };
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export interface AuthResponse {
  accessToken: string;
  expiresAt: string;
  user: UserProfile;
}

export interface DashboardStats {
  revenue: string;
  ordersByStatus: Record<OrderStatus, number>;
  totalOrders: number;
  customers: number;
  products: number;
  revenueLast7Days: { day: string; revenue: string; orders: number }[];
  topProducts: { productId: string; name: string; slug: string; quantity: number }[];
  lowStock: Product[];
  generatedAt: string;
}

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'price_asc', label: 'Giá tăng dần' },
  { value: 'price_desc', label: 'Giá giảm dần' },
  { value: 'name', label: 'Tên A → Z' },
] as const;
export type SortValue = (typeof SORT_OPTIONS)[number]['value'];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Chờ xác nhận',
  PAID: 'Đã thanh toán',
  SHIPPING: 'Đang giao',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
};

/** Phải khớp ORDER_TRANSITIONS ở backend (backend vẫn là nơi kiểm tra cuối cùng) */
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['SHIPPING', 'CANCELLED'],
  SHIPPING: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });

export function formatPrice(value: string | number): string {
  return vnd.format(Number(value));
}

export function formatDate(value: string): string {
  return dateTime.format(new Date(value));
}

export function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}
