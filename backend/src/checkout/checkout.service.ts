import { HttpStatus, Injectable } from '@nestjs/common';
import { Address, PaymentMethod, Voucher } from '@prisma/client';
import { CartService } from '../cart/cart.service';
import { AppError, ErrorCode } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { ShippingResult, ShippingService } from '../shipping/shipping.service';
import { CoinsService } from '../coins/coins.service';
import { StorageService } from '../storage/storage.service';
import { describeVoucher, evaluateVoucher, isShippingVoucher, PricedLine } from '../vouchers/voucher-engine';
import { AppliedVoucher, VouchersService } from '../vouchers/vouchers.service';
import { CheckoutDto } from './checkout.dto';
import { PricingBreakdown, priceOrder, remainingShipping } from './pricing';

export interface CheckoutLine {
  productId: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  /** Key ảnh gốc (snapshot vào order_items khi đặt) – không trả ra client */
  imageKey?: string | null;
  /** Bảo hành (tháng) – snapshot vào order_items, không trả ra client */
  warrantyMonths?: number | null;
  /** Hàng cồng kềnh (giao + lắp đặt, phụ phí riêng) */
  bulky: boolean;
  categoryId: number;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  stock: number;
  available: boolean;
}

export interface CheckoutVoucherOption {
  code: string;
  name: string;
  summary: string;
  type: Voucher['type'];
  endsAt: Date;
  applicable: boolean;
  reason: string | null;
  /** Số tiền sẽ được giảm nếu chọn voucher này */
  discount: number;
  selected: boolean;
}

export interface PaymentMethodOption {
  method: PaymentMethod;
  label: string;
  available: boolean;
  reason?: string;
}

export interface CheckoutIssue {
  code: string;
  message: string;
  productId?: string;
}

export interface CheckoutPreview {
  source: 'CART' | 'BUY_NOW';
  items: CheckoutLine[];
  address: Omit<Address, 'userId'> | null;
  shipping: (ShippingResult & { amountToFreeShip: number }) | null;
  vouchers: {
    voucherCode: string | null;
    shippingVoucherCode: string | null;
    /** Voucher giảm giá: dùng được trước, giảm nhiều trước */
    discount: CheckoutVoucherOption[];
    shipping: CheckoutVoucherOption[];
    errors: { code: string; reason: string }[];
  };
  paymentMethod: PaymentMethod;
  paymentMethods: PaymentMethodOption[];
  pricing: PricingBreakdown;
  /** Xu: số dư, tối đa dùng được cho đơn này, đang dùng, xu sẽ nhận khi đơn hoàn thành */
  coins: { balance: number; usable: number; applied: number; earnEstimate: number };
  issues: CheckoutIssue[];
  canPlaceOrder: boolean;
}

/** Dữ liệu nội bộ cho bước tạo đơn (không trả ra API) */
export interface CheckoutPlan {
  preview: CheckoutPreview;
  address: Address;
  appliedVouchers: AppliedVoucher[];
  /** Sản phẩm cần xóa khỏi giỏ sau khi đặt thành công (rỗng với "Mua ngay") */
  cartProductIds: string[];
}

export type PaymentMethodsProvider = () => PaymentMethodOption[];

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  COD: 'Thanh toán khi nhận hàng',
  VNPAY: 'VNPay (ATM / Visa / Master / QR)',
  MOMO: 'Ví MoMo',
  VIETQR: 'Chuyển khoản ngân hàng (VietQR)',
};

@Injectable()
export class CheckoutService {
  /** Module thanh toán đăng ký danh sách phương thức đang bật (mặc định chỉ COD) */
  private paymentMethods: PaymentMethodsProvider = () => [{ method: PaymentMethod.COD, label: PAYMENT_LABEL.COD, available: true }];

  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly shipping: ShippingService,
    private readonly vouchers: VouchersService,
    private readonly storage: StorageService,
    private readonly coinsService: CoinsService,
  ) {}

  setPaymentMethodsProvider(provider: PaymentMethodsProvider): void {
    this.paymentMethods = provider;
  }

  static paymentLabel(method: PaymentMethod): string {
    return PAYMENT_LABEL[method];
  }

  async preview(userId: string, dto: CheckoutDto): Promise<CheckoutPreview> {
    return (await this.build(userId, dto)).preview;
  }

  /** Tính lại toàn bộ trang thanh toán từ database. Bước tạo đơn gọi lại hàm này rồi mới khóa kho trong transaction */
  async build(userId: string, dto: CheckoutDto): Promise<CheckoutPlan> {
    const issues: CheckoutIssue[] = [];
    const { source, wanted } = await this.selection(userId, dto);

    const products = await this.prisma.product.findMany({
      where: { id: { in: [...wanted.keys()] } },
      select: {
        id: true,
        name: true,
        slug: true,
        price: true,
        stock: true,
        isActive: true,
        imageKey: true,
        categoryId: true,
        weightGrams: true,
        lengthCm: true,
        widthCm: true,
        heightCm: true,
        isBulky: true,
        warrantyMonths: true,
      },
      orderBy: { id: 'asc' },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const items: CheckoutLine[] = [];
    for (const [productId, quantity] of wanted) {
      const p = byId.get(productId);
      if (!p || !p.isActive) {
        issues.push({ code: ErrorCode.PRODUCT_UNAVAILABLE, message: `${p?.name ?? 'Một sản phẩm'} đã ngừng kinh doanh`, productId });
        continue;
      }
      const available = p.stock >= quantity;
      if (!available) {
        issues.push({
          code: ErrorCode.OUT_OF_STOCK,
          message: p.stock > 0 ? `${p.name} chỉ còn ${p.stock} sản phẩm` : `${p.name} đã hết hàng`,
          productId,
        });
      }
      items.push({
        productId,
        name: p.name,
        slug: p.slug,
        imageUrl: await this.storage.getSignedImageUrl(p.imageKey),
        imageKey: p.imageKey,
        warrantyMonths: p.warrantyMonths,
        bulky: p.isBulky,
        categoryId: p.categoryId,
        unitPrice: p.price,
        quantity,
        lineTotal: p.price * quantity,
        stock: p.stock,
        available,
      });
    }
    const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);

    // Địa chỉ
    const address = await this.resolveAddress(userId, dto.addressId);
    if (!address) issues.push({ code: ErrorCode.ADDRESS_REQUIRED, message: 'Vui lòng thêm địa chỉ nhận hàng' });
    else if (!address.provinceCode || !address.wardCode) {
      issues.push({ code: ErrorCode.ADDRESS_INVALID, message: 'Địa chỉ cũ chưa theo đơn vị hành chính mới, vui lòng cập nhật Tỉnh/Thành và Phường/Xã' });
    }

    // Phí vận chuyển
    let shipping: CheckoutPreview['shipping'] = null;
    if (address?.provinceCode && address.wardCode && items.length) {
      const quote = await this.shipping.quote(
        { provinceCode: address.provinceCode, wardCode: address.wardCode },
        items.map((i) => {
          const p = byId.get(i.productId)!;
          return { weightGrams: p.weightGrams, lengthCm: p.lengthCm, widthCm: p.widthCm, heightCm: p.heightCm, quantity: i.quantity, bulky: p.isBulky };
        }),
        subtotal,
      );
      shipping = { ...quote, amountToFreeShip: quote.freeShipThreshold > 0 ? Math.max(0, quote.freeShipThreshold - subtotal) : 0 };
    }
    const shippingFee = shipping?.fee ?? 0;
    const freeShipEligible = shipping?.freeShipEligible ?? false;
    const bulkyFee = shipping?.bulkyFee ?? 0;

    // Voucher
    const selectedCodes = [dto.voucherCode, dto.shippingVoucherCode].filter((c): c is string => Boolean(c));
    const candidates = await this.vouchers.candidates(userId, selectedCodes);
    const usage = await this.vouchers.usageByUser(userId, candidates.map((v) => v.id));
    const priced: PricedLine[] = items.map((i) => ({ productId: i.productId, categoryId: i.categoryId, lineTotal: i.lineTotal }));
    const ctx = { now: new Date(), lines: priced, remainingShippingFee: remainingShipping(shippingFee, freeShipEligible, bulkyFee), usedByUser: 0 };
    const options = candidates.map((v) => {
      const check = evaluateVoucher(v, { ...ctx, usedByUser: usage.get(v.id) ?? 0 });
      return {
        voucher: v,
        option: {
          code: v.code,
          name: v.name,
          summary: describeVoucher(v),
          type: v.type,
          endsAt: v.endsAt,
          applicable: check.ok,
          reason: check.ok ? null : check.reason,
          discount: check.discount,
          selected: selectedCodes.includes(v.code),
        } satisfies CheckoutVoucherOption,
      };
    });

    const errors: { code: string; reason: string }[] = [];
    const applied: AppliedVoucher[] = [];
    const pick = (code: string | undefined, wantShipping: boolean): number => {
      if (!code) return 0;
      const found = options.find((o) => o.voucher.code === code);
      if (!found) {
        errors.push({ code, reason: 'Mã voucher không tồn tại hoặc đã hết hạn' });
        return 0;
      }
      if (isShippingVoucher(found.voucher) !== wantShipping) {
        errors.push({ code, reason: wantShipping ? 'Đây không phải voucher vận chuyển' : 'Đây là voucher vận chuyển, hãy chọn ở mục Voucher vận chuyển' });
        return 0;
      }
      if (!found.option.applicable) {
        errors.push({ code, reason: found.option.reason ?? 'Voucher chưa đủ điều kiện' });
        return 0;
      }
      applied.push({ voucher: found.voucher, discount: found.option.discount });
      return found.option.discount;
    };
    const voucherDiscount = pick(dto.voucherCode, false);
    const shippingVoucherDiscount = pick(dto.shippingVoucherCode, true);
    for (const e of errors) issues.push({ code: ErrorCode.VOUCHER_NOT_APPLICABLE, message: `${e.code}: ${e.reason}` });

    // Phương thức thanh toán
    const paymentMethod = dto.paymentMethod ?? PaymentMethod.COD;
    const methods = this.paymentMethods();
    const chosen = methods.find((m) => m.method === paymentMethod);
    if (!chosen?.available) {
      issues.push({ code: ErrorCode.PAYMENT_METHOD_UNAVAILABLE, message: chosen?.reason ?? `${PAYMENT_LABEL[paymentMethod]} hiện chưa hỗ trợ` });
    }

    const { coinBalance } = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coinBalance: true } });
    const pricing = priceOrder({
      subtotal,
      shippingFee,
      freeShipEligible,
      bulkyFee,
      voucherDiscount,
      shippingVoucherDiscount,
      coins: { use: Boolean(dto.useCoins), balance: coinBalance, maxPercent: this.coinsService.maxUsePercent },
    });
    const beforeCoins = pricing.total + pricing.coinsUsed;
    const byDiscount = (a: CheckoutVoucherOption, b: CheckoutVoucherOption) => Number(b.applicable) - Number(a.applicable) || b.discount - a.discount;
    const { userId: _u, ...addressView } = address ?? ({} as Address);

    const preview: CheckoutPreview = {
      source,
      items,
      address: address ? addressView : null,
      shipping,
      vouchers: {
        voucherCode: applied.find((a) => !isShippingVoucher(a.voucher))?.voucher.code ?? null,
        shippingVoucherCode: applied.find((a) => isShippingVoucher(a.voucher))?.voucher.code ?? null,
        discount: options.filter((o) => !isShippingVoucher(o.voucher)).map((o) => o.option).sort(byDiscount),
        shipping: options.filter((o) => isShippingVoucher(o.voucher)).map((o) => o.option).sort(byDiscount),
        errors,
      },
      paymentMethod,
      paymentMethods: methods,
      pricing,
      coins: {
        balance: coinBalance,
        usable: this.coinsService.usable(coinBalance, beforeCoins),
        applied: pricing.coinsUsed,
        earnEstimate: Math.floor((pricing.total * this.coinsService.earnPercent) / 100),
      },
      issues,
      canPlaceOrder: issues.length === 0 && items.length > 0,
    };
    return { preview, address: address!, appliedVouchers: applied, cartProductIds: source === 'CART' ? [...wanted.keys()] : [] };
  }

  /** Hàng được chọn: "Mua ngay" (items) hoặc các sản phẩm tick trong giỏ (cartProductIds, bỏ trống = cả giỏ) */
  private async selection(userId: string, dto: CheckoutDto): Promise<{ source: 'CART' | 'BUY_NOW'; wanted: Map<string, number> }> {
    if (dto.items?.length && dto.cartProductIds?.length) {
      throw new AppError(ErrorCode.BAD_REQUEST, 'Chỉ chọn "Mua ngay" hoặc sản phẩm trong giỏ, không chọn cả hai');
    }
    if (dto.items?.length) {
      const wanted = new Map<string, number>();
      for (const i of dto.items) wanted.set(i.productId, (wanted.get(i.productId) ?? 0) + i.quantity);
      return { source: 'BUY_NOW', wanted };
    }
    const cart = await this.cart.getRaw(userId);
    if (cart.size === 0) throw new AppError(ErrorCode.CART_EMPTY, 'Giỏ hàng đang trống');
    if (!dto.cartProductIds) return { source: 'CART', wanted: cart };
    const wanted = new Map<string, number>();
    for (const id of dto.cartProductIds) {
      const qty = cart.get(id);
      if (!qty) throw new AppError(ErrorCode.NO_ITEMS_SELECTED, 'Sản phẩm được chọn không còn trong giỏ hàng, vui lòng tải lại', HttpStatus.CONFLICT, { productId: id });
      wanted.set(id, qty);
    }
    return { source: 'CART', wanted };
  }

  private async resolveAddress(userId: string, addressId?: string): Promise<Address | null> {
    if (addressId) {
      const a = await this.prisma.address.findFirst({ where: { id: addressId, userId } });
      if (!a) throw new AppError(ErrorCode.ADDRESS_NOT_FOUND, 'Không tìm thấy địa chỉ', HttpStatus.NOT_FOUND);
      return a;
    }
    return this.prisma.address.findFirst({ where: { userId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] });
  }
}
