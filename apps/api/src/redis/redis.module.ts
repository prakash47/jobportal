import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

// Global so anything (services, guards, schedulers) can inject RedisService
// without importing the module everywhere.
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
