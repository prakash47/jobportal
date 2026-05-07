import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClamAVModule } from '../clamav/clamav.module';
import { StorageModule } from '../storage/storage.module';
import { ResumeController } from './resume.controller';
import { ResumeService } from './resume.service';

@Module({
  imports: [AuthModule, StorageModule, ClamAVModule],
  controllers: [ResumeController],
  providers: [ResumeService],
})
export class ResumeModule {}
