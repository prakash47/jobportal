import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';

/// An article's cover image.
///
/// Every failure mode collapses to the same thing — nothing at all. The field
/// is nullable server-side and most seeded articles have none, so the absent
/// case is the normal one, and a broken-image icon or a grey placeholder box
/// would be more visual noise than the picture was worth. Callers decide
/// whether to render this at all by checking the URL is non-empty; this widget
/// then handles a URL that turns out to be unreachable.
class ArticleCoverImage extends StatelessWidget {
  const ArticleCoverImage({
    super.key,
    required this.url,
    required this.height,
    this.borderRadius,
  });

  final String url;
  final double height;
  final BorderRadius? borderRadius;

  @override
  Widget build(BuildContext context) {
    final radius = borderRadius ?? BorderRadius.circular(AppRadius.md);
    return ClipRRect(
      borderRadius: radius,
      child: Image.network(
        url,
        height: height,
        width: double.infinity,
        fit: BoxFit.cover,
        // Fade in rather than pop, and hold the space while loading so the
        // text below doesn't jump once the image arrives.
        frameBuilder: (context, child, frame, wasSynchronous) {
          if (wasSynchronous || frame != null) return child;
          return SizedBox(
            height: height,
            width: double.infinity,
            child: DecoratedBox(
              decoration: BoxDecoration(color: context.cq.surfaceMuted),
            ),
          );
        },
        errorBuilder: (_, _, _) => const SizedBox.shrink(),
      ),
    );
  }
}
