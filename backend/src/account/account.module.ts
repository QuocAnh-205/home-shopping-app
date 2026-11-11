import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { AccountController } from './account.controller';
import { AccountCenterService } from './account-center.service';
import { AccountService } from './account.service';
import { BanksService } from './banks.service';

@Module({
  imports: [ProductsModule],
  controllers: [AccountController],
  providers: [AccountService, AccountCenterService, BanksService],
  exports: [BanksService],
})
export class AccountModule {}
