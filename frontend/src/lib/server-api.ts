import 'server-only';
import type { Category, LatestReview, Product, ProductDetail, ProductFacets, ProductPage, SortValue, StoreSummary } from './types';

// SSR gọi thẳng backend qua mạng Docker nội bộ, không vòng ra Nginx/Internet
const API_URL = process.env.INTERNAL_API_URL ?? 'http://backend:8080';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function get<T>(path: string, revalidate: number): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    next: { revalidate },
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new ApiError(res.status, `GET ${path} failed with ${res.status}`);
  return (await res.json()) as T;
}

export interface ProductQuery {
  page: number;
  limit?: number;
  category?: string;
  q?: string;
  sort?: SortValue;
  onSale?: boolean;
  minPrice?: number;
  maxPrice?: number;
  material?: string;
  power?: string;
  capacity?: string;
  maxLength?: number;
  bulky?: boolean;
}

export function getProducts({ page, limit = 12, category, q, sort, onSale, minPrice, maxPrice, material, power, capacity, maxLength, bulky }: ProductQuery): Promise<ProductPage> {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (category) qs.set('category', category);
  if (q) qs.set('q', q);
  if (sort) qs.set('sort', sort);
  if (onSale) qs.set('onSale', 'true');
  if (minPrice !== undefined) qs.set('minPrice', String(minPrice));
  if (maxPrice !== undefined) qs.set('maxPrice', String(maxPrice));
  if (material) qs.set('material', material);
  if (power) qs.set('power', power);
  if (capacity) qs.set('capacity', capacity);
  if (maxLength) qs.set('maxLength', String(maxLength));
  if (bulky) qs.set('bulky', 'true');
  return get<ProductPage>(`/products?${qs.toString()}`, 30);
}

export function getBestSellers(): Promise<Product[]> {
  return get<Product[]>('/products/best-sellers', 60);
}

export function getDeals(): Promise<Product[]> {
  return get<Product[]>('/products/deals', 60);
}

export function getProduct(slug: string): Promise<ProductDetail> {
  return get<ProductDetail>(`/products/${encodeURIComponent(slug)}`, 30);
}

export function getFacets(category?: string): Promise<ProductFacets> {
  return get<ProductFacets>(`/products/facets${category ? `?category=${encodeURIComponent(category)}` : ''}`, 120);
}

export function getCategories(): Promise<Category[]> {
  return get<Category[]>('/categories', 300);
}

export function getLatestReviews(): Promise<LatestReview[]> {
  return get<LatestReview[]>('/reviews/latest', 60);
}

export function getStoreSummary(): Promise<StoreSummary> {
  return get<StoreSummary>('/products/summary', 300);
}
