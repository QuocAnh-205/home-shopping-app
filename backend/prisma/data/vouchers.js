/**
 * Bộ voucher bán hàng (giống cách Shopee chia): giảm tiền theo nấc đơn, giảm % có trần, freeship,
 * voucher theo danh mục, mã riêng phải nhập tay, voucher số lượng ít / sắp diễn ra.
 *
 * Seed chỉ TẠO khi chưa có mã (không ghi đè voucher admin đã sửa, không tự gia hạn ngoài local).
 * - startInDays: bắt đầu sau N ngày (mặc định bắt đầu ngay), days: số ngày hiệu lực tính từ lúc bắt đầu
 * - category: slug danh mục (bỏ trống = toàn shop)
 * - isPublic=false: mã riêng, không hiện trong kho, khách phải nhập tay (gửi qua email/fanpage)
 * - FREESHIP value=0 là miễn phí toàn bộ phí ship thường; value>0 là giảm tối đa số tiền đó
 */
module.exports = [
  // ---- Giảm tiền theo nấc giá trị đơn ----
  { code: 'GIAM10K', name: 'Giảm 10K mọi đơn', type: 'FIXED', value: 10_000, minOrderValue: 0, usageLimit: 3000, perUserLimit: 2, days: 14 },
  { code: 'GIAM20K', name: 'Giảm 20K đơn từ 99K', type: 'FIXED', value: 20_000, minOrderValue: 99_000, usageLimit: 2000, perUserLimit: 2, days: 30 },
  { code: 'GIAM30K', name: 'Giảm 30K đơn từ 199K', type: 'FIXED', value: 30_000, minOrderValue: 199_000, usageLimit: 1500, perUserLimit: 2, days: 30 },
  { code: 'GIAM40K', name: 'Giảm 40K đơn từ 299K', type: 'FIXED', value: 40_000, minOrderValue: 299_000, usageLimit: 1200, perUserLimit: 1, days: 30 },
  { code: 'GIAM60K', name: 'Giảm 60K đơn từ 499K', type: 'FIXED', value: 60_000, minOrderValue: 499_000, usageLimit: 1000, perUserLimit: 1, days: 30 },
  { code: 'GIAM80K', name: 'Giảm 80K đơn từ 699K', type: 'FIXED', value: 80_000, minOrderValue: 699_000, usageLimit: 800, perUserLimit: 1, days: 30 },
  { code: 'GIAM100K', name: 'Giảm 100K đơn từ 999K', type: 'FIXED', value: 100_000, minOrderValue: 999_000, usageLimit: 600, perUserLimit: 1, days: 30 },
  { code: 'GIAM150K', name: 'Giảm 150K đơn từ 1,5 triệu', type: 'FIXED', value: 150_000, minOrderValue: 1_500_000, usageLimit: 400, perUserLimit: 1, days: 30 },
  { code: 'GIAM200K', name: 'Giảm 200K đơn từ 2 triệu', type: 'FIXED', value: 200_000, minOrderValue: 2_000_000, usageLimit: 300, perUserLimit: 1, days: 30 },
  { code: 'GIAM300K', name: 'Giảm 300K đơn từ 3 triệu', type: 'FIXED', value: 300_000, minOrderValue: 3_000_000, usageLimit: 200, perUserLimit: 1, days: 30 },
  { code: 'GIAM500K', name: 'Giảm 500K đơn từ 5 triệu', type: 'FIXED', value: 500_000, minOrderValue: 5_000_000, usageLimit: 100, perUserLimit: 1, days: 30 },
  { code: 'GIAM1TR', name: 'Giảm 1 triệu đơn từ 10 triệu', type: 'FIXED', value: 1_000_000, minOrderValue: 10_000_000, usageLimit: 50, perUserLimit: 1, days: 30 },

  // ---- Giảm % có mức giảm tối đa, đơn càng lớn % càng cao ----
  { code: 'SALE5', name: 'Giảm 5% mọi đơn', type: 'PERCENT', value: 5, maxDiscount: 20_000, minOrderValue: 0, usageLimit: 3000, perUserLimit: 3, days: 30 },
  { code: 'SALE8', name: 'Giảm 8% đơn từ 150K', type: 'PERCENT', value: 8, maxDiscount: 40_000, minOrderValue: 150_000, usageLimit: 2000, perUserLimit: 2, days: 30 },
  { code: 'SALE10', name: 'Giảm 10% đơn từ 250K', type: 'PERCENT', value: 10, maxDiscount: 60_000, minOrderValue: 250_000, usageLimit: 1500, perUserLimit: 2, days: 30 },
  { code: 'SALE12', name: 'Giảm 12% đơn từ 500K', type: 'PERCENT', value: 12, maxDiscount: 100_000, minOrderValue: 500_000, usageLimit: 1000, perUserLimit: 1, days: 30 },
  { code: 'SALE15', name: 'Giảm 15% đơn từ 1 triệu', type: 'PERCENT', value: 15, maxDiscount: 200_000, minOrderValue: 1_000_000, usageLimit: 500, perUserLimit: 1, days: 30 },
  { code: 'SALE18', name: 'Giảm 18% đơn từ 2 triệu', type: 'PERCENT', value: 18, maxDiscount: 350_000, minOrderValue: 2_000_000, usageLimit: 300, perUserLimit: 1, days: 30 },
  { code: 'SALE20', name: 'Giảm 20% đơn từ 3 triệu', type: 'PERCENT', value: 20, maxDiscount: 500_000, minOrderValue: 3_000_000, usageLimit: 200, perUserLimit: 1, days: 30 },
  { code: 'SALE25', name: 'Giảm 25% đơn từ 6 triệu', type: 'PERCENT', value: 25, maxDiscount: 1_000_000, minOrderValue: 6_000_000, usageLimit: 80, perUserLimit: 1, days: 30 },

  // ---- Voucher vận chuyển (dùng cùng lúc với 1 voucher giảm giá) ----
  { code: 'SHIP0D', name: 'Freeship đơn từ 0Đ', type: 'FREESHIP', value: 0, minOrderValue: 0, usageLimit: 1000, perUserLimit: 1, days: 14 },
  { code: 'FREESHIP99', name: 'Freeship đơn từ 99K', type: 'FREESHIP', value: 0, minOrderValue: 99_000, usageLimit: 2000, perUserLimit: 3, days: 30 },
  { code: 'FREESHIP199', name: 'Freeship đơn từ 199K', type: 'FREESHIP', value: 0, minOrderValue: 199_000, usageLimit: 3000, perUserLimit: 5, days: 30 },
  { code: 'SHIP10K', name: 'Giảm 10K phí vận chuyển', type: 'FREESHIP', value: 10_000, minOrderValue: 0, usageLimit: 5000, perUserLimit: 5, days: 30 },
  { code: 'SHIP20K', name: 'Giảm 20K phí vận chuyển đơn từ 150K', type: 'FREESHIP', value: 20_000, minOrderValue: 150_000, usageLimit: 3000, perUserLimit: 3, days: 30 },
  { code: 'SHIP30K', name: 'Giảm 30K phí vận chuyển đơn từ 300K', type: 'FREESHIP', value: 30_000, minOrderValue: 300_000, usageLimit: 2000, perUserLimit: 3, days: 30 },
  { code: 'SHIPCONGKENH', name: 'Giảm 100K ship hàng cồng kềnh từ 3 triệu', type: 'FREESHIP', value: 100_000, minOrderValue: 3_000_000, usageLimit: 200, perUserLimit: 1, days: 30 },

  // ---- Theo danh mục ----
  { code: 'BEP10', name: 'Nhà bếp giảm 10%', type: 'PERCENT', value: 10, maxDiscount: 80_000, minOrderValue: 150_000, usageLimit: 600, perUserLimit: 2, days: 30, category: 'nha-bep' },
  { code: 'BEP50K', name: 'Nhà bếp giảm 50K đơn từ 500K', type: 'FIXED', value: 50_000, minOrderValue: 500_000, usageLimit: 400, perUserLimit: 1, days: 30, category: 'nha-bep' },
  { code: 'BANAN12', name: 'Bàn ăn giảm 12%', type: 'PERCENT', value: 12, maxDiscount: 100_000, minOrderValue: 200_000, usageLimit: 400, perUserLimit: 1, days: 30, category: 'ban-an' },
  { code: 'BANAN30K', name: 'Bàn ăn giảm 30K đơn từ 250K', type: 'FIXED', value: 30_000, minOrderValue: 250_000, usageLimit: 500, perUserLimit: 2, days: 30, category: 'ban-an' },
  { code: 'PHONGKHACH8', name: 'Phòng khách giảm 8%', type: 'PERCENT', value: 8, maxDiscount: 500_000, minOrderValue: 1_000_000, usageLimit: 200, perUserLimit: 1, days: 30, category: 'phong-khach' },
  { code: 'SOFA300K', name: 'Phòng khách giảm 300K đơn từ 5 triệu', type: 'FIXED', value: 300_000, minOrderValue: 5_000_000, usageLimit: 100, perUserLimit: 1, days: 30, category: 'phong-khach' },
  { code: 'NGUNGON10', name: 'Phòng ngủ giảm 10%', type: 'PERCENT', value: 10, maxDiscount: 150_000, minOrderValue: 300_000, usageLimit: 400, perUserLimit: 1, days: 30, category: 'phong-ngu' },
  { code: 'NGUNGON50K', name: 'Phòng ngủ giảm 50K đơn từ 600K', type: 'FIXED', value: 50_000, minOrderValue: 600_000, usageLimit: 300, perUserLimit: 1, days: 30, category: 'phong-ngu' },
  { code: 'DIENMAY7', name: 'Điện gia dụng giảm 7%', type: 'PERCENT', value: 7, maxDiscount: 400_000, minOrderValue: 1_000_000, usageLimit: 300, perUserLimit: 1, days: 30, category: 'dien-gia-dung' },
  { code: 'DIENMAY200K', name: 'Điện gia dụng giảm 200K đơn từ 3 triệu', type: 'FIXED', value: 200_000, minOrderValue: 3_000_000, usageLimit: 150, perUserLimit: 1, days: 30, category: 'dien-gia-dung' },
  { code: 'PHONGTAM15', name: 'Phòng tắm giảm 15%', type: 'PERCENT', value: 15, maxDiscount: 60_000, minOrderValue: 120_000, usageLimit: 500, perUserLimit: 2, days: 30, category: 'phong-tam' },
  { code: 'PHONGTAM20K', name: 'Phòng tắm giảm 20K đơn từ 150K', type: 'FIXED', value: 20_000, minOrderValue: 150_000, usageLimit: 600, perUserLimit: 2, days: 30, category: 'phong-tam' },
  { code: 'TRANGTRI15', name: 'Trang trí giảm 15%', type: 'PERCENT', value: 15, maxDiscount: 70_000, minOrderValue: 150_000, usageLimit: 500, perUserLimit: 2, days: 30, category: 'trang-tri' },
  { code: 'TRANGTRI25K', name: 'Trang trí giảm 25K đơn từ 199K', type: 'FIXED', value: 25_000, minOrderValue: 199_000, usageLimit: 600, perUserLimit: 2, days: 30, category: 'trang-tri' },

  // ---- Số lượng ít, hạn ngắn (tạo cảm giác "săn") ----
  { code: 'FLASH50K', name: 'Flash: giảm 50K đơn từ 200K', type: 'FIXED', value: 50_000, minOrderValue: 200_000, usageLimit: 50, perUserLimit: 1, days: 3 },
  { code: 'FLASH30', name: 'Flash: giảm 30% tối đa 150K', type: 'PERCENT', value: 30, maxDiscount: 150_000, minOrderValue: 300_000, usageLimit: 30, perUserLimit: 1, days: 2 },

  // ---- Sắp diễn ra (hiện trong kho voucher với nhãn "sắp diễn ra") ----
  { code: 'SALE1212', name: 'Sale 12.12 giảm 12% tối đa 120K', type: 'PERCENT', value: 12, maxDiscount: 120_000, minOrderValue: 300_000, usageLimit: 1212, perUserLimit: 1, startInDays: 17, days: 3 },
  { code: 'TET2027', name: 'Sắm Tết giảm 150K đơn từ 1,2 triệu', type: 'FIXED', value: 150_000, minOrderValue: 1_200_000, usageLimit: 500, perUserLimit: 1, startInDays: 30, days: 30 },
  { code: 'SHIPTET', name: 'Freeship Tết đơn từ 0Đ', type: 'FREESHIP', value: 0, minOrderValue: 0, usageLimit: 1000, perUserLimit: 2, startInDays: 30, days: 30 },

  // ---- Mã riêng (không công khai, khách phải nhập tay) ----
  { code: 'CHAOBANMOI', name: 'Khách mới giảm 50K đơn từ 150K', type: 'FIXED', value: 50_000, minOrderValue: 150_000, usageLimit: 2000, perUserLimit: 1, days: 60, isPublic: false },
  { code: 'SINHNHAT', name: 'Quà sinh nhật giảm 20% tối đa 200K', type: 'PERCENT', value: 20, maxDiscount: 200_000, minOrderValue: 300_000, usageLimit: 1000, perUserLimit: 1, days: 60, isPublic: false },
  { code: 'FANPAGE30K', name: 'Ưu đãi fanpage giảm 30K đơn từ 199K', type: 'FIXED', value: 30_000, minOrderValue: 199_000, usageLimit: 500, perUserLimit: 1, days: 30, isPublic: false },
  { code: 'KHACHVIP', name: 'Khách thân thiết giảm 10% tối đa 500K', type: 'PERCENT', value: 10, maxDiscount: 500_000, minOrderValue: 1_000_000, usageLimit: 200, perUserLimit: 2, days: 60, isPublic: false },
];
