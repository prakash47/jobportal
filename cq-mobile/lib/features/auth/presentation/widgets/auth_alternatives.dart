import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/app_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../shared/widgets/cq_buttons.dart';

/// A hairline "or" separator between the primary action and the alternatives.
class OrDivider extends StatelessWidget {
  const OrDivider({super.key});

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    return Row(
      children: [
        Expanded(child: Divider(color: cq.border)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
          child: Text(
            'or',
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: cq.fgSubtle),
          ),
        ),
        Expanded(child: Divider(color: cq.border)),
      ],
    );
  }
}

/// The official multicolour Google "G" (blank box fallback so a button that
/// uses it never breaks if the asset is missing).
Widget googleGIcon({double size = 19}) => SvgPicture.asset(
  'assets/images/google_g.svg',
  width: size,
  height: size,
  placeholderBuilder: (_) => SizedBox(width: size, height: size),
);

/// A polite sheet for options that aren't wired to the backend yet, with a
/// one-tap fallback to the email flow (which does work).
void showComingSoon(BuildContext context, String feature) {
  showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (sheetContext) {
      final text = Theme.of(sheetContext).textTheme;
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.xl2,
            AppSpacing.sm,
            AppSpacing.xl2,
            AppSpacing.xl2,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.rocket_launch_rounded,
                size: 40,
                color: sheetContext.cq.accent,
              ),
              const SizedBox(height: AppSpacing.lg),
              Text(
                '$feature is coming soon',
                style: text.titleLarge,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                'For now, continue with your email — it only takes a minute.',
                textAlign: TextAlign.center,
                style: text.bodyMedium?.copyWith(color: sheetContext.cq.fgMuted),
              ),
              const SizedBox(height: AppSpacing.xl),
              CqPrimaryButton(
                label: 'Continue with Email',
                icon: Icons.mail_outline_rounded,
                onPressed: () {
                  Navigator.of(sheetContext).pop();
                  context.push(AppRoutes.login);
                },
              ),
            ],
          ),
        ),
      );
    },
  );
}
