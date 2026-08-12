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
import '../../career_advice/data/article_models.dart';
import '../data/home_models.dart';
import '../data/home_repository.dart';

/// Home tab — the seeker's landing feed (`GET /home`): a search entry, headline
/// counts, latest jobs, browse facets, top companies, and recent advice. Every
/// section deep-links into the relevant screen.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  HomeFeed? _feed;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      if (_feed == null) _loading = true; // keep the list mounted during refresh
      _error = null;
    });
    try {
      final repo = await ref.read(homeRepositoryProvider.future);
      final feed = await repo.load();
      if (!mounted) return;
      setState(() {
        _feed = feed;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e is HomeException ? e.message : 'Could not load your feed.';
        _loading = false;
      });
    }
  }

  void _search(String query) => context.push(AppRoutes.searchPath(query));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      drawer: const AppDrawer(),
      appBar: AppBar(
        title: const Text('Career Queue'),
        actions: [
          IconButton(
            tooltip: 'Job alerts',
            icon: const Icon(Icons.notifications_none_rounded),
            onPressed: () => context.push(AppRoutes.alerts),
          ),
          const SizedBox(width: AppSpacing.xs),
        ],
      ),
      body: SafeArea(child: _body()),
    );
  }

  Widget _body() {
    if (_loading) {
      return const Center(child: CqLoader(message: 'Loading your feed…'));
    }
    if (_error != null) {
      return _ErrorView(message: _error!, onRetry: _load);
    }
    final f = _feed!;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
        children: [
          // ── Search entry ──
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            child: _SearchBox(onTap: () => context.push(AppRoutes.searchPath(''))),
          ),
          const SizedBox(height: AppSpacing.lg),

          // ── Counts ──
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            child: _CountsRibbon(counts: f.counts),
          ),
          const SizedBox(height: AppSpacing.xl),

          // ── Latest jobs ──
          if (f.featuredJobs.isNotEmpty) ...[
            _SectionHeader(
              title: 'Latest jobs',
              onSeeAll: () => context.push(AppRoutes.searchPath('')),
            ),
            SizedBox(
              height: (168 * MediaQuery.textScalerOf(context).scale(1.0))
                  .clamp(168.0, 260.0),
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                itemCount: f.featuredJobs.length,
                separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.md),
                itemBuilder: (context, i) {
                  final j = f.featuredJobs[i];
                  return _HomeJobCard(
                    job: j,
                    onTap: () =>
                        context.push(AppRoutes.jobDetailPath(j.canonicalSlug)),
                  );
                },
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
          ],

          // ── Browse facets ──
          if (f.roles.isNotEmpty)
            _ChipsSection(title: 'Browse by role', items: f.roles, onTap: _search),
          if (f.cities.isNotEmpty)
            _ChipsSection(title: 'Popular cities', items: f.cities, onTap: _search),
          if (f.topSkills.isNotEmpty)
            _ChipsSection(title: 'Top skills', items: f.topSkills, onTap: _search),

          // ── Top companies ──
          if (f.featuredCompanies.isNotEmpty) ...[
            _SectionHeader(
              title: 'Top companies',
              onSeeAll: () => context.push(AppRoutes.companies),
            ),
            SizedBox(
              height: (150 * MediaQuery.textScalerOf(context).scale(1.0))
                  .clamp(150.0, 232.0),
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                itemCount: f.featuredCompanies.length,
                separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.md),
                itemBuilder: (context, i) {
                  final c = f.featuredCompanies[i];
                  return _HomeCompanyCard(
                    company: c,
                    onTap: () => context.push(AppRoutes.companyPath(c.handle)),
                  );
                },
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
          ],

          // ── Career advice ──
          if (f.recentArticles.isNotEmpty) ...[
            _SectionHeader(
              title: 'Career advice',
              onSeeAll: () => context.push(AppRoutes.careerAdvice),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
              child: Column(
                children: [
                  for (final a in f.recentArticles)
                    _HomeArticleCard(
                      article: a,
                      onTap: () => context.push(AppRoutes.articlePath(a.slug)),
                    ),
                ],
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.lg),
        ],
      ),
    );
  }
}

class _SearchBox extends StatelessWidget {
  const _SearchBox({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    return Material(
      color: cq.surfaceMuted,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: Container(
          height: 52,
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: cq.border),
          ),
          child: Row(
            children: [
              Icon(Icons.search_rounded, color: cq.fgMuted),
              const SizedBox(width: AppSpacing.md),
              Text(
                'Search jobs, skills, companies',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: cq.fgSubtle,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CountsRibbon extends StatelessWidget {
  const _CountsRibbon({required this.counts});
  final HomeCounts counts;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
      decoration: BoxDecoration(
        color: cq.accent.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: cq.accent.withValues(alpha: 0.20)),
      ),
      child: Row(
        children: [
          _stat(context, compactCount(counts.activeJobs), 'Active jobs'),
          _divider(cq),
          _stat(context, compactCount(counts.companies), 'Companies'),
          _divider(cq),
          _stat(context, compactCount(counts.recruiters), 'Hiring teams'),
        ],
      ),
    );
  }

  Widget _divider(CqColors cq) =>
      Container(width: 1, height: 32, color: cq.border);

  Widget _stat(BuildContext context, String value, String label) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: text.titleLarge?.copyWith(
              color: cq.accent,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 2),
          Text(label, style: text.labelSmall?.copyWith(color: cq.fgMuted)),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, this.onSeeAll});
  final String title;
  final VoidCallback? onSeeAll;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        0,
        AppSpacing.sm,
        AppSpacing.md,
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          if (onSeeAll != null)
            TextButton(onPressed: onSeeAll, child: const Text('See all')),
        ],
      ),
    );
  }
}

class _ChipsSection extends StatelessWidget {
  const _ChipsSection({
    required this.title,
    required this.items,
    required this.onTap,
  });
  final String title;
  final List<HomeTaxo> items;
  final void Function(String query) onTap;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader(title: title),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            0,
            AppSpacing.lg,
            AppSpacing.xl,
          ),
          child: Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              for (final t in items)
                GestureDetector(
                  onTap: () => onTap(t.query),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.md,
                      vertical: AppSpacing.sm,
                    ),
                    decoration: BoxDecoration(
                      color: cq.surfaceMuted,
                      borderRadius: BorderRadius.circular(AppRadius.pill),
                      border: Border.all(color: cq.border),
                    ),
                    child: Text(
                      t.jobCount > 0 ? '${t.label}  ·  ${t.jobCount}' : t.label,
                      style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        color: cq.fg,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _HomeJobCard extends StatelessWidget {
  const _HomeJobCard({required this.job, required this.onTap});
  final HomeJob job;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    final salary = formatSalaryLpa(job.salaryMinPaise, job.salaryMaxPaise);
    return Material(
      color: cq.surfaceMuted,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: Container(
          width: 244,
          padding: const EdgeInsets.all(AppSpacing.lg),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: cq.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CompanyAvatar(
                    name: job.companyName,
                    logoUrl: job.companyLogoUrl,
                    size: 38,
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      job.companyName,
                      style: text.labelMedium?.copyWith(color: cq.fgMuted),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                job.title,
                style: text.titleSmall,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const Spacer(),
              if (salary != null)
                Text(
                  salary,
                  style: text.labelMedium?.copyWith(
                    color: cq.fg,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              const SizedBox(height: 2),
              Text(
                [
                  job.cityName,
                  postedAgo(job.postedAt),
                ].whereType<String>().where((s) => s.isNotEmpty).join('  ·  '),
                style: text.labelSmall?.copyWith(color: cq.fgSubtle),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HomeCompanyCard extends StatelessWidget {
  const _HomeCompanyCard({required this.company, required this.onTap});
  final HomeCompany company;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Material(
      color: cq.surfaceMuted,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: Container(
          width: 156,
          padding: const EdgeInsets.all(AppSpacing.lg),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: cq.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CompanyAvatar(name: company.name, logoUrl: company.logoUrl, size: 42),
              const SizedBox(height: AppSpacing.sm),
              Text(
                company.name,
                style: text.titleSmall,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 2),
              if (company.averageRating != null)
                Row(
                  children: [
                    Icon(Icons.star_rounded, size: 14, color: cq.warning),
                    const SizedBox(width: 3),
                    Text(
                      company.averageRating!.toStringAsFixed(1),
                      style: text.labelSmall?.copyWith(color: cq.fgMuted),
                    ),
                  ],
                ),
              const Spacer(),
              if (company.openingsCount > 0)
                Text(
                  '${company.openingsCount} open roles',
                  style: text.labelSmall?.copyWith(color: cq.accent),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HomeArticleCard extends StatelessWidget {
  const _HomeArticleCard({required this.article, required this.onTap});
  final ArticleSummary article;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Material(
      color: cq.surfaceMuted,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: Container(
          margin: const EdgeInsets.only(bottom: AppSpacing.md),
          padding: const EdgeInsets.all(AppSpacing.lg),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: cq.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(article.title, style: text.titleSmall),
              if ((article.excerpt ?? '').isNotEmpty) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(
                  article.excerpt!,
                  style: text.bodySmall?.copyWith(color: cq.fgMuted, height: 1.4),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              const SizedBox(height: AppSpacing.sm),
              Text(
                [
                  article.authorName,
                  if (article.readTimeMinutes != null)
                    '${article.readTimeMinutes} min read',
                ].where((s) => s.isNotEmpty).join('  ·  '),
                style: text.labelSmall?.copyWith(color: cq.fgSubtle),
              ),
            ],
          ),
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
