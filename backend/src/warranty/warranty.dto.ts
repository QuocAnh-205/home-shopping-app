import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';

const strip = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/[\s#.-]/g, '').toLowerCase() : value);

export class WarrantyLookupDto {
  /** Mã đơn in trên hóa đơn: 8 ký tự đầu (vd 3D2290DE) hoặc mã đầy đủ */
  @Transform(strip)
  @Matches(/^[0-9a-f]{8}([0-9a-f]{24})?$/, { message: 'Mã đơn gồm 8 ký tự (0-9, A-F), ví dụ 3D2290DE' })
  orderCode: string;

  /** SĐT nhận hàng của đơn (xác minh chủ đơn, chống dò mã đơn của người khác) */
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s.-]/g, '').replace(/^\+84/, '0') : value))
  @Matches(/^0\d{9}$/, { message: 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0' })
  phone: string;
}
