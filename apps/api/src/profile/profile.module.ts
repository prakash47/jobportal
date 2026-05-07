import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EducationController } from './education.controller';
import { EducationService } from './education.service';
import { ExperienceController } from './experience.controller';
import { ExperienceService } from './experience.service';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { ProfileSkillsController } from './skills.controller';
import { ProfileSkillsService } from './skills.service';

@Module({
  imports: [AuthModule],
  controllers: [
    ProfileController,
    EducationController,
    ExperienceController,
    ProfileSkillsController,
  ],
  providers: [ProfileService, EducationService, ExperienceService, ProfileSkillsService],
  exports: [ProfileService],
})
export class ProfileModule {}
