import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { memoryStorage } from 'multer';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { StorageService } from '../storage/storage.service';
import { CompareProductsQuery, CreateProductDto, ListProductsQuery, ProductFacetsQuery, UpdateProductDto, UpdateStockDto } from './products.dto';
import { ProductDetail, ProductFacets, ProductPage, ProductView, ProductsService, StoreSummary } from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@Query() query: ListProductsQuery): Promise<ProductPage> {
    return this.products.list(query);
  }

  /** Bán chạy nhất (theo số lượng đã bán) – giữ đường dẫn /hot để tương thích client cũ */
  @Get(['hot', 'best-sellers'])
  bestSellers(): Promise<ProductView[]> {
    return this.products.bestSellers();
  }

  /** Đang giảm giá sâu nhất */
  @Get('summary')
  summary(): Promise<StoreSummary> {
    return this.products.summary();
  }

  @Get('deals')
  deals(): Promise<ProductView[]> {
    return this.products.deals();
  }

  /** Bộ lọc kỹ thuật: số sản phẩm theo chất liệu / công suất / dung tích (chỉ trả lựa chọn có hàng) */
  @Get('facets')
  facets(@Query() query: ProductFacetsQuery): Promise<ProductFacets> {
    return this.products.facets(query.category);
  }

  /** So sánh 2–4 sản phẩm: ?slugs=a,b,c (giữ đúng thứ tự khách chọn) */
  @Get('compare')
  compare(@Query() query: CompareProductsQuery): Promise<ProductView[]> {
    return this.products.bySlugs(query.slugs);
  }

  @Get(':slug')
  bySlug(@Param('slug') slug: string): Promise<ProductDetail> {
    if (!/^[a-z0-9-]{1,200}$/.test(slug)) throw new BadRequestException('Invalid slug');
    return this.products.bySlug(slug);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateProductDto): Promise<ProductView> {
    const product = await this.products.create(dto);
    await this.audit.log({
      actorId: req.user.sub,
      action: 'product.create',
      entityType: 'product',
      entityId: product.id,
      summary: `Tạo sản phẩm "${product.name}" – giá ${product.price}, tồn kho ${product.stock}`,
    });
    return product;
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async update(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto): Promise<ProductView> {
    if (Object.keys(dto).length === 0) throw new BadRequestException('Nothing to update');
    const product = await this.products.update(id, dto);
    await this.audit.log({
      actorId: req.user.sub,
      action: 'product.update',
      entityType: 'product',
      entityId: id,
      summary: `Sửa sản phẩm "${product.name}" (${Object.keys(dto).join(', ')})`,
      metadata: { changes: dto },
    });
    return product;
  }

  @Patch(':id/stock')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateStock(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStockDto): Promise<ProductView> {
    const product = await this.products.updateStock(id, dto.stock);
    await this.audit.log({
      actorId: req.user.sub,
      action: 'product.stock',
      entityType: 'product',
      entityId: id,
      summary: `Cập nhật tồn kho "${product.name}" = ${dto.stock}`,
    });
    return product;
  }

  @Post(':id/image')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
      fileFilter: (_req, file, cb) =>
        StorageService.isAllowedMime(file.mimetype)
          ? cb(null, true)
          : cb(new BadRequestException('Only JPEG, PNG or WEBP images are allowed'), false),
    }),
  )
  async uploadImage(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ProductView> {
    if (!file) throw new BadRequestException('File is required');
    // Content-Type do client tự khai → xác minh lại bằng magic bytes để chặn file độc đổi đuôi
    if (!StorageService.matchesSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException('File content does not match its declared image type');
    }
    const product = await this.products.attachImage(id, file.buffer, file.mimetype);
    await this.audit.log({ actorId: req.user.sub, action: 'product.image', entityType: 'product', entityId: id, summary: `Đổi ảnh sản phẩm "${product.name}"` });
    return product;
  }
}
