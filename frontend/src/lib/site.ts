/**
 * Thông tin cửa hàng & chính sách – NGUỒN DUY NHẤT cho mọi trang (header, footer, FAQ, trang sản phẩm, điều khoản…).
 * Đổi hotline / giờ làm việc / email / số ngày trả hàng: chỉ sửa ở đây.
 * Ngưỡng miễn phí vận chuyển & số ngày trả hàng phải khớp backend (SHIPPING_FREE_THRESHOLD, RETURN_WINDOW_DAYS).
 */
export const SITE = {
  name: 'Home Shopping',
  hotline: '1900 6868',
  hotlineHref: 'tel:19006868',
  /** Giờ hỗ trợ khách hàng */
  supportHours: '8:00 – 21:00 mỗi ngày',
  supportHoursShort: '8h – 21h',
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hotro@homeshopping.vn',
  /** Trả hàng / hoàn tiền tính từ ngày nhận hàng */
  returnDays: 15,
  freeShipThreshold: 500_000,
  /** Bảo hành chính hãng theo nhóm hàng (chi tiết từng sản phẩm ở bảng thông số) */
  warranty: {
    appliances: '12–24 tháng',
    furniture: '12–36 tháng (khung sườn)',
  },
  /** Hàng cồng kềnh: phụ phí trọn gói mỗi kiện theo vùng (khớp BULKY_RATE ở backend) */
  bulkyFee: { sameProvince: 150_000, sameRegion: 250_000, crossRegion: 350_000 },
} as const;

const vnd = (n: number) => `${n.toLocaleString('vi-VN')}₫`;

/** Câu chữ dùng lại nhiều nơi */
export const POLICY = {
  freeShip: `Miễn phí vận chuyển đơn từ ${vnd(SITE.freeShipThreshold)}`,
  freeShipShort: `Miễn phí ship đơn từ ${SITE.freeShipThreshold / 1000}K`,
  returns: `Trả hàng ${SITE.returnDays} ngày`,
  returnsLong: `Trả hàng/hoàn tiền trong ${SITE.returnDays} ngày kể từ khi nhận hàng`,
  warranty: `Bảo hành chính hãng: điện gia dụng ${SITE.warranty.appliances}, nội thất ${SITE.warranty.furniture}`,
  bulky: `Hàng cồng kềnh (sofa, tủ, nệm…) giao bằng xe tải nhỏ, miễn phí lắp đặt; phụ phí ${vnd(SITE.bulkyFee.sameProvince)}–${vnd(
    SITE.bulkyFee.crossRegion,
  )}/kiện tùy khu vực, không áp dụng miễn phí vận chuyển`,
  support: `Hotline ${SITE.hotline} (${SITE.supportHours})`,
} as const;
