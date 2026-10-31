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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { StorageService } from '../storage/storage.service';
import { CreateProductDto, ListProductsQuery, UpdateProductDto, UpdateStockDto } from './products.dto';
import { ProductPage, ProductView, ProductsService, StoreSummary } from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

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

  @Get(':slug')
  bySlug(@Param('slug') slug: string): Promise<ProductView> {
    if (!/^[a-z0-9-]{1,200}$/.test(slug)) throw new BadRequestException('Invalid slug');
    return this.products.bySlug(slug);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateProductDto): Promise<ProductView> {
    return this.products.create(dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto): Promise<ProductView> {
    if (Object.keys(dto).length === 0) throw new BadRequestException('Nothing to update');
    return this.products.update(id, dto);
  }

  @Patch(':id/stock')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  updateStock(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStockDto): Promise<ProductView> {
    return this.products.updateStock(id, dto.stock);
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
  uploadImage(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: Express.Multer.File): Promise<ProductView> {
    if (!file) throw new BadRequestException('File is required');
    // Content-Type do client tự khai → xác minh lại bằng magic bytes để chặn file độc đổi đuôi
    if (!StorageService.matchesSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException('File content does not match its declared image type');
    }
    return this.products.attachImage(id, file.buffer, file.mimetype);
  }
}
