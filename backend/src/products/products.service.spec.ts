import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProductsService } from './products.service';

describe('ProductsService pricing', () => {
  const d = (v: string) => new Prisma.Decimal(v);

  it.each([
    ['1690000', '2190000', 23],
    ['450000', '590000', 24],
    ['99000', null, 0],
    ['100', '100', 0],
  ])('price %s / compareAt %s → %s%% off', (price, compare, expected) => {
    expect(ProductsService.discountPercent(d(price), compare ? d(compare) : null)).toBe(expected);
  });

  it('rejects a compare-at price that is not greater than the price', () => {
    expect(() => ProductsService.assertPricing('500000', '500000')).toThrow(BadRequestException);
    expect(() => ProductsService.assertPricing('500000', '400000')).toThrow(BadRequestException);
    expect(() => ProductsService.assertPricing('500000', '650000')).not.toThrow();
    expect(() => ProductsService.assertPricing('500000', null)).not.toThrow();
  });
});
