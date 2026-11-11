import { addMonths, warrantyOf } from './warranty.service';

describe('e-warranty', () => {
  it('adds calendar months without overflowing short months', () => {
    expect(addMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(addMonths(new Date('2028-01-31T00:00:00Z'), 1).toISOString()).toBe('2028-02-29T00:00:00.000Z');
    expect(addMonths(new Date('2026-11-12T00:00:00Z'), 24).toISOString()).toBe('2028-11-12T00:00:00.000Z');
  });

  it('classifies warranty state from the delivery date', () => {
    const now = new Date('2026-11-12T00:00:00Z');
    expect(warrantyOf(null, 12, now).state).toBe('NOT_DELIVERED');
    expect(warrantyOf(new Date('2026-11-01T00:00:00Z'), null, now).state).toBe('NO_WARRANTY');
    expect(warrantyOf(new Date('2026-01-01T00:00:00Z'), 12, now)).toMatchObject({ state: 'ACTIVE', daysLeft: 50 });
    expect(warrantyOf(new Date('2025-12-01T00:00:00Z'), 12, now)).toMatchObject({ state: 'EXPIRING', daysLeft: 19 });
    expect(warrantyOf(new Date('2025-01-01T00:00:00Z'), 12, now)).toMatchObject({ state: 'EXPIRED', daysLeft: 0 });
    expect(warrantyOf(new Date('2026-11-01T00:00:00Z'), 24, now)).toMatchObject({ state: 'ACTIVE', expiresAt: '2028-11-01T00:00:00.000Z' });
  });
});
