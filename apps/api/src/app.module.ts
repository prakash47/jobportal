import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';

@Module({
  imports: [AuthModule, FeatureFlagsModule],
  controllers: [AppController],
})
export class AppModule {}
