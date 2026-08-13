import 'dart:math' as math;

import 'package:flutter/material.dart';

// Brand palette — a bold navy stage so the launch never reads as a blank
// white frame, with the cyan constellation glowing against it.
const Color _navy = Color(0xFF192349);
const Color _navyLift = Color(0xFF223163); // lighter centre for depth
const Color _navyDeep = Color(0xFF0E1430); // deeper edges (vignette)
const Color _cyan = Color(0xFF24A0DB);
const Color _cyanBright = Color(0xFF57C1EE);

/// Animated launch screen — the "network" concept, on a bold navy stage.
///
/// The story: a living **constellation** of cyan nodes drifts across a deep
/// navy field, connecting and disconnecting with thin lines as they move (a
/// "network of opportunities"). A soft cyan spotlight blooms in the centre and
/// the white "Career Queue" logo **grows up into it**. The tagline slides up
/// last.
///
/// Two hard rules keep it correct on every device:
///
/// 1. **The stage is a solid brand colour from the very first frame.** The
///    native launch screen is the same navy (see `flutter_native_splash` in
///    pubspec), so app-open → animation is *one* continuous surface — never a
///    white blank flash while Flutter boots.
/// 2. **No widget opacity-from-zero.** Vivo/BBK's Impeller path drops widgets
///    that fade up via [Opacity]/[FadeTransition]. Everything here fades via
///    canvas paint-alpha or animates via [Transform] only — both are safe.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  late final AnimationController _entrance;
  late final AnimationController _drift;
  late final Animation<double> _intro;
  late final Animation<double> _logo;
  late final Animation<double> _tagline;

  @override
  void initState() {
    super.initState();

    _entrance = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    );
    // The constellation drifts on an endless loop (lower = faster movement).
    _drift = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 11000),
    )..repeat();

    // The network + centre glow fade up over the first part of the entrance.
    _intro = CurvedAnimation(
      parent: _entrance,
      curve: const Interval(0.0, 0.55, curve: Curves.easeOutCubic),
    );
    // The logo grows up into the glow (scale + rise, no opacity layer).
    _logo = CurvedAnimation(
      parent: _entrance,
      curve: const Interval(0.14, 0.72, curve: Curves.easeOutCubic),
    );
    // Tagline slides up from below, last.
    _tagline = CurvedAnimation(
      parent: _entrance,
      curve: const Interval(0.64, 1.0, curve: Curves.easeOutCubic),
    );

    _entrance.forward();
  }

  @override
  void dispose() {
    _entrance.dispose();
    _drift.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final logoW = (size.width * 0.60).clamp(200.0, 300.0);

    return Scaffold(
      backgroundColor: _navy,
      body: Stack(
        children: [
          // ── Base: navy field with a soft radial vignette for depth ──
          const Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: Alignment(0, -0.14),
                  radius: 1.15,
                  colors: [_navyLift, _navy, _navyDeep],
                  stops: [0.0, 0.52, 1.0],
                ),
              ),
            ),
          ),

          // ── Drifting constellation + centre glow (canvas paint-alpha) ──
          Positioned.fill(
            child: RepaintBoundary(
              child: AnimatedBuilder(
                animation: Listenable.merge([_drift, _intro]),
                builder: (context, _) => CustomPaint(
                  painter: _NetworkPainter(
                    phase: _drift.value * 2 * math.pi,
                    intro: _intro.value,
                  ),
                  child: const SizedBox.expand(),
                ),
              ),
            ),
          ),

          // ── Logo: white lock-up grows up into the glow ──
          Center(
            child: AnimatedBuilder(
              animation: _logo,
              builder: (_, child) {
                final v = _logo.value;
                return Transform.translate(
                  offset: Offset(0, 24 * (1 - v)),
                  child: Transform.scale(scale: 0.60 + 0.40 * v, child: child),
                );
              },
              child: Image.asset(
                'assets/images/cq_logo_white.png',
                width: logoW,
                fit: BoxFit.contain,
                errorBuilder: (_, _, _) => Text(
                  'Career Queue',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: logoW * 0.13,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
            ),
          ),

          // ── Tagline: slides up from below (below frame at start) ──
          Positioned(
            left: 0,
            right: 0,
            bottom: 56,
            child: Center(
              child: AnimatedBuilder(
                animation: _tagline,
                builder: (_, child) => Transform.translate(
                  offset: Offset(0, 60 * (1 - _tagline.value)),
                  child: child,
                ),
                child: const _MadeWithLine(),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// One node of the background constellation: a home position [x],[y] (in 0..1
/// screen fractions) plus a small drift orbit ([ax],[ay] amplitude, [px],[py]
/// phase) so it wanders gently and endlessly.
class _NetNode {
  const _NetNode(this.x, this.y, this.ax, this.ay, this.px, this.py);
  final double x, y, ax, ay, px, py;
}

const List<_NetNode> _netNodes = [
  _NetNode(0.14, 0.12, 0.030, 0.022, 0.0, 1.1),
  _NetNode(0.42, 0.19, 0.024, 0.030, 0.7, 0.3),
  _NetNode(0.73, 0.10, 0.028, 0.020, 1.6, 2.0),
  _NetNode(0.89, 0.27, 0.022, 0.026, 2.3, 0.9),
  _NetNode(0.20, 0.37, 0.030, 0.024, 3.0, 1.7),
  _NetNode(0.55, 0.43, 0.026, 0.028, 0.4, 2.6),
  _NetNode(0.81, 0.53, 0.024, 0.022, 1.2, 3.1),
  _NetNode(0.12, 0.61, 0.028, 0.026, 2.0, 0.6),
  _NetNode(0.40, 0.67, 0.030, 0.024, 2.7, 1.4),
  _NetNode(0.69, 0.75, 0.022, 0.030, 3.3, 2.2),
  _NetNode(0.28, 0.87, 0.026, 0.020, 0.9, 2.9),
  _NetNode(0.86, 0.85, 0.028, 0.026, 1.8, 0.2),
];

/// Draws the centre glow + the drifting node-and-line constellation. Everything
/// is direct canvas paint with per-shape alpha (never a widget opacity layer),
/// so it fades in and renders reliably on every device. Lines appear/disappear
/// by distance, so the network feels alive as nodes wander.
class _NetworkPainter extends CustomPainter {
  _NetworkPainter({required this.phase, required this.intro});

  final double phase; // radians, advances endlessly
  final double intro; // 0..1 fade-in

  @override
  void paint(Canvas canvas, Size size) {
    if (intro <= 0) return;

    // Soft cyan spotlight behind the logo — gives the lock-up a premium bloom
    // and does the "fade-in" heavy lifting so the logo entrance reads as soft.
    final glowCenter = Offset(size.width / 2, size.height * 0.46);
    final glow = Paint()
      ..color = _cyan.withAlpha((0.20 * intro * 255).round())
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 88);
    canvas.drawCircle(glowCenter, size.shortestSide * 0.36, glow);

    // Current positions of every node (home + drift orbit). [amp] widens the
    // orbit so movement reads clearly on the phone.
    const amp = 1.7;
    final pts = <Offset>[
      for (final n in _netNodes)
        Offset(
          (n.x + n.ax * amp * math.sin(phase + n.px)) * size.width,
          (n.y + n.ay * amp * math.cos(phase + n.py)) * size.height,
        ),
    ];

    // Links: the closer two nodes are, the brighter the line.
    final threshold = size.shortestSide * 0.62;
    final linePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.1;
    for (var i = 0; i < pts.length; i++) {
      for (var j = i + 1; j < pts.length; j++) {
        final d = (pts[i] - pts[j]).distance;
        if (d < threshold) {
          final a = (1 - d / threshold) * 0.55 * intro;
          linePaint.color = _cyan.withAlpha((a * 255).round());
          canvas.drawLine(pts[i], pts[j], linePaint);
        }
      }
    }

    // Nodes: a soft halo, a cyan body, and a bright core so they read as
    // glowing points of light on the navy field.
    final halo = Paint()
      ..color = _cyan.withAlpha((0.18 * intro * 255).round())
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6);
    final body = Paint()..color = _cyan.withAlpha((0.95 * intro * 255).round());
    final core = Paint()
      ..color = _cyanBright.withAlpha((1.0 * intro * 255).round());
    for (final p in pts) {
      canvas.drawCircle(p, 9, halo);
      canvas.drawCircle(p, 3.0, body);
      canvas.drawCircle(p, 1.3, core);
    }
  }

  @override
  bool shouldRepaint(covariant _NetworkPainter old) =>
      old.phase != phase || old.intro != intro;
}

/// "Made with ♥ in India" — white text, brand-cyan heart (never the common red).
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
            color: Colors.white,
            fontSize: 13.5,
            fontWeight: FontWeight.w600,
          ),
        ),
        Icon(Icons.favorite, size: 14, color: _cyanBright),
        Text(
          ' in India',
          style: TextStyle(
            color: Colors.white,
            fontSize: 13.5,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
