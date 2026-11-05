import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorId: string | null;
  /** Dạng <thực thể>.<hành động>, ví dụ order.status, product.update, user.lock */
  action: string;
  entityType: 'order' | 'product' | 'category' | 'user' | 'review' | 'newsletter';
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogView {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  actor: { id: string; email: string; fullName: string } | null;
}

export interface AuditQuery {
  page: number;
  limit: number;
  entityType?: string;
  action?: string;
  q?: string;
}

/**
 * Nhật ký thao tác quản trị: ghi vào bảng admin_audit_logs (tra cứu trong trang Admin)
 * và log JSON (Loki). Ghi nhật ký lỗi KHÔNG được làm hỏng thao tác chính.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    this.logger.log({ event: 'admin.audit', ...entry });
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          actorId: entry.actorId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          summary: entry.summary.slice(0, 500),
          metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (err) {
      this.logger.error({ event: 'admin.audit_failed', action: entry.action, err: (err as Error).message });
    }
  }

  async list(query: AuditQuery): Promise<{ items: AuditLogView[]; page: number; limit: number; total: number; totalPages: number }> {
    const where: Prisma.AdminAuditLogWhereInput = {
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.q
        ? {
            OR: [
              { summary: { contains: query.q, mode: 'insensitive' } },
              { entityId: { startsWith: query.q } },
              { actor: { email: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.adminAuditLog.findMany({
        where,
        include: { actor: { select: { id: true, email: true, fullName: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);
    return {
      items: rows.map(({ id, actorId: _actorId, ...rest }) => ({ ...rest, id: id.toString() })),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }
}
