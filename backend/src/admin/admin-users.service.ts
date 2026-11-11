import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { CartService } from '../cart/cart.service';
import { REVENUE_STATUSES } from '../orders/order-state';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ListUsersQuery } from './admin.dto';

const SESSION_REVOKE_TTL_SECONDS = 30 * 24 * 3600;
/** Email của tài khoản đã tự xóa (AccountService.deleteAccount ẩn danh hóa thành deleted-<id>@deleted.invalid) */
const DELETED_SUFFIX = '@deleted.invalid';
const NOT_DELETED: Prisma.UserWhereInput = { NOT: { email: { endsWith: DELETED_SUFFIX } } };
const SPENDING_STATUSES: OrderStatus[] = REVENUE_STATUSES;

const userListSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  avatarUrl: true,
  role: true,
  lockedAt: true,
  lockedReason: true,
  createdAt: true,
  passwordHash: true,
  oauthAccounts: { select: { provider: true } },
  _count: { select: { orders: true, reviews: true } },
} satisfies Prisma.UserSelect;

type UserListRow = Prisma.UserGetPayload<{ select: typeof userListSelect }>;

export interface AdminUserSummary {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  role: Role;
  lockedAt: Date | null;
  lockedReason: string | null;
  createdAt: Date;
  deleted: boolean;
  hasPassword: boolean;
  providers: string[];
  orderCount: number;
  reviewCount: number;
  totalSpent: number;
}

export interface AdminUserDetail extends AdminUserSummary {
  gender: string | null;
  dateOfBirth: string | null;
  updatedAt: Date;
  stats: { completedOrders: number; cancelledOrders: number; pendingOrders: number; lastOrderAt: Date | null; averageOrder: number };
  addresses: { id: string; fullName: string; phone: string; full: string; type: string; isDefault: boolean }[];
  recentOrders: { id: string; status: OrderStatus; totalAmount: number; createdAt: Date; itemCount: number }[];
  recentReviews: { id: string; rating: number; comment: string; createdAt: Date; product: { name: string; slug: string } }[];
}

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  private static where(query: Pick<ListUsersQuery, 'q' | 'role' | 'status'>): Prisma.UserWhereInput {
    // Mặc định ẩn tài khoản đã tự xóa; chỉ hiện khi lọc "Đã xóa"
    const status: Prisma.UserWhereInput =
      query.status === 'deleted'
        ? { email: { endsWith: DELETED_SUFFIX } }
        : query.status === 'locked'
          ? { ...NOT_DELETED, lockedAt: { not: null } }
          : query.status === 'active'
            ? { ...NOT_DELETED, lockedAt: null }
            : NOT_DELETED;
    return {
      ...status,
      ...(query.role ? { role: query.role } : {}),
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q, mode: 'insensitive' } },
              { fullName: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q } },
            ],
          }
        : {}),
    };
  }

  private static readonly ORDER_BY: Record<ListUsersQuery['sort'], Prisma.UserOrderByWithRelationInput[]> = {
    newest: [{ createdAt: 'desc' }, { id: 'asc' }],
    oldest: [{ createdAt: 'asc' }, { id: 'asc' }],
    name: [{ fullName: 'asc' }, { id: 'asc' }],
    email: [{ email: 'asc' }],
  };

  async list(query: ListUsersQuery) {
    const where = AdminUsersService.where(query);
    const [rows, total, counts] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: userListSelect,
        orderBy: AdminUsersService.ORDER_BY[query.sort],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
      this.counts(),
    ]);
    const spent = await this.spentByUser(rows.map((r) => r.id));
    return {
      items: rows.map((r) => this.toSummary(r, spent.get(r.id))),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
      counts,
    };
  }

  /** Số liệu nhanh cho thanh tiêu đề trang Người dùng */
  async counts(): Promise<{ total: number; customers: number; admins: number; locked: number; new30d: number; deleted: number }> {
    const since30 = new Date(Date.now() - 30 * 86_400_000);
    const [total, admins, locked, new30d, deleted] = await Promise.all([
      this.prisma.user.count({ where: NOT_DELETED }),
      this.prisma.user.count({ where: { ...NOT_DELETED, role: Role.ADMIN } }),
      this.prisma.user.count({ where: { ...NOT_DELETED, lockedAt: { not: null } } }),
      this.prisma.user.count({ where: { ...NOT_DELETED, createdAt: { gte: since30 } } }),
      this.prisma.user.count({ where: { email: { endsWith: DELETED_SUFFIX } } }),
    ]);
    return { total, customers: total - admins, admins, locked, new30d, deleted };
  }

  async detail(id: string): Promise<AdminUserDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...userListSelect,
        gender: true,
        dateOfBirth: true,
        updatedAt: true,
        addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] },
        orders: {
          select: { id: true, status: true, totalAmount: true, createdAt: true, _count: { select: { items: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        reviews: {
          select: { id: true, rating: true, comment: true, createdAt: true, product: { select: { name: true, slug: true } } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const [spent, byStatus, last] = await Promise.all([
      this.spentByUser([id]),
      this.prisma.order.groupBy({ by: ['status'], where: { userId: id }, _count: { _all: true } }),
      this.prisma.order.findFirst({ where: { userId: id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ]);
    const count = (s: OrderStatus) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
    const paidCount = SPENDING_STATUSES.reduce((n, s) => n + count(s), 0);
    const totalSpent = spent.get(id) ?? 0;

    return {
      ...this.toSummary(user, totalSpent),
      gender: user.gender,
      dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString().slice(0, 10) : null,
      updatedAt: user.updatedAt,
      stats: {
        completedOrders: count(OrderStatus.COMPLETED),
        cancelledOrders: count(OrderStatus.CANCELLED),
        pendingOrders: count(OrderStatus.PENDING),
        lastOrderAt: last?.createdAt ?? null,
        averageOrder: paidCount ? Math.round(totalSpent / paidCount) : 0,
      },
      addresses: user.addresses.map((a) => ({
        id: a.id,
        fullName: a.fullName,
        phone: a.phone,
        full: [a.street, a.ward, a.district, a.province].join(', '),
        type: a.type,
        isDefault: a.isDefault,
      })),
      recentOrders: user.orders.map((o) => ({
        id: o.id,
        status: o.status,
        totalAmount: o.totalAmount,
        createdAt: o.createdAt,
        itemCount: o._count.items,
      })),
      recentReviews: user.reviews,
    };
  }

  async setRole(actorId: string, id: string, role: Role): Promise<AdminUserDetail> {
    if (actorId === id) throw new BadRequestException('You cannot change your own role');
    const user = await this.findOrThrow(id);
    if (user.role === role) return this.detail(id);
    if (user.role === Role.ADMIN) await this.assertAnotherActiveAdmin(id);

    await this.prisma.user.update({ where: { id }, data: { role } });
    // Quyền nằm trong JWT → buộc đăng nhập lại để token mang quyền mới
    await this.revokeAll(id);
    await this.audit.log({
      actorId,
      action: 'user.role',
      entityType: 'user',
      entityId: id,
      summary: `Đổi quyền ${user.email}: ${user.role} → ${role}`,
      metadata: { from: user.role, to: role },
    });
    return this.detail(id);
  }

  async lock(actorId: string, id: string, reason?: string): Promise<AdminUserDetail> {
    if (actorId === id) throw new BadRequestException('You cannot lock your own account');
    const user = await this.findOrThrow(id);
    if (user.lockedAt) return this.detail(id);
    if (user.role === Role.ADMIN) await this.assertAnotherActiveAdmin(id);

    await this.prisma.user.update({ where: { id }, data: { lockedAt: new Date(), lockedReason: reason || null } });
    await this.revokeAll(id);
    await this.redis.client.del(CartService.key(id));
    await this.audit.log({
      actorId,
      action: 'user.lock',
      entityType: 'user',
      entityId: id,
      summary: `Khóa tài khoản ${user.email}${reason ? ` – lý do: ${reason}` : ''}`,
      metadata: { reason: reason ?? null },
    });
    return this.detail(id);
  }

  async unlock(actorId: string, id: string): Promise<AdminUserDetail> {
    const user = await this.findOrThrow(id);
    if (!user.lockedAt) return this.detail(id);
    await this.prisma.user.update({ where: { id }, data: { lockedAt: null, lockedReason: null } });
    // Xóa bộ đếm đăng nhập sai để người dùng đăng nhập lại được ngay
    await this.redis.client.del(AuthService.failedKey(user.email));
    await this.audit.log({ actorId, action: 'user.unlock', entityType: 'user', entityId: id, summary: `Mở khóa tài khoản ${user.email}` });
    return this.detail(id);
  }

  /** Đăng xuất người dùng khỏi mọi thiết bị (mọi JWT cấp trước thời điểm này bị từ chối) */
  async revokeSessions(actorId: string, id: string): Promise<{ ok: true }> {
    const user = await this.findOrThrow(id);
    await this.revokeAll(id);
    await this.audit.log({ actorId, action: 'user.logout_all', entityType: 'user', entityId: id, summary: `Đăng xuất mọi thiết bị của ${user.email}` });
    return { ok: true };
  }

  /** Xuất CSV (tối đa 10.000 dòng) theo đúng bộ lọc đang xem */
  async exportCsv(query: ListUsersQuery): Promise<string> {
    const rows = await this.prisma.user.findMany({
      where: AdminUsersService.where(query),
      select: userListSelect,
      orderBy: AdminUsersService.ORDER_BY[query.sort],
      take: 10_000,
    });
    const spent = await this.spentByUser(rows.map((r) => r.id));
    const header = ['ID', 'Email', 'Họ tên', 'Số điện thoại', 'Vai trò', 'Trạng thái', 'Đăng nhập bằng', 'Số đơn', 'Đã chi (VND)', 'Ngày tạo'];
    const lines = rows.map((r) => {
      const s = this.toSummary(r, spent.get(r.id));
      return [
        s.id,
        s.email,
        s.fullName,
        s.phone ?? '',
        s.role,
        s.deleted ? 'Đã xóa' : s.lockedAt ? 'Đã khóa' : 'Hoạt động',
        [s.hasPassword ? 'Mật khẩu' : null, ...s.providers].filter(Boolean).join(' + '),
        s.orderCount,
        s.totalSpent,
        s.createdAt.toISOString(),
      ];
    });
    return toCsv([header, ...lines]);
  }

  private async findOrThrow(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, email: true, role: true, lockedAt: true } });
    if (!user) throw new NotFoundException('User not found');
    if (user.email.endsWith(DELETED_SUFFIX)) throw new BadRequestException('This account has been deleted');
    return user;
  }

  /** Luôn phải còn ít nhất 1 admin đang hoạt động → không tự khóa cửa hệ thống */
  private async assertAnotherActiveAdmin(excludeId: string): Promise<void> {
    const others = await this.prisma.user.count({ where: { role: Role.ADMIN, lockedAt: null, id: { not: excludeId } } });
    if (others === 0) throw new BadRequestException('At least one active admin must remain');
  }

  private async revokeAll(userId: string): Promise<void> {
    await this.redis.client.set(AuthService.passwordChangedKey(userId), String(Math.floor(Date.now() / 1000) + 1), 'EX', SESSION_REVOKE_TTL_SECONDS);
  }

  private async spentByUser(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.order.groupBy({
      by: ['userId'],
      where: { userId: { in: ids }, status: { in: SPENDING_STATUSES } },
      _sum: { totalAmount: true },
    });
    return new Map(rows.map((r) => [r.userId, r._sum.totalAmount ?? 0]));
  }

  private toSummary(r: UserListRow, spent?: number): AdminUserSummary {
    return {
      id: r.id,
      email: r.email,
      fullName: r.fullName,
      phone: r.phone,
      avatarUrl: r.avatarUrl,
      role: r.role,
      lockedAt: r.lockedAt,
      lockedReason: r.lockedReason,
      createdAt: r.createdAt,
      deleted: r.email.endsWith(DELETED_SUFFIX),
      hasPassword: r.passwordHash !== null,
      providers: r.oauthAccounts.map((a) => a.provider),
      orderCount: r._count.orders,
      reviewCount: r._count.reviews,
      totalSpent: spent ?? 0,
    };
  }
}

/** CSV chuẩn RFC 4180 + BOM UTF-8 (Excel hiển thị đúng tiếng Việt); chặn CSV injection (=, +, -, @) */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
