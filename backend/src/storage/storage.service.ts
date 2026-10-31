import { randomUUID } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Không truyền access key: AWS SDK tự lấy credentials tạm thời từ IAM Instance Profile
 * của EC2 qua IMDSv2 (default credential provider chain).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly bucket?: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('S3_BUCKET');
    this.s3 = new S3Client({ region: config.get<string>('AWS_REGION') ?? 'ap-southeast-1' });
  }

  get enabled(): boolean {
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
    if (!this.bucket) throw new ServiceUnavailableException('Object storage is not configured');
    const key = `products/${productId}/${randomUUID()}.${EXTENSIONS[mime]}`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: mime,
        CacheControl: 'public, max-age=31536000, immutable',
        ServerSideEncryption: 'AES256',
      }),
    );
    this.logger.log({ event: 'product.image_uploaded', productId, key });
    return key;
  }

  /**
   * imageKey có 2 dạng:
   * - "/images/..." : ảnh tĩnh đóng gói cùng frontend (dữ liệu seed) → trả nguyên đường dẫn
   * - "products/..." : object trên S3 (admin upload) → presigned URL hết hạn sau 1 giờ
   */
  async getSignedImageUrl(key: string | null): Promise<string | null> {
    if (key && StorageService.isStaticAsset(key)) return key;
    if (!key || !this.bucket) return null;
    try {
      return await getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: 3600 });
    } catch (err) {
      this.logger.warn(`Cannot presign ${key}: ${(err as Error).message}`);
      return null;
    }
  }
}
