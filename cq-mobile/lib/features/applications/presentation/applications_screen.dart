import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../shell/presentation/app_drawer.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cq_loader.dart';
import '../data/application.dart';
import '../data/applications_repository.dart';

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
String _fmtDate(DateTime d) => '${d.day} ${_months[d.month - 1]} ${d.year}';

const _statuses = [
  'ALL', 'APPLIED', 'IN_REVIEW', 'SHORTLISTED', 'INTERVIEWED',
  'OFFERED', 'HIRED', 'REJECTED', 'WITHDRAWN',
];

String _pretty(String s) {
  final words = s.toLowerCase().split('_');
  return words
      .map((w) => w.isEmpty ? w : w[0].toUpperCase() + w.substring(1))
      .join(' ');
}

/// Applications tab — the seeker's application dashboard (`/me/applications`).
/// Filter by status, withdraw non-terminal ones. (Per-status counts and the
/// status-history timeline need a backend addition, so they're omitted for now.)
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
      setState(() {
        _error = e is ApplicationsException
            ? e.message
            : 'Could not load your applications.';
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
      final newStatus = await (await _repository()).withdraw(app.id);
      if (!mounted) return;
      final page = _page;
      if (page != null) {
        setState(() {
          _page = ApplicationsPage(
            hits: page.hits
                .map((a) => a.id == app.id ? a.copyWith(status: newStatus) : a)
                .toList(),
            total: page.total,
            page: page.page,
            pageSize: page.pageSize,
          );
        });
      }
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
    return Scaffold(
      drawer: const AppDrawer(),
      appBar: AppBar(title: const Text('Applications')),
      body: SafeArea(
        child: Column(
          children: [
            _FilterRow(
              current: _status,
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
      return _ErrorView(
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
            return _Pager(page: page, onGo: (p) => _load(page: p));
          }
          final a = page.hits[i];
          return _AppCard(app: a, onWithdraw: () => _withdraw(a));
        },
      ),
    );
  }
}

class _FilterRow extends StatelessWidget {
  const _FilterRow({required this.current, required this.onSelect});
  final String current;
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
                    s == 'ALL' ? 'All' : _pretty(s),
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
  const _AppCard({required this.app, required this.onWithdraw});
  final Application app;
  final VoidCallback onWithdraw;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;

    Color fg;
    switch (app.status) {
      case 'OFFERED':
      case 'HIRED':
        fg = cq.success;
      case 'REJECTED':
        fg = cq.danger;
      case 'INTERVIEWED':
      case 'SHORTLISTED':
        fg = cq.warning;
      case 'IN_REVIEW':
        fg = cq.accent;
      default:
        fg = cq.fgMuted;
    }

    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: cq.surfaceMuted,
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
                  _pretty(app.status),
                  style: text.labelSmall?.copyWith(color: fg),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              Text(
                'Applied ${_fmtDate(app.appliedAt)}',
                style: text.bodySmall?.copyWith(color: cq.fgSubtle),
              ),
              const Spacer(),
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
    );
  }
}

class _Pager extends StatelessWidget {
  const _Pager({required this.page, required this.onGo});
  final ApplicationsPage page;
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
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: cq.fgMuted),
          ),
          IconButton(
            onPressed: page.page < page.totalPages
                ? () => onGo(page.page + 1)
                : null,
            icon: const Icon(Icons.chevron_right_rounded),
          ),
        ],
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.filtered});
  final bool filtered;

  @override
  Widget build(BuildContext context) {
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
          ],
        ),
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
