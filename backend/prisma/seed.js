/* eslint-disable no-console */
'use strict';

/**
 * Seed idempotent (chạy lại nhiều lần không tạo trùng): danh mục, sản phẩm mẫu, tài khoản admin/khách demo.
 * Admin & khách demo chỉ được tạo khi có biến môi trường tương ứng → production không có tài khoản mặc định.
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
  { name: 'Nồi chiên không dầu 6L', slug: 'noi-chien-khong-dau-6l', price: '1890000', stock: 120, isHot: true, category: 'dien-gia-dung', description: 'Nồi chiên không dầu dung tích 6 lít, công suất 1700W, 8 chế độ nấu tự động, lòng nồi chống dính men ceramic.' },
  { name: 'Bộ nồi inox 5 món', slug: 'bo-noi-inox-5-mon', price: '1250000', stock: 80, isHot: true, category: 'nha-bep', description: 'Bộ nồi inox 304 ba lớp đáy, dùng được trên mọi loại bếp kể cả bếp từ, nắp kính cường lực.' },
  { name: 'Máy lọc không khí HEPA', slug: 'may-loc-khong-khi-hepa', price: '3490000', stock: 45, isHot: true, category: 'dien-gia-dung', description: 'Màng lọc HEPA H13, phù hợp phòng 40m², cảm biến bụi PM2.5, chế độ ngủ siêu êm 22dB.' },
  { name: 'Sofa băng 3 chỗ', slug: 'sofa-bang-3-cho', price: '7990000', stock: 12, isHot: false, category: 'phong-khach', description: 'Khung gỗ sồi tự nhiên, đệm mút D40 đàn hồi cao, bọc vải chống thấm dễ vệ sinh.' },
  { name: 'Đèn cây đứng LED', slug: 'den-cay-dung-led', price: '890000', stock: 60, isHot: false, category: 'phong-khach', description: 'Đèn LED 3 chế độ màu, điều chỉnh độ sáng vô cấp, chân đế kim loại sơn tĩnh điện.' },
  { name: 'Bộ chăn ga cotton 100%', slug: 'bo-chan-ga-cotton', price: '1150000', stock: 90, isHot: true, category: 'phong-ngu', description: 'Cotton 100% mật độ 300 sợi, kích thước 1m8 x 2m, thoáng mát, không phai màu.' },
  { name: 'Gối cao su non', slug: 'goi-cao-su-non', price: '390000', stock: 200, isHot: false, category: 'phong-ngu', description: 'Cao su non định hình, hỗ trợ đốt sống cổ, vỏ gối tencel tháo rời giặt được.' },
  { name: 'Máy xay sinh tố đa năng', slug: 'may-xay-sinh-to-da-nang', price: '990000', stock: 75, isHot: false, category: 'nha-bep', description: 'Cối thủy tinh 1.5L, động cơ 800W, 6 lưỡi dao inox, kèm cối xay khô.' },
  { name: 'Bàn trà mặt đá', slug: 'ban-tra-mat-da', price: '2450000', stock: 20, isHot: false, category: 'phong-khach', description: 'Mặt đá ceramic vân marble chống trầy, chân thép sơn đen tĩnh điện, kích thước 100x50cm.' },
  { name: 'Kệ gia vị xoay 360°', slug: 'ke-gia-vi-xoay-360', price: '320000', stock: 150, isHot: false, category: 'nha-bep', description: 'Kệ xoay 2 tầng, kèm 16 hũ thủy tinh có nắp, tiết kiệm diện tích bếp.' },
  { name: 'Robot hút bụi lau nhà', slug: 'robot-hut-bui-lau-nha', price: '5990000', stock: 25, isHot: true, category: 'dien-gia-dung', description: 'Lực hút 4000Pa, cảm biến LiDAR vẽ bản đồ, lau rung, điều khiển qua ứng dụng.' },
  { name: 'Ấm siêu tốc 1.7L', slug: 'am-sieu-toc-1-7l', price: '450000', stock: 3, isHot: false, category: 'dien-gia-dung', description: 'Thân inox 2 lớp cách nhiệt, tự ngắt khi sôi, đế xoay 360°.' },
  { name: 'Nệm foam 1m6', slug: 'nem-foam-1m6', price: '4590000', stock: 15, isHot: false, category: 'phong-ngu', description: 'Foam memory 5 vùng nâng đỡ, dày 25cm, vỏ vải kháng khuẩn tháo rời.' },
  { name: 'Đèn ngủ cảm ứng', slug: 'den-ngu-cam-ung', price: '250000', stock: 0, isHot: false, category: 'phong-ngu', description: 'Chạm để bật/tắt, 3 mức sáng, pin sạc USB-C dùng 7 đêm.' },
  { name: 'Vòi sen tăng áp', slug: 'voi-sen-tang-ap', price: '560000', stock: 70, isHot: false, category: 'phong-tam', description: '3 chế độ phun, tăng áp 200%, lõi lọc vitamin C khử clo.' },
  { name: 'Kệ nhà tắm inox 3 tầng', slug: 'ke-nha-tam-inox-3-tang', price: '480000', stock: 8, isHot: false, category: 'phong-tam', description: 'Inox 304 chống gỉ, dán tường không cần khoan, chịu lực 15kg mỗi tầng.' },
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
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: { ...data, categoryId: bySlug.get(category) },
    });
  }
  console.log(`  ${categories.length} categories, ${products.length} products`);

  if (process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) {
    await upsertUser(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD, 'Quản trị viên', Role.ADMIN);
  }
  if (process.env.SEED_CUSTOMER_EMAIL && process.env.SEED_CUSTOMER_PASSWORD) {
    await upsertUser(process.env.SEED_CUSTOMER_EMAIL, process.env.SEED_CUSTOMER_PASSWORD, 'Khách hàng Demo', Role.CUSTOMER);
  }
  console.log('Seed completed');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
