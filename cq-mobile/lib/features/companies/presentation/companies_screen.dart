import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/ui/refresh_failure.dart';
import '../../../core/format/job_format.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/company_avatar.dart';
import '../../../shared/widgets/cq_loader.dart';
import '../../catalogs/data/catalog_models.dart';
import '../../catalogs/presentation/catalog_picker.dart';
import '../data/company_models.dart';
import '../data/companies_repository.dart';
import '../../../shared/widgets/cq_states.dart';
import '../../../shared/widgets/cq_chips.dart';

/// Companies directory (`GET /companies`). Reached from the Home feed; each card
/// taps through to the company profile.
class CompaniesScreen extends ConsumerStatefulWidget {
  const CompaniesScreen({super.key});

  @override
  ConsumerState<CompaniesScreen> createState() => _CompaniesScreenState();
}

class _CompaniesScreenState extends ConsumerState<CompaniesScreen> {
  CompaniesRepository? _repo;
  CompaniesPage? _page;
  bool _loading = true;
  String? _error;
  int _currentPage = 1;
  String _sort = 'rating';
  bool _hiringOnly = false;
  CatalogItem? _industry;

  @override
  void initState() {
    super.initState();
    _load(1);
  }

  Future<CompaniesRepository> _repository() async {
    final existing = _repo;
    if (existing != null) return existing;
    final repo = await ref.read(companiesRepositoryProvider.future);
    _repo = repo;
    return repo;
  }

  Future<void> _load(int page) async {
    setState(() {
      if (_page == null) _loading = true; // keep the list mounted during refresh
      _error = null;
    });
    try {
      final data = await (await _repository()).list(
        sort: _sort,
        // `category` is the industry SLUG, not its name.
        category: _industry?.slug,
        hiring: _hiringOnly,
        page: page,
      );
      if (!mounted) return;
      setState(() {
        _page = data;
        _currentPage = data.page;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      final message = e is CompaniesException ? e.message : 'Could not load companies.';
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Companies'),
        actions: [
          PopupMenuButton<String>(
            initialValue: _sort,
            icon: const Icon(Icons.sort_rounded),
            tooltip: 'Sort',
            onSelected: (v) {
              _sort = v;
              _load(1);
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'rating', child: Text('Top rated')),
              PopupMenuItem(value: 'reviews', child: Text('Most reviewed')),
              PopupMenuItem(value: 'name', child: Text('Name (A–Z)')),
            ],
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            _filterBar(),
            Divider(height: 1, color: context.cq.border),
            Expanded(child: _body()),
          ],
        ),
      ),
    );
  }

  Widget _filterBar() {
    return SizedBox(
      height: 52,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
        children: [
          CqChip(
            label: 'Hiring now',
            selected: _hiringOnly,
            onTap: () {
              _hiringOnly = !_hiringOnly;
              _load(1);
            },
          ),
          const SizedBox(width: AppSpacing.sm),
          CqChip(
            label: _industry?.name ?? 'Industry',
            selected: _industry != null,
            // A selected industry clears on tap; an unset one opens the picker.
            trailing: _industry == null
                ? Icons.expand_more_rounded
                : Icons.close_rounded,
            onTap: _industry == null ? _pickIndustry : _clearIndustry,
          ),
        ],
      ),
    );
  }

  Future<void> _pickIndustry() async {
    final picked = await showCatalogPicker(
      context: context,
      kind: CatalogKind.industries,
      title: 'Industry',
      initial: _industry == null ? const [] : [_industry!],
    );
    if (picked == null || picked.isEmpty) return;
    _industry = picked.first;
    _load(1);
  }

  void _clearIndustry() {
    _industry = null;
    _load(1);
  }

  Widget _body() {
    if (_loading) {
      return const Center(child: CqLoader(message: 'Loading companies…'));
    }
    if (_error != null) {
      return CqErrorView(message: _error!, onRetry: () => _load(_currentPage));
    }
    final page = _page!;
    if (page.hits.isEmpty) {
      final filtered = _hiringOnly || _industry != null;
      return _EmptyState(
        icon: Icons.domain_rounded,
        title: 'No companies found',
        subtitle: filtered
            ? 'Try removing a filter.'
            : 'Check back later.',
      );
    }
    return RefreshIndicator(
      onRefresh: () => _load(_currentPage),
      child: ListView.separated(
        padding: const EdgeInsets.all(AppSpacing.lg),
        itemCount: page.hits.length + 1,
        separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
        itemBuilder: (context, i) {
          if (i == page.hits.length) return CqPager(page: page.page, totalPages: page.totalPages, onGo: _load);
          final c = page.hits[i];
          return _CompanyCard(
            company: c,
            onTap: () => context.push(AppRoutes.companyPath(c.handle)),
          );
        },
      ),
    );
  }
}


class _CompanyCard extends StatelessWidget {
  const _CompanyCard({required this.company, required this.onTap});

  final CompanySummary company;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    final sub = [
      company.industryName,
      company.hqCityName,
    ].whereType<String>().where((s) => s.isNotEmpty).join('  ·  ');

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
          child: Row(
            children: [
              CompanyAvatar(name: company.name, logoUrl: company.logoUrl, size: 52),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(company.name, style: text.titleMedium),
                    if (sub.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        sub,
                        style: text.bodySmall?.copyWith(color: cq.fgMuted),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                    const SizedBox(height: AppSpacing.sm),
                    Row(
                      children: [
                        if (company.averageRating != null) ...[
                          RatingPill(
                            rating: company.averageRating!,
                            reviews: company.reviewCount,
                          ),
                          const SizedBox(width: AppSpacing.md),
                        ],
                        if (company.openRolesCount > 0)
                          Text(
                            '${company.openRolesCount} open ${company.openRolesCount == 1 ? 'role' : 'roles'}',
                            style: text.labelSmall?.copyWith(color: cq.accent),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: cq.fgSubtle),
            ],
          ),
        ),
      ),
    );
  }
}

/// "★ 4.4 · 320" rating summary.
class RatingPill extends StatelessWidget {
  const RatingPill({super.key, required this.rating, this.reviews});
  final double rating;
  final int? reviews;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.star_rounded, size: 15, color: cq.warning),
        const SizedBox(width: 3),
        Text(
          rating.toStringAsFixed(1),
          style: text.labelMedium?.copyWith(fontWeight: FontWeight.w700),
        ),
        if (reviews != null && reviews! > 0) ...[
          const SizedBox(width: 4),
          Text(
            '(${compactCount(reviews!)})',
            style: text.labelSmall?.copyWith(color: cq.fgMuted),
          ),
        ],
      ],
    );
  }
}


class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.icon,
    required this.title,
    required this.subtitle,
  });
  final IconData icon;
  final String title;
  final String subtitle;

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
            Icon(icon, size: 48, color: cq.fgSubtle),
            const SizedBox(height: AppSpacing.lg),
            Text(title, style: text.titleLarge),
            const SizedBox(height: AppSpacing.sm),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: text.bodyMedium?.copyWith(color: cq.fgMuted),
            ),
          ],
        ),
      ),
    );
  }
}

