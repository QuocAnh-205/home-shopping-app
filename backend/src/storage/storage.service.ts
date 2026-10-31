import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const LOCAL_PREFIX = 'local/';
export const LOCAL_FILE_RE = /^(products|avatars)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/**
 * Lưu ảnh sản phẩm do admin upload:
 * - Production (có S3_BUCKET): Amazon S3, không cần access key – SDK tự lấy credentials từ IAM Instance Profile (IMDSv2).
 * - Local/dev (không có S3_BUCKET): ghi vào UPLOAD_DIR (Docker volume), phục vụ qua GET /api/media/... (MediaController).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly bucket?: string;
  readonly uploadDir: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('S3_BUCKET') || undefined;
    this.uploadDir = config.get<string>('UPLOAD_DIR') ?? join(process.cwd(), 'uploads');
    this.s3 = new S3Client({ region: config.get<string>('AWS_REGION') ?? 'ap-southeast-1' });
  }

  get usesS3(): boolean {
    return Boolean(this.bucket);
  }

  static isAllowedMime(mime: string): boolean {
    return mime in EXTENSIONS;
  }

  static isStaticAsset(key: string): boolean {
    return /^\/images\/[a-z0-9/-]+\.(webp|jpe?g|png)$/.test(key);
  }

  /** Kiểm tra chữ ký file (magic bytes) khớp với MIME khai báo */
  static matchesSignature(buf: Buffer, mime: string): boolean {
    if (buf.length < 12) return false;
    switch (mime) {
      case 'image/jpeg':
        return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
      case 'image/png':
        return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      case 'image/webp':
        return buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
      default:
        return false;
    }
  }

  async uploadProductImage(productId: string, body: Buffer, mime: string): Promise<string> {
    // Tên file do server sinh (UUID) → không bao giờ dùng tên file người dùng gửi lên (chống path traversal)
    const relative = `products/${productId}/${randomUUID()}.${EXTENSIONS[mime]}`;

    if (!this.bucket) {
      await mkdir(join(this.uploadDir, 'products', productId), { recursive: true });
      await writeFile(join(this.uploadDir, relative), body, { mode: 0o640 });
      this.logger.log({ event: 'product.image_uploaded', productId, storage: 'local' });
      return `${LOCAL_PREFIX}${relative}`;
    }

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: relative,
        Body: body,
        ContentType: mime,
        CacheControl: 'public, max-age=31536000, immutable',
        ServerSideEncryption: 'AES256',
      }),
    );
    this.logger.log({ event: 'product.image_uploaded', productId, storage: 's3', key: relative });
    return relative;
  }

  /**
   * Ảnh đại diện: lưu ở avatars/<userId>/<uuid>.<ext> (đĩa local hoặc S3) và luôn trả về đường dẫn công khai
   * cố định /api/media/avatars/… – MediaController phục vụ file local hoặc chuyển hướng tới presigned URL của S3.
   */
  async uploadAvatar(userId: string, body: Buffer, mime: string): Promise<string> {
    const relative = `avatars/${userId}/${randomUUID()}.${EXTENSIONS[mime]}`;
    if (!this.bucket) {
      await mkdir(join(this.uploadDir, 'avatars', userId), { recursive: true });
      await writeFile(join(this.uploadDir, relative), body, { mode: 0o640 });
    } else {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: relative,
          Body: body,
          ContentType: mime,
          CacheControl: 'public, max-age=31536000, immutable',
          ServerSideEncryption: 'AES256',
        }),
      );
    }
    this.logger.log({ event: 'user.avatar_uploaded', userId, storage: this.bucket ? 's3' : 'local' });
    return `/api/media/${relative}`;
  }

  /** Presigned URL cho object S3 (dùng khi phục vụ ảnh đại diện ở chế độ S3) */
  async presign(key: string): Promise<string | null> {
    if (!this.bucket) return null;
    try {
      return await getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: 3600 });
    } catch (err) {
      this.logger.warn(`Cannot presign ${key}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * imageKey có 3 dạng:
   * - "/images/..."       : ảnh tĩnh đóng gói cùng frontend (dữ liệu seed) → trả nguyên đường dẫn
   * - "local/products/…"  : ảnh upload lưu trên đĩa → /api/media/products/…
   * - "products/…"        : object trên S3 → presigned URL hết hạn sau 1 giờ
   */
  async getSignedImageUrl(key: string | null): Promise<string | null> {
    if (!key) return null;
    if (StorageService.isStaticAsset(key)) return key;
    if (key.startsWith(LOCAL_PREFIX)) return `/api/media/${key.slice(LOCAL_PREFIX.length)}`;
    return this.presign(key);
  }
}
