import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationPage, NotificationsService } from './notifications.service';

export class ListNotificationsQuery {
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  page = 1;
}

export class MarkAllQuery {
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() q: ListNotificationsQuery): Promise<NotificationPage> {
    return this.notifications.list(req.user.sub, q.type, q.page);
  }

  @Get('unread-count')
  unread(@Req() req: AuthenticatedRequest) {
    return this.notifications.unreadCounts(req.user.sub);
  }

  @Post('read-all')
  @HttpCode(200)
  async readAll(@Req() req: AuthenticatedRequest, @Query() q: MarkAllQuery): Promise<{ updated: number }> {
    return { updated: await this.notifications.markAllRead(req.user.sub, q.type) };
  }

  @Post(':id/read')
  @HttpCode(204)
  async read(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.notifications.markRead(req.user.sub, id);
  }
}
