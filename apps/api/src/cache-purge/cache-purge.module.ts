import { Module } from '@nestjs/common';
import { CachePurgeService } from './cache-purge.service';

@Module({
  providers: [CachePurgeService],
  exports: [CachePurgeService],
})
export class CachePurgeModule {}
