import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/ui/refresh_failure.dart';
import '../../../core/format/job_format.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/article_cover_image.dart';
import '../../../shared/widgets/cq_loader.dart';
import '../data/article_models.dart';
import '../data/articles_repository.dart';
import '../../../shared/widgets/cq_states.dart';
import '../../../shared/widgets/cq_chips.dart';

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
  String? _q;
  bool _loading = true;
  String? _error;
  int _currentPage = 1;
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load(1);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<ArticlesRepository> _repository() async {
    final existing = _repo;
    if (existing != null) return existing;
    final repo = await ref.read(articlesRepositoryProvider.future);
    _repo = repo;
    return repo;
  }

  /// Returns false when the request failed and the PREVIOUS results were kept.
  /// See _selectTag: a topic chip lights up before its results arrive, and a
  /// failure would otherwise leave it lit above the unfiltered list.
  Future<bool> _load(int page) async {
    setState(() {
      if (_page == null) _loading = true; // keep the list mounted during refresh
      _error = null;
    });
    try {
      final data = await (await _repository()).list(
        tag: _tag,
        q: _q,
        page: page,
      );
      if (!mounted) return true;
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
      return true;
    } catch (e) {
      if (!mounted) return false;
      final message = e is ArticlesException ? e.message : 'Could not load articles.';
      // A refresh that fails keeps what is already on screen — see
      // core/ui/refresh_failure.dart.
      if (keepContentOnFailure(context, message, hasContent: _page != null)) {
        setState(() => _loading = false);
        return false;
      }
      setState(() {
        _error = message;
        _loading = false;
      });
      return false;
    }
  }

  Future<void> _selectTag(String? tag) async {
    final previous = _tag;
    setState(() => _tag = tag);
    // Put the chip back if the results it promised never arrived.
    if (!await _load(1) && mounted) setState(() => _tag = previous);
  }

  void _submitSearch(String raw) {
    final q = raw.trim();
    _q = q.isEmpty ? null : q;
    _load(1);
  }

  void _clearSearch() {
    _searchController.clear();
    _q = null;
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
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.md,
                AppSpacing.lg,
                AppSpacing.sm,
              ),
              child: TextField(
                controller: _searchController,
                textInputAction: TextInputAction.search,
                // Searched on submit rather than per keystroke: every query is
                // a round trip, and the article set is small enough that
                // as-you-type would be a lot of requests for little gain.
                onSubmitted: _submitSearch,
                decoration: InputDecoration(
                  hintText: 'Search advice',
                  prefixIcon: const Icon(Icons.search_rounded, size: 20),
                  suffixIcon: _q == null
                      ? null
                      : IconButton(
                          tooltip: 'Clear',
                          icon: const Icon(Icons.close_rounded, size: 18),
                          onPressed: _clearSearch,
                        ),
                  isDense: true,
                ),
              ),
            ),
            if (_allTags.isNotEmpty)
              SizedBox(
                height: 52,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                  children: [
                    CqChip(label: 'All', selected: _tag == null, onTap: () => _selectTag(null)),
                    for (final t in _allTags) ...[
                      const SizedBox(width: AppSpacing.sm),
                      CqChip(
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
      return CqErrorView(message: _error!, onRetry: () => _load(_currentPage));
    }
    final page = _page!;
    if (page.hits.isEmpty) {
      return _EmptyState(
        icon: Icons.menu_book_rounded,
        title: _q == null ? 'No articles here yet' : 'No results for "$_q"',
        subtitle: _q == null
            ? 'Try a different topic.'
            : 'Try different words, or clear the search.',
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
              // Absent on most articles today — rendered only when present, so
              // a coverless list looks deliberate rather than broken.
              if ((article.coverImageUrl ?? '').isNotEmpty) ...[
                ArticleCoverImage(url: article.coverImageUrl!, height: 148),
                const SizedBox(height: AppSpacing.md),
              ],
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

