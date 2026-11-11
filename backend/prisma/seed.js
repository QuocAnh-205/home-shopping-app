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
const { PrismaClient, Role } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { categories, products } = require('./data/catalog');
const { deriveAttributes } = require('./data/product-attributes');
const { variantBySlug } = require('./data/variants');
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

// Cân nặng mặc định theo danh mục khi catalog không ghi "Trọng lượng"; hệ số thể tích (cm³/gram) của gói hàng:
// đồ trang trí/chăn gối cồng kềnh hơn đồ điện cùng cân nặng
const PACKAGE = {
  'dien-gia-dung': { grams: 2500, cm3PerGram: 3 },
  'nha-bep': { grams: 1200, cm3PerGram: 3 },
  'ban-an': { grams: 1000, cm3PerGram: 4 },
  'phong-khach': { grams: 6000, cm3PerGram: 5 },
  'phong-ngu': { grams: 2000, cm3PerGram: 6 },
  'phong-tam': { grams: 800, cm3PerGram: 4 },
  'trang-tri': { grams: 700, cm3PerGram: 6 },
};

/** "4.3 kg" / "160 g" trong thông số → gram (+10% bao bì); kích thước hộp suy từ cân nặng (hộp gần lập phương) */
function packageOf(p) {
  const raw = p.specs?.['Trọng lượng'] ?? p.specs?.['Khối lượng'];
  const m = typeof raw === 'string' ? raw.replace(',', '.').match(/([\d.]+)\s*(kg|g)\b/i) : null;
  const def = PACKAGE[p.cat] ?? { grams: 500, cm3PerGram: 4 };
  const grams = Math.max(50, m ? Math.round(Number(m[1]) * (m[2].toLowerCase() === 'kg' ? 1000 : 1) * 1.1) : def.grams);
  const side = Math.min(120, Math.max(8, Math.round(Math.cbrt(grams * def.cm3PerGram))));
  return { weightGrams: grams, lengthCm: side, widthCm: side, heightCm: side };
}

/**
 * Thông số đầy đủ để khách ra quyết định: bổ sung Trọng lượng (ước tính, ghi rõ "≈"), Bảo hành mặc định theo danh mục
 * và dịch vụ giao + lắp đặt cho hàng cồng kềnh khi catalog không ghi.
 */
function enrichSpecs(specs, attrs) {
  const out = { ...specs };
  if (attrs.estimatedWeightGrams && !out['Trọng lượng']) out['Trọng lượng'] = `≈ ${Math.round(attrs.estimatedWeightGrams / 1000)} kg`;
  if (attrs.warrantyMonths && !Object.keys(out).some((k) => /bảo hành/i.test(k))) {
    out['Bảo hành'] = attrs.warrantyMonths % 12 === 0 ? `${attrs.warrantyMonths / 12} năm` : `${attrs.warrantyMonths} tháng`;
  }
  if (attrs.isBulky) out['Giao hàng'] = 'Hàng cồng kềnh – giao bằng xe tải nhỏ, miễn phí lắp đặt tận nơi';
  return out;
}

function toProductData(p, categoryId) {
  const story = CATEGORY_STORY[p.cat] ?? '';
  const { estimatedWeightGrams, ...columns } = deriveAttributes({ name: p.name, categorySlug: p.cat, specs: p.specs });
  // Hàng cồng kềnh: kiện hàng = kích thước thật + 5 cm đóng gói, cân nặng thật/ước tính (hộp lập phương suy từ cân nặng là sai với sofa)
  const pkg =
    columns.isBulky && columns.dimLengthCm
      ? {
          weightGrams: estimatedWeightGrams ?? packageOf(p).weightGrams,
          lengthCm: Math.min(300, columns.dimLengthCm + 5),
          widthCm: Math.min(300, columns.dimWidthCm + 5),
          heightCm: Math.min(300, columns.dimHeightCm + 5),
        }
      : packageOf(p);
  return {
    name: p.name,
    description: story ? `${p.summary}\n\n${story}` : p.summary,
    highlights: p.features,
    specs: enrichSpecs(p.specs ?? {}, { ...columns, estimatedWeightGrams }),
    price: p.price,
    compareAtPrice: p.compare ?? null,
    imageKey: `/images/products/${p.slug}.webp`,
    ...pkg,
    ...columns,
    ...(variantBySlug.get(p.slug) ?? { variantGroup: null, variantName: null, variantLabel: null }),
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

/** Lịch sử trạng thái + mốc thời gian của 1 đơn mẫu (mỗi bước cách nhau vài giờ, không vượt quá hiện tại) */
function orderTimeline(status, createdAt) {
  const path = {
    PENDING: ['PENDING'],
    PROCESSING: ['PENDING', 'PROCESSING'],
    SHIPPING: ['PENDING', 'PROCESSING', 'SHIPPING'],
    DELIVERED: ['PENDING', 'PROCESSING', 'SHIPPING', 'DELIVERED'],
    COMPLETED: ['PENDING', 'PROCESSING', 'SHIPPING', 'DELIVERED', 'COMPLETED'],
    CANCELLED: ['PENDING', 'CANCELLED'],
  }[status];
  const field = { PROCESSING: 'confirmedAt', SHIPPING: 'shippedAt', DELIVERED: 'deliveredAt', COMPLETED: 'completedAt', CANCELLED: 'cancelledAt' };
  const step = Math.max(1, Math.floor((Date.now() - createdAt.getTime()) / (path.length * 2)));
  const fields = {};
  const history = [];
  let at = createdAt;
  path.forEach((s, i) => {
    if (i > 0) at = new Date(Math.min(at.getTime() + Math.min(step, 26 * 3600_000), Date.now()));
    if (field[s]) fields[field[s]] = at;
    history.push({
      fromStatus: i === 0 ? null : path[i - 1],
      toStatus: s,
      actorType: i === 0 || s === 'CANCELLED' ? 'CUSTOMER' : s === 'COMPLETED' ? 'SYSTEM' : 'ADMIN',
      note: i === 0 ? 'Đặt hàng' : s === 'CANCELLED' ? 'Muốn thay đổi địa chỉ giao hàng' : null,
      createdAt: at,
    });
  });
  if (status === 'DELIVERED' || status === 'COMPLETED') Object.assign(fields, { paymentStatus: 'PAID', paidAt: fields.deliveredAt });
  if (status === 'CANCELLED') Object.assign(fields, { cancelledBy: 'CUSTOMER', cancelReason: 'Muốn thay đổi địa chỉ giao hàng' });
  return { fields, history, updatedAt: at };
}

/** Lịch sử ~140 đơn hàng trong 60 ngày (giá theo bảng giá hiện tại) để dashboard có số liệu thật để phân tích */
async function seedOrders(customers) {
  const catalog = await prisma.product.findMany({ select: { id: true, slug: true, price: true, name: true, imageKey: true } });
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
      daysAgo === 0 ? (h % 2 ? 'PENDING' : 'PROCESSING')
      : daysAgo <= 2 ? ['PENDING', 'PROCESSING', 'SHIPPING'][h % 3]
      : daysAgo <= 4 ? (h % 4 === 0 ? 'PROCESSING' : 'SHIPPING')
      : daysAgo <= 5 ? 'DELIVERED'
      : h % 12 === 0 ? 'CANCELLED' : 'COMPLETED';

    const lines = new Map();
    const count = 1 + (h % 3);
    for (let k = 0; k < count; k++) {
      const product = catalog[(h >>> (k * 5)) % catalog.length];
      lines.set(product.id, { product, quantity: 1 + ((h >>> (k * 7)) % 2) });
    }
    const items = [...lines.values()].map(({ product, quantity }) => ({
      productId: product.id,
      quantity,
      unitPrice: product.price,
      productName: product.name,
      productSlug: product.slug,
      imageKey: product.imageKey,
    }));
    const total = items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);

    const timeline = orderTimeline(status, createdAt);
    await prisma.order.create({
      data: {
        userId: customers[h % customers.length].id,
        idempotencyKey: key,
        status,
        totalAmount: total,
        subtotal: total,
        shippingAddress: ADDRESSES[h % ADDRESSES.length],
        phone: `09${String(10000000 + (h % 89999999)).slice(0, 8)}`,
        createdAt,
        updatedAt: timeline.updatedAt,
        ...timeline.fields,
        items: { create: items },
        history: { create: timeline.history },
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

/** 34 tỉnh + 3.321 xã theo đơn vị hành chính mới (01/07/2025); chỉ chèn khi còn thiếu */
async function seedLocations() {
  const units = require('./data/vn-admin-units.json');
  const wardTotal = units.reduce((n, p) => n + p.wards.length, 0);
  if ((await prisma.province.count()) === units.length && (await prisma.ward.count()) === wardTotal) return;
  const regionOf = (code) => (code <= 37 ? 'NORTH' : code <= 68 ? 'CENTRAL' : 'SOUTH');
  await prisma.province.createMany({
    data: units.map((p) => ({ code: p.code, name: p.name, region: regionOf(p.code) })),
    skipDuplicates: true,
  });
  await prisma.ward.createMany({
    data: units.flatMap((p) => p.wards.map(([code, name]) => ({ code, name, provinceCode: p.code }))),
    skipDuplicates: true,
  });
  console.log(`  ${units.length} provinces, ${wardTotal} wards`);
}

/** Voucher mẫu (demo): chỉ tạo khi chưa có mã; voucher hết hạn được gia hạn thêm 90 ngày để demo luôn dùng được */
async function seedVouchers(categoryIds) {
  const day = 86_400_000;
  const startsAt = new Date(Date.now() - day);
  const endsAt = new Date(Date.now() + 90 * day);
  const samples = [
    { code: 'HOMESHOP10', name: 'Giảm 10% toàn shop', type: 'PERCENT', value: 10, maxDiscount: 50_000, minOrderValue: 300_000, usageLimit: 1000, perUserLimit: 3 },
    { code: 'GIAM50K', name: 'Giảm 50K đơn từ 500K', type: 'FIXED', value: 50_000, minOrderValue: 500_000, usageLimit: 500, perUserLimit: 1 },
    { code: 'FREESHIP', name: 'Miễn phí vận chuyển', type: 'FREESHIP', value: 0, minOrderValue: 150_000, usageLimit: 2000, perUserLimit: 5 },
    { code: 'SHIP15K', name: 'Giảm 15K phí vận chuyển', type: 'FREESHIP', value: 15_000, minOrderValue: 0, usageLimit: null, perUserLimit: 10 },
    {
      code: 'BEPXINH15',
      name: 'Nhà bếp giảm 15%',
      type: 'PERCENT',
      value: 15,
      maxDiscount: 100_000,
      minOrderValue: 200_000,
      usageLimit: 300,
      perUserLimit: 1,
      categoryIds: [categoryIds.get('nha-bep')].filter(Boolean),
    },
  ];
  for (const v of samples) {
    const existing = await prisma.voucher.findUnique({ where: { code: v.code }, select: { endsAt: true } });
    if (!existing) await prisma.voucher.create({ data: { ...v, startsAt, endsAt, isPublic: true } });
    else if (existing.endsAt < new Date()) await prisma.voucher.update({ where: { code: v.code }, data: { endsAt } });
  }
  console.log(`  ${samples.length} demo vouchers`);
}

/** Địa chỉ mặc định cho tài khoản khách demo (để thử đặt hàng ngay), chỉ tạo khi họ chưa có địa chỉ nào */
async function seedDemoAddresses(customers) {
  const samples = [
    { provinceCode: 79, wardCode: 26743, street: '25 Nguyễn Huệ' },
    { provinceCode: 1, wardCode: 70, street: '42 Lý Thường Kiệt' },
    { provinceCode: 48, wardCode: 20242, street: '118 Trần Phú' },
  ];
  for (const [i, user] of customers.entries()) {
    if (await prisma.address.count({ where: { userId: user.id } })) continue;
    const s = samples[i % samples.length];
    const ward = await prisma.ward.findUnique({ where: { code: s.wardCode }, include: { province: true } });
    if (!ward || ward.provinceCode !== s.provinceCode) continue;
    await prisma.address.create({
      data: {
        userId: user.id,
        fullName: user.fullName,
        phone: `090${String(1234567 + i).padStart(7, '0')}`,
        province: ward.province.name,
        ward: ward.name,
        street: s.street,
        provinceCode: s.provinceCode,
        wardCode: s.wardCode,
        isDefault: true,
      },
    });
  }
}

async function main() {
  await seedLocations();
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
    const customers = [];
    for (const a of demoAccounts.filter((x) => x.role === 'CUSTOMER')) customers.push(await upsertDemoAccount(a));
    await seedDemoAddresses(customers);
    await seedVouchers(categoryIds);
  }

  if (process.env.SEED_DEMO_DATA === 'true') {
    const accounts = [];
    for (const a of demoAccounts) accounts.push(await upsertDemoAccount(a));
    const customers = accounts.filter((u) => u.role === Role.CUSTOMER);
    if (customers.length > 0) {
      await seedDemoAddresses(customers);
      await seedVouchers(categoryIds);
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
