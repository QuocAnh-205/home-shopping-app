import type { MailMessage } from './mail.service';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout(title: string, body: string): string {
  return `<!doctype html><html lang="vi"><body style="margin:0;background:#f5f3ef;font-family:Arial,Helvetica,sans-serif;color:#1c1917">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:#c2410c;padding:20px 28px;color:#fff;font-size:20px;font-weight:bold">Home Shopping</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:22px">${title}</h1>${body}
</td></tr>
<tr><td style="padding:16px 28px;background:#faf8f5;color:#78716c;font-size:12px">
Email tự động từ Home Shopping, vui lòng không trả lời email này.</td></tr>
</table></td></tr></table></body></html>`;
}

export function passwordResetMail(to: string, fullName: string, link: string, minutes: number): MailMessage {
  const name = escapeHtml(fullName);
  return {
    to,
    subject: 'Đặt lại mật khẩu Home Shopping',
    text: `Xin chào ${fullName},\n\nMở liên kết sau để đặt lại mật khẩu (hiệu lực ${minutes} phút, chỉ dùng 1 lần):\n${link}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này – mật khẩu hiện tại vẫn an toàn.`,
    html: layout(
      'Đặt lại mật khẩu',
      `<p>Xin chào <strong>${name}</strong>,</p>
<p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Nhấn nút bên dưới để tạo mật khẩu mới:</p>
<p style="text-align:center;margin:28px 0"><a href="${escapeHtml(link)}" style="background:#c2410c;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:bold;display:inline-block">Đặt lại mật khẩu</a></p>
<p style="color:#78716c;font-size:13px">Liên kết có hiệu lực trong ${minutes} phút và chỉ dùng được một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này – mật khẩu hiện tại vẫn an toàn.</p>`,
    ),
  };
}

export function passwordChangedMail(to: string, fullName: string): MailMessage {
  return {
    to,
    subject: 'Mật khẩu Home Shopping vừa được thay đổi',
    text: `Xin chào ${fullName},\n\nMật khẩu tài khoản của bạn vừa được thay đổi và mọi phiên đăng nhập cũ đã bị đăng xuất. Nếu không phải bạn, hãy dùng chức năng Quên mật khẩu ngay.`,
    html: layout(
      'Mật khẩu đã được thay đổi',
      `<p>Xin chào <strong>${escapeHtml(fullName)}</strong>,</p>
<p>Mật khẩu tài khoản của bạn vừa được thay đổi và mọi phiên đăng nhập cũ đã bị đăng xuất.</p>
<p style="color:#b91c1c">Nếu không phải bạn thực hiện, hãy dùng chức năng <strong>Quên mật khẩu</strong> ngay lập tức.</p>`,
    ),
  };
}

export function newsletterWelcomeMail(to: string): MailMessage {
  return {
    to,
    subject: 'Chào mừng bạn đến với bản tin Home Shopping',
    text: 'Cảm ơn bạn đã đăng ký! Bạn sẽ nhận được thông tin khuyến mãi và sản phẩm mới mỗi tuần.',
    html: layout(
      'Cảm ơn bạn đã đăng ký!',
      '<p>Mỗi tuần, chúng tôi sẽ gửi đến bạn những ưu đãi độc quyền, sản phẩm mới và mẹo trang trí nhà cửa.</p>',
    ),
  };
}
