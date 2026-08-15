import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format/job_format.dart';
import '../../../core/network/external_link.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/company_avatar.dart';
import '../../../shared/widgets/cq_loader.dart';
import '../data/company_models.dart';
import '../data/companies_repository.dart';
import 'companies_screen.dart' show RatingPill;

/// Company profile (`GET /companies/:handle`) — about, what it's like to work
/// here, open roles, reviews, and related companies.
class CompanyDetailScreen extends ConsumerStatefulWidget {
  const CompanyDetailScreen({super.key, required this.handle});

  final String handle;

  @override
  ConsumerState<CompanyDetailScreen> createState() => _CompanyDetailScreenState();
}

class _CompanyDetailScreenState extends ConsumerState<CompanyDetailScreen> {
  CompanyProfile? _company;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _openWebsite(String url) async {
    final opened = await openExternalLink(url);
    if (!mounted || opened) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(content: Text('Could not open this link')));
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final repo = await ref.read(companiesRepositoryProvider.future);
      final c = await repo.profile(widget.handle);
      if (!mounted) return;
      setState(() {
        _company = c;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e is CompaniesException ? e.message : 'Could not load this company.';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_company?.name ?? 'Company')),
      body: SafeArea(child: _body()),
    );
  }

  Widget _body() {
    if (_loading) {
      return const Center(child: CqLoader(message: 'Loading company…'));
    }
    if (_error != null) {
      return _ErrorView(message: _error!, onRetry: _load);
    }
    final c = _company!;
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    final sub = [
      c.industryName,
      c.hqCityName,
    ].whereType<String>().where((s) => s.isNotEmpty).join('  ·  ');

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.xl2),
      children: [
        // ── Header ──
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CompanyAvatar(name: c.name, logoUrl: c.logoUrl, size: 64),
            const SizedBox(width: AppSpacing.lg),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(child: Text(c.name, style: text.titleLarge)),
                      if (c.isVerified) ...[
                        const SizedBox(width: 6),
                        Icon(Icons.verified_rounded, size: 18, color: cq.accent),
                      ],
                    ],
                  ),
                  if (sub.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(sub, style: text.bodyMedium?.copyWith(color: cq.fgMuted)),
                  ],
                  if (c.averageRating != null) ...[
                    const SizedBox(height: AppSpacing.sm),
                    RatingPill(rating: c.averageRating!, reviews: c.reviewCount),
                  ],
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),

        // ── Quick facts ──
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            if (c.companyType != null && c.companyType!.isNotEmpty)
              _fact(context, Icons.business_rounded, companyTypeLabel(c.companyType)),
            if (c.employeeCount != null && c.employeeCount!.isNotEmpty)
              _fact(context, Icons.groups_rounded, '${c.employeeCount} employees'),
            if (c.foundedYear != null)
              _fact(context, Icons.flag_rounded, 'Founded ${c.foundedYear}'),
            if (c.activeJobs > 0)
              _fact(context, Icons.work_outline_rounded, '${c.activeJobs} open roles'),
            // Only rendered when the URL survives validation, so a hostile or
            // malformed value shows nothing rather than a chip that refuses to
            // work when tapped.
            if (safeWebUri(c.websiteUrl) != null)
              _linkFact(
                context,
                Icons.open_in_new_rounded,
                hostLabel(c.websiteUrl!),
                () => _openWebsite(c.websiteUrl!),
              ),
          ],
        ),

        if (c.description != null && c.description!.isNotEmpty) ...[
          _sectionTitle(context, 'About'),
          Text(
            c.description!,
            style: text.bodyMedium?.copyWith(color: cq.fg, height: 1.5),
          ),
        ],

        if (c.highlights.isNotEmpty) ...[
          _sectionTitle(context, "What it's like to work here"),
          for (final h in c.highlights) _HighlightCard(highlight: h),
        ],

        if (c.openings.isNotEmpty) ...[
          // `activeJobs` is the real count; `openings` is a server-capped
          // sample of at most 10. Using the list length here made a company
          // with 43 live roles read "43 open roles" in the facts row and
          // "Open roles (10)" six lines below it.
          _sectionTitle(context, 'Open roles (${c.activeJobs})'),
          for (final o in c.openings)
            _OpeningRow(
              opening: o,
              onTap: () => context.push(AppRoutes.jobDetailPath(o.canonicalSlug)),
            ),
          if (c.activeJobs > c.openings.length)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.sm),
              child: Center(
                child: Text(
                  // No "see all" action: /v1/jobs has no company filter, so
                  // there is no endpoint to send them to.
                  'Showing ${c.openings.length} of ${c.activeJobs}.',
                  style: text.labelSmall?.copyWith(color: cq.fgMuted),
                ),
              ),
            ),
        ],

        if (c.reviews.isNotEmpty) ...[
          _sectionTitle(context, 'Reviews'),
          for (final r in c.reviews) _ReviewCard(review: r),
        ],

        if (c.relatedCompanies.isNotEmpty) ...[
          _sectionTitle(context, 'Similar companies'),
          SizedBox(
            // Taller than before: a rated company that is also hiring now
            // renders both lines, where it used to render only one.
            height: (152 * MediaQuery.textScalerOf(context).scale(1.0))
                .clamp(152.0, 232.0),
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: c.relatedCompanies.length,
              separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.md),
              itemBuilder: (context, i) {
                final r = c.relatedCompanies[i];
                return _RelatedCard(
                  related: r,
                  onTap: () => context.push(AppRoutes.companyPath(r.handle)),
                );
              },
            ),
          ),
        ],
        const SizedBox(height: AppSpacing.lg),
      ],
    );
  }

  Widget _sectionTitle(BuildContext context, String title) => Padding(
    padding: const EdgeInsets.only(top: AppSpacing.xl, bottom: AppSpacing.md),
    child: Text(title, style: Theme.of(context).textTheme.titleMedium),
  );
}

Widget _fact(BuildContext context, IconData icon, String label) {
  final cq = context.cq;
  return Container(
    padding: const EdgeInsets.symmetric(
      horizontal: AppSpacing.md,
      vertical: AppSpacing.sm,
    ),
    decoration: BoxDecoration(
      color: cq.surfaceMuted,
      borderRadius: BorderRadius.circular(AppRadius.sm),
      border: Border.all(color: cq.border),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 15, color: cq.fgMuted),
        const SizedBox(width: 6),
        Text(
          label,
          style: Theme.of(context).textTheme.labelMedium?.copyWith(color: cq.fg),
        ),
      ],
    ),
  );
}

/// A fact chip that is also a link — same shape as [_fact], tinted with the
/// accent so it reads as the one tappable item in the row.
Widget _linkFact(
  BuildContext context,
  IconData icon,
  String label,
  VoidCallback onTap,
) {
  final cq = context.cq;
  return Material(
    color: cq.surfaceMuted,
    borderRadius: BorderRadius.circular(AppRadius.sm),
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.sm),
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.sm,
        ),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppRadius.sm),
          border: Border.all(color: cq.accent.withValues(alpha: 0.35)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 15, color: cq.accent),
            const SizedBox(width: 6),
            Text(
              label,
              style: Theme.of(context).textTheme.labelMedium
                  ?.copyWith(color: cq.accent),
            ),
          ],
        ),
      ),
    ),
  );
}

class _HighlightCard extends StatelessWidget {
  const _HighlightCard({required this.highlight});
  final CompanyHighlight highlight;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: cq.surfaceMuted,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: cq.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(highlight.heading, style: text.titleSmall),
          const SizedBox(height: AppSpacing.xs),
          Text(
            highlight.body,
            style: text.bodyMedium?.copyWith(color: cq.fgMuted, height: 1.5),
          ),
        ],
      ),
    );
  }
}

class _OpeningRow extends StatelessWidget {
  const _OpeningRow({required this.opening, required this.onTap});
  final CompanyOpening opening;
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
          margin: const EdgeInsets.only(bottom: AppSpacing.sm),
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: cq.border),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(opening.title, style: text.titleSmall),
                    const SizedBox(height: 2),
                    Text(
                      [
                        opening.primaryCityName,
                        'Posted ${postedAgo(opening.postedAt)}',
                      ].whereType<String>().where((s) => s.isNotEmpty).join('  ·  '),
                      style: text.bodySmall?.copyWith(color: cq.fgMuted),
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

class _ReviewCard extends StatelessWidget {
  const _ReviewCard({required this.review});
  final CompanyReview review;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
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
            children: [
              _Stars(rating: review.rating),
              const Spacer(),
              Text(
                formatMonthYear(review.createdAt),
                style: text.labelSmall?.copyWith(color: cq.fgSubtle),
              ),
            ],
          ),
          if ((review.title ?? '').isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(review.title!, style: text.titleSmall),
          ],
          const SizedBox(height: AppSpacing.xs),
          Text(
            review.body,
            style: text.bodyMedium?.copyWith(color: cq.fgMuted, height: 1.5),
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              Icon(Icons.person_outline_rounded, size: 14, color: cq.fgSubtle),
              const SizedBox(width: 4),
              Text(
                review.authorName ?? 'Anonymous',
                style: text.labelSmall?.copyWith(color: cq.fgSubtle),
              ),
              if (review.isVerified) ...[
                const SizedBox(width: 6),
                Icon(Icons.verified_rounded, size: 13, color: cq.success),
                const SizedBox(width: 2),
                Text(
                  'Verified',
                  style: text.labelSmall?.copyWith(color: cq.success),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _Stars extends StatelessWidget {
  const _Stars({required this.rating});
  final int rating;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 1; i <= 5; i++)
          Icon(
            i <= rating ? Icons.star_rounded : Icons.star_outline_rounded,
            size: 16,
            color: i <= rating ? cq.warning : cq.fgSubtle,
          ),
      ],
    );
  }
}

class _RelatedCard extends StatelessWidget {
  const _RelatedCard({required this.related, required this.onTap});
  final RelatedCompany related;
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
          width: 150,
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: cq.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CompanyAvatar(name: related.name, logoUrl: related.logoUrl, size: 40),
              const SizedBox(height: AppSpacing.sm),
              Text(
                related.name,
                style: text.titleSmall,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 2),
              // Rating and open roles are independent facts, not alternatives —
              // an either/or hid the hiring signal on every rated company,
              // which is the more useful of the two to a job seeker.
              if (related.averageRating != null)
                RatingPill(rating: related.averageRating!),
              if (related.openRoles > 0)
                Text(
                  '${related.openRoles} open roles',
                  style: text.labelSmall?.copyWith(color: cq.fgMuted),
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
