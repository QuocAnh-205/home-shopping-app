import { Controller, Get, Header, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LocationsService, ProvinceView, WardView } from './locations.service';

@ApiTags('locations')
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

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
