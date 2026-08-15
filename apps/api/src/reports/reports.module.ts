import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

// Mirrors PublicJobsModule, the other consumer of OptionalJwtAuthGuard: the
// guard has to be provided here as well as imported, because it is a plain
// injectable rather than something AuthModule exports.
@Module({
  imports: [AuthModule],
  controllers: [ReportsController],
  providers: [ReportsService, OptionalJwtAuthGuard],
})
export class ReportsModule {}
