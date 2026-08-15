import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format/job_format.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/article_cover_image.dart';
import '../../../shared/widgets/cq_loader.dart';
import '../../../shared/widgets/simple_markdown.dart';
import '../data/article_models.dart';
import '../data/articles_repository.dart';

/// A single career-advice article (`GET /career-advice/:slug`) — title, byline,
/// markdown body, and an FAQ section.
class ArticleDetailScreen extends ConsumerStatefulWidget {
  const ArticleDetailScreen({super.key, required this.slug});

  final String slug;

  @override
  ConsumerState<ArticleDetailScreen> createState() => _ArticleDetailScreenState();
}

class _ArticleDetailScreenState extends ConsumerState<ArticleDetailScreen> {
  ArticleDetail? _article;
  List<ArticleSummary> _related = const [];
  bool _loading = true;
  String? _error;

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
      final repo = await ref.read(articlesRepositoryProvider.future);
      final a = await repo.detail(widget.slug);
      if (!mounted) return;
      setState(() {
        _article = a;
        _related = const [];
        _loading = false;
      });
      // Same-topic reading, derived from the article's own tag. Never throws.
      final related = await repo.related(a);
      if (!mounted || _article?.slug != a.slug) return;
      setState(() => _related = related);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e is ArticlesException ? e.message : 'Could not load this article.';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Article')),
      body: SafeArea(child: _body()),
    );
  }

  Widget _body() {
    if (_loading) {
      return const Center(child: CqLoader(message: 'Loading article…'));
    }
    if (_error != null) {
      return _ErrorView(message: _error!, onRetry: _load);
    }
    final a = _article!;
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    final meta = [
      a.authorName,
      if (a.publishedAt != null) formatDate(a.publishedAt!),
      if (a.readTimeMinutes != null) '${a.readTimeMinutes} min read',
    ].where((s) => s.isNotEmpty).join('  ·  ');

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.xl2),
      children: [
        if ((a.coverImageUrl ?? '').isNotEmpty) ...[
          ArticleCoverImage(url: a.coverImageUrl!, height: 180),
          const SizedBox(height: AppSpacing.lg),
        ],
        if (a.tags.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: Text(
              _pretty(a.tags.first).toUpperCase(),
              style: text.labelSmall?.copyWith(
                color: cq.accent,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5,
              ),
            ),
          ),
        Text(a.title, style: text.headlineSmall),
        const SizedBox(height: AppSpacing.sm),
        Text(meta, style: text.bodySmall?.copyWith(color: cq.fgMuted)),
        const SizedBox(height: AppSpacing.lg),
        Divider(height: 1, color: cq.border),
        const SizedBox(height: AppSpacing.lg),

        SimpleMarkdown(a.body),

        if (a.faqs.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xl),
          Text('FAQs', style: text.titleMedium),
          const SizedBox(height: AppSpacing.sm),
          for (final f in a.faqs) _FaqTile(faq: f),
        ],

        if (a.tags.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xl),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [for (final t in a.tags) _tagPill(context, _pretty(t))],
          ),
        ],

        if (_related.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xl),
          Divider(height: 1, color: cq.border),
          const SizedBox(height: AppSpacing.lg),
          Text('More on this topic', style: text.titleMedium),
          const SizedBox(height: AppSpacing.md),
          for (final r in _related) ...[
            _RelatedArticleRow(
              article: r,
              // `replace`, so reading through a chain of related articles
              // doesn't build a deep stack of article screens to back out of.
              onTap: () => context.replace(AppRoutes.articlePath(r.slug)),
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
        ],
        const SizedBox(height: AppSpacing.lg),
      ],
    );
  }
}

/// A compact link to another article on the same topic.
class _RelatedArticleRow extends StatelessWidget {
  const _RelatedArticleRow({required this.article, required this.onTap});

  final ArticleSummary article;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    final meta = [
      if (article.readTimeMinutes != null) '${article.readTimeMinutes} min read',
      if (article.publishedAt != null) formatDate(article.publishedAt!),
    ].join('  ·  ');

    return Material(
      color: cq.surfaceMuted,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: cq.border),
          ),
          child: Row(
            children: [
              if ((article.coverImageUrl ?? '').isNotEmpty) ...[
                SizedBox(
                  width: 64,
                  child: ArticleCoverImage(
                    url: article.coverImageUrl!,
                    height: 48,
                    borderRadius: BorderRadius.circular(AppRadius.sm),
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      article.title,
                      style: text.titleSmall,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (meta.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        meta,
                        style: text.labelSmall?.copyWith(color: cq.fgSubtle),
                      ),
                    ],
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, size: 18, color: cq.fgSubtle),
            ],
          ),
        ),
      ),
    );
  }
}

String _pretty(String tag) => tag
    .split('-')
    .map((w) => w.isEmpty ? w : w[0].toUpperCase() + w.substring(1))
    .join(' ');

Widget _tagPill(BuildContext context, String label) {
  final cq = context.cq;
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: 6),
    decoration: BoxDecoration(
      color: cq.surfaceMuted,
      borderRadius: BorderRadius.circular(AppRadius.pill),
      border: Border.all(color: cq.border),
    ),
    child: Text(
      label,
      style: Theme.of(context).textTheme.labelSmall?.copyWith(color: cq.fgMuted),
    ),
  );
}

class _FaqTile extends StatelessWidget {
  const _FaqTile({required this.faq});
  final ArticleFaq faq;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      decoration: BoxDecoration(
        color: cq.surfaceMuted,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: cq.border),
      ),
      child: Theme(
        // Strip the default divider lines ExpansionTile draws.
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
          childrenPadding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            0,
            AppSpacing.lg,
            AppSpacing.lg,
          ),
          iconColor: cq.accent,
          collapsedIconColor: cq.fgMuted,
          title: Text(faq.question, style: text.titleSmall),
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                faq.answer,
                style: text.bodyMedium?.copyWith(color: cq.fgMuted, height: 1.5),
              ),
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
