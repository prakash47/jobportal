import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cq_buttons.dart';
import '../../../shared/widgets/network_background.dart';
import '../../../shared/widgets/theme_toggle_button.dart';
import 'widgets/auth_alternatives.dart';

/// The first screen an unauthenticated user sees.
///
/// A branded navy hero — the logo glowing over the live "network of
/// opportunities" — flows into an action sheet. **Email works today** (it opens
/// the email-first flow). Google is gated behind a "coming soon" sheet (no
/// mobile OAuth yet); Phone opens its number-entry screen.
///
/// Layout is `Expanded(hero) + sheet(min)` inside safe areas, capped to a max
/// content width — so it fits every phone (notch or not), iOS or Android,
/// without overflow.
class AuthLandingScreen extends StatelessWidget {
  const AuthLandingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: AppPalette.navy,
      body: Column(
        children: [
          Expanded(child: _Hero()),
          _AuthSheet(),
        ],
      ),
    );
  }
}

/// Navy gradient + live network, with the glowing logo and headline centred,
/// and the theme toggle tucked into the top-right.
class _Hero extends StatelessWidget {
  const _Hero();

  @override
  Widget build(BuildContext context) {
    final headline = Theme.of(context).textTheme.headlineLarge?.copyWith(
      color: Colors.white,
      fontWeight: FontWeight.w800,
      height: 1.14,
    );

    return Stack(
      fit: StackFit.expand,
      children: [
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF1D2952), AppPalette.navy, Color(0xFF0E1730)],
              stops: [0.0, 0.5, 1.0],
            ),
          ),
        ),
        const NetworkBackground(
          color: Color(0xFF86CDF0),
          maxLineOpacity: 0.42,
          linkReach: 0.95,
        ),
        SafeArea(
          bottom: false,
          child: Stack(
            children: [
              const Align(
                alignment: Alignment.topRight,
                child: Padding(
                  padding: EdgeInsets.only(top: AppSpacing.xs, right: AppSpacing.xs),
                  child: ThemeToggleButton(color: Colors.white70),
                ),
              ),
              Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.xl2,
                    vertical: AppSpacing.xl2,
                  ),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 420),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SizedBox(
                          height: 150,
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              Container(
                                width: 220,
                                height: 220,
                                decoration: const BoxDecoration(
                                  shape: BoxShape.circle,
                                  gradient: RadialGradient(
                                    colors: [Color(0x5924A0DB), Color(0x0024A0DB)],
                                    stops: [0.0, 0.72],
                                  ),
                                ),
                              ),
                              Image.asset(
                                'assets/images/cq_logo_white.png',
                                height: 58,
                                fit: BoxFit.contain,
                                errorBuilder: (_, _, _) => const Text(
                                  'Career Queue',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 26,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: AppSpacing.xl),
                        Text.rich(
                          const TextSpan(
                            children: [
                              TextSpan(text: 'Find your next\n'),
                              TextSpan(
                                text: 'job',
                                style: TextStyle(color: AppPalette.cyan),
                              ),
                              TextSpan(text: ' in India.'),
                            ],
                          ),
                          textAlign: TextAlign.center,
                          style: headline,
                        ),
                      ],
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

/// The action sheet: primary Email (opens the email-first flow), then Google +
/// Phone. Content-sized and bottom-safe-area padded.
class _AuthSheet extends StatelessWidget {
  const _AuthSheet();

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final surface = Theme.of(context).scaffoldBackgroundColor;

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(26)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.16),
            blurRadius: 28,
            offset: const Offset(0, -8),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.xl2,
                AppSpacing.lg,
                AppSpacing.xl2,
                AppSpacing.xl2,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 38,
                    height: 4,
                    decoration: BoxDecoration(
                      color: cq.border,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xl2),

                  CqPrimaryButton(
                    label: 'Continue with Email',
                    icon: Icons.mail_outline_rounded,
                    showArrow: true,
                    onPressed: () => context.push(AppRoutes.login),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  const OrDivider(),
                  const SizedBox(height: AppSpacing.lg),

                  CqProviderButton(
                    icon: googleGIcon(),
                    label: 'Continue with Google',
                    onTap: () => showComingSoon(context, 'Google sign-in'),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  CqProviderButton(
                    icon: Icon(
                      Icons.smartphone_rounded,
                      size: 20,
                      color: cq.fg,
                    ),
                    label: 'Continue with Phone',
                    onTap: () => context.push(AppRoutes.phoneContinue),
                  ),

                  const SizedBox(height: AppSpacing.xl),
                  Text(
                    'By continuing you agree to our Terms & Privacy Policy.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: cq.fgSubtle,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
