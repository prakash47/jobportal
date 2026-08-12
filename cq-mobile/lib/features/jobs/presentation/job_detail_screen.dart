import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/config/app_config.dart';
import '../../../core/format/job_format.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/company_avatar.dart';
import '../../../shared/widgets/cq_buttons.dart';
import '../../../shared/widgets/cq_loader.dart';
import '../../../shared/widgets/simple_markdown.dart';
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

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
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
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e is JobsException ? e.message : 'Could not load this job.';
        _loading = false;
      });
    }
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
    } catch (e) {
      if (!mounted) return;
      setState(() => _applying = false);
      _toast(e is JobsException ? e.message : 'Could not apply. Please try again.',
          error: true);
    }
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
        const SizedBox(height: AppSpacing.lg),
      ],
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
      child: _applied
          ? Row(
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
          : !job.isActive
              ? Text(
                  'This job is no longer accepting applications.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: cq.fgMuted),
                )
              : CqPrimaryButton(
                  label: 'Apply now',
                  icon: Icons.send_rounded,
                  loading: _applying,
                  onPressed: _apply,
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
