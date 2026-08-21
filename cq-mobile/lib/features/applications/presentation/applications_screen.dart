import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/ui/refresh_failure.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../shell/presentation/app_drawer.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cq_loader.dart';
import '../data/application.dart';
import '../data/applications_repository.dart';
import '../../../core/state/data_freshness.dart';
import '../../../shared/widgets/cq_states.dart';
import '../../../shared/widgets/cq_buttons.dart';
import '../../shell/application/shell_tab.dart';

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
String? _fmtDate(DateTime? d) => d == null ? null : '${d.day} ${_months[d.month - 1]} ${d.year}';

const _statuses = [
  'ALL', 'APPLIED', 'IN_REVIEW', 'SHORTLISTED', 'INTERVIEWED',
  'OFFERED', 'HIRED', 'REJECTED', 'WITHDRAWN',
];

Color _statusColor(BuildContext context, String status) {
  final cq = context.cq;
  return switch (status) {
    'HIRED' || 'OFFERED' => cq.success,
    'REJECTED' => cq.danger,
    'INTERVIEWED' || 'SHORTLISTED' => cq.warning,
    'IN_REVIEW' => cq.accent,
    'WITHDRAWN' => cq.fgSubtle,
    _ => cq.fgMuted,
  };
}

/// Applications tab — the seeker's application dashboard (`/me/applications`).
/// Filter by status (with live per-status counts), withdraw non-terminal ones,
/// and tap a card to see its full status timeline.
class ApplicationsScreen extends ConsumerStatefulWidget {
  const ApplicationsScreen({super.key});

  @override
  ConsumerState<ApplicationsScreen> createState() => _ApplicationsScreenState();
}

class _ApplicationsScreenState extends ConsumerState<ApplicationsScreen> {
  ApplicationsRepository? _repo;
  ApplicationsPage? _page;
  bool _loading = true;
  String? _error;
  int _currentPage = 1;
  String _status = 'ALL';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<ApplicationsRepository> _repository() async {
    final existing = _repo;
    if (existing != null) return existing;
    final repo = await ref.read(applicationsRepositoryProvider.future);
    _repo = repo;
    return repo;
  }

  Future<void> _load({String? status, int page = 1}) async {
    setState(() {
      _loading = true;
      _error = null;
      if (status != null) _status = status;
    });
    try {
      final data = await (await _repository()).list(status: _status, page: page);
      if (!mounted) return;
      setState(() {
        _page = data;
        _currentPage = data.page;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      final message = e is ApplicationsException
            ? e.message
            : 'Could not load your applications.';
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

  Future<void> _withdraw(Application app) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Withdraw application?'),
        content: Text(
          'Withdraw your application for "${app.jobTitle}"? This can\'t be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Withdraw'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      await (await _repository()).withdraw(app.id);
      ref.bumpData(CqData.applications);
      if (!mounted) return;
      // Reload so counts + filtered list stay correct after the transition.
      await _load(page: _currentPage);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Application withdrawn')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              e is ApplicationsException ? e.message : 'Could not withdraw.',
            ),
          ),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    // Same reason as the Saved tab: applying happens on the job detail screen,
    // which this tab would otherwise never hear about.
    ref.onDataChanged(
      CqData.applications,
      () => _load(status: _status, page: _currentPage),
    );
    return Scaffold(
      drawer: const AppDrawer(),
      // Matches the bottom-nav label; the tab said Applied and the screen
      // said Applications, which read as two different places.
      appBar: AppBar(title: const Text('Applied jobs')),
      body: SafeArea(
        child: Column(
          children: [
            _FilterRow(
              current: _status,
              counts: _page?.counts ?? const {},
              onSelect: (s) => _load(status: s, page: 1),
            ),
            Expanded(child: _body()),
          ],
        ),
      ),
    );
  }

  Widget _body() {
    if (_loading) {
      return const Center(child: CqLoader(message: 'Loading applications…'));
    }
    if (_error != null) {
      return CqErrorView(
        message: _error!,
        onRetry: () => _load(page: _currentPage),
      );
    }
    final page = _page!;
    if (page.hits.isEmpty) {
      return _Empty(filtered: _status != 'ALL');
    }
    return RefreshIndicator(
      onRefresh: () => _load(page: _currentPage),
      child: ListView.separated(
        padding: const EdgeInsets.all(AppSpacing.lg),
        itemCount: page.hits.length + 1,
        separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
        itemBuilder: (context, i) {
          if (i == page.hits.length) {
            return CqPager(page: page.page, totalPages: page.totalPages, onGo: (p) => _load(page: p));
          }
          final a = page.hits[i];
          return _AppCard(
            app: a,
            onWithdraw: () => _withdraw(a),
            onTap: () => _showApplicationTimeline(context, a),
          );
        },
      ),
    );
  }
}

class _FilterRow extends StatelessWidget {
  const _FilterRow({
    required this.current,
    required this.counts,
    required this.onSelect,
  });
  final String current;
  final Map<String, int> counts;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    return SizedBox(
      height: 52,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
        itemCount: _statuses.length,
        separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.sm),
        itemBuilder: (context, i) {
          final s = _statuses[i];
          final selected = s == current;
          final count = counts[s];
          final label = applicationStatusLabel(s);
          return Center(
            child: Material(
              color: selected ? cq.accent : cq.surfaceMuted,
              borderRadius: BorderRadius.circular(AppRadius.pill),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () => onSelect(s),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.lg,
                    vertical: AppSpacing.sm,
                  ),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(AppRadius.pill),
                    border: Border.all(color: selected ? cq.accent : cq.border),
                  ),
                  child: Text(
                    count != null ? '$label  $count' : label,
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: selected ? cq.onAccent : cq.fg,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _AppCard extends StatelessWidget {
  const _AppCard({
    required this.app,
    required this.onWithdraw,
    required this.onTap,
  });
  final Application app;
  final VoidCallback onWithdraw;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    final fg = _statusColor(context, app.status);

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
                        Text(app.jobTitle, style: text.titleMedium),
                        if (app.companyName.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(
                            app.companyName,
                            style: text.bodyMedium?.copyWith(color: cq.fgMuted),
                          ),
                        ],
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.sm,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: fg.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(AppRadius.sm),
                      border: Border.all(color: fg.withValues(alpha: 0.4)),
                    ),
                    child: Text(
                      applicationStatusLabel(app.status),
                      style: text.labelSmall?.copyWith(color: fg),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              _StatusBar(app: app),
              const SizedBox(height: AppSpacing.md),
              // Every fixed-width child plus a Spacer overflowed once the system
              // font was scaled up — the date alone can outgrow the row. The
              // date now yields (Flexible + ellipsis) instead of pushing.
              Row(
                children: [
                  Flexible(
                    child: Text(
                      // Omitted rather than dated 1 Jan 2000, which is what
                      // the old sentinel rendered as.
                      switch (_fmtDate(app.appliedAt)) {
                        final d? => 'Applied $d',
                        _ => '',
                      },
                      style: text.bodySmall?.copyWith(color: cq.fgSubtle),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const Spacer(),
                  Icon(Icons.timeline_rounded, size: 15, color: cq.fgSubtle),
                  const SizedBox(width: 4),
                  Text(
                    'Timeline',
                    style: text.labelSmall?.copyWith(color: cq.fgSubtle),
                  ),
                  if (!app.isTerminal)
                    TextButton(
                      onPressed: onWithdraw,
                      style: TextButton.styleFrom(
                        foregroundColor: cq.danger,
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.md,
                        ),
                        minimumSize: const Size(0, 34),
                      ),
                      child: const Text('Withdraw'),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Compact segmented progress across the forward stages, filled up to the
/// furthest stage reached (from the timeline). Colour reflects the outcome.
class _StatusBar extends StatelessWidget {
  const _StatusBar({required this.app});
  final Application app;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    var reached = 0;
    for (final e in app.timeline) {
      final idx = applicationForwardStages.indexOf(e.to);
      if (idx > reached) reached = idx;
    }
    final fill = _statusColor(context, app.status);
    return Row(
      children: [
        for (var i = 0; i < applicationForwardStages.length; i++) ...[
          if (i > 0) const SizedBox(width: 4),
          Expanded(
            child: Container(
              height: 4,
              decoration: BoxDecoration(
                color: i <= reached ? fill : cq.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

Future<void> _showApplicationTimeline(BuildContext context, Application app) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Theme.of(context).scaffoldBackgroundColor,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.lg)),
    ),
    builder: (_) => _TimelineSheet(app: app),
  );
}

class _TimelineSheet extends StatelessWidget {
  const _TimelineSheet({required this.app});
  final Application app;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    final events = app.timeline;
    return Padding(
      padding: EdgeInsets.only(
        left: AppSpacing.xl2,
        right: AppSpacing.xl2,
        top: AppSpacing.lg,
        bottom: MediaQuery.of(context).viewPadding.bottom + AppSpacing.xl2,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: AppSpacing.lg),
                decoration: BoxDecoration(
                  color: cq.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Text(app.jobTitle, style: text.titleLarge),
            if (app.companyName.isNotEmpty) ...[
              const SizedBox(height: 2),
              Text(app.companyName, style: text.bodyMedium?.copyWith(color: cq.fgMuted)),
            ],
            if (app.jobPath != null || app.companyHandle != null) ...[
              const SizedBox(height: AppSpacing.lg),
              Row(
                children: [
                  if (app.jobPath != null)
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () {
                          Navigator.pop(context);
                          context.push(AppRoutes.jobDetailPath(app.jobPath!));
                        },
                        icon: const Icon(Icons.work_outline_rounded, size: 18),
                        label: const Text('View job'),
                      ),
                    ),
                  if (app.jobPath != null && app.companyHandle != null)
                    const SizedBox(width: AppSpacing.md),
                  if (app.companyHandle != null)
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () {
                          Navigator.pop(context);
                          context.push(AppRoutes.companyPath(app.companyHandle!));
                        },
                        icon: const Icon(Icons.business_outlined, size: 18),
                        label: const Text('Company'),
                      ),
                    ),
                ],
              ),
            ],
            const SizedBox(height: AppSpacing.xl),
            for (var i = 0; i < events.length; i++)
              _TimelineRow(event: events[i], isLast: i == events.length - 1),
          ],
        ),
      ),
    );
  }
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({required this.event, required this.isLast});
  final StatusEvent event;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    final color = _statusColor(context, event.to);
    final by = switch (event.by) {
      'RECRUITER' => ' · by recruiter',
      'CANDIDATE' => ' · by you',
      _ => '',
    };
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              ),
              if (!isLast)
                Expanded(child: Container(width: 2, color: cq.border)),
            ],
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : AppSpacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    applicationStatusLabel(event.to),
                    style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    switch (_fmtDate(event.at)) {
                      final d? => '$d$by',
                      _ => by.trim(),
                    },
                    style: text.bodySmall?.copyWith(color: cq.fgMuted),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}


class _Empty extends ConsumerWidget {
  const _Empty({required this.filtered});
  final bool filtered;

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
            Icon(Icons.assignment_outlined, size: 48, color: cq.fgSubtle),
            const SizedBox(height: AppSpacing.lg),
            Text(
              filtered ? 'No applications with this status' : 'No applications yet',
              style: text.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              filtered
                  ? 'Try a different status filter.'
                  : 'Jobs you apply to will appear here with their status.',
              textAlign: TextAlign.center,
              style: text.bodyMedium?.copyWith(color: cq.fgMuted),
            ),
            // Only when there is genuinely nothing yet — with a filter on, the
            // way out is the filter row directly above, not another screen.
            if (!filtered) ...[
              const SizedBox(height: AppSpacing.xl),
              CqPrimaryButton(
                label: 'Find jobs to apply',
                icon: Icons.search_rounded,
                onPressed: () =>
                    ref.read(shellTabProvider.notifier).select(ShellTab.jobs),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

