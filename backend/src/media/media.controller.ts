import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { LOCAL_FILE_RE, StorageService } from '../storage/storage.service';

const CONTENT_TYPE: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * Phục vụ ảnh upload:
 * - products/…: ảnh sản phẩm lưu trên đĩa (chế độ không có S3).
 * - avatars/…: ảnh đại diện. Không S3 → đọc từ đĩa; có S3 → chuyển hướng 302 tới presigned URL (1 giờ),
 *   nhờ vậy avatarUrl lưu trong DB là đường dẫn cố định, không bao giờ hết hạn.
 * Chỉ chấp nhận đường dẫn đúng định dạng server sinh ra (UUID/UUID.ext).
 */
@ApiTags('media')
@SkipThrottle()
@Controller('media')
export class MediaController {
  constructor(private readonly storage: StorageService) {}

  @Get('products/:productId/:file')
  product(@Param('productId') productId: string, @Param('file') file: string, @Res() res: Response): void {
    this.sendLocal(`products/${productId}/${file}`, res);
  }

  @Get('avatars/:userId/:file')
  async avatar(@Param('userId') userId: string, @Param('file') file: string, @Res() res: Response): Promise<void> {
    const relative = `avatars/${userId}/${file}`;
    if (!LOCAL_FILE_RE.test(relative)) throw new NotFoundException();
    if (!this.storage.usesS3) return this.sendLocal(relative, res);
    const url = await this.storage.presign(relative);
    if (!url) throw new NotFoundException();
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.redirect(302, url);
  }

  private sendLocal(relative: string, res: Response): void {
    if (!LOCAL_FILE_RE.test(relative)) throw new NotFoundException();
    const ext = relative.split('.').pop()!;
    res.setHeader('Content-Type', CONTENT_TYPE[ext]);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // sendFile với root cố định + regex ở trên → không thể thoát ra ngoài UPLOAD_DIR
    res.sendFile(relative, { root: this.storage.uploadDir, dotfiles: 'deny' }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ statusCode: 404, message: 'Not found' });
    });
  }
}
