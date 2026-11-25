import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalToc } from '@/components/LegalPage';
import { POLICY, SITE } from '@/lib/site';

export const metadata: Metadata = { title: 'Điều khoản sử dụng' };

const vnd = (n: number) => `${n.toLocaleString('vi-VN')}₫`;

const SECTIONS = [
  { id: 'chap-nhan', title: 'Chấp nhận điều khoản' },
  { id: 'giai-thich', title: 'Giải thích từ ngữ' },
  { id: 'dieu-kien', title: 'Điều kiện sử dụng' },
  { id: 'tai-khoan', title: 'Tài khoản' },
  { id: 'bao-mat-tk', title: 'Bảo mật tài khoản' },
  { id: 'san-pham', title: 'Thông tin sản phẩm và giá' },
  { id: 'dat-hang', title: 'Đặt hàng và xác lập hợp đồng' },
  { id: 'thanh-toan', title: 'Thanh toán' },
  { id: 'van-chuyen', title: 'Vận chuyển và giao nhận' },
  { id: 'huy-don', title: 'Hủy đơn hàng' },
  { id: 'tra-hang', title: 'Trả hàng và hoàn tiền' },
  { id: 'bao-hanh', title: 'Bảo hành' },
  { id: 'voucher', title: 'Voucher và chương trình khuyến mãi' },
  { id: 'xu', title: 'Xu thưởng' },
  { id: 'danh-gia', title: 'Đánh giá và nội dung do người dùng đăng' },
  { id: 'hanh-vi-cam', title: 'Các hành vi bị cấm' },
  { id: 'so-huu-tri-tue', title: 'Quyền sở hữu trí tuệ' },
  { id: 'gioi-han', title: 'Giới hạn trách nhiệm' },
  { id: 'bat-kha-khang', title: 'Sự kiện bất khả kháng' },
  { id: 'tam-ngung', title: 'Tạm ngừng, khóa và chấm dứt tài khoản' },
  { id: 'rieng-tu', title: 'Quyền riêng tư' },
  { id: 'khieu-nai', title: 'Khiếu nại và giải quyết tranh chấp' },
  { id: 'thay-doi', title: 'Sửa đổi điều khoản' },
  { id: 'lien-he', title: 'Thông tin liên hệ' },
];

export default function TermsPage() {
  return (
    <LegalPage title="Điều khoản sử dụng" updated="25/11/2026" path="/terms">
      <p>
        Chào mừng bạn đến với {SITE.name}, website mua sắm đồ gia dụng và nội thất trực tuyến. Điều khoản sử dụng này (“Điều khoản”) là thỏa thuận giữa bạn
        và {SITE.name} (“chúng tôi”, “cửa hàng”) về việc truy cập website, tạo tài khoản, mua hàng và sử dụng mọi tính năng liên quan. Vui lòng đọc kỹ trước khi
        sử dụng dịch vụ.
      </p>

      <LegalToc sections={SECTIONS} />

      <h2 id="chap-nhan">1. Chấp nhận điều khoản</h2>
      <p>
        Khi truy cập website, tạo tài khoản (bằng email hoặc bằng tài khoản Google/Facebook) hoặc đặt hàng, bạn xác nhận đã đọc, hiểu và đồng ý tuân thủ Điều
        khoản này cùng <Link href="/privacy">Chính sách bảo mật</Link>. Hai văn bản này là một thể thống nhất. Nếu không đồng ý với bất kỳ nội dung nào, bạn vui
        lòng ngừng sử dụng dịch vụ.
      </p>
      <p>
        Điều khoản được xây dựng trên cơ sở pháp luật Việt Nam về giao dịch điện tử, thương mại điện tử, bảo vệ quyền lợi người tiêu dùng và bảo vệ dữ liệu cá
        nhân. Những vấn đề chưa được quy định trong Điều khoản sẽ áp dụng theo pháp luật hiện hành.
      </p>

      <h2 id="giai-thich">2. Giải thích từ ngữ</h2>
      <ul>
        <li>
          <strong>Website:</strong> trang web {SITE.name} và các trang con, bao gồm cả giao diện lập trình phục vụ website.
        </li>
        <li>
          <strong>Khách hàng, người dùng, “bạn”:</strong> cá nhân truy cập website, dù có tài khoản hay không.
        </li>
        <li>
          <strong>Tài khoản:</strong> tài khoản bạn tạo trên website để đặt hàng, theo dõi đơn, lưu địa chỉ, voucher và xu.
        </li>
        <li>
          <strong>Đơn hàng:</strong> yêu cầu mua hàng bạn gửi qua website, gồm sản phẩm, số lượng, địa chỉ nhận, phương thức thanh toán và tổng tiền.
        </li>
        <li>
          <strong>Voucher:</strong> mã ưu đãi giảm giá hoặc giảm phí vận chuyển do cửa hàng phát hành.
        </li>
        <li>
          <strong>Xu:</strong> điểm thưởng trong chương trình khách hàng thân thiết, quy đổi 1 xu = 1₫ khi thanh toán theo mục 14.
        </li>
      </ul>

      <h2 id="dieu-kien">3. Điều kiện sử dụng</h2>
      <ul>
        <li>
          Bạn phải từ đủ 16 tuổi trở lên. Người dưới 16 tuổi chỉ được sử dụng khi có sự đồng ý và giám sát của cha, mẹ hoặc người giám hộ, và người giám hộ chịu
          trách nhiệm về giao dịch của người đó.
        </li>
        <li>Bạn có năng lực hành vi dân sự để xác lập giao dịch mua bán, hoặc được người đại diện hợp pháp cho phép.</li>
        <li>Thông tin bạn cung cấp (họ tên, email, số điện thoại, địa chỉ) phải chính xác, đầy đủ và là của bạn hoặc của người nhận hàng mà bạn được phép cung cấp.</li>
        <li>Bạn sử dụng dịch vụ cho mục đích mua sắm hợp pháp, không vi phạm pháp luật và không vi phạm các điều cấm tại mục 16.</li>
      </ul>

      <h2 id="tai-khoan">4. Tài khoản</h2>
      <h3>4.1. Đăng ký</h3>
      <ul>
        <li>
          Bạn có thể đăng ký bằng <strong>email và mật khẩu</strong>, hoặc bằng <strong>tài khoản Google</strong> hay <strong>tài khoản Facebook</strong>. Các cách
          đăng ký có giá trị như nhau.
        </li>
        <li>
          Mật khẩu phải dài từ 8 đến 72 ký tự, có ít nhất một chữ hoa, một chữ thường và một chữ số.
        </li>
        <li>
          Khi đăng ký bằng Google/Facebook, bạn đồng ý để chúng tôi nhận họ tên, email và ảnh đại diện công khai từ các dịch vụ này như mô tả trong Chính sách bảo
          mật. Nếu email đó đã có tài khoản và được Google/Facebook xác minh, tài khoản sẽ được liên kết thay vì tạo mới.
        </li>
        <li>Mỗi email chỉ gắn với một tài khoản. Bạn không được tạo tài khoản bằng thông tin của người khác hoặc tạo nhiều tài khoản để trục lợi khuyến mãi.</li>
      </ul>
      <h3>4.2. Quản lý tài khoản</h3>
      <ul>
        <li>Bạn có thể cập nhật hồ sơ, ảnh đại diện, sổ địa chỉ (tối đa 10 địa chỉ, đúng một địa chỉ mặc định) và đổi mật khẩu trong Tài khoản của tôi.</li>
        <li>Bạn có thể liên kết hoặc hủy liên kết Google/Facebook, miễn là tài khoản luôn còn ít nhất một cách đăng nhập.</li>
        <li>
          Bạn có thể tự xóa tài khoản bất cứ lúc nào theo <Link href="/data-deletion">hướng dẫn xóa dữ liệu</Link>. Xóa tài khoản không làm mất nghĩa vụ của bạn với
          các đơn hàng đang xử lý; xu và voucher trong ví sẽ mất và không được quy đổi thành tiền.
        </li>
      </ul>

      <h2 id="bao-mat-tk">5. Bảo mật tài khoản</h2>
      <ul>
        <li>Bạn chịu trách nhiệm giữ bí mật mật khẩu và mọi hoạt động diễn ra dưới tài khoản của mình.</li>
        <li>
          Để bảo vệ bạn, đăng nhập bị tạm khóa 15 phút sau 5 lần nhập sai mật khẩu liên tiếp; phiên đăng nhập hết hạn sau 1 ngày; đổi mật khẩu sẽ đăng xuất mọi thiết
          bị khác.
        </li>
        <li>Liên kết đặt lại mật khẩu gửi qua email chỉ dùng được một lần và hết hạn sau 30 phút.</li>
        <li>
          Nếu nghi ngờ tài khoản bị truy cập trái phép, hãy đổi mật khẩu ngay và báo cho chúng tôi. Chúng tôi không chịu trách nhiệm về thiệt hại phát sinh do bạn để
          lộ mật khẩu, trừ khi lỗi thuộc về hệ thống của chúng tôi.
        </li>
        <li>{SITE.name} không bao giờ yêu cầu bạn cung cấp mật khẩu, mã OTP hay thông tin thẻ qua điện thoại, tin nhắn hoặc email.</li>
      </ul>

      <h2 id="san-pham">6. Thông tin sản phẩm và giá</h2>
      <ul>
        <li>
          Chúng tôi cố gắng mô tả sản phẩm (hình ảnh, kích thước, chất liệu, công suất, dung tích, xuất xứ, thời hạn bảo hành) chính xác nhất. Màu sắc thực tế có thể
          chênh lệch nhẹ so với ảnh do điều kiện chụp và màn hình hiển thị.
        </li>
        <li>Giá niêm yết bằng Việt Nam đồng (₫) và <strong>đã bao gồm thuế giá trị gia tăng (VAT)</strong>. Phí vận chuyển được hiển thị riêng trước khi đặt hàng.</li>
        <li>
          Giá gốc gạch ngang và phần trăm giảm phản ánh mức giá trước khuyến mãi. Giá và số lượng tồn kho có thể thay đổi; giá áp dụng cho đơn là giá tại thời điểm
          đơn được tạo thành công.
        </li>
        <li>
          Nếu có sai sót rõ ràng về giá (ví dụ lỗi nhập liệu khiến giá thấp bất thường), chúng tôi có quyền hủy đơn liên quan, thông báo cho bạn và hoàn lại toàn bộ
          số tiền đã thanh toán (nếu có).
        </li>
        <li>Số liệu “đã bán”, điểm đánh giá trung bình được tính tự động từ dữ liệu thực trên hệ thống.</li>
      </ul>

      <h2 id="dat-hang">7. Đặt hàng và xác lập hợp đồng</h2>
      <ol>
        <li>Bạn chọn sản phẩm vào giỏ (hoặc bấm “Mua ngay”), mỗi sản phẩm tối đa 99 cái trong một đơn.</li>
        <li>
          Tại trang thanh toán, bạn chọn địa chỉ nhận, phương thức thanh toán, voucher và xu. Hệ thống hiển thị đầy đủ tạm tính, phí vận chuyển, các khoản giảm và
          tổng tiền phải trả.
        </li>
        <li>
          Khi bấm đặt hàng, hệ thống kiểm tra lại giá, tồn kho và điều kiện voucher. Nếu có thay đổi so với lúc bạn xem, bạn sẽ được thông báo để xác nhận lại trước khi
          đơn được tạo.
        </li>
        <li>
          Đơn hàng được tạo thành công khi bạn nhận được mã đơn và đơn xuất hiện trong mục Đơn mua. Hợp đồng mua bán được xác lập khi cửa hàng xác nhận đơn (trạng
          thái chuyển sang “Đang chuẩn bị hàng”).
        </li>
        <li>
          Các trạng thái đơn hàng: Chờ thanh toán → Chờ xác nhận → Đang chuẩn bị hàng → Đang giao → Đã giao → Hoàn thành. Ngoài ra có các trạng thái Đã hủy, Yêu
          cầu trả hàng/hoàn tiền và Đã trả hàng/hoàn tiền. Mọi thay đổi trạng thái đều được thông báo trong mục Thông báo.
        </li>
        <li>Chúng tôi có quyền từ chối hoặc hủy đơn có dấu hiệu gian lận, đặt hàng ảo, thông tin nhận hàng không liên lạc được, hoặc sản phẩm hết hàng ngoài dự kiến.</li>
      </ol>

      <h2 id="thanh-toan">8. Thanh toán</h2>
      <ul>
        <li>
          <strong>Thanh toán khi nhận hàng (COD):</strong> bạn được kiểm tra hàng (ngoại quan, đúng mẫu, đúng số lượng) trước khi trả tiền cho nhân viên giao hàng.
        </li>
        <li>
          <strong>Thanh toán online qua VNPay hoặc ví MoMo:</strong> đơn được giữ hàng trong 15 phút ở trạng thái “Chờ thanh toán”. Quá thời hạn mà chưa thanh toán,
          đơn tự hủy, hàng được trả về kho và voucher được hoàn lượt. Trong thời gian này bạn có thể thanh toán lại hoặc đổi sang COD.
        </li>
        <li>
          <strong>Chuyển khoản VietQR:</strong> quét mã QR bằng ứng dụng ngân hàng và chuyển đúng số tiền, đúng nội dung. Sau khi bạn bấm “Tôi đã chuyển khoản”, đơn
          được giữ thêm tối đa 24 giờ để cửa hàng đối soát.
        </li>
        <li>
          Kết quả thanh toán online do cổng thanh toán gửi về được kiểm tra chữ ký điện tử và đối chiếu số tiền; giao dịch có số tiền không khớp với đơn sẽ bị từ chối.
        </li>
        <li>
          Thông tin thẻ và ví do VNPay, MoMo, ngân hàng xử lý theo quy định của họ; {SITE.name} không lưu số thẻ, mã OTP hay mật khẩu ngân hàng của bạn.
        </li>
        <li>Các phương thức thanh toán đang khả dụng luôn được hiển thị ở trang thanh toán và có thể thay đổi theo từng thời điểm.</li>
      </ul>

      <h2 id="van-chuyen">9. Vận chuyển và giao nhận</h2>
      <ul>
        <li>Chúng tôi giao hàng trên toàn quốc. Phí vận chuyển tính theo địa chỉ nhận và khối lượng gói hàng, luôn hiển thị trước khi bạn đặt hàng.</li>
        <li>{POLICY.freeShip} (áp dụng cho hàng thông thường).</li>
        <li>{POLICY.bulky}.</li>
        <li>
          Thời gian giao dự kiến hiển thị ở trang thanh toán chỉ mang tính tham khảo; có thể chậm hơn do thời tiết, dịch bệnh, ngày lễ, địa chỉ ở vùng sâu vùng xa hoặc
          sự kiện bất khả kháng.
        </li>
        <li>
          Khi nhận hàng, bạn vui lòng kiểm tra tình trạng bên ngoài kiện hàng. Nếu kiện hàng móp méo, rách, có dấu hiệu bị mở, hãy từ chối nhận hoặc chụp ảnh lại và
          báo ngay cho chúng tôi.
        </li>
        <li>
          Sau khi đơn ở trạng thái “Đã giao”, bạn có thể bấm “Đã nhận hàng” để hoàn thành đơn. Nếu bạn không thao tác và không gửi yêu cầu trả hàng, đơn tự chuyển
          sang “Hoàn thành” sau 3 ngày.
        </li>
        <li>Rủi ro đối với hàng hóa chuyển sang bạn kể từ thời điểm bạn (hoặc người được bạn ủy quyền) ký nhận hàng.</li>
      </ul>

      <h2 id="huy-don">10. Hủy đơn hàng</h2>
      <ul>
        <li>
          <strong>Bạn tự hủy được</strong> khi đơn đang ở trạng thái “Chờ thanh toán” hoặc “Chờ xác nhận”, ngay trong mục Đơn mua.
        </li>
        <li>
          Khi đơn đã chuyển sang “Đang chuẩn bị hàng” hoặc “Đang giao”, bạn không tự hủy được; vui lòng liên hệ hotline để được hỗ trợ.
        </li>
        <li>Cửa hàng có thể hủy đơn trong các trường hợp nêu ở mục 6 và mục 7, và sẽ thông báo lý do cho bạn.</li>
        <li>
          Khi đơn bị hủy: hàng được trả về kho, voucher được hoàn lượt dùng, xu đã dùng được trả lại ví xu, và tiền đã thanh toán online được hoàn về phương thức thanh
          toán ban đầu (thời gian tiền về tài khoản phụ thuộc ngân hàng hoặc ví điện tử).
        </li>
      </ul>

      <h2 id="tra-hang">11. Trả hàng và hoàn tiền</h2>
      <ul>
        <li>{POLICY.returnsLong}.</li>
        <li>
          Bạn gửi yêu cầu trong mục Đơn mua, nêu lý do và đính kèm tối đa 5 ảnh minh chứng. Các lý do được chấp nhận gồm: hàng lỗi do nhà sản xuất, hàng bị hư hỏng trong
          quá trình vận chuyển, giao sai mẫu, sai màu, sai kích thước, thiếu hàng hoặc thiếu phụ kiện.
        </li>
        <li>
          Sản phẩm trả lại cần còn đầy đủ phụ kiện, quà tặng kèm (nếu có), chưa qua sử dụng hoặc chỉ dùng thử để kiểm tra, không bị hư hỏng do người dùng (rơi vỡ, vào
          nước, tự ý sửa chữa).
        </li>
        <li>Cửa hàng xem xét và phản hồi yêu cầu. Nếu yêu cầu bị từ chối, đơn trở về trạng thái “Hoàn thành” kèm lý do.</li>
        <li>
          Khi yêu cầu được chấp nhận: đơn thanh toán online được hoàn tiền về phương thức đã dùng; đơn COD hoặc chuyển khoản được hoàn vào tài khoản ngân hàng bạn khai
          báo. Xu đã dùng được trả lại, xu đã được thưởng từ đơn đó bị thu hồi.
        </li>
        <li>Quyền trả hàng theo mục này không làm mất các quyền khác của người tiêu dùng theo quy định của pháp luật.</li>
      </ul>

      <h2 id="bao-hanh">12. Bảo hành</h2>
      <ul>
        <li>{POLICY.warranty}, tính từ ngày nhận hàng. Thời hạn bảo hành cụ thể của từng sản phẩm được ghi ở bảng thông số trên trang sản phẩm.</li>
        <li>
          Bạn có thể tra cứu tình trạng và thời hạn bảo hành tại trang <Link href="/warranty">Tra cứu bảo hành</Link>.
        </li>
        <li>
          Bảo hành không áp dụng cho hư hỏng do sử dụng sai hướng dẫn, rơi vỡ, va đập, vào nước, côn trùng, thiên tai, dùng sai điện áp, tự ý tháo lắp hoặc sửa chữa,
          và các bộ phận hao mòn tự nhiên.
        </li>
      </ul>

      <h2 id="voucher">13. Voucher và chương trình khuyến mãi</h2>
      <ul>
        <li>
          Mỗi đơn hàng dùng tối đa <strong>1 voucher giảm giá</strong> và <strong>1 voucher vận chuyển</strong>. Voucher không quy đổi thành tiền mặt và không chuyển
          nhượng.
        </li>
        <li>
          Mỗi voucher có điều kiện riêng hiển thị kèm theo: giá trị đơn tối thiểu, mức giảm tối đa (với voucher giảm theo %), danh mục hoặc sản phẩm áp dụng, thời
          gian hiệu lực, tổng số lượt và số lượt tối đa mỗi tài khoản. Giá trị đơn tối thiểu được tính trên các sản phẩm thuộc phạm vi áp dụng.
        </li>
        <li>
          Voucher hết hạn, hết lượt hoặc chưa tới ngày bắt đầu không áp dụng được; trang thanh toán ghi rõ lý do (ví dụ “Mua thêm 50.000₫”).
        </li>
        <li>Voucher công khai có thể lưu vào ví; mã riêng chỉ dùng được khi bạn nhập đúng mã.</li>
        <li>Khi đơn bị hủy, voucher đã dùng được hoàn lại lượt (nếu voucher còn hạn).</li>
        <li>
          Chương trình khuyến mãi (Flash Sale, giảm giá theo mùa) có số lượng và thời gian giới hạn; cửa hàng có quyền kết thúc sớm khi hết số lượng ưu đãi.
        </li>
        <li>
          Chúng tôi có quyền thu hồi ưu đãi và hủy đơn hàng có dấu hiệu lạm dụng voucher: tạo nhiều tài khoản, dùng công cụ tự động, gian lận đơn hàng.
        </li>
      </ul>

      <h2 id="xu">14. Xu thưởng</h2>
      <ul>
        <li>Bạn được cộng xu khi đơn hàng chuyển sang “Hoàn thành”, theo tỷ lệ phần trăm giá trị đơn do cửa hàng công bố trong mục Xu của tôi.</li>
        <li>Bạn được thưởng xu khi đánh giá lần đầu một sản phẩm đã mua.</li>
        <li>Khi thanh toán, 1 xu = 1₫, dùng tối đa một tỷ lệ nhất định trên số tiền của đơn (hiển thị ở trang thanh toán).</li>
        <li>Đơn bị hủy hoặc trả hàng: xu đã dùng được trả lại; xu đã thưởng từ đơn trả hàng bị thu hồi.</li>
        <li>Xu không có giá trị quy đổi thành tiền mặt, không chuyển nhượng, và mất khi bạn xóa tài khoản.</li>
        <li>Mọi giao dịch cộng/trừ xu được ghi lại và bạn có thể xem lịch sử trong mục Xu của tôi.</li>
      </ul>

      <h2 id="danh-gia">15. Đánh giá và nội dung do người dùng đăng</h2>
      <ul>
        <li>
          Mỗi tài khoản viết được một đánh giá cho mỗi sản phẩm (từ 1 đến 5 sao, nội dung tối đa 1.000 ký tự) và có thể sửa hoặc xóa bất cứ lúc nào. Đánh giá của
          khách đã mua sản phẩm được gắn nhãn “Đã mua hàng”.
        </li>
        <li>
          Nội dung phải trung thực, dựa trên trải nghiệm thật, không xúc phạm, không phân biệt đối xử, không chứa thông tin cá nhân của người khác, không quảng cáo,
          không chứa liên kết độc hại và không vi phạm pháp luật.
        </li>
        <li>
          Bạn giữ quyền đối với nội dung mình đăng, đồng thời cho phép {SITE.name} hiển thị nội dung đó trên website, không độc quyền và miễn phí, trong thời gian
          nội dung còn được đăng.
        </li>
        <li>Quản trị viên có quyền gỡ đánh giá vi phạm mà không cần báo trước.</li>
        <li>Ảnh bạn tải lên (ảnh đại diện, ảnh minh chứng trả hàng) phải là ảnh bạn có quyền sử dụng và không vi phạm thuần phong mỹ tục.</li>
      </ul>

      <h2 id="hanh-vi-cam">16. Các hành vi bị cấm</h2>
      <p>Khi sử dụng website, bạn không được:</p>
      <ul>
        <li>Cung cấp thông tin giả, mạo danh người khác hoặc sử dụng tài khoản của người khác khi chưa được phép.</li>
        <li>Đặt hàng ảo, đặt hàng rồi cố ý không nhận nhiều lần, hoặc gây rối hoạt động kinh doanh của cửa hàng.</li>
        <li>Lạm dụng voucher, xu, chương trình khuyến mãi bằng nhiều tài khoản hoặc thủ đoạn gian lận.</li>
        <li>
          Truy cập trái phép, dò quét lỗ hổng, tấn công từ chối dịch vụ, chèn mã độc, can thiệp vào hệ thống hoặc dữ liệu của người khác.
        </li>
        <li>Dùng công cụ tự động (bot, crawler) để thu thập dữ liệu hàng loạt, đặt hàng hoặc săn voucher, trừ khi được chúng tôi cho phép bằng văn bản.</li>
        <li>Đăng nội dung vi phạm pháp luật, xúc phạm danh dự, nhân phẩm người khác, vi phạm quyền sở hữu trí tuệ hoặc quyền riêng tư của bên thứ ba.</li>
        <li>Mua hàng nhằm mục đích bán lại khi chương trình khuyến mãi có ghi rõ giới hạn số lượng cho mỗi khách.</li>
      </ul>
      <p>Vi phạm có thể dẫn đến việc hủy đơn, thu hồi ưu đãi, khóa tài khoản và, khi cần, chuyển thông tin cho cơ quan có thẩm quyền.</p>

      <h2 id="so-huu-tri-tue">17. Quyền sở hữu trí tuệ</h2>
      <p>
        Giao diện, bố cục, logo, tên gọi {SITE.name}, mã nguồn, nội dung mô tả và hình ảnh do chúng tôi tạo ra thuộc quyền sở hữu của chúng tôi hoặc được sử dụng
        hợp pháp theo giấy phép của chủ sở hữu (ảnh sản phẩm minh họa lấy từ Unsplash theo Giấy phép Unsplash). Bạn không được sao chép, phân phối, sửa đổi hay sử
        dụng cho mục đích thương mại khi chưa có sự đồng ý bằng văn bản. Tên và biểu tượng Google, Facebook, VNPay, MoMo, VietQR thuộc về chủ sở hữu tương ứng và
        chỉ được hiển thị để nhận diện phương thức đăng nhập, thanh toán.
      </p>

      <h2 id="gioi-han">18. Giới hạn trách nhiệm</h2>
      <ul>
        <li>
          Chúng tôi nỗ lực duy trì website hoạt động liên tục, chính xác và an toàn, nhưng không bảo đảm website không bao giờ gián đoạn hay không có lỗi. Website có
          thể tạm ngừng để bảo trì, nâng cấp; chúng tôi sẽ cố gắng thực hiện vào khung giờ ít ảnh hưởng nhất.
        </li>
        <li>
          Trong phạm vi pháp luật cho phép, trách nhiệm của chúng tôi đối với một đơn hàng không vượt quá giá trị bạn đã thanh toán cho đơn hàng đó. Chúng tôi không
          chịu trách nhiệm đối với thiệt hại gián tiếp như mất lợi nhuận, mất cơ hội kinh doanh.
        </li>
        <li>
          Chúng tôi không chịu trách nhiệm đối với nội dung, chính sách và hoạt động của website, dịch vụ bên thứ ba (cổng thanh toán, ngân hàng, mạng xã hội, đơn vị
          vận chuyển) ngoài phạm vi kiểm soát của mình, nhưng sẽ phối hợp hỗ trợ bạn khi có vấn đề.
        </li>
        <li>Giới hạn này không loại trừ các trách nhiệm mà pháp luật về bảo vệ quyền lợi người tiêu dùng không cho phép loại trừ.</li>
      </ul>

      <h2 id="bat-kha-khang">19. Sự kiện bất khả kháng</h2>
      <p>
        Chúng tôi không bị coi là vi phạm nghĩa vụ khi việc chậm trễ hoặc không thực hiện được là do sự kiện bất khả kháng như thiên tai, hỏa hoạn, dịch bệnh, chiến
        tranh, bạo loạn, quyết định của cơ quan nhà nước, sự cố mạng viễn thông hoặc điện lực diện rộng, sự cố của nhà cung cấp hạ tầng. Khi xảy ra, chúng tôi sẽ
        thông báo cho bạn và nỗ lực khắc phục sớm nhất; bạn có quyền hủy đơn bị ảnh hưởng và được hoàn tiền đầy đủ.
      </p>

      <h2 id="tam-ngung">20. Tạm ngừng, khóa và chấm dứt tài khoản</h2>
      <ul>
        <li>
          Chúng tôi có quyền tạm khóa hoặc khóa vĩnh viễn tài khoản vi phạm Điều khoản, có dấu hiệu gian lận, lạm dụng hệ thống hoặc theo yêu cầu của cơ quan có thẩm
          quyền. Khi bị khóa, mọi phiên đăng nhập bị thu hồi và tài khoản không đăng nhập được bằng bất kỳ cách nào, kể cả Google/Facebook.
        </li>
        <li>Bạn có thể liên hệ hotline hoặc email để được biết lý do khóa, giải trình và đề nghị mở khóa.</li>
        <li>Bạn có thể chấm dứt sử dụng dịch vụ bất cứ lúc nào bằng cách xóa tài khoản.</li>
        <li>Các đơn hàng đã xác lập trước khi chấm dứt vẫn được xử lý theo Điều khoản này.</li>
      </ul>

      <h2 id="rieng-tu">21. Quyền riêng tư</h2>
      <p>
        Việc thu thập, sử dụng, lưu trữ và bảo vệ dữ liệu cá nhân của bạn tuân theo <Link href="/privacy">Chính sách bảo mật</Link>. Bạn có thể{' '}
        <Link href="/data-deletion">xóa tài khoản và dữ liệu</Link> bất cứ lúc nào.
      </p>

      <h2 id="khieu-nai">22. Khiếu nại và giải quyết tranh chấp</h2>
      <ol>
        <li>
          Mọi khiếu nại vui lòng gửi qua hotline {SITE.hotline} hoặc email {SITE.email}, kèm mã đơn hàng, mô tả sự việc và hình ảnh liên quan (nếu có).
        </li>
        <li>Chúng tôi tiếp nhận, phản hồi và giải quyết khiếu nại trong thời hạn pháp luật về bảo vệ quyền lợi người tiêu dùng quy định.</li>
        <li>
          Tranh chấp được ưu tiên giải quyết bằng thương lượng, hòa giải trên tinh thần thiện chí. Nếu không đạt được thỏa thuận, mỗi bên có quyền yêu cầu cơ quan
          nhà nước có thẩm quyền hoặc Tòa án giải quyết theo pháp luật Việt Nam.
        </li>
        <li>Điều khoản này được điều chỉnh và giải thích theo pháp luật Việt Nam.</li>
      </ol>

      <h2 id="thay-doi">23. Sửa đổi điều khoản</h2>
      <p>
        Chúng tôi có thể sửa đổi Điều khoản để phù hợp với tính năng mới hoặc quy định pháp luật mới. Ngày cập nhật gần nhất luôn ghi ở đầu trang; thay đổi quan
        trọng sẽ được thông báo trên website. Điều khoản mới có hiệu lực kể từ ngày đăng tải và áp dụng cho các đơn hàng tạo sau thời điểm đó; đơn hàng tạo trước
        tiếp tục áp dụng điều khoản tại thời điểm đặt. Nếu một điều khoản bị xem là vô hiệu, các điều khoản còn lại vẫn giữ nguyên hiệu lực.
      </p>

      <h2 id="lien-he">24. Thông tin liên hệ</h2>
      <ul>
        <li>
          Chủ sở hữu website: <strong>Nguyễn Quốc Anh</strong>
        </li>
        <li>
          Hotline: <a href={SITE.hotlineHref}>{SITE.hotline}</a> ({SITE.supportHours})
        </li>
        <li>
          Email hỗ trợ: <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
        </li>
        <li>
          Miễn phí vận chuyển đơn từ {vnd(SITE.freeShipThreshold)} · Trả hàng {SITE.returnDays} ngày · Kiểm tra hàng trước khi thanh toán (COD)
        </li>
      </ul>
      <p>Cảm ơn bạn đã tin tưởng mua sắm tại {SITE.name}!</p>
    </LegalPage>
  );
}
