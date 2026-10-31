import { StorageService } from './storage.service';

describe('StorageService.matchesSignature', () => {
  const pad = (head: number[]) => Buffer.concat([Buffer.from(head), Buffer.alloc(16)]);
  const png = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const jpeg = pad([0xff, 0xd8, 0xff, 0xe0]);
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(8)]);
  const php = Buffer.from('<?php system($_GET["c"]); ?>');

  it.each([
    ['image/png', png, true],
    ['image/jpeg', jpeg, true],
    ['image/webp', webp, true],
    ['image/png', jpeg, false],
    ['image/jpeg', php, false],
    ['image/gif', png, false],
  ])('%s with given bytes → %s', (mime, buf, expected) => {
    expect(StorageService.matchesSignature(buf, mime)).toBe(expected);
  });

  it('only treats safe local paths as static assets', () => {
    expect(StorageService.isStaticAsset('/images/products/sofa-bang-3-cho.webp')).toBe(true);
    expect(StorageService.isStaticAsset('/images/../etc/passwd')).toBe(false);
    expect(StorageService.isStaticAsset('https://evil.example/x.png')).toBe(false);
    expect(StorageService.isStaticAsset('products/abc/1.png')).toBe(false);
  });

  it('rejects tiny files', () => {
    expect(StorageService.matchesSignature(Buffer.from([0xff, 0xd8]), 'image/jpeg')).toBe(false);
  });
});
