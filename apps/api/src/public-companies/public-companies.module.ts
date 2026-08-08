import { Module } from '@nestjs/common';
import { PublicCompaniesController } from './public-companies.controller';
import { PublicCompaniesService } from './public-companies.service';

@Module({
  controllers: [PublicCompaniesController],
  providers: [PublicCompaniesService],
})
export class PublicCompaniesModule {}
