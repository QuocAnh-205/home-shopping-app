import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalToc } from '@/components/LegalPage';
import { SITE } from '@/lib/site';

export const metadata: Metadata = { title: 'Chính sách bảo mật' };

const SECTIONS = [
  { id: 'pham-vi', title: 'Phạm vi áp dụng và định nghĩa' },
  { id: 'thu-thap', title: 'Dữ liệu cá nhân chúng tôi thu thập' },
  { id: 'mang-xa-hoi', title: 'Đăng ký và đăng nhập bằng Google, Facebook' },
  { id: 'nguon', title: 'Cách chúng tôi thu thập dữ liệu' },
  { id: 'muc-dich', title: 'Mục đích xử lý dữ liệu' },
  { id: 'co-so', title: 'Cơ sở xử lý dữ liệu' },
  { id: 'thanh-toan', title: 'Dữ liệu thanh toán và hoàn tiền' },
  { id: 'vi-tri', title: 'Dữ liệu vị trí và địa chỉ giao hàng' },
  { id: 'chia-se', title: 'Chia sẻ dữ liệu với bên thứ ba' },
  { id: 'cong-khai', title: 'Thông tin hiển thị công khai' },
  { id: 'luu-tru', title: 'Nơi lưu trữ và chuyển dữ liệu ra nước ngoài' },
  { id: 'thoi-han', title: 'Thời gian lưu trữ' },
  { id: 'bao-mat', title: 'Biện pháp bảo vệ dữ liệu' },
  { id: 'cookie', title: 'Cookie và bộ nhớ trình duyệt' },
  { id: 'email', title: 'Email, thông báo và bản tin' },
  { id: 'quyen', title: 'Quyền của bạn đối với dữ liệu cá nhân' },
  { id: 'xoa', title: 'Xóa tài khoản và dữ liệu' },
  { id: 'tre-em', title: 'Dữ liệu của trẻ em' },
  { id: 'su-co', title: 'Xử lý sự cố lộ lọt dữ liệu' },
  { id: 'thay-doi', title: 'Thay đổi chính sách' },
  { id: 'lien-he', title: 'Liên hệ' },
];

export default function PrivacyPage() {
  return (
    <LegalPage title="Chính sách bảo mật" updated="25/11/2026" path="/privacy">
      <p>
        {SITE.name} (“chúng tôi”, “cửa hàng”) tôn trọng và cam kết bảo vệ quyền riêng tư của mọi khách hàng truy cập và mua sắm trên website. Chính sách
        này giải thích một cách đầy đủ, dễ hiểu: chúng tôi thu thập những dữ liệu cá nhân nào, thu thập bằng cách nào, dùng vào việc gì, chia sẻ cho ai,
        lưu ở đâu và trong bao lâu, bảo vệ ra sao, và bạn có những quyền gì đối với dữ liệu của mình.
      </p>
      <p>
        Chính sách được xây dựng phù hợp với quy định của pháp luật Việt Nam về bảo vệ dữ liệu cá nhân, an ninh mạng, thương mại điện tử và bảo vệ quyền
        lợi người tiêu dùng, đồng thời đáp ứng yêu cầu của Google và Meta (Facebook) đối với các ứng dụng sử dụng tính năng đăng nhập của họ. Bằng việc
        tạo tài khoản, đăng nhập hoặc đặt hàng, bạn xác nhận đã đọc và đồng ý với Chính sách này. Nếu không đồng ý, bạn vui lòng ngừng sử dụng dịch vụ.
      </p>

      <LegalToc sections={SECTIONS} />

      <h2 id="pham-vi">1. Phạm vi áp dụng và định nghĩa</h2>
      <p>
        Chính sách áp dụng cho website {SITE.name}, các trang con, giao diện lập trình (API) phục vụ website và mọi kênh hỗ trợ khách hàng do chúng tôi trực
        tiếp vận hành (email, hotline). Chính sách không áp dụng cho website, ứng dụng của bên thứ ba mà bạn truy cập thông qua liên kết trên trang của chúng
        tôi (ví dụ cổng thanh toán VNPay, ví MoMo, ứng dụng ngân hàng, trang đăng nhập của Google hoặc Facebook); các bên đó có chính sách quyền riêng tư
        riêng mà bạn nên tham khảo.
      </p>
      <ul>
        <li>
          <strong>Dữ liệu cá nhân:</strong> thông tin dưới dạng ký hiệu, chữ viết, chữ số, hình ảnh, âm thanh hoặc dạng tương tự gắn với một con người cụ thể
          hoặc giúp xác định một con người cụ thể, ví dụ họ tên, email, số điện thoại, địa chỉ.
        </li>
        <li>
          <strong>Xử lý dữ liệu:</strong> bất kỳ thao tác nào với dữ liệu cá nhân như thu thập, ghi, phân tích, lưu trữ, chỉnh sửa, cung cấp, truy cập,
          truy xuất, mã hóa, giải mã, sao chép, chuyển giao, xóa, hủy.
        </li>
        <li>
          <strong>Chủ thể dữ liệu (“bạn”):</strong> người dùng có dữ liệu cá nhân được xử lý, bao gồm khách vãng lai, khách đã có tài khoản và người đăng ký
          nhận bản tin.
        </li>
        <li>
          <strong>Bên xử lý dữ liệu:</strong> tổ chức cung cấp dịch vụ cho chúng tôi và xử lý dữ liệu theo chỉ dẫn của chúng tôi, ví dụ nhà cung cấp hạ tầng
          máy chủ, dịch vụ gửi email.
        </li>
      </ul>

      <h2 id="thu-thap">2. Dữ liệu cá nhân chúng tôi thu thập</h2>
      <p>
        Chúng tôi áp dụng nguyên tắc <strong>tối thiểu hóa dữ liệu</strong>: chỉ thu thập những gì thật sự cần để cung cấp dịch vụ bạn yêu cầu. Các nhóm dữ
        liệu cụ thể:
      </p>
      <h3>2.1. Thông tin tài khoản</h3>
      <ul>
        <li>Họ tên, địa chỉ email, tên đăng nhập (hệ thống tự tạo, bạn có thể đổi).</li>
        <li>
          Mật khẩu: <strong>chỉ lưu dưới dạng băm một chiều bằng thuật toán bcrypt</strong>. Không ai, kể cả quản trị viên, có thể đọc được mật khẩu gốc của
          bạn. Tài khoản tạo bằng Google/Facebook có thể không có mật khẩu cho đến khi bạn tự đặt.
        </li>
        <li>Thông tin hồ sơ bạn tự nguyện bổ sung: số điện thoại, giới tính, ngày sinh, ảnh đại diện (tối đa 1 MB).</li>
        <li>Thời điểm tạo tài khoản, thời điểm đổi mật khẩu gần nhất, vai trò (khách hàng hoặc quản trị viên), trạng thái khóa tài khoản nếu có.</li>
      </ul>
      <h3>2.2. Thông tin mua hàng</h3>
      <ul>
        <li>Sổ địa chỉ giao hàng (tối đa 10 địa chỉ): tên người nhận, số điện thoại, tỉnh/thành, phường/xã, số nhà và tên đường, loại địa chỉ (nhà riêng/văn phòng).</li>
        <li>Giỏ hàng (danh sách sản phẩm và số lượng bạn đang chọn).</li>
        <li>Đơn hàng: sản phẩm, số lượng, giá tại thời điểm mua, phí vận chuyển, voucher và xu đã dùng, phương thức thanh toán, trạng thái và lịch sử xử lý đơn.</li>
        <li>Yêu cầu trả hàng/hoàn tiền: lý do, mô tả, tối đa 5 ảnh minh chứng bạn tải lên.</li>
        <li>Tra cứu bảo hành: thông tin đơn hàng bạn nhập để tra cứu.</li>
        <li>Ví voucher (các mã bạn đã lưu), lịch sử cộng và trừ xu thưởng.</li>
        <li>Đánh giá sản phẩm: số sao, nội dung nhận xét, thời điểm đánh giá.</li>
      </ul>
      <h3>2.3. Dữ liệu kỹ thuật</h3>
      <ul>
        <li>
          Nhật ký truy cập máy chủ: địa chỉ IP, thời điểm, đường dẫn được gọi, mã phản hồi, thời gian xử lý, thông tin trình duyệt (user-agent). Dữ liệu này
          dùng để vận hành, chống tấn công và điều tra sự cố, không dùng để quảng cáo.
        </li>
        <li>Số lần đăng nhập sai liên tiếp theo tài khoản (lưu tạm tối đa 15 phút) để chống dò mật khẩu.</li>
        <li>Mã định danh phiên đăng nhập và danh sách phiên đã bị thu hồi (khi bạn đăng xuất hoặc đổi mật khẩu).</li>
      </ul>
      <h3>2.4. Dữ liệu chúng tôi KHÔNG thu thập</h3>
      <ul>
        <li>Số thẻ ngân hàng, mã CVV, mã OTP, mật khẩu ví điện tử hay mật khẩu Internet Banking của bạn.</li>
        <li>Mật khẩu tài khoản Google hoặc Facebook của bạn.</li>
        <li>Danh bạ, danh sách bạn bè, tin nhắn, bài đăng trên mạng xã hội.</li>
        <li>Số căn cước công dân, hộ chiếu, dữ liệu sinh trắc học (vân tay, khuôn mặt), dữ liệu sức khỏe, tôn giáo, quan điểm chính trị.</li>
        <li>Vị trí của bạn khi bạn không chủ động chia sẻ.</li>
      </ul>

      <h2 id="mang-xa-hoi">3. Đăng ký và đăng nhập bằng Google, Facebook</h2>
      <p>
        Bạn có thể tạo tài khoản hoặc đăng nhập bằng tài khoản Google hoặc Facebook thay cho email và mật khẩu. Hai cách có giá trị như nhau. Khi bạn bấm nút
        tương ứng, trình duyệt được chuyển tới trang chính thức của Google (<code>accounts.google.com</code>) hoặc Facebook (<code>facebook.com</code>). Bạn
        chọn tài khoản và xác nhận trực tiếp trên trang của họ; <strong>{SITE.name} không bao giờ nhìn thấy mật khẩu Google/Facebook của bạn</strong>.
      </p>
      <ul>
        <li>
          <strong>Quyền chúng tôi yêu cầu:</strong> với Google là <code>openid</code>, <code>email</code>, <code>profile</code>; với Facebook là{' '}
          <code>email</code>, <code>public_profile</code>. Đây là các quyền cơ bản nhất.
        </li>
        <li>
          <strong>Dữ liệu chúng tôi nhận:</strong> mã định danh tài khoản do Google/Facebook cấp riêng cho ứng dụng của chúng tôi, họ tên, địa chỉ email (và
          trạng thái đã xác minh email), ảnh đại diện công khai.
        </li>
        <li>
          <strong>Dữ liệu chúng tôi không nhận và không yêu cầu:</strong> mật khẩu, danh bạ, bạn bè, ảnh, bài viết, tin nhắn, trang bạn thích. Chúng tôi{' '}
          <strong>không đăng bất cứ nội dung gì</strong> lên tài khoản mạng xã hội của bạn.
        </li>
        <li>
          <strong>Liên kết tài khoản:</strong> lần đầu đăng nhập, nếu chưa có tài khoản nào dùng email đó, hệ thống tự tạo tài khoản mới (đăng ký). Nếu đã có
          tài khoản dùng cùng email <em>và</em> Google/Facebook xác nhận email đó đã được xác minh, hệ thống liên kết vào tài khoản sẵn có thay vì tạo trùng.
          Hệ thống không bao giờ liên kết dựa trên email chưa xác minh, để ngăn người khác chiếm tài khoản của bạn.
        </li>
        <li>
          <strong>Bảo mật luồng đăng nhập:</strong> chúng tôi dùng chuẩn OAuth 2.0 kèm PKCE và tham số <code>state</code> chống giả mạo yêu cầu; mã xác
          thực trung gian chỉ dùng được một lần và hết hạn sau vài phút.
        </li>
        <li>
          <strong>Hủy liên kết:</strong> bạn có thể hủy liên kết ngay trong Tài khoản của tôi (khi tài khoản còn ít nhất một cách đăng nhập khác), hoặc thu
          hồi quyền của ứng dụng tại trang quản lý quyền của Google (Tài khoản Google → Bảo mật → Kết nối với ứng dụng bên thứ ba) hoặc Facebook (Cài đặt →
          Ứng dụng và trang web).
        </li>
      </ul>

      <h2 id="nguon">4. Cách chúng tôi thu thập dữ liệu</h2>
      <ul>
        <li>
          <strong>Do bạn cung cấp trực tiếp:</strong> khi đăng ký, cập nhật hồ sơ, thêm địa chỉ, đặt hàng, viết đánh giá, gửi yêu cầu trả hàng, đăng ký bản
          tin hoặc liên hệ hỗ trợ.
        </li>
        <li>
          <strong>Từ Google/Facebook:</strong> khi bạn chọn đăng nhập bằng các dịch vụ này, trong phạm vi quyền nêu ở mục 3.
        </li>
        <li>
          <strong>Từ cổng thanh toán:</strong> kết quả giao dịch (thành công/thất bại, mã giao dịch, số tiền, thời điểm) do VNPay, MoMo hoặc ngân hàng gửi
          về sau khi bạn thanh toán.
        </li>
        <li>
          <strong>Tự động khi bạn sử dụng website:</strong> nhật ký truy cập kỹ thuật nêu ở mục 2.3. Chúng tôi không dùng công cụ phân tích hành vi hay theo
          dõi quảng cáo của bên thứ ba.
        </li>
      </ul>

      <h2 id="muc-dich">5. Mục đích xử lý dữ liệu</h2>
      <p>Dữ liệu của bạn chỉ được dùng cho các mục đích dưới đây. Chúng tôi không xử lý dữ liệu cho mục đích khác khi chưa thông báo và có sự đồng ý của bạn.</p>
      <ol>
        <li>
          <strong>Cung cấp tài khoản:</strong> tạo tài khoản, xác thực khi đăng nhập, khôi phục mật khẩu qua email, quản lý các phiên đăng nhập.
        </li>
        <li>
          <strong>Xử lý đơn hàng:</strong> tính giá, phí vận chuyển và ưu đãi; giữ hàng; tiếp nhận thanh toán; đóng gói, giao hàng; xử lý hủy đơn, trả hàng,
          hoàn tiền và bảo hành.
        </li>
        <li>
          <strong>Chăm sóc khách hàng:</strong> gửi thông báo trạng thái đơn hàng, trả lời câu hỏi, giải quyết khiếu nại.
        </li>
        <li>
          <strong>Chương trình khách hàng thân thiết:</strong> cộng/trừ xu thưởng, lưu và áp dụng voucher, kiểm tra giới hạn lượt dùng voucher của từng tài khoản.
        </li>
        <li>
          <strong>Bảo mật và chống gian lận:</strong> giới hạn tần suất yêu cầu, tạm khóa đăng nhập khi nhập sai nhiều lần, phát hiện lạm dụng voucher, đơn hàng
          ảo, đánh giá spam; điều tra sự cố an ninh.
        </li>
        <li>
          <strong>Vận hành và cải thiện dịch vụ:</strong> theo dõi tình trạng hệ thống, sửa lỗi, đo hiệu năng (ở dạng số liệu tổng hợp, không gắn với cá nhân).
        </li>
        <li>
          <strong>Gửi bản tin khuyến mãi:</strong> chỉ khi bạn chủ động đăng ký nhận bản tin.
        </li>
        <li>
          <strong>Tuân thủ pháp luật:</strong> lưu chứng từ giao dịch theo quy định về kế toán, thuế; phối hợp với cơ quan nhà nước có thẩm quyền khi có yêu cầu
          hợp pháp.
        </li>
      </ol>
      <p>
        Chúng tôi <strong>không bán, không cho thuê, không trao đổi</strong> dữ liệu cá nhân của bạn cho bất kỳ ai vì mục đích quảng cáo hay thương mại, và
        không đưa ra quyết định tự động nào gây ảnh hưởng đáng kể tới bạn chỉ dựa trên việc xử lý tự động (ngoài các kiểm tra kỹ thuật như mật khẩu sai, voucher
        hết hạn, hết hàng).
      </p>

      <h2 id="co-so">6. Cơ sở xử lý dữ liệu</h2>
      <ul>
        <li>
          <strong>Sự đồng ý của bạn:</strong> khi đăng ký tài khoản, đăng nhập bằng mạng xã hội, chia sẻ vị trí, đăng ký bản tin. Bạn có thể rút lại sự đồng ý
          bất cứ lúc nào (xem mục 16); việc rút lại không ảnh hưởng tới tính hợp pháp của việc xử lý đã thực hiện trước đó.
        </li>
        <li>
          <strong>Thực hiện hợp đồng mua bán:</strong> dữ liệu cần để giao hàng, thanh toán, đổi trả, bảo hành mà bạn đã yêu cầu.
        </li>
        <li>
          <strong>Nghĩa vụ pháp lý:</strong> lưu giữ hóa đơn, chứng từ; cung cấp thông tin khi cơ quan có thẩm quyền yêu cầu theo đúng thủ tục pháp luật.
        </li>
        <li>
          <strong>Bảo vệ quyền và lợi ích hợp pháp:</strong> chống gian lận, bảo đảm an toàn hệ thống cho bạn và cho các khách hàng khác.
        </li>
      </ul>

      <h2 id="thanh-toan">7. Dữ liệu thanh toán và hoàn tiền</h2>
      <ul>
        <li>
          <strong>Thanh toán khi nhận hàng (COD):</strong> không phát sinh dữ liệu thanh toán điện tử.
        </li>
        <li>
          <strong>VNPay, ví MoMo:</strong> bạn nhập thông tin thanh toán trên trang hoặc ứng dụng của VNPay/MoMo. Chúng tôi chỉ nhận lại kết quả giao dịch
          (mã giao dịch, số tiền, ngân hàng hoặc ví, thời điểm, trạng thái). Mọi kết quả đều được kiểm tra chữ ký điện tử; nếu số tiền không khớp tổng đơn,
          giao dịch bị từ chối.
        </li>
        <li>
          <strong>Chuyển khoản VietQR:</strong> bạn chuyển khoản từ ứng dụng ngân hàng của mình tới tài khoản của cửa hàng theo mã QR. Chúng tôi chỉ đối chiếu
          số tiền và nội dung chuyển khoản.
        </li>
        <li>
          <strong>Tài khoản nhận hoàn tiền:</strong> với đơn COD hoặc chuyển khoản bị trả hàng, bạn có thể lưu tài khoản ngân hàng (ngân hàng, số tài khoản,
          tên chủ tài khoản) để nhận tiền hoàn. Thông tin này chỉ dùng để hoàn tiền cho bạn và bị xóa khi bạn xóa tài khoản.
        </li>
      </ul>

      <h2 id="vi-tri">8. Dữ liệu vị trí và địa chỉ giao hàng</h2>
      <p>
        Việc chia sẻ vị trí là <strong>hoàn toàn không bắt buộc</strong>. Chỉ khi bạn bấm “Dùng vị trí hiện tại” hoặc ghim vị trí trên bản đồ, trình duyệt mới
        hỏi quyền và gửi tọa độ cho chúng tôi. Tọa độ được lưu kèm địa chỉ giao hàng để shipper giao đúng nơi. Để đổi tọa độ thành tên tỉnh/phường/đường,
        máy chủ của chúng tôi gửi tọa độ (không kèm tên, email hay bất kỳ thông tin nhận dạng nào khác) tới dịch vụ bản đồ Photon dựa trên dữ liệu
        OpenStreetMap. Chúng tôi không theo dõi vị trí của bạn ở bất kỳ thời điểm nào khác. Bạn có thể bỏ ghim, sửa hoặc xóa địa chỉ bất cứ lúc nào trong Tài
        khoản của tôi, hoặc thu hồi quyền vị trí trong cài đặt trình duyệt.
      </p>

      <h2 id="chia-se">9. Chia sẻ dữ liệu với bên thứ ba</h2>
      <p>Chúng tôi chỉ chia sẻ phần dữ liệu tối thiểu cần thiết, cho đúng mục đích, với các nhóm sau:</p>
      <ul>
        <li>
          <strong>Đơn vị vận chuyển và nhân viên giao hàng:</strong> tên người nhận, số điện thoại, địa chỉ giao hàng, thông tin kiện hàng và số tiền cần thu
          (với đơn COD).
        </li>
        <li>
          <strong>Cổng thanh toán (VNPay, MoMo) và ngân hàng:</strong> mã đơn hàng và số tiền cần thanh toán hoặc hoàn tiền.
        </li>
        <li>
          <strong>Google, Facebook:</strong> chỉ trong luồng đăng nhập bạn chủ động bắt đầu; chúng tôi không gửi dữ liệu mua sắm của bạn cho các nền tảng này.
        </li>
        <li>
          <strong>Nhà cung cấp hạ tầng:</strong> Amazon Web Services (máy chủ, lưu trữ ảnh và bản sao lưu) và nhà cung cấp dịch vụ gửi email. Các bên này xử lý
          dữ liệu theo chỉ dẫn của chúng tôi, không được dùng cho mục đích riêng.
        </li>
        <li>
          <strong>Dịch vụ bản đồ Photon/OpenStreetMap:</strong> chỉ tọa độ, như mô tả ở mục 8.
        </li>
        <li>
          <strong>Cơ quan nhà nước có thẩm quyền:</strong> khi có yêu cầu bằng văn bản theo đúng quy định pháp luật.
        </li>
        <li>
          <strong>Trường hợp tái cấu trúc:</strong> nếu cửa hàng sáp nhập, chuyển nhượng, dữ liệu có thể được chuyển cho đơn vị kế thừa, với điều kiện đơn vị
          đó tiếp tục tuân thủ Chính sách này; bạn sẽ được thông báo trước.
        </li>
      </ul>

      <h2 id="cong-khai">10. Thông tin hiển thị công khai</h2>
      <p>
        Khi bạn đánh giá sản phẩm, những người xem trang sản phẩm sẽ thấy tên hiển thị, ảnh đại diện, số sao, nội dung nhận xét, thời điểm đánh giá và nhãn “Đã
        mua hàng” (nếu bạn đã mua sản phẩm đó). Email, số điện thoại và địa chỉ của bạn <strong>không bao giờ</strong> được hiển thị công khai. Bạn có thể sửa
        hoặc xóa đánh giá của mình bất cứ lúc nào.
      </p>

      <h2 id="luu-tru">11. Nơi lưu trữ và chuyển dữ liệu ra nước ngoài</h2>
      <p>
        Dữ liệu được lưu trên hạ tầng của Amazon Web Services tại khu vực Singapore (ap-southeast-1): cơ sở dữ liệu PostgreSQL, bộ nhớ đệm Redis, ảnh sản phẩm
        và ảnh do người dùng tải lên trên Amazon S3, bản sao lưu cơ sở dữ liệu trên Amazon S3. Như vậy dữ liệu của bạn được chuyển và lưu trữ ở ngoài lãnh thổ
        Việt Nam. Chúng tôi chọn nhà cung cấp có tiêu chuẩn an toàn thông tin được công nhận quốc tế, áp dụng mã hóa khi truyền và khi lưu (mục 13), và chỉ cho
        phép truy cập trong phạm vi cần thiết. Bằng việc sử dụng dịch vụ, bạn đồng ý với việc chuyển dữ liệu này.
      </p>

      <h2 id="thoi-han">12. Thời gian lưu trữ</h2>
      <ul>
        <li>
          <strong>Tài khoản và hồ sơ:</strong> lưu trong suốt thời gian tài khoản còn hoạt động; xóa hoặc ẩn danh ngay khi bạn xóa tài khoản (mục 17).
        </li>
        <li>
          <strong>Đơn hàng và chứng từ thanh toán:</strong> lưu để phục vụ đối soát, bảo hành, khiếu nại và nghĩa vụ kế toán, thuế theo thời hạn pháp luật quy
          định. Khi bạn xóa tài khoản, đơn hàng được giữ lại ở dạng <strong>đã ẩn danh</strong> (không còn gắn với tên, email, số điện thoại của bạn).
        </li>
        <li>
          <strong>Giỏ hàng:</strong> tự xóa sau 7 ngày không thay đổi.
        </li>
        <li>
          <strong>Mã đặt lại mật khẩu:</strong> hết hạn sau 30 phút và chỉ dùng được một lần; hệ thống chỉ lưu mã băm của liên kết.
        </li>
        <li>
          <strong>Bộ đếm đăng nhập sai:</strong> tự xóa sau 15 phút.
        </li>
        <li>
          <strong>Bản sao lưu cơ sở dữ liệu:</strong> tự động xóa sau tối đa 30 ngày. Dữ liệu bạn đã xóa có thể còn trong bản sao lưu cũ cho tới khi bản sao
          lưu đó hết hạn; bản sao lưu chỉ dùng để khôi phục khi có sự cố.
        </li>
        <li>
          <strong>Nhật ký kỹ thuật:</strong> được xoay vòng và xóa định kỳ, chỉ giữ trong thời gian ngắn phục vụ vận hành và điều tra sự cố.
        </li>
        <li>
          <strong>Nhật ký thao tác quản trị:</strong> các thay đổi do quản trị viên thực hiện (ví dụ khóa tài khoản, sửa đơn) được ghi lại để bảo đảm trách nhiệm
          giải trình.
        </li>
      </ul>

      <h2 id="bao-mat">13. Biện pháp bảo vệ dữ liệu</h2>
      <p>Chúng tôi áp dụng nhiều lớp bảo vệ về kỹ thuật và quản lý, trong đó có:</p>
      <ul>
        <li>Toàn bộ kết nối giữa trình duyệt và máy chủ được mã hóa bằng HTTPS (TLS); ổ đĩa máy chủ, kho ảnh và bản sao lưu được mã hóa khi lưu trữ.</li>
        <li>Mật khẩu băm bằng bcrypt; mã đặt lại mật khẩu chỉ lưu dạng băm.</li>
        <li>
          Tự động tạm khóa đăng nhập 15 phút sau 5 lần nhập sai mật khẩu liên tiếp; giới hạn tần suất các yêu cầu đăng nhập, đăng ký, quên mật khẩu và lưu voucher.
        </li>
        <li>
          Phiên đăng nhập hết hạn sau 1 ngày; khi bạn đăng xuất, phiên bị thu hồi ngay; khi bạn đổi mật khẩu hoặc bị khóa tài khoản, mọi phiên cũ trên các thiết bị
          khác đều mất hiệu lực.
        </li>
        <li>Cơ sở dữ liệu và bộ nhớ đệm nằm trong mạng nội bộ, không mở trực tiếp ra Internet; cổng quản trị máy chủ chỉ mở tạm thời khi triển khai.</li>
        <li>Phân quyền chặt chẽ: chỉ tài khoản quản trị mới truy cập được trang quản trị; mọi thao tác của quản trị viên đều được ghi nhật ký.</li>
        <li>Ảnh tải lên được kiểm tra định dạng thật (không chỉ dựa vào đuôi tệp) và giới hạn dung lượng.</li>
        <li>
          Mã nguồn được quét tự động trước mỗi lần cập nhật: quét lộ khóa bí mật, quét lỗ hổng thư viện và ảnh container, chạy kiểm thử tự động; bản cập nhật có lỗi
          nghiêm trọng bị chặn không cho triển khai.
        </li>
        <li>Sao lưu cơ sở dữ liệu định kỳ và diễn tập khôi phục để bảo đảm dữ liệu không bị mất khi có sự cố.</li>
      </ul>
      <p>
        Không có hệ thống nào an toàn tuyệt đối. Bạn cũng góp phần bảo vệ tài khoản bằng cách dùng mật khẩu mạnh, không dùng lại mật khẩu của dịch vụ khác,
        không chia sẻ mật khẩu và đăng xuất khi dùng máy tính chung. {SITE.name} <strong>không bao giờ</strong> gọi điện, nhắn tin hay gửi email yêu cầu bạn
        cung cấp mật khẩu, mã OTP hay thông tin thẻ.
      </p>

      <h2 id="cookie">14. Cookie và bộ nhớ trình duyệt</h2>
      <ul>
        <li>
          <strong>Cookie kỹ thuật bắt buộc:</strong> dùng trong lúc đăng nhập bằng Google/Facebook để chống giả mạo yêu cầu; tự hết hạn sau 10 phút.
        </li>
        <li>
          <strong>Bộ nhớ trình duyệt (localStorage):</strong> lưu phiên đăng nhập để bạn không phải đăng nhập lại mỗi lần mở trang, lựa chọn giao diện
          sáng/tối và danh sách sản phẩm bạn đang so sánh (danh sách này chỉ nằm trên máy của bạn, không gửi về máy chủ). Dữ liệu này nằm trên máy của bạn và bị xóa khi bạn đăng xuất (phiên) hoặc xóa dữ liệu trang web trong trình duyệt.
        </li>
        <li>
          Chúng tôi <strong>không</strong> dùng cookie quảng cáo, cookie theo dõi của bên thứ ba hay công cụ phân tích hành vi người dùng.
        </li>
      </ul>

      <h2 id="email">15. Email, thông báo và bản tin</h2>
      <ul>
        <li>
          <strong>Email giao dịch</strong> (đặt lại mật khẩu, thông tin cần thiết về đơn hàng, tài khoản) là một phần của dịch vụ và được gửi khi cần.
        </li>
        <li>
          <strong>Thông báo trong website</strong> (đơn hàng, ưu đãi, xu thưởng) hiển thị ở mục Thông báo; bạn có thể đánh dấu đã đọc từng thông báo hoặc tất cả.
        </li>
        <li>
          <strong>Bản tin khuyến mãi</strong> chỉ được gửi khi bạn tự đăng ký. Để ngừng nhận, hãy liên hệ chúng tôi qua email ở mục 21; email của bạn cũng tự bị
          xóa khỏi danh sách bản tin khi bạn xóa tài khoản.
        </li>
      </ul>

      <h2 id="quyen">16. Quyền của bạn đối với dữ liệu cá nhân</h2>
      <p>Theo pháp luật Việt Nam về bảo vệ dữ liệu cá nhân, bạn có các quyền sau, và chúng tôi tạo công cụ để bạn tự thực hiện phần lớn các quyền này:</p>
      <ul>
        <li>
          <strong>Quyền được biết:</strong> về việc xử lý dữ liệu của mình, thông qua chính Chính sách này.
        </li>
        <li>
          <strong>Quyền truy cập và chỉnh sửa:</strong> xem và sửa hồ sơ, địa chỉ, đánh giá tại <Link href="/account">Tài khoản của tôi</Link>.
        </li>
        <li>
          <strong>Quyền đồng ý và rút lại sự đồng ý:</strong> ngừng chia sẻ vị trí, hủy liên kết Google/Facebook, hủy nhận bản tin, xóa tài khoản.
        </li>
        <li>
          <strong>Quyền xóa dữ liệu:</strong> tự xóa tài khoản bất cứ lúc nào (mục 17).
        </li>
        <li>
          <strong>Quyền hạn chế và phản đối xử lý:</strong> gửi yêu cầu qua email để chúng tôi tạm dừng xử lý một phần dữ liệu, trừ dữ liệu bắt buộc phải lưu
          theo luật.
        </li>
        <li>
          <strong>Quyền được cung cấp dữ liệu:</strong> yêu cầu bản sao dữ liệu cá nhân chúng tôi đang lưu về bạn.
        </li>
        <li>
          <strong>Quyền khiếu nại, tố cáo, khởi kiện và yêu cầu bồi thường</strong> theo quy định pháp luật khi quyền lợi của bạn bị xâm phạm.
        </li>
      </ul>
      <p>
        Với các yêu cầu gửi qua email, chúng tôi có thể đề nghị bạn xác minh là chủ tài khoản (ví dụ gửi từ chính email đăng ký) trước khi thực hiện, để tránh
        người khác giả danh bạn. Chúng tôi phản hồi trong thời hạn pháp luật quy định và không thu phí cho các yêu cầu hợp lý.
      </p>

      <h2 id="xoa">17. Xóa tài khoản và dữ liệu</h2>
      <p>
        Bạn có thể tự xóa tài khoản tại Tài khoản của tôi → Đổi mật khẩu → Xóa tài khoản (cần nhập lại email và mật khẩu, nếu tài khoản có mật khẩu). Hướng dẫn
        chi tiết, kể cả cho tài khoản đăng nhập bằng Facebook, có tại trang <Link href="/data-deletion">Hướng dẫn xóa dữ liệu</Link>. Khi xóa, hệ thống thực hiện
        ngay lập tức:
      </p>
      <ul>
        <li>Xóa sổ địa chỉ, tài khoản nhận hoàn tiền, thông báo, ví voucher, đánh giá sản phẩm, liên kết Google/Facebook, mã đặt lại mật khẩu và email nhận bản tin.</li>
        <li>Xóa họ tên, email, mật khẩu, số điện thoại, giới tính, ngày sinh, ảnh đại diện, tên đăng nhập và cài đặt cá nhân.</li>
        <li>Đăng xuất và thu hồi mọi phiên đăng nhập trên tất cả thiết bị.</li>
        <li>Giữ lại lịch sử đơn hàng ở dạng ẩn danh để phục vụ nghĩa vụ kế toán, thuế và bảo hành; các đơn này không còn liên kết được với bạn.</li>
      </ul>
      <p>Việc xóa tài khoản không thể hoàn tác. Sau khi xóa, bạn vẫn có thể đăng ký tài khoản mới bằng cùng email.</p>

      <h2 id="tre-em">18. Dữ liệu của trẻ em</h2>
      <p>
        Dịch vụ dành cho người từ đủ 16 tuổi trở lên. Người dưới 16 tuổi chỉ được sử dụng khi có sự đồng ý và giám sát của cha, mẹ hoặc người giám hộ hợp pháp.
        Chúng tôi không cố ý thu thập dữ liệu của trẻ em. Nếu phát hiện đã nhận dữ liệu của trẻ em mà không có sự đồng ý hợp lệ, chúng tôi sẽ xóa dữ liệu đó;
        phụ huynh có thể liên hệ với chúng tôi để yêu cầu xóa.
      </p>

      <h2 id="su-co">19. Xử lý sự cố lộ lọt dữ liệu</h2>
      <p>
        Nếu phát hiện sự cố có thể làm lộ, mất hoặc thay đổi trái phép dữ liệu cá nhân, chúng tôi sẽ: (1) khoanh vùng và ngăn chặn sự cố ngay lập tức, ví dụ thu
        hồi mọi phiên đăng nhập, đổi khóa bí mật; (2) đánh giá phạm vi và mức độ ảnh hưởng; (3) thông báo cho cơ quan chức năng theo thời hạn pháp luật quy định;
        (4) thông báo cho những khách hàng bị ảnh hưởng, kèm hướng dẫn tự bảo vệ (ví dụ đổi mật khẩu); (5) khắc phục nguyên nhân và rút kinh nghiệm.
      </p>

      <h2 id="thay-doi">20. Thay đổi chính sách</h2>
      <p>
        Chính sách có thể được cập nhật khi chúng tôi thêm tính năng mới hoặc khi pháp luật thay đổi. Ngày cập nhật gần nhất luôn ghi ở đầu trang. Với thay đổi
        quan trọng (ví dụ thu thập loại dữ liệu mới hoặc dùng dữ liệu cho mục đích mới), chúng tôi sẽ thông báo nổi bật trên website hoặc qua email trước khi áp
        dụng và xin lại sự đồng ý của bạn khi pháp luật yêu cầu. Việc bạn tiếp tục sử dụng dịch vụ sau khi thay đổi có hiệu lực được hiểu là bạn đồng ý với nội
        dung mới.
      </p>

      <h2 id="lien-he">21. Liên hệ</h2>
      <p>Mọi câu hỏi, yêu cầu hoặc khiếu nại về quyền riêng tư, vui lòng liên hệ:</p>
      <ul>
        <li>
          Chủ sở hữu và người chịu trách nhiệm bảo vệ dữ liệu: <strong>Nguyễn Quốc Anh</strong>
        </li>
        <li>
          Email: <a href={`mailto:${SITE.email}`}>{SITE.email}</a> (ghi tiêu đề “Quyền riêng tư”)
        </li>
        <li>
          Hotline: <a href={SITE.hotlineHref}>{SITE.hotline}</a> ({SITE.supportHours})
        </li>
      </ul>
      <p>
        Xem thêm: <Link href="/terms">Điều khoản sử dụng</Link> · <Link href="/data-deletion">Hướng dẫn xóa dữ liệu</Link>.
      </p>
    </LegalPage>
  );
}
