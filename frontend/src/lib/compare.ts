'use client';

import { useEffect, useState } from 'react';

/** Danh sách so sánh lưu trong trình duyệt (tối đa 4 món, không cần đăng nhập) */
const KEY = 'hs_compare';
const EVENT = 'hs:compare';
export const COMPARE_MAX = 4;

export interface CompareItem {
  slug: string;
  name: string;
  imageUrl: string | null;
}

export function readCompare(): CompareItem[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as CompareItem[];
    return Array.isArray(list) ? list.filter((i) => typeof i?.slug === 'string').slice(0, COMPARE_MAX) : [];
  } catch {
    return [];
  }
}

function write(list: CompareItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, COMPARE_MAX)));
  } catch {
    /* storage bị chặn */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Thêm / bỏ 1 sản phẩm. Trả về false nếu danh sách đã đủ 4 món */
export function toggleCompare(item: CompareItem): boolean {
  const list = readCompare();
  if (list.some((i) => i.slug === item.slug)) {
    write(list.filter((i) => i.slug !== item.slug));
    return true;
  }
  if (list.length >= COMPARE_MAX) return false;
  write([...list, item]);
  return true;
}

export function removeCompare(slug: string): void {
  write(readCompare().filter((i) => i.slug !== slug));
}

export function clearCompare(): void {
  write([]);
}

/** Danh sách hiện tại, tự cập nhật khi tab khác / component khác thay đổi */
export function useCompare(): CompareItem[] {
  const [list, setList] = useState<CompareItem[]>([]);
  useEffect(() => {
    const sync = () => setList(readCompare());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return list;
}
