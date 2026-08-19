import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';

/// Minimum height of an interactive chip's TAP TARGET.
///
/// Material asks for 48dp and Apple for 44pt. The pill itself stays around
/// 32px — the extra height is transparent padding around it, which is how
/// Material's own icon buttons hit the guideline without looking inflated.
/// Before this, every filter and sort chip in the app was ~30px and missed both.
const double _minTapTarget = 48;

/// A selectable pill: filters, sorts, tags, work modes, employment types.
///
/// **Why this exists.** The same control was hand-rolled six times —
/// `_TagChip`, `_FilterChip`, `_ToggleChip`, `_SortChip`, `_ActiveFilterChip`,
/// plus two skill-chip helpers — across three visual languages and four
/// heights. They were pixel-identical in some places and quietly different in
/// others, which is how a job's skills ended up as neutral squares in the
/// search list and cyan pills on the detail screen one tap later.
class CqChip extends StatelessWidget {
  const CqChip({
    super.key,
    required this.label,
    required this.onTap,
    this.selected = false,
    this.trailing,
  });

  final String label;
  final VoidCallback onTap;
  final bool selected;

  /// Optional trailing glyph — a chevron for "opens a picker", a cross for
  /// "removes this filter".
  final IconData? trailing;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final fg = selected ? cq.accent : cq.fgMuted;

    return Semantics(
      button: true,
      selected: selected,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.pill),
        // The InkWell wraps the FULL tap target, not the pill, so the extra
        // height is actually tappable rather than just empty space.
        child: SizedBox(
          height: _minTapTarget,
          // widthFactor: 1 makes this size to the pill. A bare Center expands to
          // the maximum width offered, which inside a Wrap gave every chip the
          // full row — the sort chips stacked vertically instead of sitting in
          // a line. Only visible on a real screen, not in the analyzer.
          child: Center(
            widthFactor: 1,
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: AppSpacing.sm,
              ),
              decoration: BoxDecoration(
                color: selected
                    ? cq.accent.withValues(alpha: 0.14)
                    : cq.surfaceMuted,
                borderRadius: BorderRadius.circular(AppRadius.pill),
                border: Border.all(
                  color: selected
                      ? cq.accent.withValues(alpha: 0.5)
                      : cq.border,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    label,
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: fg,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                    ),
                  ),
                  if (trailing != null) ...[
                    const SizedBox(width: 4),
                    Icon(trailing, size: 15, color: fg),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A static label — a skill on a job, a tag on an article. Not tappable, so it
/// carries no tap-target minimum and no selected state.
///
/// One neutral treatment everywhere. The loud accent-tinted version that the
/// job detail used made a routine list of skills the brightest thing on the
/// screen, and disagreed with the same skills rendered in search results.
class CqTag extends StatelessWidget {
  const CqTag(this.label, {super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: 4,
      ),
      decoration: BoxDecoration(
        color: cq.surfaceMuted,
        borderRadius: BorderRadius.circular(AppRadius.sm),
        border: Border.all(color: cq.border),
      ),
      child: Text(
        label,
        style: Theme.of(
          context,
        ).textTheme.labelSmall?.copyWith(color: cq.fg),
      ),
    );
  }
}
