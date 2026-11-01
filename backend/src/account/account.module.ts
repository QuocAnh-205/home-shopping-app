import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

@Module({
  imports: [ProductsModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
