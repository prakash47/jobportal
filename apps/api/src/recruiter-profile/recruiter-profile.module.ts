import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClamAVModule } from '../clamav/clamav.module';
import { StorageModule } from '../storage/storage.module';
import { RecruiterProfileController } from './recruiter-profile.controller';
import { RecruiterProfileService } from './recruiter-profile.service';

@Module({
  imports: [AuthModule, StorageModule, ClamAVModule],
  controllers: [RecruiterProfileController],
  providers: [RecruiterProfileService],
})
export class RecruiterProfileModule {}
