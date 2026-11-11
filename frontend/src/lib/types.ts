export type Role = 'CUSTOMER' | 'ADMIN';
export type OrderStatus = 'PENDING' | 'PAID' | 'SHIPPING' | 'COMPLETED' | 'CANCELLED';
export type OAuthProvider = 'GOOGLE' | 'FACEBOOK';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type AddressType = 'HOME' | 'OFFICE';

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
  price: number;
  compareAtPrice: number | null;
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

export interface StoreSummary {
  products: number;
  onSale: number;
  sold: number;
  reviews: number;
  averageRating: number;
  reviewers: number;
}

/** Khoảng giá cho mục "Mua theo mức giá" (max không bao gồm) */
export const PRICE_RANGES = [
  { id: 'duoi-200k', label: 'Dưới 200.000₫', hint: 'Quà nhỏ xinh', min: undefined, max: 200_000 },
  { id: '200k-500k', label: '200.000₫ – 500.000₫', hint: 'Đồ dùng hằng ngày', min: 200_000, max: 500_000 },
  { id: '500k-1tr', label: '500.000₫ – 1 triệu', hint: 'Nâng cấp tổ ấm', min: 500_000, max: 1_000_000 },
  { id: '1tr-3tr', label: '1 – 3 triệu', hint: 'Thiết bị chất lượng', min: 1_000_000, max: 3_000_000 },
  { id: 'tren-3tr', label: 'Trên 3 triệu', hint: 'Nội thất cao cấp', min: 3_000_000, max: undefined },
] as const;
export type PriceRangeId = (typeof PRICE_RANGES)[number]['id'];

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
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  available: boolean;
}

export interface Cart {
  items: CartLine[];
  totalItems: number;
  totalAmount: number;
}

export interface OrderItem {
  id: number;
  productId: string;
  quantity: number;
  unitPrice: number;
  product: { name: string; slug: string };
}

export interface Order {
  id: string;
  status: OrderStatus;
  totalAmount: number;
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
  phone: string | null;
  gender: Gender | null;
  /** YYYY-MM-DD */
  dateOfBirth: string | null;
  createdAt: string;
  hasPassword: boolean;
  providers: OAuthProvider[];
}

export interface Address {
  id: string;
  fullName: string;
  phone: string;
  province: string;
  district: string;
  ward: string;
  street: string;
  type: AddressType;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AddressInput = Omit<Address, 'id' | 'createdAt' | 'updatedAt'>;

/** "12 Bạch Đằng, P. Hải Châu 1, Q. Hải Châu, Đà Nẵng" – dùng làm địa chỉ giao hàng của đơn */
export function formatAddress(a: Pick<Address, 'street' | 'ward' | 'district' | 'province'>): string {
  return [a.street, a.ward, a.district, a.province].filter(Boolean).join(', ');
}

/** Che bớt email giống Shopee: "lan.nguyen@x.vn" → "la********@x.vn" */
export function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(3, name.length - 2))}@${domain}`;
}

/** "0901234567" → "********67" */
export function maskPhone(phone: string): string {
  return `${'*'.repeat(phone.length - 2)}${phone.slice(-2)}`;
}

export interface AuthResponse {
  accessToken: string;
  expiresAt: string;
  user: UserProfile;
}

export interface DailyRevenue {
  day: string;
  revenue: number;
  orders: number;
}

export interface DashboardStats {
  kpis: {
    revenueAll: number;
    revenueToday: number;
    revenueYesterday: number;
    revenue30d: number;
    revenuePrev30d: number;
    ordersToday: number;
    ordersYesterday: number;
    paidOrders30d: number;
    paidOrdersPrev30d: number;
    avgOrderValue30d: number;
    unitsSold30d: number;
    newCustomers30d: number;
    newCustomersPrev30d: number;
    customers: number;
    products: number;
    outOfStock: number;
    pendingOrders: number;
  };
  ordersByStatus: Record<OrderStatus, number>;
  totalOrders: number;
  revenueDaily: DailyRevenue[];
  revenueByCategory: { slug: string; name: string; revenue: number; units: number }[];
  topProducts: { productId: string; name: string; slug: string; imageUrl: string | null; quantity: number; revenue: number }[];
  recentOrders: { id: string; customer: string; totalAmount: number; status: OrderStatus; createdAt: string; itemCount: number }[];
  reviews: { average: number; count: number; last30d: number; distribution: Record<'1' | '2' | '3' | '4' | '5', number> };
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
