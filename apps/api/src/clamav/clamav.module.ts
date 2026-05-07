import { Module } from '@nestjs/common';
import { ClamAVService } from './clamav.service';

@Module({
  providers: [ClamAVService],
  exports: [ClamAVService],
})
export class ClamAVModule {}
