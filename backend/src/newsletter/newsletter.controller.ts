import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';
import { MailService } from '../mail/mail.service';
import { newsletterWelcomeMail } from '../mail/mail.templates';
import { PrismaService } from '../prisma/prisma.service';

export class SubscribeDto {
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;
}

@ApiTags('newsletter')
@Controller('newsletter')
export class NewsletterController {
  private readonly logger = new Logger(NewsletterController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** Đăng ký lặp lại vẫn trả 200 (idempotent) và không tiết lộ email đã có trong danh sách hay chưa */
  @Post('subscribe')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async subscribe(@Body() dto: SubscribeDto): Promise<{ ok: true }> {
    const before = await this.prisma.newsletterSubscriber.findUnique({ where: { email: dto.email }, select: { id: true } });
    if (!before) {
      await this.prisma.newsletterSubscriber.upsert({ where: { email: dto.email }, update: {}, create: { email: dto.email } });
      await this.mail.send(newsletterWelcomeMail(dto.email));
      this.logger.log({ event: 'newsletter.subscribed' });
    }
    return { ok: true };
  }
}
