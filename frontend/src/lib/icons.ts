import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faBath, faBed, faCouch, faHouseChimney, faKitchenSet, faPalette, faPlug, faUtensils } from '@fortawesome/free-solid-svg-icons';

const CATEGORY_ICON: Record<string, IconDefinition> = {
  'nha-bep': faKitchenSet,
  'ban-an': faUtensils,
  'phong-khach': faCouch,
  'phong-ngu': faBed,
  'dien-gia-dung': faPlug,
  'phong-tam': faBath,
  'trang-tri': faPalette,
};

/** Icon nhỏ cạnh tên danh mục (chip, nhãn) — KHÔNG dùng thay ảnh sản phẩm */
export function categoryIcon(slug?: string): IconDefinition {
  return (slug && CATEGORY_ICON[slug]) || faHouseChimney;
}

/** Ảnh đại diện danh mục (file tĩnh trong public/images/site) */
export function categoryImage(slug: string): string | null {
  return slug in CATEGORY_ICON ? `/images/site/cat-${slug}.webp` : null;
}

/** Hướng dẫn sử dụng & bảo quản theo danh mục (hiển thị ở trang chi tiết sản phẩm) */
export const CARE_GUIDE: Record<string, string[]> = {
  'dien-gia-dung': [
    'Đọc kỹ hướng dẫn sử dụng đi kèm trước lần dùng đầu tiên.',
    'Cắm điện trực tiếp vào ổ 220V, tránh dùng chung ổ cắm với thiết bị công suất lớn.',
    'Rút phích cắm và để nguội hoàn toàn trước khi vệ sinh.',
    'Không ngâm thân máy vào nước; lau bằng khăn ẩm mềm.',
  ],
  'nha-bep': [
    'Rửa sạch bằng nước ấm và xà phòng trước lần sử dụng đầu tiên.',
    'Dùng dụng cụ gỗ hoặc silicon để giữ bề mặt chống dính bền lâu.',
    'Tránh sốc nhiệt: không đổ nước lạnh vào dụng cụ đang nóng.',
    'Lau khô và cất nơi thoáng mát sau khi rửa.',
  ],
  'ban-an': [
    'Rửa bằng nước ấm và nước rửa chén trung tính trước khi dùng.',
    'Sản phẩm có viền kim loại không dùng trong lò vi sóng.',
    'Xếp chồng nhẹ nhàng, lót khăn giữa các món để tránh trầy xước.',
  ],
  'phong-khach': [
    'Đặt xa nguồn nhiệt và tránh ánh nắng chiếu trực tiếp lâu ngày.',
    'Hút bụi định kỳ hằng tuần; xử lý vết bẩn ngay bằng khăn ẩm.',
    'Dùng miếng lót chân để bảo vệ sàn gỗ.',
  ],
  'phong-ngu': [
    'Giặt riêng lần đầu ở nhiệt độ dưới 40°C với chế độ nhẹ.',
    'Phơi nơi thoáng gió, tránh nắng gắt để giữ màu bền đẹp.',
    'Thay ga gối 1–2 tuần/lần để đảm bảo vệ sinh giấc ngủ.',
  ],
  'phong-tam': [
    'Lau khô bề mặt sau khi sử dụng để tránh đọng cặn nước.',
    'Vệ sinh bằng dung dịch trung tính, không dùng chất tẩy có tính axit mạnh.',
    'Kiểm tra và siết lại ốc vít định kỳ 6 tháng/lần.',
  ],
  'trang-tri': [
    'Lau bụi bằng khăn khô mềm hoặc chổi lông.',
    'Đặt nơi khô ráo, tránh va đập với đồ gốm, thủy tinh.',
    'Với cây xanh: tưới khi đất khô 2–3 cm bề mặt, để nơi có ánh sáng tán xạ.',
  ],
};
