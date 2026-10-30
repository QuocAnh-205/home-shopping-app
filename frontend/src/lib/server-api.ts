import 'server-only';
import type { Category, Product, ProductPage, SortValue } from './types';

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
  category?: string;
  q?: string;
  sort?: SortValue;
}

export function getProducts({ page, category, q, sort }: ProductQuery): Promise<ProductPage> {
  const qs = new URLSearchParams({ page: String(page), limit: '12' });
  if (category) qs.set('category', category);
  if (q) qs.set('q', q);
  if (sort) qs.set('sort', sort);
  return get<ProductPage>(`/products?${qs.toString()}`, 30);
}

export function getHotProducts(): Promise<Product[]> {
  return get<Product[]>('/products/hot', 60);
}

export function getProduct(slug: string): Promise<Product> {
  return get<Product>(`/products/${encodeURIComponent(slug)}`, 30);
}

export function getCategories(): Promise<Category[]> {
  return get<Category[]>('/categories', 300);
}
