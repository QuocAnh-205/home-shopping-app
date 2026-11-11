'use strict';

/**
 * Biến thể sản phẩm (màu sắc / kích cỡ / dung tích…) theo mô hình "mỗi biến thể là 1 SKU":
 * mỗi lựa chọn có giá, tồn kho, ảnh và thông số riêng (đúng như hàng thật – sofa 2 chỗ và 3 chỗ khác giá, khác kích thước).
 * Các SKU cùng `group` hiển thị chung bộ chọn "<option>: [nhãn] [nhãn]…" ở trang sản phẩm; giỏ hàng / đơn hàng
 * lưu đúng SKU khách chọn nên không cần bảng phụ.
 *
 * group  = mã nhóm (kebab-case), option = tên thuộc tính khách chọn, items = [slug sản phẩm, nhãn hiển thị]
 */
const variantGroups = [
  {
    group: 'sofa-phong-khach',
    option: 'Kích cỡ & chất liệu',
    items: [
      ['sofa-vai-do-cam-2-cho', '2 chỗ · Vải đỏ cam'],
      ['sofa-bang-3-cho', '3 chỗ · Vải bố xám'],
      ['sofa-xam-tay-cuon', '3 chỗ · Tay cuộn xám nhạt'],
      ['sofa-nhung-xanh-luc-bao', '3 chỗ · Nhung xanh lục bảo'],
      ['sofa-ni-xanh-reu', '3 chỗ lưng cao · Nỉ xanh rêu'],
    ],
  },
  {
    group: 'tu-ngan-keo',
    option: 'Kích thước',
    items: [
      ['tu-ngan-keo-son-den-3-tang', '3 tầng · Sơn đen'],
      ['tu-ngan-keo-trang-4-ngan', '4 ngăn · Trắng'],
      ['tu-ngan-keo-go-5-tang', '5 tầng · Gỗ tự nhiên'],
      ['tu-ngan-keo-go-oc-cho-6-ngan', '6 ngăn · Gỗ óc chó'],
    ],
  },
  {
    group: 'tu-dau-giuong',
    option: 'Màu sắc',
    items: [
      ['tu-dau-giuong-trang', 'Trắng'],
      ['tu-dau-giuong-xanh-2-ngan', 'Xanh ngọc'],
      ['tu-dau-giuong-go-oc-cho', 'Gỗ óc chó'],
    ],
  },
  {
    group: 'may-loc-khong-khi',
    option: 'Diện tích phòng',
    items: [
      ['may-loc-khong-khi-mini-de-ban', 'Để bàn · dưới 10 m²'],
      ['may-loc-khong-khi-mini', '15 – 25 m²'],
      ['may-loc-khong-khi-hepa', '30 – 40 m² · HEPA H13'],
    ],
  },
  {
    group: 'robot-hut-bui',
    option: 'Phiên bản',
    items: [
      ['robot-hut-bui-trang', 'Tiêu chuẩn · Trắng'],
      ['robot-hut-bui-lau-nha', 'LiDAR + lau nhà · Đen'],
    ],
  },
  {
    group: 'may-tao-am',
    option: 'Dung tích',
    items: [
      ['may-tao-am-mini-usb', '300 ml · USB'],
      ['may-phun-suong-tao-am', '4 lít · 2 vòi'],
    ],
  },
  {
    group: 'lo-nuong',
    option: 'Dung tích',
    items: [
      ['lo-nuong-mini-12l', '12 lít'],
      ['lo-nuong-doi-luu-25l', '25 lít · Đối lưu'],
    ],
  },
  {
    group: 'quat-ban',
    option: 'Kiểu dáng',
    items: [
      ['quat-ban-long-thep', 'Lồng thép · Đen'],
      ['quat-co-dien-xanh-ngoc', 'Cổ điển · Xanh ngọc'],
    ],
  },
  {
    group: 'may-khuech-tan-tinh-dau',
    option: 'Mẫu',
    items: [
      ['may-khuech-tan-tinh-dau-soc', 'Sọc đen trắng'],
      ['may-khuech-tan-tinh-dau-gom-xanh', 'Gốm xanh'],
    ],
  },
  {
    group: 'chao',
    option: 'Kích cỡ',
    items: [
      ['chao-sau-long-24cm', '24 cm · Sâu lòng'],
      ['chao-chong-dinh-28cm', '28 cm · Cán gỗ'],
    ],
  },
  {
    group: 'noi-gang',
    option: 'Phiên bản',
    items: [
      ['noi-gang-den-nap-nang-4l', 'Gang đen · 4.5 lít'],
      ['noi-gang-trang-men-do-24cm', 'Tráng men đỏ · 24 cm'],
    ],
  },
  {
    group: 'french-press',
    option: 'Dung tích',
    items: [
      ['binh-french-press-600ml', '600 ml · Thủy tinh'],
      ['binh-french-press-thep-1l', '1 lít · Thép xanh'],
    ],
  },
  {
    group: 'binh-giu-nhiet',
    option: 'Màu sắc',
    items: [
      ['binh-giu-nhiet-xanh-reu-500ml', 'Xanh rêu'],
      ['binh-giu-nhiet-den-nham', 'Đen nhám'],
    ],
  },
  {
    group: 'dong-ho-bao-thuc',
    option: 'Màu sắc',
    items: [
      ['dong-ho-bao-thuc-chuong-doi', 'Đen'],
      ['dong-ho-bao-thuc-xanh-mint', 'Xanh mint'],
      ['dong-ho-bao-thuc-do', 'Đỏ'],
    ],
  },
  {
    group: 'chan-len',
    option: 'Màu sắc',
    items: [
      ['chan-len-dan-tay-cam', 'Cam'],
      ['bo-chan-len-dan', 'Pastel'],
      ['chan-len-vang-mu-tat', 'Vàng mù tạt'],
    ],
  },
  {
    group: 'dep-trong-nha',
    option: 'Kiểu',
    items: [
      ['dep-di-trong-nha-long-cuu', 'Lông cừu · Trắng'],
      ['dep-bong-xam-lot-long', 'Bông · Xám'],
    ],
  },
  {
    group: 'ao-choang-tam',
    option: 'Chất liệu',
    items: [
      ['ao-choang-tam-cotton-trang', 'Cotton trắng'],
      ['ao-choang-tam-vai-to-ong', 'Vải tổ ong'],
    ],
  },
  {
    group: 'binh-xa-phong',
    option: 'Màu sắc',
    items: [
      ['binh-xa-phong-thuy-tinh-nau', 'Nâu hổ phách'],
      ['binh-xa-phong-thuy-tinh-xanh', 'Xanh gân'],
    ],
  },
  {
    group: 'guong-tron',
    option: 'Kiểu viền',
    items: [
      ['guong-tron-vien-go', 'Viền gỗ'],
      ['guong-tron-vien-vang', 'Viền kim loại vàng'],
      ['guong-treo-day-da', 'Treo dây da'],
    ],
  },
];

/** slug → { variantGroup, variantName, variantLabel } */
const variantBySlug = new Map(
  variantGroups.flatMap((g) => g.items.map(([slug, label]) => [slug, { variantGroup: g.group, variantName: g.option, variantLabel: label }])),
);

module.exports = { variantGroups, variantBySlug };
