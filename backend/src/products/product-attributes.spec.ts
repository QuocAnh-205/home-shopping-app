import { deriveAttributes, MATERIAL_OPTIONS, parseDimensions } from './product-attributes';

describe('product attributes (chuẩn hóa thông số để lọc / so sánh / tính ship)', () => {
  it('parses dimensions in many Vietnamese notations', () => {
    expect(parseDimensions('200 x 85 x 80 cm')).toEqual([200, 85, 80]);
    expect(parseDimensions('Ø 24 x 54 cm')).toEqual([24, 24, 54]);
    expect(parseDimensions('160 x 230 cm')).toEqual([160, 230, 1]);
    expect(parseDimensions('1m6 x 2m')).toEqual([160, 200, 1]);
    expect(parseDimensions('450 x 300 x 120 mm')).toEqual([45, 30, 12]);
    expect(parseDimensions(null)).toBeNull();
  });

  it('a velvet sofa: bulky, material = Nhung (upholstery wins over frame), real size + estimated weight', () => {
    const a = deriveAttributes({
      name: 'Sofa nhung xanh lục bảo 3 chỗ',
      categorySlug: 'phong-khach',
      specs: { 'Kích thước': '200 x 85 x 80 cm', 'Chất liệu': 'Nhung, gỗ sồi', 'Bảo hành': '3 năm khung' },
    });
    expect(a).toMatchObject({ isBulky: true, material: 'Nhung', dimLengthCm: 200, dimWidthCm: 85, dimHeightCm: 80, warrantyMonths: 36 });
    expect(a.estimatedWeightGrams).toBe(55_000);
  });

  it('understands accented words ("Nỉ, mút, gỗ" → Vải / Nỉ, not Gỗ)', () => {
    expect(deriveAttributes({ name: 'Sofa nỉ', categorySlug: 'phong-khach', specs: { 'Chất liệu': 'Nỉ, mút, gỗ' } }).material).toBe('Vải / Nỉ');
  });

  it('an air fryer: power (W) and capacity (ml) for the technical filters, not bulky', () => {
    const a = deriveAttributes({
      name: 'Nồi chiên không dầu 6.2L',
      categorySlug: 'dien-gia-dung',
      specs: { 'Dung tích': '6.2 lít', 'Công suất': '1700W', 'Chất liệu lòng nồi': 'Thép phủ ceramic chống dính', 'Bảo hành': '24 tháng' },
    });
    expect(a).toMatchObject({ powerW: 1700, capacityMl: 6200, warrantyMonths: 24, isBulky: false, estimatedWeightGrams: null });
    expect(a.material).toBe('Kim loại');
  });

  it('small accessories named after furniture are NOT bulky (gối tựa sofa, tủ đầu giường)', () => {
    expect(deriveAttributes({ name: 'Gối tựa sofa sọc xanh', categorySlug: 'phong-khach', specs: { 'Kích thước': '45 x 45 cm' } }).isBulky).toBe(false);
    expect(deriveAttributes({ name: 'Tủ đầu giường gỗ óc chó', categorySlug: 'phong-ngu', specs: { 'Kích thước': '50 x 40 x 55 cm' } }).isBulky).toBe(false);
  });

  it('anything heavier than 20 kg is bulky; warranty falls back to the category default', () => {
    const a = deriveAttributes({ name: 'Bếp nướng than', categorySlug: 'dien-gia-dung', specs: { 'Trọng lượng': '24 kg' } });
    expect(a).toMatchObject({ isBulky: true, warrantyMonths: 12, estimatedWeightGrams: null });
    expect(MATERIAL_OPTIONS).toContain('Inox');
  });
});
