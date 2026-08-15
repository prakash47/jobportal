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
      // Best-effort: correct the saved/applied state from the bulk endpoint
      // (the detail payload doesn't carry per-user markers).
      final state = await repo.jobState([job.id]);
      if (!mounted || _job?.id != job.id) return;
      setState(() {
        _saved = state.saved.contains(job.id);
        _applied = state.applied.containsKey(job.id);
      });
      await _loadQuota(repo);
      // Similar jobs load last and never throw — the section simply stays
      // hidden if the query comes back empty.
      final similar = await repo.similar(job);
      if (!mounted || _job?.id != job.id) return;
      setState(() => _similar = similar);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e is JobsException ? e.message : 'Could not load this job.';
        _loading = false;
      });
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
      // The 201 carries no quota, so the cached figure is now one stale.
      await _loadQuota(repo);
    } catch (e) {
      if (!mounted) return;
      // No resume on file → offer to upload one, then retry the application.
      if (e is JobsException && e.code == 'RESUME_REQUIRED') {
        final uploaded = await _promptResumeUpload();
        if (!mounted) return;
        if (uploaded) {
          await _apply(); // retry now that a resume exists
          return;
        }
        setState(() => _applying = false);
        return;
      }
      // Quota exhausted → reflect it in the bar, not just in a toast that
      // disappears and leaves an apparently-tappable Apply button.
      if (e is JobsException && e.code == 'QUOTA_EXCEEDED') {
        final limit = _quota?.limit ?? 0;
        setState(() {
          _applying = false;
          _quota = ApplyQuota(count: limit, limit: limit);
        });
        _toast(e.message, error: true);
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
      return _ErrorView(message: _error!, onRetry: _load);
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
            _fact(context, Icons.calendar_today_rounded, 'Posted ${postedAgo(job.postedAt)}'),
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
              for (final s in job.skills) _skillChip(context, s.name),
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

Widget _skillChip(BuildContext context, String label) {
  final cq = context.cq;
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: 6),
    decoration: BoxDecoration(
      color: cq.accent.withValues(alpha: 0.10),
      borderRadius: BorderRadius.circular(AppRadius.pill),
      border: Border.all(color: cq.accent.withValues(alpha: 0.30)),
    ),
    child: Text(
      label,
      style: Theme.of(context).textTheme.labelMedium?.copyWith(color: cq.accent),
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

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_rounded, size: 40, color: context.cq.fgSubtle),
            const SizedBox(height: AppSpacing.lg),
            Text(message, textAlign: TextAlign.center, style: text.bodyLarge),
            const SizedBox(height: AppSpacing.lg),
            OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
          ],
        ),
      ),
    );
  }
}
