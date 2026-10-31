import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Gửi email qua SMTP (SMTP_URL). Local: Mailpit bắt mọi email để xem tại http://localhost:8025.
 * Production: SMTP của Amazon SES / Gmail Workspace… cấu hình qua biến môi trường.
 * Chưa cấu hình SMTP → chỉ ghi log sự kiện (không ghi nội dung/token) để hệ thống vẫn chạy.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const url = config.get<string>('SMTP_URL');
    this.from = config.get<string>('MAIL_FROM') ?? 'Home Shopping <no-reply@homeshop.local>';
    this.transporter = url ? createTransport(url) : null;
  }

  get enabled(): boolean {
    return this.transporter !== null;
  }

  async send(message: MailMessage): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn({ event: 'mail.skipped', reason: 'SMTP_URL not configured', subject: message.subject });
      return false;
    }
    try {
      await this.transporter.sendMail({ from: this.from, ...message });
      this.logger.log({ event: 'mail.sent', subject: message.subject });
      return true;
    } catch (err) {
      // Lỗi gửi mail không được làm lộ thông tin cho client (ví dụ email có tồn tại hay không)
      this.logger.error({ event: 'mail.failed', subject: message.subject, err: (err as Error).message });
      return false;
    }
  }
}
