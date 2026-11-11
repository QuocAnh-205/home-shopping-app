import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ListReviewsQuery, UpsertReviewDto } from './reviews.dto';
import { LatestReview, ReviewPage, ReviewView, ReviewsService } from './reviews.service';

const SLUG_RE = /^[a-z0-9-]{1,200}$/;

function assertSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) throw new BadRequestException('Invalid slug');
}

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('reviews/latest')
  latest(): Promise<LatestReview[]> {
    return this.reviews.latest();
  }

  @Get('products/:slug/reviews')
  list(@Param('slug') slug: string, @Query() query: ListReviewsQuery): Promise<ReviewPage> {
    assertSlug(slug);
    return this.reviews.list(slug, query);
  }

  @Get('products/:slug/reviews/mine')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async mine(@Param('slug') slug: string, @Req() req: AuthenticatedRequest): Promise<{ review: ReviewView | null; canReview: boolean }> {
    assertSlug(slug);
    const [review, canReview] = await Promise.all([this.reviews.mine(slug, req.user.sub), this.reviews.canReview(slug, req.user.sub)]);
    return { review, canReview };
  }

  @Put('products/:slug/reviews')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  upsert(@Param('slug') slug: string, @Req() req: AuthenticatedRequest, @Body() dto: UpsertReviewDto): Promise<ReviewView> {
    assertSlug(slug);
    return this.reviews.upsert(slug, req.user.sub, dto);
  }

  @Delete('products/:slug/reviews/mine')
  @HttpCode(204)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async removeMine(@Param('slug') slug: string, @Req() req: AuthenticatedRequest): Promise<void> {
    assertSlug(slug);
    await this.reviews.removeMine(slug, req.user.sub);
  }
}
