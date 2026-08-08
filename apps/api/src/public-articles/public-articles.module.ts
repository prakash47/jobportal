import { Module } from '@nestjs/common';
import { PublicArticlesController } from './public-articles.controller';
import { PublicArticlesService } from './public-articles.service';

@Module({
  controllers: [PublicArticlesController],
  providers: [PublicArticlesService],
})
export class PublicArticlesModule {}
