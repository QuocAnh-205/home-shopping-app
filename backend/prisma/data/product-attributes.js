'use strict';

/**
 * Chuẩn hóa thuộc tính kỹ thuật từ bảng thông số tự do { "Nhãn": "Giá trị" } của sản phẩm
 * → cột có cấu trúc để LỌC (chất liệu, công suất, dung tích, kích thước), SO SÁNH và TÍNH PHÍ SHIP hàng cồng kềnh.
 *
 * Một bản cài đặt duy nhất, dùng chung cho:
 *  - prisma/seed.js (dữ liệu mẫu)
 *  - backend ProductsService khi admin tạo/sửa sản phẩm (src/products/product-attributes.ts bọc file này)
 * Hàm thuần (không I/O) → có unit test: src/products/product-attributes.spec.ts
 */

/** Từ nguyên vẹn, hiểu chữ có dấu (\b của JS chỉ hiểu ASCII: "nỉ" sẽ không khớp) */
const word = (alts) => new RegExp(`(?<!\\p{L})(?:${alts})(?!\\p{L})`, 'iu');

/** Nhóm chất liệu hiển thị ở bộ lọc (thứ tự = thứ tự hiển thị) */
const MATERIALS = [
  { label: 'Inox', re: word('inox|thép không gỉ|stainless') },
  { label: 'Gang', re: word('gang') },
  { label: 'Gỗ', re: word('gỗ|sồi|óc chó|teak|thông|walnut|keo|mdf') },
  { label: 'Tre / Mây / Cói', re: word('tre|sợi tre|mây|cói|lục bình|rattan|cỏ biển') },
  { label: 'Nhung', re: word('nhung|velvet') },
  { label: 'Da', re: word('da|da bò|da thật|da PU|leather') },
  { label: 'Vải / Nỉ', re: word('vải|nỉ|bouclé|canvas|lanh|vải bố|bố|thổ cẩm|polyester|microfiber|gấm') },
  { label: 'Cotton / Len / Lụa', re: word('cotton|len|lụa|tencel|bông|lông cừu') },
  { label: 'Thủy tinh', re: word('thủy tinh|kính|borosilicate') },
  { label: 'Gốm sứ', re: word('gốm|sứ|ceramic|đất nung|terracotta') },
  { label: 'Kim loại', re: word('thép|nhôm|đồng|sắt|kim loại|hợp kim') },
  { label: 'Nhựa / Silicone', re: word('nhựa|silicone|ABS|PP|acrylic|resin') },
];

/** Bảo hành mặc định theo danh mục khi thông số không ghi */
const DEFAULT_WARRANTY_MONTHS = { 'dien-gia-dung': 12, 'phong-khach': 12, 'phong-ngu': 12, 'ban-an': 6, 'phong-tam': 6 };

/** Hàng cồng kềnh (theo LOẠI hàng – đầu tên): nội thất lớn cần xe tải nhỏ, 2 người khiêng và lắp đặt tại nhà */
const BULKY_NAME = /^(máy giặt|tủ lạnh|máy rửa bát|máy sấy quần áo|sofa|ghế bành|ghế thư giãn|tủ ngăn kéo|tủ thấp|tủ quần áo|tủ lavabo|tủ bếp|bàn trà|bàn ăn|bàn làm việc|bàn console|giường|nệm|kệ tivi|kệ sách)/i;

/** Cân nặng ước tính (kg) cho hàng cồng kềnh khi thông số không ghi "Trọng lượng" */
const ESTIMATED_KG = [
  [/^(máy giặt|tủ lạnh|máy rửa bát|máy sấy quần áo)/i, 65],
  [/^sofa.*(3 chỗ|băng)/i, 55],
  [/^sofa.*2 chỗ/i, 38],
  [/^sofa/i, 48],
  [/^giường/i, 60],
  [/^nệm/i, 22],
  [/^tủ (ngăn kéo|thấp|quần áo)/i, 32],
  [/^tủ lavabo/i, 20],
  [/^bàn ăn/i, 35],
  [/^bàn (trà|làm việc|console)/i, 15],
  [/^ghế (bành|thư giãn)/i, 18],
  [/^kệ/i, 15],
];

const num = (s) => Number(String(s).replace(',', '.'));

function specValue(specs, re) {
  for (const [k, v] of Object.entries(specs ?? {})) if (re.test(k)) return String(v);
  return null;
}

/** "1700W" · "1.5 kW" · "800 – 1000W" → W (lấy số lớn nhất) */
function parsePowerW(text) {
  if (!text) return null;
  const values = [...String(text).matchAll(/([\d.,]+)\s*(kW|W)(?!\p{L})/giu)].map((m) => num(m[1]) * (m[2].toLowerCase() === 'kw' ? 1000 : 1));
  const ok = values.filter((n) => Number.isFinite(n) && n > 0);
  return ok.length ? Math.round(Math.max(...ok)) : null;
}

/** "6.2 lít" · "1.7L" · "300 ml" → ml */
function parseCapacityMl(text) {
  if (!text) return null;
  const m = String(text).match(/([\d.,]+)\s*(ml|lít|lit|l)(?!\p{L})/iu);
  if (!m) return null;
  const v = num(m[1]) * (m[2].toLowerCase() === 'ml' ? 1 : 1000);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}

/** "24 tháng" · "3 năm khung" · "10 năm" → tháng */
function parseWarrantyMonths(text) {
  if (!text) return null;
  const m = String(text).match(/([\d.,]+)\s*(tháng|năm)/iu);
  if (!m) return null;
  return Math.round(num(m[1]) * (m[2].toLowerCase() === 'năm' ? 12 : 1));
}

/**
 * "200 x 85 x 80 cm" · "Ø 24 x 54 cm" (đường kính × cao) · "160 x 230 cm" · "450 x 300 mm" · "1m6 x 2m" → [D, R, C] cm
 * (chỉ có 2 số → vật phẳng, cao 1 cm)
 */
function parseDimensions(text) {
  if (!text) return null;
  // Cách viết Việt Nam: 1m6 = 1,6 m
  const s = String(text).replace(/(\d+)\s*m\s*(\d+)(?!\s*(?:cm|mm))/giu, '$1.$2 m');
  const factor = /cm/i.test(s) ? 1 : /mm/i.test(s) ? 0.1 : /\d\s*m(?!\p{L})/iu.test(s) ? 100 : 1;
  const nums = [...s.matchAll(/(\d+(?:[.,]\d+)?)/g)].map((m) => num(m[1]) * factor).filter((n) => Number.isFinite(n) && n > 0);
  if (!nums.length) return null;
  if (/ø|đường kính/iu.test(s)) {
    const [d, h = d] = nums;
    return [d, d, h].map((n) => Math.max(1, Math.round(n)));
  }
  const [l, w = l, h = 1] = nums;
  return [l, w, h].map((n) => Math.max(1, Math.round(n)));
}

/**
 * Chất liệu chính: ưu tiên vật liệu bọc ngoài ("bọc nhung…"), sau đó nhóm xuất hiện SỚM NHẤT trong ô "Chất liệu…"
 * (vd "Nỉ, mút, gỗ" → Vải / Nỉ). Không có ô chất liệu thì xét tên sản phẩm.
 */
function primaryMaterial(specs, name) {
  const text = specValue(specs, /^chất liệu/i) ?? specValue(specs, /chất liệu|^mặt|^vỏ|^chậu/i) ?? name;
  const covered = String(text).match(/bọc\s+([^,;]+)/iu)?.[1];
  for (const source of [covered, text].filter(Boolean)) {
    let best = null;
    for (const m of MATERIALS) {
      const hit = String(source).search(m.re);
      if (hit >= 0 && (best === null || hit < best.at)) best = { label: m.label, at: hit };
    }
    if (best) return best.label;
  }
  return null;
}

/**
 * @param {{ name: string, categorySlug?: string|null, specs?: Record<string,string>, weightGrams?: number|null }} p
 * @returns {{ material: string|null, powerW: number|null, capacityMl: number|null, warrantyMonths: number|null,
 *   dimLengthCm: number|null, dimWidthCm: number|null, dimHeightCm: number|null, isBulky: boolean, estimatedWeightGrams: number|null }}
 */
function deriveAttributes(p) {
  const specs = p.specs ?? {};
  const dims = parseDimensions(specValue(specs, /^kích thước$/i) ?? specValue(specs, /^kích thước/i));
  const statedWeight = specValue(specs, /trọng lượng|khối lượng/i);
  const statedKg = statedWeight ? (() => {
    const m = statedWeight.match(/([\d.,]+)\s*(kg|g)(?!\p{L})/iu);
    return m ? num(m[1]) * (m[2].toLowerCase() === 'kg' ? 1 : 0.001) : 0;
  })() : 0;
  const isBulky = BULKY_NAME.test(p.name.trim()) || statedKg >= 20;
  let estimatedWeightGrams = null;
  if (isBulky && !statedWeight) {
    const hit = ESTIMATED_KG.find(([re]) => re.test(p.name.trim()));
    const byVolume = dims ? Math.round(((dims[0] * dims[1] * dims[2]) / 1_000_000) * 60) : 20;
    estimatedWeightGrams = (hit ? hit[1] : Math.min(80, Math.max(10, byVolume))) * 1000;
  }
  return {
    material: primaryMaterial(specs, p.name),
    powerW: parsePowerW(specValue(specs, /^công suất/i)),
    capacityMl: parseCapacityMl(specValue(specs, /^dung tích/i)),
    warrantyMonths: parseWarrantyMonths(specValue(specs, /bảo hành/i)) ?? DEFAULT_WARRANTY_MONTHS[p.categorySlug ?? ''] ?? null,
    dimLengthCm: dims ? dims[0] : null,
    dimWidthCm: dims ? dims[1] : null,
    dimHeightCm: dims ? dims[2] : null,
    isBulky,
    estimatedWeightGrams,
  };
}

module.exports = {
  deriveAttributes,
  MATERIALS: MATERIALS.map((m) => m.label),
  parseDimensions,
  parseCapacityMl,
  parsePowerW,
  parseWarrantyMonths,
  primaryMaterial,
};
