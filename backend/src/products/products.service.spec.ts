import { BadRequestException } from '@nestjs/common';
import { toVnd } from '../common/money';
import { ProductsService } from './products.service';

describe('ProductsService pricing', () => {
  it.each([
    [1690000, 2190000, 23],
    [450000, 590000, 24],
    [99000, null, 0],
    [100, 100, 0],
  ])('price %s / compareAt %s → %s%% off', (price, compare, expected) => {
    expect(ProductsService.discountPercent(price, compare)).toBe(expected);
  });

  it('rejects a compare-at price that is not greater than the price', () => {
    expect(() => ProductsService.assertPricing(500000, 500000)).toThrow(BadRequestException);
    expect(() => ProductsService.assertPricing(500000, 400000)).toThrow(BadRequestException);
    expect(() => ProductsService.assertPricing(500000, 650000)).not.toThrow();
    expect(() => ProductsService.assertPricing(500000, null)).not.toThrow();
  });

  it('accepts integer VND from numbers and numeric strings only', () => {
    expect(toVnd({ value: 199000 })).toBe(199000);
    expect(toVnd({ value: '199000' })).toBe(199000);
    expect(toVnd({ value: '199000.00' })).toBe(199000);
    // Có phần lẻ thật / không phải số → giữ nguyên để @IsInt báo lỗi
    expect(toVnd({ value: '199000.5' })).toBe('199000.5');
    expect(toVnd({ value: 'abc' })).toBe('abc');
  });
});
