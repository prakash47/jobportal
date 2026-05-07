import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ApplicationsModule } from './applications/applications.module';
import { AuthModule } from './auth/auth.module';
import { CachePurgeModule } from './cache-purge/cache-purge.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { SavedJobsModule } from './saved-jobs/saved-jobs.module';

@Module({
  imports: [
    AuthModule,
    FeatureFlagsModule,
    ApplicationsModule,
    SavedJobsModule,
    CachePurgeModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
