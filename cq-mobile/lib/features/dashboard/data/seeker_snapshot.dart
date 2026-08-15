import '../../jobs/data/job_models.dart';

/// The signed-in seeker's at-a-glance state, shown at the top of Home.
///
/// The website has a standalone dashboard page for this; on mobile the same
/// information belongs on Home, because Saved / Applied / Profile are already
/// one tap away in the bottom bar and a separate hub screen would only
/// duplicate them.
///
/// Every field is best-effort — this is composed from several endpoints and a
/// failure in any one of them leaves that number null rather than failing the
/// whole block. Null means "unknown", which the UI renders as a dash.
class SeekerSnapshot {
  const SeekerSnapshot({
    this.applications,
    this.saved,
    this.alerts,
    this.recommended = const [],
  });

  final int? applications;
  final int? saved;
  final int? alerts;

  /// Jobs matched to the candidate's own skills and preferred cities, with
  /// anything they have already applied to removed.
  final List<JobSummary> recommended;

  bool get hasCounts => applications != null || saved != null || alerts != null;
}
