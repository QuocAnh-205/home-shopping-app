import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { LocationsController } from './locations.controller';
import { GeocoderService } from './geocoder.service';
import { LocationsService } from './locations.service';

@Global()
@Module({
  controllers: [LocationsController],
  providers: [
    LocationsService,
    // GeocoderService có tham số http (fetch) để test; Nest tạo bằng factory với fetch thật
    {
      provide: GeocoderService,
      inject: [PrismaService, RedisService, ConfigService],
      useFactory: (prisma: PrismaService, redis: RedisService, config: ConfigService) => new GeocoderService(prisma, redis, config),
    },
  ],
  exports: [LocationsService, GeocoderService],
})
export class LocationsModule {}
