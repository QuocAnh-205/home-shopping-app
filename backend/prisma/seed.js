/* eslint-disable no-console */
'use strict';

/**
 * Seed idempotent (chạy lại nhiều lần không tạo trùng).
 * - Danh mục + 131 sản phẩm từ prisma/data/catalog.js (ảnh tĩnh trong frontend/public/images, nguồn Unsplash).
 *   Sản phẩm đã có: cập nhật nội dung, giá, ảnh; GIỮ NGUYÊN tồn kho & số đã bán (dữ liệu vận hành thật).
 * - Tài khoản chỉ tạo khi có biến môi trường → production không có tài khoản mặc định:
 *     SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD          → 1 admin
 *     SEED_CUSTOMER_EMAIL / SEED_CUSTOMER_PASSWORD    → khách demo chính
 *     SEED_DEMO_CUSTOMERS=true                        → thêm 3 khách demo (cùng mật khẩu khách)
 *     SEED_DEMO_REVIEWS=true                          → đánh giá mẫu từ các khách demo (chỉ dùng cho môi trường demo)
 */
const { PrismaClient, Prisma, Role } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { categories, products } = require('./data/catalog');

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

const DEMO_CUSTOMERS = [
  { email: 'lan.nguyen@homeshop.local', fullName: 'Nguyễn Thị Lan' },
  { email: 'minh.tran@homeshop.local', fullName: 'Trần Văn Minh' },
  { email: 'huong.le@homeshop.local', fullName: 'Lê Thu Hương' },
];

const REVIEW_TEXT = {
  5: [
    'Sản phẩm đúng như mô tả, hoàn thiện rất chắc chắn. Giao hàng nhanh, đóng gói cẩn thận. Rất hài lòng!',
    'Dùng được vài tuần rồi, chất lượng vượt mong đợi so với giá tiền. Sẽ tiếp tục ủng hộ shop.',
    'Hàng ngoài đẹp hơn trong ảnh, màu sắc sang trọng. Shop tư vấn nhiệt tình.',
    'Mua làm quà tặng mẹ, mẹ rất thích. Hộp đựng đẹp, giao đúng hẹn.',
  ],
  4: [
    'Chất lượng tốt, dùng ổn định. Trừ một sao vì giao chậm hơn dự kiến một ngày.',
    'Sản phẩm đẹp, đúng mô tả. Hướng dẫn sử dụng hơi ít nhưng dùng một lúc là quen.',
    'Giá hợp lý, chất lượng ổn trong tầm giá. Đóng gói kỹ.',
  ],
  3: ['Sản phẩm dùng tạm ổn, màu thực tế hơi khác ảnh một chút. Giao hàng nhanh.'],
};

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

async function upsertUser(email, password, fullName, role) {
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, fullName, role, passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`  user ${email} (${role})`);
  return user;
}

async function seedReviews(customers) {
  let created = 0;
  for (const p of products) {
    const h = hash(p.slug);
    // ~70% sản phẩm có đánh giá, mỗi sản phẩm 1–4 đánh giá từ các khách demo khác nhau
    if (h % 10 >= 7) continue;
    const product = await prisma.product.findUnique({ where: { slug: p.slug }, select: { id: true } });
    const count = 1 + (h % Math.min(4, customers.length));
    for (let i = 0; i < count; i++) {
      const user = customers[(h + i) % customers.length];
      const roll = (h >>> (i * 3)) % 10;
      const rating = roll < 6 ? 5 : roll < 9 ? 4 : 3;
      const texts = REVIEW_TEXT[rating];
      await prisma.review.upsert({
        where: { productId_userId: { productId: product.id, userId: user.id } },
        update: {},
        create: {
          productId: product.id,
          userId: user.id,
          rating,
          comment: texts[(h + i) % texts.length],
          verifiedPurchase: (h + i) % 3 !== 0,
          createdAt: new Date(Date.now() - ((h >>> i) % 60) * 86_400_000),
        },
      });
      created++;
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

  if (process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) {
    await upsertUser(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD, 'Quản trị viên', Role.ADMIN);
  }

  const customers = [];
  const customerPassword = process.env.SEED_CUSTOMER_PASSWORD;
  if (process.env.SEED_CUSTOMER_EMAIL && customerPassword) {
    customers.push(await upsertUser(process.env.SEED_CUSTOMER_EMAIL, customerPassword, 'Khách hàng Demo', Role.CUSTOMER));
    if (process.env.SEED_DEMO_CUSTOMERS === 'true') {
      for (const c of DEMO_CUSTOMERS) customers.push(await upsertUser(c.email, customerPassword, c.fullName, Role.CUSTOMER));
    }
  }

  if (process.env.SEED_DEMO_REVIEWS === 'true' && customers.length > 0) await seedReviews(customers);

  await clearProductCache();
  console.log('Seed completed');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
