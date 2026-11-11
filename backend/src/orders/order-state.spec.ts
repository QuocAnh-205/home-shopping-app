import { ActorType, OrderStatus } from '@prisma/client';
import { AppError } from '../common/errors';
import { ORDER_RULES, ORDER_TRANSITIONS, assertTransition, canTransition, isFinal } from './order-state';

const { CUSTOMER, ADMIN, SYSTEM } = ActorType;
const S = OrderStatus;

describe('order state machine', () => {
  it.each([
    // Luồng chuẩn
    [S.AWAITING_PAYMENT, S.PENDING, SYSTEM, true],
    [S.PENDING, S.PROCESSING, ADMIN, true],
    [S.PROCESSING, S.SHIPPING, ADMIN, true],
    [S.SHIPPING, S.DELIVERED, ADMIN, true],
    [S.DELIVERED, S.COMPLETED, CUSTOMER, true],
    [S.DELIVERED, S.COMPLETED, SYSTEM, true],
    // Hủy
    [S.AWAITING_PAYMENT, S.CANCELLED, SYSTEM, true],
    [S.PENDING, S.CANCELLED, CUSTOMER, true],
    [S.PROCESSING, S.CANCELLED, CUSTOMER, false],
    [S.PROCESSING, S.CANCELLED, ADMIN, true],
    [S.SHIPPING, S.CANCELLED, ADMIN, false],
    // Trả hàng
    [S.DELIVERED, S.RETURN_REQUESTED, CUSTOMER, true],
    [S.COMPLETED, S.RETURN_REQUESTED, CUSTOMER, true],
    [S.RETURN_REQUESTED, S.RETURNED, ADMIN, true],
    [S.RETURN_REQUESTED, S.RETURNED, CUSTOMER, false],
    [S.RETURN_REQUESTED, S.COMPLETED, ADMIN, true],
    // Không ai được "nhảy cóc" hay hồi sinh đơn
    [S.PENDING, S.SHIPPING, ADMIN, false],
    [S.PENDING, S.PROCESSING, CUSTOMER, false],
    [S.PENDING, S.PROCESSING, SYSTEM, true],
    [S.AWAITING_PAYMENT, S.PENDING, ADMIN, false],
    [S.CANCELLED, S.PENDING, ADMIN, false],
    [S.COMPLETED, S.SHIPPING, ADMIN, false],
    [S.RETURNED, S.COMPLETED, ADMIN, false],
  ])('%s → %s by %s: %s', (from, to, actor, allowed) => {
    expect(canTransition(from, to, actor)).toBe(allowed);
  });

  it('throws a coded 409 error with Vietnamese labels for invalid transitions', () => {
    try {
      assertTransition(S.COMPLETED, S.CANCELLED, ADMIN);
      fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).getStatus()).toBe(409);
      expect((err as AppError).code).toBe('INVALID_TRANSITION');
      expect((err as AppError).message).toContain('Hoàn thành');
    }
  });

  it('final states have no outgoing transitions', () => {
    expect(isFinal(S.CANCELLED)).toBe(true);
    expect(isFinal(S.RETURNED)).toBe(true);
    expect(isFinal(S.COMPLETED)).toBe(false);
  });

  it('every status is covered and ORDER_TRANSITIONS mirrors the rules', () => {
    for (const status of Object.values(S)) {
      expect(ORDER_RULES[status]).toBeDefined();
      expect([...ORDER_TRANSITIONS[status]].sort()).toEqual(Object.keys(ORDER_RULES[status]).sort());
    }
  });
});
