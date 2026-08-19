import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format/job_format.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../shell/presentation/app_drawer.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/company_avatar.dart';
import '../../../shared/widgets/cq_buttons.dart';
import '../../../shared/widgets/cq_loader.dart';
import '../../alerts/data/alerts_repository.dart';
import '../../catalogs/data/catalog_models.dart';
import '../data/job_filters.dart';
import '../data/job_models.dart';
import '../data/jobs_repository.dart';
import 'job_filters_sheet.dart';
import '../../../core/state/data_freshness.dart';
import '../../../shared/widgets/cq_states.dart';
import '../../../shared/widgets/cq_chips.dart';

/// "a, b and c" — for naming the filters an alert can't carry.
String _joinWords(List<String> words) {
  if (words.length <= 1) return words.join();
  return '${words.sublist(0, words.length - 1).join(', ')} and ${words.last}';
}

/// Jobs tab — search + browse the job feed, from the live `GET /v1/jobs`.
///
/// (`AppConfig.useMockData` still serves sample data for offline demo builds,
/// but it defaults to false and the endpoint has been live since Aug 2026.)
/// Each result taps through to the full job detail.
class JobSearchScreen extends ConsumerStatefulWidget {
  const JobSearchScreen({
    super.key,
    this.initialQuery,
    this.initialFacet,
    this.initialFacetSlug,
    this.initialFacetLabel,
  });

  /// When set (e.g. pushed from Home with a role), the screen opens with this
  /// keyword already searched.
  final String? initialQuery;

  /// When set, the screen opens with ONE filter already applied instead of a
  /// keyword: `city` | `skill` | `industry`, identified by
  /// [initialFacetSlug] and shown as [initialFacetLabel].
  final String? initialFacet;
  final String? initialFacetSlug;
  final String? initialFacetLabel;

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
    _filters = _facetFromRoute();
    _load(1);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  /// Turns a `?facet=city&slug=rajkot&label=Rajkot` route into a real filter.
  ///
  /// The id is 0 because the home feed sends a slug and a name but no
  /// catalogue id, and the query only ever serialises the slug. It matters
  /// nowhere except chip removal, which compares ids within a single facet
  /// list — and there is at most one route-seeded entry per list.
  JobFilters _facetFromRoute() {
    final slug = widget.initialFacetSlug?.trim() ?? '';
    if (slug.isEmpty) return const JobFilters();
    final item = CatalogItem(
      id: 0,
      slug: slug,
      name: widget.initialFacetLabel?.trim().isNotEmpty == true
          ? widget.initialFacetLabel!.trim()
          : slug,
    );
    return switch (widget.initialFacet) {
      'city' => JobFilters(cities: [item]),
      'skill' => JobFilters(skills: [item]),
      'industry' => JobFilters(industry: item),
      _ => const JobFilters(),
    };
  }

  Future<JobsRepository> _repository() async {
    final existing = _repo;
    if (existing != null) return existing;
    final repo = await ref.read(jobsRepositoryProvider.future);
    _repo = repo;
    return repo;
  }

  Future<void> _load(int page, {bool refresh = false}) async {
    setState(() {
      // The list stays mounted ONLY for pull-to-refresh, where the same page is
      // reloading under the user's finger and the RefreshIndicator is already
      // the feedback. Every other path — the pager, a new query, a sort or a
      // filter change — replaces the results wholesale, and staying silent
      // there made "Next page" look like a dead button: nothing moved until the
      // network came back, and then the content swapped underneath a user still
      // scrolled to the bottom, so page 2 opened at its end. Swapping in the
      // loader also rebuilds the list, which starts it back at the top.
      if (!refresh || _page == null) _loading = true;
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
      final message = e is JobsException ? e.message : 'Could not load jobs.';
      // Same rule as Home: results already on screen survive a failed refresh.
      // Only a search that has nothing to show falls back to the error view.
      if (_page != null) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(message)));
        return;
      }
      setState(() {
        _error = message;
        _loading = false;
      });
    }
  }

  /// Re-read the markers for the page already on screen, after a save or an
  /// apply somewhere else in the app.
  Future<void> _refreshMarkers() async {
    final page = _page;
    if (page == null || page.hits.isEmpty) return;
    try {
      _enrichMarkers(await _repository(), page);
    } catch (_) {
      // Badges are decoration; a failure here must not disturb the results.
    }
  }

  /// Overlay per-user saved/applied markers once the list is on screen (one
  /// bulk call instead of 20). Silently no-ops if it fails or the page changed.
  Future<void> _enrichMarkers(JobsRepository repo, JobsPage page) async {
    final ids = page.hits.map((h) => h.id).toList();
    if (ids.isEmpty) return;
    final state = await repo.jobState(ids);
    if (!mounted || !identical(_page, page)) return;
    // No early return on an empty result. It reads like an optimisation, but
    // once this also runs as a REFRESH it becomes a bug: unsave your only saved
    // job and the reply is legitimately empty, so bailing here would leave the
    // bookmark on this row still filled.
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

  /// Save the current search as a job alert.
  ///
  /// The alert query is narrower than the search (see
  /// [JobFilters.toAlertQuery]), so the sheet states exactly which active
  /// facets will not be carried over rather than saving a quietly different
  /// search under the user's chosen name.
  Future<void> _createAlert() async {
    final dropped = _filters.unsupportedForAlert;
    final alertQuery = _filters.toAlertQuery(_query);
    if (alertQuery.isEmpty) {
      _snack('Add a keyword or a filter first, so the alert has something to watch.');
      return;
    }
    final defaultName = _query.trim().isNotEmpty
        ? _query.trim()
        : (_filters.active.isNotEmpty ? _filters.active.first.label : 'New jobs');

    final controller = TextEditingController(text: defaultName);
    var frequency = 'daily';
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(
            AppSpacing.xl2,
            AppSpacing.xl,
            AppSpacing.xl2,
            AppSpacing.xl + MediaQuery.of(sheetContext).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Create alert',
                style: Theme.of(sheetContext).textTheme.titleLarge,
              ),
              const SizedBox(height: AppSpacing.md),
              TextField(
                controller: controller,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(labelText: 'Alert name'),
              ),
              const SizedBox(height: AppSpacing.lg),
              Text(
                'How often',
                style: Theme.of(sheetContext).textTheme.labelLarge,
              ),
              const SizedBox(height: AppSpacing.sm),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'instant', label: Text('Instant')),
                  ButtonSegment(value: 'daily', label: Text('Daily')),
                  ButtonSegment(value: 'weekly', label: Text('Weekly')),
                ],
                selected: {frequency},
                onSelectionChanged: (s) =>
                    setSheetState(() => frequency = s.first),
              ),
              if (dropped.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.lg),
                Text(
                  'Alerts can\'t follow ${_joinWords(dropped)} — that ${dropped.length == 1 ? 'filter' : 'filters'} won\'t be saved.',
                  style: Theme.of(sheetContext).textTheme.bodySmall?.copyWith(
                    color: sheetContext.cq.fgMuted,
                  ),
                ),
              ],
              const SizedBox(height: AppSpacing.xl),
              CqPrimaryButton(
                label: 'Create alert',
                icon: Icons.notifications_active_outlined,
                onPressed: () => Navigator.pop(sheetContext, true),
              ),
            ],
          ),
        ),
      ),
    );

    if (created != true || !mounted) {
      controller.dispose();
      return;
    }
    final name = controller.text.trim().isEmpty
        ? defaultName
        : controller.text.trim();
    controller.dispose();
    try {
      final repo = await ref.read(alertsRepositoryProvider.future);
      await repo.create(name: name, frequency: frequency, query: alertQuery);
      if (!mounted) return;
      ref.bumpData(CqData.alerts);
      _snack('Alert created');
    } catch (e) {
      if (!mounted) return;
      // Includes the server's own "You can have at most 10 alerts." on 409.
      _snack(e is AlertsException ? e.message : 'Could not create the alert.');
    }
  }

  void _snack(String message) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(content: Text(message), behavior: SnackBarBehavior.floating),
    );

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
    // As the Jobs tab this screen is mounted for the whole session inside the
    // shell's IndexedStack, so it never rebuilds on its own. Saving or applying
    // from a job detail pushed on top of it left the bookmark and the "Applied"
    // badge on these very rows showing the old state until the app restarted.
    // Only the markers are refetched — one bulk call — rather than re-running
    // the search, which would lose the user's scroll position for a change to
    // two booleans.
    for (final domain in const [CqData.savedJobs, CqData.applications]) {
      ref.onDataChanged(domain, _refreshMarkers);
    }
    // This screen is BOTH the Jobs tab and the pushed `/search` route (Home's
    // facet chips and search box land here). Pushed, it sits above the shell so
    // the bottom nav is gone — and the drawer was taking the AppBar's leading
    // slot, so no back arrow appeared either and the user was stranded. Attach
    // the drawer only when this really is the tab.
    final isPushed = Navigator.of(context).canPop();
    return Scaffold(
      drawer: isPushed ? null : const AppDrawer(),
      appBar: AppBar(
        title: const Text('Jobs'),
        actions: [
          IconButton(
            tooltip: 'Create alert for this search',
            icon: const Icon(Icons.notifications_active_outlined),
            onPressed: _createAlert,
          ),
          const SizedBox(width: AppSpacing.xs),
        ],
      ),
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
                      CqChip(
                        label: 'Relevant',
                        selected: _sort == 'relevance',
                        onTap: () => _setSort('relevance'),
                      ),
                      CqChip(
                        label: 'Newest',
                        selected: _sort == 'recent',
                        onTap: () => _setSort('recent'),
                      ),
                      CqChip(
                        label: 'Highest pay',
                        selected: _sort == 'salary_desc',
                        onTap: () => _setSort('salary_desc'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            // ── Active filters ──
            //
            // Each chip removes exactly one facet; reopening the whole sheet to
            // undo one choice is the friction this exists to remove.
            if (_filters.activeCount > 0)
              SizedBox(
                // Fits the chips' 48dp tap target (CqChip._minTapTarget).
                height: 52,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                  children: [
                    for (final f in _filters.active) ...[
                      CqChip(
                        label: f.label,
                        selected: true,
                        trailing: Icons.close_rounded,
                        onTap: () {
                          setState(() => _filters = f.without);
                          _load(1);
                        },
                      ),
                      const SizedBox(width: AppSpacing.sm),
                    ],
                    _ClearAllChip(
                      onTap: () {
                        setState(() => _filters = const JobFilters());
                        _load(1);
                      },
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
      return CqErrorView(message: _error!, onRetry: () => _load(_currentPage));
    }
    final page = _page!;
    if (page.hits.isEmpty) {
      return _EmptyResults(
        query: _query,
        activeFilters: _filters.activeCount,
        onClearFilters: () {
          setState(() => _filters = const JobFilters());
          _load(1);
        },
      );
    }

    return RefreshIndicator(
      onRefresh: () => _load(_currentPage, refresh: true),
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
          if (i == page.hits.length + 1) return CqPager(page: page.page, totalPages: page.totalPages, onGo: _load);
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
              // Optional at posting time and nullable in the database, so this
              // is absent on plenty of real jobs — never reserve space for it.
              if ((job.shortDescription ?? '').trim().isNotEmpty) ...[
                const SizedBox(height: AppSpacing.sm),
                Text(
                  job.shortDescription!.trim(),
                  style: text.bodySmall?.copyWith(color: cq.fgMuted, height: 1.4),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              const SizedBox(height: AppSpacing.md),
              Wrap(
                spacing: AppSpacing.lg,
                runSpacing: AppSpacing.xs,
                children: [
                  if (salary != null)
                    _meta(context, Icons.currency_rupee_rounded, salary),
                  if (exp != null)
                    _meta(context, Icons.work_history_outlined, exp),
                  if (postedAgo(job.postedAt) case final posted?)
                    _meta(context, Icons.schedule_rounded, posted),
                ],
              ),
              if (job.skills.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.md),
                Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: [
                    for (final s in job.skills.take(4)) CqTag(s),
                    if (job.skills.length > 4)
                      CqTag('+${job.skills.length - 4}'),
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


class _ClearAllChip extends StatelessWidget {
  const _ClearAllChip({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    return Center(
      child: TextButton(
        onPressed: onTap,
        style: TextButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
          minimumSize: Size.zero,
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
        child: Text(
          'Clear all',
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
            color: cq.fgMuted,
          ),
        ),
      ),
    );
  }
}



class _EmptyResults extends StatelessWidget {
  const _EmptyResults({
    required this.query,
    required this.activeFilters,
    required this.onClearFilters,
  });
  final String query;
  final int activeFilters;
  final VoidCallback onClearFilters;

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
                // With filters on, they are the likeliest cause — say so and
                // offer the fix, instead of blaming the keywords.
                activeFilters > 0
                    ? 'No jobs match your filters${query.isEmpty ? '' : ' for "$query"'}.'
                    : query.isEmpty
                        ? 'Try a different search.'
                        : 'Nothing matched "$query". Try broader keywords.',
                textAlign: TextAlign.center,
                style: text.bodyMedium?.copyWith(color: cq.fgMuted),
              ),
              if (activeFilters > 0) ...[
                const SizedBox(height: AppSpacing.lg),
                OutlinedButton.icon(
                  onPressed: onClearFilters,
                  icon: const Icon(Icons.filter_alt_off_rounded, size: 18),
                  label: Text(
                    'Clear ${activeFilters == 1 ? 'filter' : 'all $activeFilters filters'}',
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

