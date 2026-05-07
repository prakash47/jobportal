import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';

@Module({
  imports: [FeatureFlagsModule],
  controllers: [AppController],
})
export class AppModule {}
