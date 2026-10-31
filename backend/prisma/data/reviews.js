'use strict';

/**
 * Dữ liệu đánh giá mẫu (chỉ seed khi SEED_DEMO_DATA=true).
 *
 * - reviewers: người đánh giá mẫu. Tài khoản KHÔNG có mật khẩu (passwordHash = null) nên không đăng nhập được —
 *   chỉ để trang sản phẩm có lượng đánh giá tự nhiên. Tài khoản khách để test nằm ở demo-accounts.js.
 * - REVIEW_TEXT: nội dung theo danh mục và số sao, để lời nhận xét khớp với loại sản phẩm.
 */
const reviewers = [
  'Đỗ Minh Khôi', 'Vũ Ngọc Ánh', 'Bùi Thanh Tùng', 'Hoàng Mai Phương', 'Phan Đức Thịnh',
  'Ngô Thu Trang', 'Đặng Hải Yến', 'Trịnh Quang Huy', 'Lý Bảo Ngọc', 'Huỳnh Gia Hân',
  'Mai Tiến Dũng', 'Tô Kim Oanh', 'Châu Thanh Tâm', 'Dương Khánh Linh', 'Lâm Nhật Nam',
  'Võ Mỹ Duyên', 'Cao Hoàng Phúc', 'Kiều Anh Thư', 'Tạ Văn Lộc', 'Quách Ngọc Hà',
].map((fullName, i) => ({ fullName, email: `reviewer${String(i + 1).padStart(2, '0')}@reviews.homeshop.local` }));

const COMMON = {
  5: [
    'Đóng gói rất kỹ, có cả màng xốp chống sốc. Hàng đúng như ảnh, không có gì để chê.',
    'Giao nhanh hơn dự kiến, nhân viên giao hàng thân thiện. Sản phẩm đẹp, chắc chắn.',
    'Lần thứ hai mua ở shop, chất lượng vẫn ổn định như lần đầu. Rất đáng tiền.',
  ],
  4: [
    'Sản phẩm tốt, đúng mô tả. Trừ một sao vì giao chậm hơn hẹn một ngày.',
    'Chất lượng ổn trong tầm giá, đóng gói cẩn thận. Sẽ quay lại khi có khuyến mãi.',
  ],
  3: ['Dùng tạm ổn, màu ngoài thực tế hơi khác ảnh một chút. Shop phản hồi nhanh khi mình hỏi.'],
  2: ['Hộp bị móp nhẹ khi nhận, sản phẩm bên trong vẫn dùng được. Mong shop đóng gói kỹ hơn.'],
};

const REVIEW_TEXT = {
  'dien-gia-dung': {
    5: [
      'Máy chạy êm hơn mình nghĩ, bật lên dùng ngay không cần đọc nhiều hướng dẫn. Bảo hành điện tử tra cứu tiện.',
      'Dùng gần một tháng, máy vẫn chạy ổn định, không nóng, không có mùi nhựa. Rất hài lòng.',
      'Thiết kế gọn, để trong bếp nhìn rất sang. Tiết kiệm điện hơn máy cũ nhà mình.',
      'Mua cho bố mẹ, nút bấm rõ ràng nên ông bà dùng được ngay. Shop gọi điện hướng dẫn tận tình.',
    ],
    4: [
      'Máy dùng tốt, hiệu quả đúng quảng cáo. Dây điện hơi ngắn nên phải dùng thêm ổ cắm nối.',
      'Hoạt động ổn, chỉ là tiếng hơi to ở mức cao nhất. Ở mức trung bình thì rất êm.',
    ],
    3: ['Máy dùng được nhưng sách hướng dẫn tiếng Việt hơi sơ sài, phải xem video mới hiểu hết chức năng.'],
    2: ['Lần đầu nhận máy bị lỗi nút nguồn, shop đổi máy mới nhanh nhưng mình mất thêm mấy ngày chờ.'],
  },
  'nha-bep': {
    5: [
      'Nấu thử mấy bữa rồi, chất liệu dày dặn, rửa rất nhanh sạch. Bếp nhà mình gọn hẳn.',
      'Cầm chắc tay, hoàn thiện kỹ, không có cạnh sắc. Đúng là đồ dùng lâu dài được.',
      'Vợ mình rất thích, ngày nào cũng dùng. Đẹp hơn ảnh và không bị ám mùi thức ăn.',
      'Mua thêm cái thứ hai để tặng chị gái. Chất lượng tương xứng giá tiền.',
    ],
    4: [
      'Dùng tốt, chỉ hơi nặng hơn mình tưởng. Bù lại rất chắc chắn.',
      'Sản phẩm ổn, nên rửa tay thay vì máy rửa bát để giữ mới lâu hơn.',
    ],
    3: ['Chất lượng ổn nhưng kích thước nhỏ hơn mình hình dung, nên đo kỹ trước khi mua.'],
    2: ['Sau vài lần dùng có vết xước nhỏ, vẫn dùng được nhưng không bền như kỳ vọng.'],
  },
  'ban-an': {
    5: [
      'Bày lên bàn ăn nhìn sang hẳn, khách tới nhà ai cũng hỏi mua ở đâu.',
      'Đóng gói từng món riêng, không sứt mẻ gì. Men đẹp, cầm rất thích tay.',
      'Mua đúng dịp giảm giá, chất lượng vượt mong đợi. Rửa máy rửa bát vẫn bền màu.',
      'Màu sắc trang nhã, phối với khăn trải bàn rất hợp. Cả nhà đều khen.',
    ],
    4: [
      'Đẹp, đúng ảnh. Một chiếc có vết men không đều nhưng nhìn kỹ mới thấy.',
      'Chất lượng tốt, kích thước vừa phải cho gia đình 4 người.',
    ],
    3: ['Sản phẩm ổn, màu thực tế nhạt hơn ảnh. Dùng hằng ngày thì vẫn được.'],
    2: ['Nhận được một món bị mẻ cạnh, shop đã gửi bù nhưng hơi lâu.'],
  },
  'phong-khach': {
    5: [
      'Đội giao hàng lắp đặt tận nơi, làm rất nhanh và dọn sạch sẽ. Phòng khách đẹp lên trông thấy.',
      'Chất liệu sờ rất thích, màu đúng như ảnh. Ngồi lâu không bị mỏi.',
      'Đặt ở phòng khách cùng sofa xám rất hợp tông. Đáng đồng tiền.',
      'Hoàn thiện tỉ mỉ, không có mùi sơn hay mùi keo. Rất ưng ý.',
    ],
    4: [
      'Đẹp và chắc, chỉ là giao hàng phải hẹn lại một lần do kho hết hàng.',
      'Chất lượng tốt, màu ngoài đời đậm hơn ảnh một chút nhưng vẫn đẹp.',
    ],
    3: ['Sản phẩm ổn nhưng hướng dẫn lắp ráp hơi khó hiểu, mất khá nhiều thời gian.'],
    2: ['Có một vết xước nhỏ ở mặt sau, shop hỗ trợ sơn dặm nhưng mình vẫn hơi tiếc.'],
  },
  'phong-ngu': {
    5: [
      'Phòng ngủ ấm cúng hơn hẳn. Chất liệu mềm, không có mùi lạ khi mở hộp.',
      'Ngủ ngon hơn từ khi đổi sang món này. Màu nhẹ nhàng, dễ phối đồ.',
      'Hàng đẹp, chắc chắn, đúng kích thước mô tả. Giao nhanh trong 2 ngày.',
      'Mua tặng em gái dọn nhà mới, em rất thích. Sẽ ủng hộ shop dài dài.',
    ],
    4: [
      'Chất lượng tốt, chỉ là màu thật hơi ấm hơn trong ảnh.',
      'Sản phẩm ổn, đóng gói kỹ. Nên giặt trước khi dùng lần đầu.',
    ],
    3: ['Dùng tạm ổn, kích thước hơi nhỏ so với phòng nhà mình.'],
    2: ['Giao thiếu một phụ kiện nhỏ, shop gửi bù sau 3 ngày.'],
  },
  'phong-tam': {
    5: [
      'Dùng trong phòng tắm cả tháng, không gỉ không mốc. Lau một cái là sáng bóng.',
      'Lắp đặt dễ, phòng tắm nhìn gọn gàng và sạch sẽ hơn hẳn.',
      'Chất liệu tốt, khô nhanh dù trời nồm. Rất đáng mua.',
      'Thiết kế tinh tế, hợp phòng tắm tông trắng nhà mình.',
    ],
    4: [
      'Sản phẩm tốt, nhưng nên chuẩn bị thêm keo dán chuyên dụng cho tường gạch men.',
      'Chất lượng ổn, đúng mô tả. Giao hàng hơi chậm.',
    ],
    3: ['Dùng được, chất liệu mỏng hơn mình nghĩ một chút.'],
    2: ['Sau hai tuần có vết ố nhẹ, phải dùng giấm lau mới sạch.'],
  },
  'trang-tri': {
    5: [
      'Đặt lên kệ phòng khách nhìn có điểm nhấn hẳn. Đẹp hơn ảnh rất nhiều.',
      'Món quà tân gia ý nghĩa, bạn mình thích lắm. Đóng gói như quà tặng luôn.',
      'Màu sắc tinh tế, đúng phong cách Japandi mình đang theo đuổi.',
      'Kích thước vừa xinh, mua thêm một cái nữa để đặt bàn làm việc.',
    ],
    4: [
      'Đẹp, đúng mô tả. Mỗi món thủ công hơi khác nhau một chút nên không giống ảnh 100%.',
      'Chất lượng ổn, giá hợp lý. Shop gói hàng rất cẩn thận.',
    ],
    3: ['Sản phẩm xinh nhưng nhỏ hơn mình tưởng, nên xem kỹ kích thước.'],
    2: ['Hàng giao bị bong một chút ở cạnh, shop có hỗ trợ đổi.'],
  },
};

/** Lấy bộ câu nhận xét cho danh mục + số sao (gộp câu chung để đa dạng hơn) */
function reviewTexts(cat, rating) {
  return [...(REVIEW_TEXT[cat]?.[rating] ?? []), ...COMMON[rating]];
}

module.exports = { reviewers, reviewTexts };
