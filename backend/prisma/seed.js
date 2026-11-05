/* eslint-disable no-console */
'use strict';

/**
 * Seed idempotent (chạy lại nhiều lần không tạo trùng).
 * - Danh mục + 200 sản phẩm từ prisma/data/catalog.js (ảnh tĩnh trong frontend/public/images, nguồn Unsplash).
 *   Sản phẩm đã có: cập nhật nội dung, giá, ảnh; GIỮ NGUYÊN tồn kho & số đã bán (dữ liệu vận hành thật).
 * - SEED_DEMO_DATA=true (chỉ môi trường demo/local): tạo tài khoản trong prisma/data/demo-accounts.js
 *   (SỬA TÀI KHOẢN DEMO Ở FILE ĐÓ), đánh giá mẫu (mọi sản phẩm 3–6 đánh giá, người đánh giá trong prisma/data/reviews.js) và lịch sử đơn hàng 60 ngày cho dashboard quản trị.
 * - SEED_DEMO_CUSTOMERS=true (dùng được ở production): chỉ tạo các tài khoản KHÁCH trong demo-accounts.js,
 *   không tạo admin demo (admin production lấy từ SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD, mật khẩu bí mật).
 * - Production: không bật SEED_DEMO_DATA → không có tài khoản mặc định. SEED_SAMPLE_REVIEWS=true chỉ thêm đánh giá mẫu
 *   (người viết không có mật khẩu, không đăng nhập được). Có thể tạo 1 admin đầu tiên
 *   bằng SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (chỉ tạo nếu chưa tồn tại, không ghi đè mật khẩu).
 */
const { PrismaClient, Prisma, Role } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { categories, products } = require('./data/catalog');
const { demoAccounts } = require('./data/demo-accounts');
const { reviewers, reviewTexts } = require('./data/reviews');

const prisma = new PrismaClient();

// Đoạn giới thiệu bổ sung theo danh mục → trang chi tiết có nội dung phong phú, tự nhiên
const CATEGORY_STORY = {
  'dien-gia-dung':
    'Sản phẩm được nhập khẩu chính hãng, đạt chứng nhận an toàn điện và tương thích điện áp 220V tại Việt Nam. Mỗi máy đều được kiểm tra vận hành trước khi giao, kèm phiếu bảo hành điện tử tra cứu bằng số điện thoại.',
  'nha-bep':
    'Chất liệu đạt tiêu chuẩn an toàn thực phẩm, không chứa chì, cadmium hay BPA. Thiết kế chú trọng công năng để việc nấu nướng hằng ngày nhẹ nhàng, gọn gàng và đẹp mắt hơn.',
  'ban-an':
    'Từng món được tuyển chọn để bàn ăn gia đình thêm ấm cúng và tinh tế – từ bữa cơm thường ngày đến buổi tiệc đãi khách. Đóng gói chống sốc nhiều lớp, cam kết đổi mới nếu sứt mẻ khi vận chuyển.',
  'phong-khach':
    'Nội thất được sản xuất theo quy trình kiểm soát chất lượng nghiêm ngặt: gỗ sấy đạt độ ẩm tiêu chuẩn, vải bọc chống phai màu. Đội ngũ kỹ thuật giao và lắp đặt miễn phí tận nơi trong nội thành.',
  'phong-ngu':
    'Chất liệu mềm mại, thân thiện với làn da và an toàn cho cả trẻ nhỏ. Thiết kế hướng đến không gian nghỉ ngơi yên bình, giúp bạn có giấc ngủ sâu và trọn vẹn hơn mỗi đêm.',
  'phong-tam':
    'Vật liệu chống gỉ, chống ẩm mốc, phù hợp khí hậu nồm ẩm của Việt Nam. Dễ lắp đặt, dễ vệ sinh và giữ vẻ sáng đẹp sau thời gian dài sử dụng.',
  'trang-tri':
    'Mỗi món đồ trang trí được chọn lọc để dễ phối với nhiều phong cách: tối giản, Bắc Âu, Japandi hay vintage. Một điểm nhấn nhỏ nhưng đủ làm không gian sống trở nên có hồn.',
};

const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/;
const ADDRESSES = [
  '25 Nguyễn Huệ, P. Bến Nghé, Quận 1, TP. Hồ Chí Minh',
  '118 Trần Phú, P. Hải Châu 1, Q. Hải Châu, Đà Nẵng',
  '42 Lý Thường Kiệt, P. Trần Hưng Đạo, Q. Hoàn Kiếm, Hà Nội',
  '9 Hùng Vương, P. Lộc Thọ, TP. Nha Trang, Khánh Hòa',
  '76 Nguyễn Văn Linh, P. Tân Phong, Quận 7, TP. Hồ Chí Minh',
];

/** Hash ổn định theo chuỗi → seed tạo ra cùng một bộ dữ liệu mỗi lần chạy */
function hash(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

function toProductData(p, categoryId) {
  const story = CATEGORY_STORY[p.cat] ?? '';
  return {
    name: p.name,
    description: story ? `${p.summary}\n\n${story}` : p.summary,
    highlights: p.features,
    specs: p.specs,
    price: new Prisma.Decimal(p.price),
    compareAtPrice: p.compare ? new Prisma.Decimal(p.compare) : null,
    imageKey: `/images/products/${p.slug}.webp`,
    isHot: Boolean(p.hot),
    categoryId,
  };
}

/** Tài khoản demo: cập nhật họ tên / vai trò / mật khẩu theo demo-accounts.js mỗi lần seed */
async function upsertDemoAccount({ email, fullName, password, role }) {
  const normalized = String(email).trim().toLowerCase();
  if (!PASSWORD_RE.test(password)) {
    throw new Error(`demo-accounts.js: mật khẩu của ${normalized} cần ≥ 8 ký tự, có chữ hoa, chữ thường và chữ số`);
  }
  if (!['ADMIN', 'CUSTOMER'].includes(role)) throw new Error(`demo-accounts.js: role của ${normalized} phải là ADMIN hoặc CUSTOMER`);
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email: normalized },
    update: { fullName, role, passwordHash },
    create: { email: normalized, fullName, role, passwordHash },
  });
  console.log(`  demo account ${normalized} (${role})`);
  return user;
}

/** Lịch sử ~140 đơn hàng trong 60 ngày (giá theo bảng giá hiện tại) để dashboard có số liệu thật để phân tích */
async function seedOrders(customers) {
  const catalog = await prisma.product.findMany({ select: { id: true, slug: true, price: true } });
  catalog.sort((a, b) => a.slug.localeCompare(b.slug));
  let created = 0;
  for (let i = 0; i < 140; i++) {
    const key = `seed-order-${String(i).padStart(3, '0')}`;
    if (await prisma.order.findUnique({ where: { idempotencyKey: key }, select: { id: true } })) continue;
    const h = hash(key);
    // Mật độ đơn tăng dần về gần hiện tại; vài đơn luôn rơi vào hôm nay để KPI "hôm nay" có dữ liệu
    const daysAgo = i < 4 ? 0 : Math.floor(Math.pow((h % 1000) / 1000, 1.4) * 60);
    const createdAt = new Date(Date.now() - daysAgo * 86_400_000 - ((h >>> 8) % 36_000) * 1000);
    const status =
      daysAgo === 0 ? (h % 2 ? 'PENDING' : 'PAID')
      : daysAgo <= 2 ? ['PENDING', 'PAID', 'SHIPPING'][h % 3]
      : daysAgo <= 5 ? (h % 4 === 0 ? 'PAID' : 'SHIPPING')
      : h % 12 === 0 ? 'CANCELLED' : 'COMPLETED';

    const lines = new Map();
    const count = 1 + (h % 3);
    for (let k = 0; k < count; k++) {
      const product = catalog[(h >>> (k * 5)) % catalog.length];
      lines.set(product.id, { product, quantity: 1 + ((h >>> (k * 7)) % 2) });
    }
    const items = [...lines.values()].map(({ product, quantity }) => ({ productId: product.id, quantity, unitPrice: product.price }));
    const total = items.reduce((sum, it) => sum.add(it.unitPrice.mul(it.quantity)), new Prisma.Decimal(0));

    await prisma.order.create({
      data: {
        userId: customers[h % customers.length].id,
        idempotencyKey: key,
        status,
        totalAmount: total,
        shippingAddress: ADDRESSES[h % ADDRESSES.length],
        phone: `09${String(10000000 + (h % 89999999)).slice(0, 8)}`,
        createdAt,
        updatedAt: createdAt,
        items: { create: items },
      },
    });
    created++;
  }
  console.log(`  ${created} demo orders (60 days history)`);
}

/** Người đánh giá mẫu: không có mật khẩu → không đăng nhập được, chỉ hiển thị tên trên đánh giá */
async function upsertReviewers() {
  const users = [];
  for (const r of reviewers) {
    users.push(
      await prisma.user.upsert({
        where: { email: r.email },
        update: { fullName: r.fullName },
        create: { email: r.email, fullName: r.fullName, role: Role.CUSTOMER, passwordHash: null },
      }),
    );
  }
  return users;
}

async function seedReviews(customers) {
  const pool = [...customers, ...(await upsertReviewers())];
  let created = 0;
  for (const p of products) {
    const h = hash(p.slug);
    const product = await prisma.product.findUnique({ where: { slug: p.slug }, select: { id: true } });
    // Mọi sản phẩm có 3–6 đánh giá từ những người khác nhau (bước nhảy lẻ → không trùng người trong 1 sản phẩm)
    const count = 3 + (h % 4);
    const step = 1 + 2 * ((h >>> 4) % 5);
    for (let i = 0; i < count; i++) {
      const user = pool[(h + i * step) % pool.length];
      const roll = (h >>> (i * 3)) % 20;
      const rating = roll < 12 ? 5 : roll < 17 ? 4 : roll < 19 ? 3 : 2;
      const texts = reviewTexts(p.cat, rating);
      const res = await prisma.review.upsert({
        where: { productId_userId: { productId: product.id, userId: user.id } },
        update: {},
        create: {
          productId: product.id,
          userId: user.id,
          rating,
          comment: texts[(h >>> i) % texts.length],
          verifiedPurchase: (h + i) % 4 !== 0,
          createdAt: new Date(Date.now() - ((h >>> i) % 90) * 86_400_000 - i * 3_600_000),
        },
      });
      if (res) created++;
    }
  }
  // Tính lại điểm trung bình & số lượt đánh giá cho mọi sản phẩm bằng 1 câu SQL
  await prisma.$executeRaw`
    UPDATE products p
    SET rating_avg = r.avg, rating_count = r.cnt
    FROM (
      SELECT p2.id, COALESCE(ROUND(AVG(rv.rating)::numeric, 2), 0) AS avg, COUNT(rv.id)::int AS cnt
      FROM products p2 LEFT JOIN reviews rv ON rv.product_id = p2.id
      GROUP BY p2.id
    ) r
    WHERE p.id = r.id`;
  console.log(`  ${created} demo reviews`);
}

async function clearProductCache() {
  if (!process.env.REDIS_URL) return;
  const Redis = require('ioredis');
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true });
  try {
    await redis.connect();
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'cache:products:*', 'COUNT', 500);
      cursor = next;
      if (keys.length) await redis.unlink(...keys);
    } while (cursor !== '0');
  } catch (err) {
    console.warn(`  cache invalidation skipped: ${err.message}`);
  } finally {
    redis.disconnect();
  }
}

async function main() {
  for (const c of categories) {
    await prisma.category.upsert({ where: { slug: c.slug }, update: { name: c.name }, create: { name: c.name, slug: c.slug } });
  }
  const categoryIds = new Map((await prisma.category.findMany()).map((c) => [c.slug, c.id]));

  for (const p of products) {
    const data = toProductData(p, categoryIds.get(p.cat));
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: data,
      create: { ...data, slug: p.slug, stock: p.stock, soldCount: p.sold ?? 0 },
    });
  }
  console.log(`  ${categories.length} categories, ${products.length} products`);

  // Admin đầu tiên cho production: chỉ tạo khi chưa có, không bao giờ ghi đè mật khẩu
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  if (adminEmail && process.env.SEED_ADMIN_PASSWORD) {
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: { email: adminEmail, fullName: 'Quản trị viên', role: Role.ADMIN, passwordHash: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD, 12) },
    });
    console.log(`  admin ${adminEmail}`);
  }

  // Production demo: chỉ tạo các tài khoản KHÁCH trong demo-accounts.js (không tạo admin mật khẩu công khai,
  // không tạo đơn hàng giả) để giảng viên/người xem đăng nhập thử được ngay
  if (process.env.SEED_DEMO_CUSTOMERS === 'true' && process.env.SEED_DEMO_DATA !== 'true') {
    for (const a of demoAccounts.filter((x) => x.role === 'CUSTOMER')) await upsertDemoAccount(a);
  }

  if (process.env.SEED_DEMO_DATA === 'true') {
    const accounts = [];
    for (const a of demoAccounts) accounts.push(await upsertDemoAccount(a));
    const customers = accounts.filter((u) => u.role === Role.CUSTOMER);
    if (customers.length > 0) {
      await seedReviews(customers);
      await seedOrders(customers);
    }
  } else if (process.env.SEED_SAMPLE_REVIEWS === 'true') {
    // Production demo: chỉ đánh giá mẫu từ người đánh giá KHÔNG đăng nhập được (không có tài khoản mật khẩu công khai)
    await seedReviews([]);
  }

  await clearProductCache();
  console.log('Seed completed');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
