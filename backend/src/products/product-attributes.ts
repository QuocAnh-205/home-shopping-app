/**
 * Bọc có kiểu cho prisma/data/product-attributes.js – MỘT bản cài đặt dùng chung với seed.
 * Chạy được ở cả 3 nơi vì đường dẫn tương đối giống nhau: src/products (ts-jest), dist/products (Node) → ../../prisma/data
 */
export interface ProductAttributes {
  material: string | null;
  powerW: number | null;
  capacityMl: number | null;
  warrantyMonths: number | null;
  dimLengthCm: number | null;
  dimWidthCm: number | null;
  dimHeightCm: number | null;
  isBulky: boolean;
  /** Chỉ có khi là hàng cồng kềnh mà thông số không ghi trọng lượng */
  estimatedWeightGrams: number | null;
}

interface AttributesModule {
  deriveAttributes(p: { name: string; categorySlug?: string | null; specs?: Record<string, string>; weightGrams?: number | null }): ProductAttributes;
  MATERIALS: string[];
  parseDimensions(text: string | null): [number, number, number] | null;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require('../../prisma/data/product-attributes') as AttributesModule;

export const deriveAttributes = mod.deriveAttributes;
export const MATERIAL_OPTIONS: readonly string[] = mod.MATERIALS;
export const parseDimensions = mod.parseDimensions;
