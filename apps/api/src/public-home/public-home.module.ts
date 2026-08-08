import { Module } from '@nestjs/common';
import { PublicHomeController } from './public-home.controller';

@Module({ controllers: [PublicHomeController] })
export class PublicHomeModule {}
