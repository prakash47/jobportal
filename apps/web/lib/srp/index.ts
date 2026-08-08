export {
  cityBreadcrumb,
  homeOnly,
  skillBreadcrumb,
  skillCityBreadcrumb,
} from './breadcrumbs';
// The SRP param mapping moved to @jobportal/domain so the mobile GET /jobs
// applies the identical URL→SearchJobsParams rules (ADR 0002) — including the
// years→months conversion and the emp/mode no-ops.
export {
  buildSrpHref,
  parseSrpSearchParams,
  readSelections,
  type SrpHrefInput,
  type SrpQuerySchema,
} from '@jobportal/domain/srp-params';
export { loadSrpUserContext, type SrpUserContext } from './user-context';
