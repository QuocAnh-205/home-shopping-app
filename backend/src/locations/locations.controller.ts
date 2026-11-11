import { Controller, Get, Header, Param, ParseIntPipe, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';
import { GeocoderService, ReverseResult } from './geocoder.service';
import { ApiTags } from '@nestjs/swagger';
import { LocationsService, ProvinceView, WardView } from './locations.service';

export class ReverseQuery {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;
}

@ApiTags('locations')
@Controller('locations')
export class LocationsController {
  constructor(
    private readonly locations: LocationsService,
    private readonly geocoder: GeocoderService,
  ) {}

  /** Tọa độ GPS / điểm chọn trên bản đồ → gợi ý tỉnh/xã (đơn vị hành chính mới) + số nhà, tên đường */
  @Get('reverse')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  reverse(@Query() q: ReverseQuery): Promise<ReverseResult> {
    return this.geocoder.reverse(q.lat, q.lng);
  }

  /** 34 tỉnh/thành (đơn vị hành chính mới) cho ô chọn địa chỉ */
  @Get('provinces')
  @Header('Cache-Control', 'public, max-age=3600')
  provinces(): Promise<ProvinceView[]> {
    return this.locations.provinces();
  }

  /** Xã/phường của 1 tỉnh */
  @Get('provinces/:code/wards')
  @Header('Cache-Control', 'public, max-age=3600')
  wards(@Param('code', ParseIntPipe) code: number): Promise<WardView[]> {
    return this.locations.wards(code);
  }
}
