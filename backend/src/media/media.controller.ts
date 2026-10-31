import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { LOCAL_FILE_RE, StorageService } from '../storage/storage.service';

const CONTENT_TYPE: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** Phục vụ ảnh upload lưu trên đĩa (chế độ không có S3). Chỉ chấp nhận đường dẫn đúng định dạng server sinh ra. */
@ApiTags('media')
@SkipThrottle()
@Controller('media/products')
export class MediaController {
  constructor(private readonly storage: StorageService) {}

  @Get(':productId/:file')
  serve(@Param('productId') productId: string, @Param('file') file: string, @Res() res: Response): void {
    const relative = `products/${productId}/${file}`;
    if (!LOCAL_FILE_RE.test(relative)) throw new NotFoundException();
    const ext = file.split('.').pop()!;
    res.setHeader('Content-Type', CONTENT_TYPE[ext]);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // sendFile với root cố định + regex ở trên → không thể thoát ra ngoài UPLOAD_DIR
    res.sendFile(relative, { root: this.storage.uploadDir, dotfiles: 'deny' }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ statusCode: 404, message: 'Not found' });
    });
  }
}
