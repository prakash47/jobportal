import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminStaffController } from './admin-staff.controller';
import { AdminStaffService } from './admin-staff.service';

// SRS §4.16 — the Roles & Permissions console (/sadmin/roles), ADR 0007.
//
// AuthModule provides AuthService (issueSession — the auto-login on invite
// accept) and re-exports EmailModule (EmailService — the invite email producer).
//
// AdminGuard is deliberately NOT in providers. Its only constructor dependency
// is Reflector, which Nest core always supplies, and nine other controllers
// import it directly without any module providing it.
@Module({
  imports: [AuthModule],
  controllers: [AdminStaffController],
  providers: [AdminStaffService],
})
export class AdminStaffModule {}
