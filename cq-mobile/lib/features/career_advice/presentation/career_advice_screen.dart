import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format/job_format.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cq_loader.dart';
import '../data/article_models.dart';
import '../data/articles_repository.dart';

/// Career advice list (`GET /career-advice`) with a tag filter. Reached from the
/// Home feed; each card taps through to the full article.
class CareerAdviceScreen extends ConsumerStatefulWidget {
  const CareerAdviceScreen({super.key});

  @override
  ConsumerState<CareerAdviceScreen> createState() => _CareerAdviceScreenState();
}

class _CareerAdviceScreenState extends ConsumerState<CareerAdviceScreen> {
  ArticlesRepository? _repo;
  ArticlesPage? _page;
  List<String> _allTags = const [];
  String? _tag;
  bool _loading = true;
  String? _error;
  int _currentPage = 1;

  @override
  void initState() {
    super.initState();
    _load(1);
  }

  Future<ArticlesRepository> _repository() async {
    final existing = _repo;
    if (existing != null) return existing;
    final repo = await ref.read(articlesRepositoryProvider.future);
    _repo = repo;
    return repo;
  }

  Future<void> _load(int page) async {
    setState(() {
      if (_page == null) _loading = true; // keep the list mounted during refresh
      _error = null;
    });
    try {
      final data = await (await _repository()).list(tag: _tag, page: page);
      if (!mounted) return;
      setState(() {
        _page = data;
        _currentPage = data.page;
        // Accumulate the tag set across loads (mock is one page; live grows it
        // as more results come in).
        final set = _allTags.toSet();
        for (final a in data.hits) {
          set.addAll(a.tags);
        }
        _allTags = set.toList();
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e is ArticlesException ? e.message : 'Could not load articles.';
        _loading = false;
      });
    }
  }

  void _selectTag(String? tag) {
    _tag = tag;
    _load(1);
  }

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    return Scaffold(
      appBar: AppBar(title: const Text('Career advice')),
      body: SafeArea(
        child: Column(
          children: [
            if (_allTags.isNotEmpty)
              SizedBox(
                height: 48,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                  children: [
                    _TagChip(label: 'All', selected: _tag == null, onTap: () => _selectTag(null)),
                    for (final t in _allTags) ...[
                      const SizedBox(width: AppSpacing.sm),
                      _TagChip(
                        label: _pretty(t),
                        selected: _tag == t,
                        onTap: () => _selectTag(t),
                      ),
                    ],
                  ],
                ),
              ),
            if (_allTags.isNotEmpty) Divider(height: 1, color: cq.border),
            Expanded(child: _body()),
          ],
        ),
      ),
    );
  }

  Widget _body() {
    if (_loading) {
      return const Center(child: CqLoader(message: 'Loading articles…'));
    }
    if (_error != null) {
      return _ErrorView(message: _error!, onRetry: () => _load(_currentPage));
    }
    final page = _page!;
    if (page.hits.isEmpty) {
      return const _EmptyState(
        icon: Icons.menu_book_rounded,
        title: 'No articles here yet',
        subtitle: 'Try a different topic.',
      );
    }
    return RefreshIndicator(
      onRefresh: () => _load(_currentPage),
      child: ListView.separated(
        padding: const EdgeInsets.all(AppSpacing.lg),
        itemCount: page.hits.length + 1,
        separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
        itemBuilder: (context, i) {
          if (i == page.hits.length) return _Pager(page: page, onGo: _load);
          final a = page.hits[i];
          return _ArticleCard(
            article: a,
            onTap: () => context.push(AppRoutes.articlePath(a.slug)),
          );
        },
      ),
    );
  }
}

String _pretty(String tag) => tag
    .split('-')
    .map((w) => w.isEmpty ? w : w[0].toUpperCase() + w.substring(1))
    .join(' ');

class _ArticleCard extends StatelessWidget {
  const _ArticleCard({required this.article, required this.onTap});

  final ArticleSummary article;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    final meta = [
      article.authorName,
      if (article.publishedAt != null) formatDate(article.publishedAt!),
      if (article.readTimeMinutes != null) '${article.readTimeMinutes} min read',
    ].where((s) => s.isNotEmpty).join('  ·  ');

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
              if (article.tags.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: Text(
                    _pretty(article.tags.first).toUpperCase(),
                    style: text.labelSmall?.copyWith(
                      color: cq.accent,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
              Text(article.title, style: text.titleMedium),
              if ((article.excerpt ?? '').isNotEmpty) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(
                  article.excerpt!,
                  style: text.bodyMedium?.copyWith(color: cq.fgMuted, height: 1.4),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              const SizedBox(height: AppSpacing.sm),
              Text(meta, style: text.labelSmall?.copyWith(color: cq.fgSubtle)),
            ],
          ),
        ),
      ),
    );
  }
}

class _TagChip extends StatelessWidget {
  const _TagChip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    return Center(
      child: GestureDetector(
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
      ),
    );
  }
}

class _Pager extends StatelessWidget {
  const _Pager({required this.page, required this.onGo});
  final ArticlesPage page;
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
