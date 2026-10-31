/* eslint-disable no-console */
'use strict';

/**
 * Seed idempotent (chạy lại nhiều lần không tạo trùng): danh mục, sản phẩm mẫu, tài khoản admin/khách demo.
 * - Sản phẩm đã tồn tại: cập nhật tên, mô tả, ảnh theo dữ liệu mới nhất; GIỮ NGUYÊN giá & tồn kho
 *   (có thể đã được admin chỉnh trên production).
 * - Ảnh mẫu là file tĩnh trong frontend/public/images/products (nguồn: Unsplash, xem CREDITS.md).
 * - Admin & khách demo chỉ được tạo khi có biến môi trường tương ứng → production không có tài khoản mặc định.
 */
const { PrismaClient, Role } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const categories = [
  { name: 'Nhà bếp', slug: 'nha-bep' },
  { name: 'Phòng khách', slug: 'phong-khach' },
  { name: 'Phòng ngủ', slug: 'phong-ngu' },
  { name: 'Điện gia dụng', slug: 'dien-gia-dung' },
  { name: 'Phòng tắm', slug: 'phong-tam' },
];

const products = [
  {
    slug: 'noi-chien-khong-dau-6l',
    name: 'Nồi chiên không dầu điện tử 6.2L',
    category: 'dien-gia-dung', price: '1890000', stock: 120, isHot: true,
    description:
      'Thân máy màu đen bóng sang trọng với núm xoay điều chỉnh nhiệt độ 80–200°C và hẹn giờ đến 60 phút, đèn báo nguồn xanh dễ quan sát.\n' +
      'Công nghệ đối lưu khí nóng tốc độ cao giúp món ăn giòn đều, giảm đến 90% dầu mỡ.\n' +
      'Lòng nồi 6.2L chống dính, giỏ chiên tháo rời rửa được bằng máy rửa bát. Công suất 1700W.',
  },
  {
    slug: 'bo-noi-inox-5-mon',
    name: 'Bộ nồi inox 304 cao cấp 5 món',
    category: 'nha-bep', price: '1250000', stock: 80, isHot: true,
    description:
      'Gồm nồi 16 / 20 / 24 cm, quánh 16 cm và nồi luộc 26 cm, inox 304 đánh bóng gương sáng loáng.\n' +
      'Tay cầm inox tán đinh chắc chắn, nắp khít giữ nhiệt; đáy 3 lớp truyền nhiệt đều, dùng được mọi loại bếp kể cả bếp từ.',
  },
  {
    slug: 'may-loc-khong-khi-hepa',
    name: 'Máy lọc không khí dạng tháp HEPA H13',
    category: 'dien-gia-dung', price: '3490000', stock: 45, isHot: true,
    description:
      'Thiết kế trụ tròn màu trắng tối giản, hút gió 360° từ thân dưới và thổi khí sạch lên trên.\n' +
      'Bộ lọc 3 lớp: màng lọc thô, HEPA H13 giữ lại 99.97% bụi mịn PM2.5 và than hoạt tính khử mùi.\n' +
      'Phù hợp phòng đến 40 m², chế độ ngủ chỉ 22 dB.',
  },
  {
    slug: 'sofa-bang-3-cho',
    name: 'Sofa băng 3 chỗ vải bố xám',
    category: 'phong-khach', price: '7990000', stock: 12, isHot: false,
    description:
      'Bọc vải bố màu xám ghi chống bám bụi, 3 gối tựa lưng rời êm ái, đệm ngồi mút D40 đàn hồi cao.\n' +
      'Tay vịn bo tròn, chân gỗ sồi tự nhiên. Kích thước 210 x 88 x 82 cm, hợp phòng khách hiện đại.',
  },
  {
    slug: 'den-cay-dung-led',
    name: 'Đèn cây chụp vải xếp ly',
    category: 'phong-khach', price: '890000', stock: 60, isHot: false,
    description:
      'Chụp vải xếp ly hình trụ cao, khuếch tán ánh sáng vàng ấm dịu mắt cho góc đọc sách và phòng khách.\n' +
      'Thân thép sơn đen mảnh, đế tròn chắc chắn, chiều cao 160 cm. Đui E27 kèm bóng LED tiết kiệm điện, công tắc chân.',
  },
  {
    slug: 'bo-chan-ga-cotton',
    name: 'Bộ chăn ga gối cotton trắng',
    category: 'phong-ngu', price: '1150000', stock: 90, isHot: true,
    description:
      'Bộ 4 món màu trắng tinh khôi: ga bọc, vỏ chăn và 2 vỏ gối nằm.\n' +
      'Cotton 100% mật độ 300 sợi mềm mát, thấm hút tốt, không xù lông sau nhiều lần giặt. Kích thước 1m8 x 2m.',
  },
  {
    slug: 'goi-cao-su-non',
    name: 'Gối ngủ bông mềm trắng',
    category: 'phong-ngu', price: '390000', stock: 200, isHot: false,
    description:
      'Ruột gối bông microfiber siêu mềm, độ phồng cao, ôm đầu và cổ tự nhiên.\n' +
      'Vỏ cotton trắng có khóa kéo, giặt máy được. Kích thước 50 x 70 cm.',
  },
  {
    slug: 'may-xay-sinh-to-da-nang',
    name: 'Máy xay sinh tố công suất lớn 1.8L',
    category: 'nha-bep', price: '990000', stock: 75, isHot: false,
    description:
      'Cối xay Tritan trong suốt 1.8L không chứa BPA, tay cầm đen chống trượt.\n' +
      'Lưỡi dao inox 6 cánh cùng động cơ mạnh xay nhuyễn rau xanh, trái cây và đá viên chỉ trong 30 giây.',
  },
  {
    slug: 'ban-tra-mat-da',
    name: 'Bàn trà gỗ thông 2 tầng',
    category: 'phong-khach', price: '2450000', stock: 20, isHot: false,
    description:
      'Gỗ thông tự nhiên dày, vân gỗ mộc ấm áp phong cách rustic.\n' +
      'Thiết kế 2 tầng: mặt trên bày trí, tầng dưới để sách báo. Kích thước 110 x 55 x 40 cm.',
  },
  {
    slug: 'ke-gia-vi-xoay-360',
    name: 'Bộ hũ gia vị thủy tinh nắp đen',
    category: 'nha-bep', price: '320000', stock: 150, isHot: false,
    description:
      'Bộ 8 hũ thủy tinh dày trong suốt, nắp kim loại sơn đen có ron cao su kín hơi, giữ gia vị luôn khô thơm.\n' +
      'Kèm nhãn dán ghi tên, xếp gọn đẹp mắt trên kệ bếp.',
  },
  {
    slug: 'robot-hut-bui-lau-nha',
    name: 'Robot hút bụi lau nhà LiDAR',
    category: 'dien-gia-dung', price: '5990000', stock: 25, isHot: true,
    description:
      'Thân robot màu đen nhám, tháp cảm biến LiDAR viền vàng quét laser vẽ bản đồ nhà chính xác.\n' +
      'Lực hút 4000 Pa, lau rung, tự động về sạc; thân mỏng luồn được dưới sofa và giường. Điều khiển qua ứng dụng.',
  },
  {
    slug: 'am-sieu-toc-1-7l',
    name: 'Ấm siêu tốc thủy tinh 1.7L',
    category: 'dien-gia-dung', price: '450000', stock: 3, isHot: false,
    description:
      'Thân thủy tinh borosilicate trong suốt chịu nhiệt, quan sát được nước sôi.\n' +
      'Tay cầm và đế màu đen, đế xoay 360°, tự ngắt khi sôi và chống đun khô. Công suất 2200W.',
  },
  {
    slug: 'nem-foam-1m6',
    name: 'Nệm foam 1m6 vỏ gấm chần bông',
    category: 'phong-ngu', price: '4590000', stock: 15, isHot: false,
    description:
      'Mặt nệm vải gấm trắng chần bông hoa văn trám, êm ái và thoáng khí.\n' +
      'Lõi foam memory 5 vùng nâng đỡ cột sống, dày 25 cm. Kích thước 1m6 x 2m.',
  },
  {
    slug: 'den-ngu-cam-ung',
    name: 'Đèn ngủ cầu thủy tinh mờ',
    category: 'phong-ngu', price: '250000', stock: 0, isHot: false,
    description:
      'Quả cầu thủy tinh mờ cho ánh sáng vàng ấm dịu nhẹ, không chói mắt khi ngủ.\n' +
      'Đế kim loại nhỏ gọn đặt vừa tab đầu giường, 3 mức sáng, cổng sạc USB-C.',
  },
  {
    slug: 'voi-sen-tang-ap',
    name: 'Bộ sen tắm 2 trong 1 mạ vàng',
    category: 'phong-tam', price: '560000', stock: 70, isHot: false,
    description:
      'Bát sen tròn kết hợp tay sen cầm tay, lớp mạ vàng PVD sang trọng chống bong tróc.\n' +
      '3 chế độ phun, công nghệ tăng áp cho dòng nước mạnh kể cả khi áp lực nước yếu. Dây sen đen dài 1.5 m.',
  },
  {
    slug: 'ke-nha-tam-inox-3-tang',
    name: 'Kệ nhà tắm thép sơn đen 3 tầng',
    category: 'phong-tam', price: '480000', stock: 8, isHot: false,
    description:
      'Khung thép sơn tĩnh điện đen nhám chống gỉ, gồm kệ treo tường và kệ đứng 3 tầng.\n' +
      'Để chai lọ, khăn tắm và giỏ đựng đồ gọn gàng; mỗi tầng chịu lực 15 kg.',
  },
];

async function upsertUser(email, password, fullName, role) {
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, fullName, role, passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`  user ${email} (${role})`);
}

async function main() {
  for (const c of categories) {
    await prisma.category.upsert({ where: { slug: c.slug }, update: { name: c.name }, create: c });
  }

  const bySlug = new Map((await prisma.category.findMany()).map((c) => [c.slug, c.id]));
  for (const p of products) {
    const { category, ...data } = p;
    const imageKey = `/images/products/${p.slug}.webp`;
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: { name: p.name, description: p.description, imageKey, categoryId: bySlug.get(category) },
      create: { ...data, imageKey, categoryId: bySlug.get(category) },
    });
  }
  console.log(`  ${categories.length} categories, ${products.length} products`);

  if (process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) {
    await upsertUser(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD, 'Quản trị viên', Role.ADMIN);
  }
  if (process.env.SEED_CUSTOMER_EMAIL && process.env.SEED_CUSTOMER_PASSWORD) {
    await upsertUser(process.env.SEED_CUSTOMER_EMAIL, process.env.SEED_CUSTOMER_PASSWORD, 'Khách hàng Demo', Role.CUSTOMER);
  }

  // Seed thay đổi dữ liệu trực tiếp trong DB → xóa cache sản phẩm trên Redis (nếu cấu hình) để web hiện ngay
  if (process.env.REDIS_URL) {
    const Redis = require('ioredis');
    const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true });
    try {
      await redis.connect();
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', 'cache:products:*', 'COUNT', 200);
        cursor = next;
        if (keys.length) await redis.unlink(...keys);
      } while (cursor !== '0');
    } catch (err) {
      console.warn(`  cache invalidation skipped: ${err.message}`);
    } finally {
      redis.disconnect();
    }
  }
  console.log('Seed completed');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
