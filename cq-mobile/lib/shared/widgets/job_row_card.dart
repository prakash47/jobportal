import 'package:flutter/material.dart';

import '../../core/format/job_format.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../features/jobs/data/job_models.dart';
import 'company_avatar.dart';

/// A compact job card for the *secondary* job lists — "Similar jobs" on the
/// detail screen and the recommended feed on the dashboard.
///
/// The search results keep their own taller card (skills, applied marker, the
/// full meta row); this one is deliberately lighter so a list of them can sit
/// inside a page that is already about something else without taking it over.
class JobRowCard extends StatelessWidget {
  const JobRowCard({super.key, required this.job, required this.onTap});

  final JobSummary job;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    final salary = formatSalaryLpa(job.salaryMin, job.salaryMax);
    final hasCity = (job.city ?? '').isNotEmpty;
    final sub = hasCity ? '${job.company.name}  ·  ${job.city}' : job.company.name;
    final meta = [
      ?salary,
      ?postedAgo(job.postedAt),
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
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CompanyAvatar(
                name: job.company.name,
                logoUrl: job.company.logoUrl,
                size: 38,
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      job.title,
                      style: text.titleSmall,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      sub,
                      style: text.bodySmall?.copyWith(color: cq.fgMuted),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      meta,
                      style: text.labelSmall?.copyWith(color: cq.fgSubtle),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              if (job.isSaved) ...[
                const SizedBox(width: AppSpacing.sm),
                Icon(Icons.bookmark_rounded, size: 16, color: cq.accent),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
