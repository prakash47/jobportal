import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/config/app_config.dart';
import '../../../core/format/job_format.dart';
import '../../../core/network/external_link.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/company_avatar.dart';
import '../../../shared/widgets/cq_buttons.dart';
import '../../../shared/widgets/cq_loader.dart';
import '../../../shared/widgets/job_row_card.dart';
import '../../../shared/widgets/simple_markdown.dart';
import '../../auth/application/auth_controller.dart';
import '../../resume/presentation/resume_section.dart';
import '../data/job_models.dart';
import '../data/jobs_repository.dart';
import '../../../core/state/data_freshness.dart';
import '../../auth/presentation/verify_email_sheet.dart';
import '../../../shared/widgets/cq_states.dart';
import '../../../shared/widgets/cq_chips.dart';
import '../../reports/presentation/report_job_sheet.dart';

/// The full job (`GET /jobs/:slug`) — header, key facts, markdown description,
/// skills, and an Apply action. Apply is live today (`POST /me/applications`);
/// with sample jobs it shows a preview note instead of hitting the server.
class JobDetailScreen extends ConsumerStatefulWidget {
  const JobDetailScreen({super.key, required this.slug});

  final String slug;

  @override
  ConsumerState<JobDetailScreen> createState() => _JobDetailScreenState();
}

class _JobDetailScreenState extends ConsumerState<JobDetailScreen> {
  JobDetail? _job;
  bool _loading = true;
  String? _error;
  bool _applying = false;
  bool _applied = false;
  bool _saved = false;
  List<JobSummary> _similar = const [];
  ApplyQuota? _quota;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _similar = const [];
    });
    try {
      final repo = await ref.read(jobsRepositoryProvider.future);
      final job = await repo.detail(widget.slug);
      if (!mounted) return;
      setState(() {
        _job = job;
        _applied = job.isApplied;
        _saved = job.isSaved;
        _loading = false;
      });
      await _enrich(repo, job);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e is JobsException ? e.message : 'Could not load this job.';
        _loading = false;
      });
    }
  }

  /// Everything that decorates a job which has already loaded: the per-user
  /// saved/applied markers, today's apply allowance, and the similar-jobs rail.
  ///
  /// Each gets its own catch. They used to sit inside the same `try` as the
  /// job itself, so a failure in any of them set `_error` and replaced a job
  /// that was already on screen with "Could not load this job" — the one thing
  /// that demonstrably had worked. Separate catches also mean a failing
  /// markers call no longer skips the quota and the rail behind it.
  Future<void> _enrich(JobsRepository repo, JobDetail job) async {
    bool stale() => !mounted || _job?.id != job.id;

    try {
      // The detail payload carries no per-user markers, so these come from the
      // bulk endpoint.
      final state = await repo.jobState([job.id]);
      if (stale()) return;
      setState(() {
        _saved = state.saved.contains(job.id);
        _applied = state.applied.containsKey(job.id);
      });
    } catch (_) {
      // Keep whatever the detail payload said.
    }

    try {
      await _loadQuota(repo);
    } catch (_) {
      // The hint above the apply button simply does not appear.
    }

    try {
      final similar = await repo.similar(job);
      if (stale()) return;
      setState(() => _similar = similar);
    } catch (_) {
      // The rail stays hidden.
    }
  }

  /// Today's application allowance, for the hint above the apply button.
  ///
  /// Only fetched for a signed-in user: job detail is viewable anonymously, so
  /// an unconditional fetch would fire a guaranteed 401 on every public view
  /// and spend the shared rate-limit budget for nothing.
  Future<void> _loadQuota(JobsRepository repo) async {
    if (ref.read(authControllerProvider) is! AuthAuthenticated) return;
    final quota = await repo.applyQuota();
    if (!mounted || quota == null) return;
    setState(() => _quota = quota);
  }

  Future<void> _apply() async {
    final job = _job;
    if (job == null || _applying || _applied) return;

    // Sample jobs don't exist server-side, so we don't call the live endpoint.
    if (AppConfig.useMockData) {
      _toast('Applying goes live once real jobs are connected.');
      return;
    }
    setState(() => _applying = true);
    try {
      final repo = await ref.read(jobsRepositoryProvider.future);
      await repo.apply(job.id);
      if (!mounted) return;
      setState(() {
        _applied = true;
        _applying = false;
      });
      _toast('Application submitted');
      ref.bumpData(CqData.applications);
      // The 201 carries no quota, so the cached figure is now one stale.
      await _loadQuota(repo);
    } catch (e) {
      if (!mounted) return;
      // No resume on file → offer to upload one, then retry the application.
      if (e is JobsException && e.code == 'RESUME_REQUIRED') {
        final uploaded = await _promptResumeUpload();
        if (!mounted) return;
        if (uploaded) {
          // Clear the in-flight flag BEFORE recursing. `_apply` guards on
          // `_applying` in its very first line, so retrying with it still set
          // returned immediately: the retry never ran, and `_applying` stayed
          // true forever, leaving Apply stuck on its spinner. That was the
          // path EVERY first-time applicant takes.
          setState(() => _applying = false);
          await _apply(); // retry now that a resume exists
          return;
        }
        setState(() => _applying = false);
        return;
      }
      // Quota exhausted → reflect it in the bar, not just in a toast that
      // disappears and leaves an apparently-tappable Apply button.
      if (e is JobsException && e.code == 'QUOTA_EXCEEDED') {
        // Prefer the numbers the refusal itself carried. Rebuilding them from
        // _quota alone failed exactly when it mattered: the quota GET shares
        // the 100/min budget, so a candidate being refused is a candidate
        // whose quota read has very likely failed too — leaving _quota null,
        // limit 0, and both consumers (the hint and the disable condition)
        // gated on limit > 0. The result was the toast-that-fades-over-a-
        // tappable-button this branch exists to prevent.
        final limit = e.quota?.limit ?? _quota?.limit ?? 0;
        setState(() {
          _applying = false;
          _quota = e.quota ?? ApplyQuota(count: limit, limit: limit);
        });
        _toast(e.message, error: true);
        return;
      }
      // An unverified email is the one apply refusal the user can fix from
      // here, so it opens the verification sheet instead of a toast that fades.
      // The server sends all three of its code-less 403s as plain text, so we
      // identify this one from our OWN state rather than by matching message
      // wording.
      //
      // The job's own status has to be part of that: the other two code-less
      // 403s mean the job is draft, closed or expired, and an unverified
      // candidate who applied to a closed job used to be marched through email
      // verification and then straight back into the same refusal. If the job
      // is not open, the refusal is about the job — show what the server said.
      final auth = ref.read(authControllerProvider);
      if (e is JobsException &&
          e.code == 'FORBIDDEN' &&
          (_job?.isActive ?? false) &&
          auth is AuthAuthenticated &&
          !auth.user.emailVerified) {
        setState(() => _applying = false);
        final verified = await showVerifyEmailSheet(
          context,
          ref,
          email: auth.user.email,
          reason: 'You need a verified email address to apply for this job.',
        );
        if (verified && mounted) await _apply(); // straight back to applying
        return;
      }
      setState(() => _applying = false);
      _toast(e is JobsException ? e.message : 'Could not apply. Please try again.',
          error: true);
    }
  }

  /// Ask the seeker to add a resume (required to apply), then upload it.
  /// Returns true if a resume was uploaded.
  Future<bool> _promptResumeUpload() async {
    final proceed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add a resume to apply'),
        content: const Text(
          'Employers need your resume to consider your application. '
          'Upload a PDF or Word file (up to 5 MB).',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Not now'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Choose file'),
          ),
        ],
      ),
    );
    if (proceed != true || !mounted) return false;
    final resume = await pickAndUploadResume(context, ref);
    if (resume == null) return false;
    if (mounted) _toast('Resume added');
    return true;
  }

  /// Hand the job to the OS share sheet as its canonical website URL — the one
  /// link that works for someone who doesn't have the app.
  Future<void> _share() async {
    final job = _job;
    if (job == null) return;
    final url = '${AppConfig.webBaseUrl}/job/${job.canonicalSlug}';
    final text = '${job.title} at ${job.company.name}\n$url';
    // The share sheet wants the origin rect on iPad; harmless elsewhere.
    final box = context.findRenderObject() as RenderBox?;
    await SharePlus.instance.share(
      ShareParams(
        text: text,
        subject: '${job.title} at ${job.company.name}',
        sharePositionOrigin: box == null
            ? null
            : box.localToGlobal(Offset.zero) & box.size,
      ),
    );
  }

  Future<void> _openCompanyWebsite(String url) async {
    if (await openExternalLink(url)) return;
    if (!mounted) return;
    _toast('Could not open this link', error: true);
  }

  Future<void> _toggleSave() async {
    final job = _job;
    if (job == null) return;
    final next = !_saved;
    setState(() => _saved = next); // optimistic
    try {
      final repo = await ref.read(jobsRepositoryProvider.future);
      await repo.setSaved(job.id, next);
      if (!mounted) return;
      // The Saved tab is already mounted and will not reload itself.
      ref.bumpData(CqData.savedJobs);
      _toast(next ? 'Saved to your list' : 'Removed from saved');
    } catch (e) {
      if (!mounted) return;
      setState(() => _saved = !next); // revert on failure
      _toast(
        e is JobsException ? e.message : 'Could not update saved.',
        error: true,
      );
    }
  }

  void _toast(String message, {bool error = false}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          behavior: SnackBarBehavior.floating,
          backgroundColor: error ? context.cq.danger : context.cq.fg,
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Job details'),
        actions: [
          if (_job != null)
            IconButton(
              tooltip: 'Share',
              icon: const Icon(Icons.ios_share_rounded),
              onPressed: _share,
            ),
          if (_job != null)
            IconButton(
              tooltip: _saved ? 'Saved' : 'Save',
              icon: Icon(_saved ? Icons.bookmark_rounded : Icons.bookmark_border_rounded),
              color: _saved ? context.cq.accent : null,
              onPressed: _toggleSave,
            ),
        ],
      ),
      body: SafeArea(child: _body()),
      bottomNavigationBar: _job == null ? null : _applyBar(_job!),
    );
  }

  Widget _body() {
    if (_loading) {
      return const Center(child: CqLoader(message: 'Loading job…'));
    }
    if (_error != null) {
      return CqErrorView(message: _error!, onRetry: _load);
    }
    final job = _job!;
    final cq = context.cq;
    final text = Theme.of(context).textTheme;

    final salary = formatSalaryLpa(job.salaryMinPaise, job.salaryMaxPaise);
    final exp = formatExperienceYears(job.experienceMinYears, job.experienceMaxYears);
    final location = job.cities.isNotEmpty ? job.cities.join(', ') : null;

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.xl2),
      children: [
        Text(job.title, style: text.headlineSmall),
        const SizedBox(height: AppSpacing.md),
        InkWell(
          onTap: () => context.push(
            AppRoutes.companyPath('${job.company.slug}-overview-${job.company.id}'),
          ),
          borderRadius: BorderRadius.circular(AppRadius.sm),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              children: [
                CompanyAvatar(name: job.company.name, logoUrl: job.company.logoUrl, size: 40),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(job.company.name, style: text.titleSmall),
                      if (location != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          location,
                          style: text.bodySmall?.copyWith(color: cq.fgMuted),
                        ),
                      ],
                    ],
                  ),
                ),
                // Its own tap target inside the company row: the row goes to
                // the company page, this goes to the company's own site.
                if (safeWebUri(job.company.websiteUrl) != null)
                  IconButton(
                    tooltip: 'Company website',
                    icon: const Icon(Icons.language_rounded, size: 20),
                    color: cq.fgSubtle,
                    onPressed: () => _openCompanyWebsite(job.company.websiteUrl!),
                  ),
                Icon(Icons.chevron_right_rounded, size: 20, color: cq.fgSubtle),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.lg),

        // ── Key facts ──
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            if (salary != null) _fact(context, Icons.currency_rupee_rounded, salary),
            if (exp != null) _fact(context, Icons.work_history_outlined, exp),
            if (job.workMode != null)
              _fact(context, Icons.location_city_rounded, workModeLabel(job.workMode)),
            if (job.employmentType != null)
              _fact(context, Icons.schedule_rounded, employmentLabel(job.employmentType)),
            if (postedAgo(job.postedAt) case final posted?)
              _fact(context, Icons.calendar_today_rounded, 'Posted $posted'),
          ],
        ),

        if (!job.isActive) ...[
          const SizedBox(height: AppSpacing.lg),
          _ClosedBanner(status: job.status),
        ],

        const SizedBox(height: AppSpacing.xl),
        Divider(height: 1, color: cq.border),
        const SizedBox(height: AppSpacing.lg),

        Text('Job description', style: text.titleMedium),
        const SizedBox(height: AppSpacing.md),
        SimpleMarkdown(job.body),

        if (job.skills.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xl),
          Text('Skills', style: text.titleMedium),
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              for (final s in job.skills) CqTag(s.name),
            ],
          ),
        ],

        if (job.industry != null) ...[
          const SizedBox(height: AppSpacing.xl),
          Row(
            children: [
              Icon(Icons.domain_rounded, size: 16, color: cq.fgMuted),
              const SizedBox(width: AppSpacing.sm),
              Text(
                job.industry!.name,
                style: text.bodyMedium?.copyWith(color: cq.fgMuted),
              ),
            ],
          ),
        ],

        if (_similar.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xl),
          Divider(height: 1, color: cq.border),
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              Expanded(child: Text('Similar jobs', style: text.titleMedium)),
              TextButton(
                onPressed: () => context.push(AppRoutes.searchPath(job.title)),
                child: const Text('See all'),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          for (final s in _similar) ...[
            JobRowCard(
              job: s,
              // `replace` so a chain of similar-job taps doesn't build an
              // ever-deeper back stack of job screens.
              onTap: () =>
                  context.replace(AppRoutes.jobDetailPath(s.canonicalSlug)),
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
        ],
        // ── Report ──
        //
        // Last thing on the page on purpose: it must be findable but must not
        // compete with Apply. Reachable signed-out too — the job page is public
        // and a browsing stranger is often the one who spots a scam posting.
        const SizedBox(height: AppSpacing.xl),
        Divider(height: 1, color: cq.border),
        const SizedBox(height: AppSpacing.sm),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => showReportJobSheet(
              context,
              ref,
              jobId: job.id,
              jobTitle: job.title,
            ),
            icon: Icon(Icons.flag_outlined, size: 17, color: cq.fgMuted),
            label: Text(
              'Report this job',
              style: Theme.of(
                context,
              ).textTheme.labelLarge?.copyWith(color: cq.fgMuted),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
      ],
    );
  }

  /// "3 of 10 applications left today", above the Apply button.
  ///
  /// Hidden entirely for unlimited plans (where the server pins `count` to a
  /// meaningless 0) and when the limit is unknown. No "resets at midnight"
  /// copy: the server buckets the counter in UTC, so for India it actually
  /// rolls over at 05:30 IST and any clock-time promise would be wrong.
  Widget? _quotaHint(JobDetail job) {
    final quota = _quota;
    if (quota == null || quota.unlimited || quota.limit <= 0) return null;
    if (_applied || !job.isActive) return null;
    final exhausted = quota.remaining == 0;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Text(
        exhausted
            ? "You've used today's applications. More tomorrow."
            : '${quota.remaining} of ${quota.limit} applications left today',
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.labelMedium?.copyWith(
          color: exhausted ? context.cq.warning : context.cq.fgMuted,
        ),
      ),
    );
  }

  Widget _applyBar(JobDetail job) {
    final cq = context.cq;
    return Container(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.md,
        AppSpacing.lg,
        AppSpacing.md + MediaQuery.of(context).padding.bottom,
      ),
      decoration: BoxDecoration(
        color: Theme.of(context).scaffoldBackgroundColor,
        border: Border(top: BorderSide(color: cq.border)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ?_quotaHint(job),
          if (_applied)
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.check_circle_rounded, color: cq.success),
                const SizedBox(width: AppSpacing.sm),
                Text(
                  'Application submitted',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(color: cq.success),
                ),
              ],
            )
          else if (!job.isActive)
            Text(
              'This job is no longer accepting applications.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: cq.fgMuted),
            )
          else
            CqPrimaryButton(
              label: 'Apply now',
              icon: Icons.send_rounded,
              loading: _applying,
              // Out of applications → the button stops pretending it will work.
              onPressed: (_quota != null &&
                      !_quota!.unlimited &&
                      _quota!.limit > 0 &&
                      _quota!.remaining == 0)
                  ? null
                  : _apply,
            ),
        ],
      ),
    );
  }
}

Widget _fact(BuildContext context, IconData icon, String label) {
  final cq = context.cq;
  return Container(
    padding: const EdgeInsets.symmetric(
      horizontal: AppSpacing.md,
      vertical: AppSpacing.sm,
    ),
    decoration: BoxDecoration(
      color: cq.surfaceMuted,
      borderRadius: BorderRadius.circular(AppRadius.sm),
      border: Border.all(color: cq.border),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 15, color: cq.fgMuted),
        const SizedBox(width: 6),
        Text(
          label,
          style: Theme.of(context).textTheme.labelMedium?.copyWith(color: cq.fg),
        ),
      ],
    ),
  );
}


class _ClosedBanner extends StatelessWidget {
  const _ClosedBanner({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final label = status == 'EXPIRED'
        ? 'This job posting has expired.'
        : 'This job is closed and no longer active.';
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: cq.warning.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(AppRadius.sm),
        border: Border.all(color: cq.warning.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          Icon(Icons.info_outline_rounded, size: 18, color: cq.warning),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: cq.fg),
            ),
          ),
        ],
      ),
    );
  }
}

