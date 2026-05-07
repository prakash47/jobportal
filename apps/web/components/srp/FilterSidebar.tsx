import {
  CityFilter,
  EmploymentTypeFilter,
  ExperienceFilter,
  IndustryFilter,
  PostedWithinFilter,
  SalaryFilter,
  SkillFilter,
  WorkModeFilter,
} from './Filters';

export type FilterOption = { slug: string; name: string };

export interface FilterSidebarProps {
  basePath: string;
  /** Hide the city filter on /jobs-in-... routes where city is in the URL. */
  showCity?: boolean;
  /** Hide the skill filter on /...-jobs routes where skill is in the URL. */
  showSkill?: boolean;
  skills: FilterOption[];
  cities: FilterOption[];
  industries: FilterOption[];
}

export function FilterSidebar({
  basePath,
  showCity = true,
  showSkill = true,
  skills,
  cities,
  industries,
}: FilterSidebarProps) {
  return (
    <aside aria-label="Filters" className="space-y-0">
      {showSkill && <SkillFilter basePath={basePath} options={skills} />}
      {showCity && <CityFilter basePath={basePath} options={cities} />}
      <IndustryFilter basePath={basePath} options={industries} />
      <EmploymentTypeFilter basePath={basePath} />
      <WorkModeFilter basePath={basePath} />
      <ExperienceFilter basePath={basePath} />
      <SalaryFilter basePath={basePath} />
      <PostedWithinFilter basePath={basePath} />
    </aside>
  );
}
