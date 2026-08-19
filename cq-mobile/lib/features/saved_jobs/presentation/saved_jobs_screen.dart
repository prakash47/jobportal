import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/ui/refresh_failure.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../shell/presentation/app_drawer.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cq_loader.dart';
import '../data/saved_job.dart';
import '../data/saved_jobs_repository.dart';
import '../../../core/state/data_freshness.dart';
import '../../../shared/widgets/cq_states.dart';
import '../../../shared/widgets/cq_buttons.dart';
import '../../shell/application/shell_tab.dart';

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
String? _fmtDate(DateTime? d) => d == null ? null : '${d.day} ${_months[d.month - 1]} ${d.year}';

/// Saved jobs tab — reads `/me/saved-jobs`.
///
/// Jobs are saved from the job detail screen in this app (POST
/// /me/saved-jobs/:jobId); here the seeker reviews and removes them, and sees
/// which they have already applied to. The list refreshes itself when a job is
/// saved elsewhere — see CqData.savedJobs.
class SavedJobsScreen extends ConsumerStatefulWidget {
  const SavedJobsScreen({super.key});

  @override
  ConsumerState<SavedJobsScreen> createState() => _SavedJobsScreenState();
}

class _SavedJobsScreenState extends ConsumerState<SavedJobsScreen> {
  SavedJobsRepository? _repo;
  SavedJobsPage? _page;
  bool _loading = true;
  String? _error;
  int _currentPage = 1;

  @override
  void initState() {
    super.initState();
    _load(1);
  }

  Future<SavedJobsRepository> _repository() async {
    final existing = _repo;
    if (existing != null) return existing;
    final repo = await ref.read(savedJobsRepositoryProvider.future);
    _repo = repo;
    return repo;
  }

  Future<void> _load(int page) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await (await _repository()).list(page: page);
      if (!mounted) return;
      setState(() {
        _page = data;
        _currentPage = data.page;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      final message = e is SavedJobsException
            ? e.message
            : 'Could not load your saved jobs.';
        _loading = false;
      // A refresh that fails keeps what is already on screen — see
      // core/ui/refresh_failure.dart.
      if (keepContentOnFailure(context, message, hasContent: _page != null)) {
        setState(() => _loading = false);
        return;
      }
      setState(() {
        _error = message;
        _loading = false;
      });
    }
  }

  Future<void> _remove(SavedJob job) async {
    final page = _page;
    if (page == null) return;
    // Optimistic removal.
    setState(() {
      _page = SavedJobsPage(
        hits: page.hits.where((j) => j.jobId != job.jobId).toList(),
        total: (page.total - 1).clamp(0, 1 << 31),
        page: page.page,
        pageSize: page.pageSize,
      );
    });
    try {
      await (await _repository()).remove(job.jobId);
      ref.bumpData(CqData.savedJobs);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text('Removed "${job.title}"')));
      // If this page emptied out, step back to the previous one.
      if ((_page?.hits.isEmpty ?? true) && _currentPage > 1) {
        _load(_currentPage - 1);
      }
    } catch (e) {
      if (!mounted) return;
      _load(_currentPage); // reconcile with server on failure
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              e is SavedJobsException ? e.message : 'Could not remove that job.',
            ),
          ),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    // This tab is mounted for the whole session inside the shell's IndexedStack,
    // so it never rebuilds on its own. Saving a job from the detail screen has
    // to reach it, or it keeps showing the empty state after the user just
    // saved something.
    ref.onDataChanged(CqData.savedJobs, () => _load(_currentPage));
    return Scaffold(
      drawer: const AppDrawer(),
      appBar: AppBar(title: const Text('Saved jobs')),
      body: SafeArea(child: _body()),
    );
  }

  Widget _body() {
    if (_loading) {
      return const Center(child: CqLoader(message: 'Loading saved jobs…'));
    }
    if (_error != null) {
      return CqErrorView(message: _error!, onRetry: () => _load(_currentPage));
    }
    final page = _page!;
    if (page.hits.isEmpty) return const _EmptySaved();

    return RefreshIndicator(
      onRefresh: () => _load(_currentPage),
      child: ListView.separated(
        padding: const EdgeInsets.all(AppSpacing.lg),
        itemCount: page.hits.length + 1,
        separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
        itemBuilder: (context, i) {
          if (i == page.hits.length) return CqPager(page: page.page, totalPages: page.totalPages, onGo: _load);
          final job = page.hits[i];
          return _SavedJobCard(
            job: job,
            onRemove: () => _remove(job),
            onTap: job.canonicalSlug.isEmpty
                ? null
                : () => context.push(AppRoutes.jobDetailPath(job.canonicalSlug)),
          );
        },
      ),
    );
  }
}

class _SavedJobCard extends StatelessWidget {
  const _SavedJobCard({required this.job, required this.onRemove, this.onTap});

  final SavedJob job;
  final VoidCallback onRemove;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Material(
      color: cq.surfaceMuted,
      borderRadius: BorderRadius.circular(AppRadius.md),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.lg),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: cq.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(job.title, style: text.titleMedium),
                        if (job.companyName.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(
                            job.companyName,
                            style: text.bodyMedium?.copyWith(color: cq.fgMuted),
                          ),
                        ],
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Remove',
                    icon: Icon(Icons.bookmark_remove_outlined, color: cq.fgMuted),
                    onPressed: onRemove,
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.xs,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                switch (_fmtDate(job.savedAt)) {
                  final d? => 'Saved $d',
                  _ => '',
                },
                style: text.bodySmall?.copyWith(color: cq.fgSubtle),
              ),
              if (!job.isActive)
                _Badge(
                  job.jobStatus == 'CLOSED' || job.jobStatus == 'EXPIRED'
                      ? 'No longer active'
                      : 'Unavailable',
                  bg: cq.surfaceMuted,
                  fg: cq.fgMuted,
                  border: cq.border,
                ),
              if (job.applied)
                _Badge(
                  'Applied${job.appliedStatus != null ? ' · ${_pretty(job.appliedStatus!)}' : ''}',
                  bg: cq.accent.withValues(alpha: 0.14),
                  fg: cq.accent,
                  border: cq.accent.withValues(alpha: 0.4),
                ),
            ],
          ),
        ],
          ),
        ),
      ),
    );
  }

  String _pretty(String s) =>
      s[0].toUpperCase() + s.substring(1).toLowerCase().replaceAll('_', ' ');
}

class _Badge extends StatelessWidget {
  const _Badge(this.label, {required this.bg, required this.fg, required this.border});
  final String label;
  final Color bg, fg, border;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppRadius.sm),
        border: Border.all(color: border),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(color: fg),
      ),
    );
  }
}


class _EmptySaved extends ConsumerWidget {
  const _EmptySaved();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.bookmark_border_rounded, size: 48, color: cq.fgSubtle),
            const SizedBox(height: AppSpacing.lg),
            Text('No saved jobs yet', style: text.titleLarge),
            const SizedBox(height: AppSpacing.sm),
            Text(
              'Tap the bookmark on any job to save it here for later.',
              textAlign: TextAlign.center,
              style: text.bodyMedium?.copyWith(color: cq.fgMuted),
            ),
            const SizedBox(height: AppSpacing.xl),
            // An empty state that only describes the emptiness is a dead end —
            // the user is already here, so hand them the way out.
            CqPrimaryButton(
              label: 'Browse jobs',
              icon: Icons.search_rounded,
              onPressed: () =>
                  ref.read(shellTabProvider.notifier).select(ShellTab.jobs),
            ),
          ],
        ),
      ),
    );
  }
}

