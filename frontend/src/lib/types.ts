export type Role = 'CUSTOMER' | 'ADMIN';
export type OrderStatus = 'PENDING' | 'PAID' | 'SHIPPING' | 'COMPLETED' | 'CANCELLED';
export type OAuthProvider = 'GOOGLE' | 'FACEBOOK';

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
  highlights: string[];
  specs: Record<string, string>;
  price: string;
  compareAtPrice: string | null;
  discountPercent: number;
  stock: number;
  soldCount: number;
  ratingAvg: number;
  ratingCount: number;
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

export interface ReviewUser {
  id: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface Review {
  id: string;
  rating: number;
  comment: string;
  verifiedPurchase: boolean;
  createdAt: string;
  updatedAt: string;
  user: ReviewUser;
}

export interface ReviewSummary {
  average: number;
  count: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

export interface ReviewPage extends Page<Review> {
  summary: ReviewSummary;
}

export interface LatestReview extends Review {
  product: { name: string; slug: string; imageUrl: string | null };
}

export interface AdminReview extends Review {
  product: { name: string; slug: string };
}

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
  avatarUrl: string | null;
}

export interface AccountProfile extends UserProfile {
  createdAt: string;
  hasPassword: boolean;
  providers: OAuthProvider[];
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
  { value: 'best_selling', label: 'Bán chạy' },
  { value: 'top_rated', label: 'Đánh giá cao' },
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
const dateOnly = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' });
const compact = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });

export function formatPrice(value: string | number): string {
  return vnd.format(Number(value));
}

export function formatDate(value: string): string {
  return dateTime.format(new Date(value));
}

export function formatDay(value: string): string {
  return dateOnly.format(new Date(value));
}

/** 1240 → "1,2 N" (dùng cho "Đã bán") */
export function formatCompact(value: number): string {
  return compact.format(value);
}

export function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

/** Chữ cái đầu của tên (tên tiếng Việt: lấy từ cuối là tên gọi) */
export function initials(fullName: string): string {
  return fullName.trim().split(/\s+/).slice(-1)[0]?.charAt(0).toUpperCase() ?? '?';
}
