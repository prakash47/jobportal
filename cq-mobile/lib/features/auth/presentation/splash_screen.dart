import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/config/app_boot.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/network_background.dart';

/// The Career Queue launch screen — the signature "arrow completes the mark"
/// reveal, over the live "network of opportunities".
///
/// The letters, glow and drifting network are on screen from the first visible
/// frame; then, a beat after the native splash lifts, the cyan **arrow shoots in
/// from the left** (slowly, clearly) and slots beside the C to complete the CQ
/// mark — ONCE. It settles and stays; then the router moves on to welcome. The
/// arrow start is delayed off [AppBoot.firstFrame] so it isn't lost behind a
/// slow (debug) native splash.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  // Logo lock-up aspect (2966 × 1784).
  static const double _logoW = 150;
  static const double _logoH = _logoW * 1784 / 2966;

  late final AnimationController _arrowCtrl;
  late final Animation<double> _arrow;
  Timer? _startTimer;

  @override
  void initState() {
    super.initState();
    _arrowCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1300), // slow enough to watch
    );
    _arrow = CurvedAnimation(parent: _arrowCtrl, curve: Curves.easeOutCubic);

    // Play the arrow ONCE, a beat after the splash is actually visible (the
    // native splash has lifted). Then it stays until the router moves to welcome.
    AppBoot.firstFrame.future.then((_) {
      if (!mounted) return;
      _startTimer = Timer(const Duration(milliseconds: 1300), () {
        if (mounted) _arrowCtrl.forward();
      });
    });
  }

  @override
  void dispose() {
    _startTimer?.cancel();
    _arrowCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppPalette.navy,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // ── Navy gradient (identical to the welcome hero) ──
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

          // ── Live network of opportunities (drifts continuously) ──
          const NetworkBackground(
            color: Color(0xFF86CDF0),
            maxLineOpacity: 0.36,
            linkReach: 0.95,
          ),

          // ── Logo: static letters + the cyan arrow flying in once ──
          Center(
            child: SizedBox(
              height: 200,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  // Soft static glow behind the mark.
                  Container(
                    width: 210,
                    height: 210,
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(
                        colors: [Color(0x4D22A0DA), Color(0x0022A0DA)],
                        stops: [0.0, 0.72],
                      ),
                    ),
                  ),

                  SizedBox(
                    width: _logoW,
                    height: _logoH,
                    child: Stack(
                      clipBehavior: Clip.none,
                      fit: StackFit.expand,
                      children: [
                        // White letters — always visible.
                        Image.asset(
                          'assets/images/cq_letters_white.png',
                          fit: BoxFit.contain,
                          errorBuilder: (_, _, _) => const Center(
                            child: Text(
                              'Career Queue',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 24,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ),
                        // Cyan arrow — flies in from the left, once, and stays.
                        AnimatedBuilder(
                          animation: _arrow,
                          builder: (context, child) => Transform.translate(
                            offset: Offset(-1.7 * _logoW * (1 - _arrow.value), 0),
                            child: Opacity(
                              opacity: (_arrow.value * 6).clamp(0.0, 1.0),
                              child: child,
                            ),
                          ),
                          child: Image.asset(
                            'assets/images/cq_arrow_part.png',
                            fit: BoxFit.contain,
                            errorBuilder: (_, _, _) => const SizedBox.shrink(),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          // ── Tagline ──
          const Positioned(
            left: 0,
            right: 0,
            bottom: 54,
            child: Center(child: _MadeWithLine()),
          ),
        ],
      ),
    );
  }
}

/// "Made with ❤ in India" — white text, brand-cyan heart.
class _MadeWithLine extends StatelessWidget {
  const _MadeWithLine();

  @override
  Widget build(BuildContext context) {
    return const Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'Made with ',
          style: TextStyle(
            color: Colors.white70,
            fontSize: 13.5,
            fontWeight: FontWeight.w600,
          ),
        ),
        Icon(Icons.favorite, size: 14, color: AppPalette.cyan),
        Text(
          ' in India',
          style: TextStyle(
            color: Colors.white70,
            fontSize: 13.5,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
