import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EducationController } from './education.controller';
import { EducationService } from './education.service';
import { ExperienceController } from './experience.controller';
import { ExperienceService } from './experience.service';
import { LanguagesController } from './languages.controller';
import { LanguagesService } from './languages.service';
import { ProfileController } from './profile.controller';
import { StorageModule } from '../storage/storage.module';
import { ClamAVModule } from '../clamav/clamav.module';
import { ProfileService } from './profile.service';
import { ProfilePhotoService } from './photo.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProfileSkillsController } from './skills.controller';
import { ProfileSkillsService } from './skills.service';

@Module({
  imports: [AuthModule, StorageModule, ClamAVModule],
  controllers: [
    ProfileController,
    EducationController,
    ExperienceController,
    ProfileSkillsController,
    ProjectsController,
    LanguagesController,
  ],
  providers: [
    ProfileService,
    ProfilePhotoService,
    EducationService,
    ExperienceService,
    ProfileSkillsService,
    ProjectsService,
    LanguagesService,
  ],
  exports: [ProfileService],
})
export class ProfileModule {}
