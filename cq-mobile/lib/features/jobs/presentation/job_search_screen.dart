import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format/job_format.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../shell/presentation/app_drawer.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/company_avatar.dart';
import '../../../shared/widgets/cq_loader.dart';
import '../data/job_filters.dart';
import '../data/job_models.dart';
import '../data/jobs_repository.dart';
import 'job_filters_sheet.dart';

/// Jobs tab — search + browse the job feed. Reads the public `/jobs` endpoint
/// (static sample data until the backend ships it). Each result taps through to
/// the full job detail.
class JobSearchScreen extends ConsumerStatefulWidget {
  const JobSearchScreen({super.key, this.initialQuery});

  /// When set (e.g. pushed from Home with a role/city/skill), the screen opens
  /// pre-filtered to this query.
  final String? initialQuery;

  @override
  ConsumerState<JobSearchScreen> createState() => _JobSearchScreenState();
}

class _JobSearchScreenState extends ConsumerState<JobSearchScreen> {
  JobsRepository? _repo;
  final _controller = TextEditingController();
  String _query = '';
  String _sort = 'relevance';
  JobFilters _filters = const JobFilters();
  JobsPage? _page;
  bool _loading = true;
  String? _error;
  int _currentPage = 1;

  @override
  void initState() {
    super.initState();
    final q = widget.initialQuery;
    if (q != null && q.trim().isNotEmpty) {
      _query = q.trim();
      _controller.text = _query;
    }
    _load(1);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<JobsRepository> _repository() async {
    final existing = _repo;
    if (existing != null) return existing;
    final repo = await ref.read(jobsRepositoryProvider.future);
    _repo = repo;
    return repo;
  }

  Future<void> _load(int page) async {
    setState(() {
      if (_page == null) _loading = true; // keep the list mounted during refresh
      _error = null;
    });
    try {
      final repo = await _repository();
      final data = await repo.search(
        q: _query,
        page: page,
        sort: _sort,
        filters: _filters,
      );
      if (!mounted) return;
      setState(() {
        _page = data;
        _currentPage = data.page;
        _loading = false;
      });
      _enrichMarkers(repo, data); // best-effort saved/applied badges
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e is JobsException ? e.message : 'Could not load jobs.';
        _loading = false;
      });
    }
  }

  /// Overlay per-user saved/applied markers once the list is on screen (one
  /// bulk call instead of 20). Silently no-ops if it fails or the page changed.
  Future<void> _enrichMarkers(JobsRepository repo, JobsPage page) async {
    final ids = page.hits.map((h) => h.id).toList();
    if (ids.isEmpty) return;
    final state = await repo.jobState(ids);
    if (!mounted || !identical(_page, page)) return;
    if (state.saved.isEmpty && state.applied.isEmpty) return;
    setState(() {
      _page = JobsPage(
        hits: page.hits
            .map(
              (h) => h.copyWith(
                isSaved: state.saved.contains(h.id),
                isApplied: state.applied.containsKey(h.id),
              ),
            )
            .toList(),
        total: page.total,
        page: page.page,
        pageSize: page.pageSize,
      );
    });
  }

  void _runSearch() {
    FocusScope.of(context).unfocus();
    _query = _controller.text.trim();
    _load(1);
  }

  void _setSort(String sort) {
    if (_sort == sort) return;
    _sort = sort;
    _load(1);
  }

  Future<void> _openFilters() async {
    final r = await showJobFilters(context, _filters);
    if (r != null) {
      setState(() => _filters = r);
      _load(1);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    return Scaffold(
      drawer: const AppDrawer(),
      appBar: AppBar(title: const Text('Jobs')),
      body: SafeArea(
        child: Column(
          children: [
            // ── Search + sort ──
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.sm,
                AppSpacing.lg,
                AppSpacing.sm,
              ),
              child: Column(
                children: [
                  TextField(
                    controller: _controller,
                    textInputAction: TextInputAction.search,
                    onSubmitted: (_) => _runSearch(),
                    decoration: InputDecoration(
                      hintText: 'Search jobs, skills, companies',
                      prefixIcon: const Icon(Icons.search_rounded),
                      suffixIcon: _controller.text.isEmpty
                          ? null
                          : IconButton(
                              icon: const Icon(Icons.close_rounded),
                              onPressed: () {
                                _controller.clear();
                                _runSearch();
                              },
                            ),
                    ),
                    onChanged: (_) => setState(() {}), // toggle the clear button
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.sm,
                    children: [
                      _FilterButton(count: _filters.activeCount, onTap: _openFilters),
                      _SortChip(
                        label: 'Relevant',
                        selected: _sort == 'relevance',
                        onTap: () => _setSort('relevance'),
                      ),
                      _SortChip(
                        label: 'Newest',
                        selected: _sort == 'recent',
                        onTap: () => _setSort('recent'),
                      ),
                      _SortChip(
                        label: 'Highest pay',
                        selected: _sort == 'salary_desc',
                        onTap: () => _setSort('salary_desc'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Divider(height: 1, color: cq.border),
            Expanded(child: _body()),
          ],
        ),
      ),
    );
  }

  Widget _body() {
    if (_loading) {
      return const Center(child: CqLoader(message: 'Finding jobs…'));
    }
    if (_error != null) {
      return _ErrorView(message: _error!, onRetry: () => _load(_currentPage));
    }
    final page = _page!;
    if (page.hits.isEmpty) return _EmptyResults(query: _query);

    return RefreshIndicator(
      onRefresh: () => _load(_currentPage),
      child: ListView.separated(
        padding: const EdgeInsets.all(AppSpacing.lg),
        itemCount: page.hits.length + 2,
        separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
        itemBuilder: (context, i) {
          if (i == 0) {
            return Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.xs),
              child: Text(
                '${page.total} ${page.total == 1 ? 'job' : 'jobs'}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: context.cq.fgMuted,
                ),
              ),
            );
          }
          if (i == page.hits.length + 1) return _Pager(page: page, onGo: _load);
          final job = page.hits[i - 1];
          return _JobCard(
            job: job,
            onTap: () => context.push(AppRoutes.jobDetailPath(job.canonicalSlug)),
          );
        },
      ),
    );
  }
}

class _JobCard extends StatelessWidget {
  const _JobCard({required this.job, required this.onTap});

  final JobSummary job;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    final salary = formatSalaryLpa(job.salaryMin, job.salaryMax);
    final exp = formatExperienceMonths(job.minExperienceMonths, job.maxExperienceMonths);
    final hasCity = (job.city ?? '').isNotEmpty;
    final sub = hasCity ? '${job.company.name}  ·  ${job.city}' : job.company.name;

    return Material(
      color: cq.surfaceMuted,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.md),
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
                  CompanyAvatar(name: job.company.name, logoUrl: job.company.logoUrl),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          job.title,
                          style: text.titleMedium,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          sub,
                          style: text.bodyMedium?.copyWith(color: cq.fgMuted),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  if (job.isSaved)
                    Icon(Icons.bookmark_rounded, size: 18, color: cq.accent),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              Wrap(
                spacing: AppSpacing.lg,
                runSpacing: AppSpacing.xs,
                children: [
                  if (salary != null)
                    _meta(context, Icons.currency_rupee_rounded, salary),
                  if (exp != null)
                    _meta(context, Icons.work_history_outlined, exp),
                  _meta(context, Icons.schedule_rounded, postedAgo(job.postedAt)),
                ],
              ),
              if (job.skills.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.md),
                Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: [
                    for (final s in job.skills.take(4)) _skillChip(context, s),
                    if (job.skills.length > 4)
                      _skillChip(context, '+${job.skills.length - 4}'),
                  ],
                ),
              ],
              if (job.isApplied) ...[
                const SizedBox(height: AppSpacing.md),
                Row(
                  children: [
                    Icon(Icons.check_circle_rounded, size: 15, color: cq.success),
                    const SizedBox(width: 4),
                    Text(
                      'Applied',
                      style: text.labelSmall?.copyWith(color: cq.success),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

Widget _meta(BuildContext context, IconData icon, String label) {
  final cq = context.cq;
  return Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, size: 14, color: cq.fgMuted),
      const SizedBox(width: 4),
      Text(
        label,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(color: cq.fgMuted),
      ),
    ],
  );
}

Widget _skillChip(BuildContext context, String label) {
  final cq = context.cq;
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: 3),
    decoration: BoxDecoration(
      color: Theme.of(context).scaffoldBackgroundColor,
      borderRadius: BorderRadius.circular(AppRadius.sm),
      border: Border.all(color: cq.border),
    ),
    child: Text(
      label,
      style: Theme.of(context).textTheme.labelSmall?.copyWith(color: cq.fgMuted),
    ),
  );
}

class _FilterButton extends StatelessWidget {
  const _FilterButton({required this.count, required this.onTap});
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final active = count > 0;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.sm,
        ),
        decoration: BoxDecoration(
          color: active ? cq.accent.withValues(alpha: 0.14) : cq.surfaceMuted,
          borderRadius: BorderRadius.circular(AppRadius.pill),
          border: Border.all(
            color: active ? cq.accent.withValues(alpha: 0.5) : cq.border,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.tune_rounded, size: 15, color: active ? cq.accent : cq.fgMuted),
            const SizedBox(width: 5),
            Text(
              active ? 'Filters · $count' : 'Filters',
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                color: active ? cq.accent : cq.fgMuted,
                fontWeight: active ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SortChip extends StatelessWidget {
  const _SortChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.sm,
        ),
        decoration: BoxDecoration(
          color: selected ? cq.accent.withValues(alpha: 0.14) : cq.surfaceMuted,
          borderRadius: BorderRadius.circular(AppRadius.pill),
          border: Border.all(
            color: selected ? cq.accent.withValues(alpha: 0.5) : cq.border,
          ),
        ),
        child: Text(
          label,
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
            color: selected ? cq.accent : cq.fgMuted,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

class _Pager extends StatelessWidget {
  const _Pager({required this.page, required this.onGo});
  final JobsPage page;
  final void Function(int) onGo;

  @override
  Widget build(BuildContext context) {
    if (page.totalPages <= 1) return const SizedBox.shrink();
    final cq = context.cq;
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.sm),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          IconButton(
            onPressed: page.page > 1 ? () => onGo(page.page - 1) : null,
            icon: const Icon(Icons.chevron_left_rounded),
          ),
          Text(
            'Page ${page.page} of ${page.totalPages}',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: cq.fgMuted),
          ),
          IconButton(
            onPressed: page.page < page.totalPages ? () => onGo(page.page + 1) : null,
            icon: const Icon(Icons.chevron_right_rounded),
          ),
        ],
      ),
    );
  }
}

class _EmptyResults extends StatelessWidget {
  const _EmptyResults({required this.query});
  final String query;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return ListView(
      children: [
        Padding(
          padding: const EdgeInsets.all(AppSpacing.xl2),
          child: Column(
            children: [
              const SizedBox(height: AppSpacing.xl3),
              Icon(Icons.search_off_rounded, size: 48, color: cq.fgSubtle),
              const SizedBox(height: AppSpacing.lg),
              Text('No jobs found', style: text.titleLarge),
              const SizedBox(height: AppSpacing.sm),
              Text(
                query.isEmpty
                    ? 'Try a different search.'
                    : 'Nothing matched "$query". Try broader keywords.',
                textAlign: TextAlign.center,
                style: text.bodyMedium?.copyWith(color: cq.fgMuted),
              ),
            ],
          ),
        ),
      ],
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
