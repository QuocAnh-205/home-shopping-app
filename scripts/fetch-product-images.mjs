#!/usr/bin/env node
/**
 * Tải ảnh sản phẩm/danh mục (Unsplash License) theo backend/prisma/data/catalog.js
 * vào frontend/public/images. Chỉ tải file còn thiếu → chạy lại an toàn.
 *
 *   node scripts/fetch-product-images.mjs            # tải ảnh còn thiếu
 *   node scripts/fetch-product-images.mjs --force    # tải lại toàn bộ
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { categories, products } = createRequire(import.meta.url)(join(root, 'backend/prisma/data/catalog.js'));
const force = process.argv.includes('--force');
const outProducts = join(root, 'frontend/public/images/products');
const outSite = join(root, 'frontend/public/images/site');
mkdirSync(outProducts, { recursive: true });
mkdirSync(outSite, { recursive: true });

const jobs = [
  ...products.map((p) => ({ id: p.img, file: join(outProducts, `${p.slug}.webp`), w: 1200, h: 900, crop: p.crop ?? 'entropy' })),
  ...categories.map((c) => ({ id: c.img, file: join(outSite, `cat-${c.slug}.webp`), w: 800, h: 800, crop: 'entropy' })),
];

async function download({ id, file, w, h, crop }) {
  const url = `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&crop=${crop}&q=78&fm=webp`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      // WebP = "RIFF....WEBP": chặn trường hợp CDN trả trang lỗi HTML
      if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') throw new Error('not a WebP');
      writeFileSync(file, buf);
      return buf.length;
    } catch (err) {
      if (attempt === 3) throw new Error(`${id}: ${err.message}`);
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
}

const pending = jobs.filter((j) => force || !existsSync(j.file));
let done = 0;
const failures = [];
// 6 luồng song song: đủ nhanh mà không dội CDN
const queue = [...pending];
await Promise.all(
  Array.from({ length: 6 }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        await download(job);
        done++;
      } catch (err) {
        failures.push(err.message);
      }
    }
  }),
);
console.log(`downloaded ${done}/${pending.length} (skipped ${jobs.length - pending.length} existing)`);
if (failures.length) {
  console.error('failed:\n  ' + failures.join('\n  '));
  process.exit(1);
}
