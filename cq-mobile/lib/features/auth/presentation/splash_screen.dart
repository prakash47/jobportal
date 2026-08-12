import 'dart:math' as math;

import 'package:flutter/material.dart';

const Color _bg = Color(0xFFF4F8FC);
const Color _navy = Color(0xFF192349);
const Color _cyan = Color(0xFF24A0DB);

/// Animated launch screen — the "network" concept.
///
/// The story: a living **constellation** of nodes drifts behind the stage,
/// connecting and disconnecting with thin lines as they move (a "network of
/// opportunities"). Out of it the navy "CQ / Career Queue" letters **grow in
/// from nothing**, then the cyan arrow **shoots in from the left to complete the
/// logo**. The tagline slides up last.
///
/// Two hard rules keep it correct:
///
/// 1. **The very first frame is blank** — the network fades up from 0 (drawn on
///    a canvas, so it's paint-alpha, not a widget opacity layer) and the letters
///    grow from scale ~0. This matches the native launch screen (just [_bg]), so
///    launch reads as **one** screen, not two.
/// 2. **No widget opacity-from-zero** — Vivo/BBK's Impeller path drops widgets
///    that fade up via [Opacity]/[FadeTransition]. Canvas paint-alpha and
///    transforms are safe, so that's all we use.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  // Logical size of the logo lock-up (aspect 2966:1784 → 232 x 139.5).
  static const double _logoW = 232;
  static const double _logoH = 139.5;

  late final AnimationController _entrance;
  late final AnimationController _drift;
  late final Animation<double> _intro;
  late final Animation<double> _letters;
  late final Animation<double> _arrow;
  late final Animation<double> _tagline;

  @override
  void initState() {
    super.initState();

    _entrance = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    );
    // The network drifts on an endless loop (lower = faster movement).
    _drift = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 11000),
    )..repeat();

    // The network fades up over the first part of the entrance.
    _intro = CurvedAnimation(
      parent: _entrance,
      curve: const Interval(0.0, 0.6, curve: Curves.easeOutCubic),
    );
    // Letters grow up from nothing, so frame 0 is empty (matches native screen).
    _letters = CurvedAnimation(
      parent: _entrance,
      curve: const Interval(0.05, 0.6, curve: Curves.easeOutCubic),
    );
    // Arrow flies in from the left and locks in (easeOutBack overshoots a touch).
    _arrow = CurvedAnimation(
      parent: _entrance,
      curve: const Interval(0.32, 0.95, curve: Curves.easeOutBack),
    );
    _tagline = CurvedAnimation(
      parent: _entrance,
      curve: const Interval(0.66, 1.0, curve: Curves.easeOutCubic),
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
    return Scaffold(
      backgroundColor: _bg,
      body: Stack(
        children: [
          // ── Background: drifting network of connected nodes ──
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

          // ── Focus veil: softens the network right behind the logo so it
          //    stays crisp and readable (a static gradient, faded in). ──
          Positioned.fill(
            child: AnimatedBuilder(
              animation: _intro,
              builder: (context, _) => DecoratedBox(
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    center: const Alignment(0, -0.10),
                    radius: 0.52,
                    colors: [
                      _bg.withAlpha((0.86 * _intro.value * 255).round()),
                      _bg.withAlpha(0),
                    ],
                    stops: const [0.0, 1.0],
                  ),
                ),
              ),
            ),
          ),

          // ── Logo: navy letters + wordmark, then the arrow flies in ──
          Center(
            child: SizedBox(
              width: _logoW,
              height: _logoH,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  // Letters + wordmark — grow up from nothing.
                  AnimatedBuilder(
                    animation: _letters,
                    builder: (_, child) {
                      final v = _letters.value;
                      return Transform.translate(
                        offset: Offset(0, 26 * (1 - v)),
                        child: Transform.scale(
                          scale: 0.001 + 0.999 * v, // never exactly 0
                          child: child,
                        ),
                      );
                    },
                    child: Image.asset(
                      'assets/images/cq_letters_wordmark.png',
                      width: _logoW,
                      fit: BoxFit.contain,
                      errorBuilder: (_, _, _) => Image.asset(
                        'assets/images/cq_logo.png',
                        width: _logoW,
                        fit: BoxFit.contain,
                        errorBuilder: (_, _, _) => const Text(
                          'Career Queue',
                          style: TextStyle(
                            color: _navy,
                            fontSize: 28,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                  ),
                  // Arrow — shoots in from the left to complete the logo.
                  AnimatedBuilder(
                    animation: _arrow,
                    builder: (_, child) => Transform.translate(
                      offset: Offset(-172 * (1 - _arrow.value), 0),
                      child: child,
                    ),
                    child: Image.asset(
                      'assets/images/cq_arrow_part.png',
                      width: _logoW,
                      fit: BoxFit.contain,
                      errorBuilder: (_, _, _) => const SizedBox.shrink(),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // ── Tagline: slides up from below (hidden at frame 0) ──
          Positioned(
            left: 0,
            right: 0,
            bottom: 56,
            child: Center(
              child: AnimatedBuilder(
                animation: _tagline,
                builder: (_, child) => Transform.translate(
                  offset: Offset(0, 70 * (1 - _tagline.value)),
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

/// Draws the drifting node-and-line constellation. Everything is direct canvas
/// paint with per-shape alpha (never a widget opacity layer), so it fades in and
/// renders reliably on every device. Lines appear/disappear by distance, so the
/// network feels alive as nodes wander.
class _NetworkPainter extends CustomPainter {
  _NetworkPainter({required this.phase, required this.intro});

  final double phase; // radians, advances endlessly
  final double intro; // 0..1 fade-in

  @override
  void paint(Canvas canvas, Size size) {
    if (intro <= 0) return;

    // Current positions of every node (home + drift orbit). [_amp] widens the
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
          final a = (1 - d / threshold) * 0.45 * intro;
          linePaint.color = _cyan.withAlpha((a * 255).round());
          canvas.drawLine(pts[i], pts[j], linePaint);
        }
      }
    }

    // Nodes: a soft halo + a solid dot.
    final halo = Paint()..color = _cyan.withAlpha((0.12 * intro * 255).round());
    final dot = Paint()..color = _cyan.withAlpha((0.90 * intro * 255).round());
    for (final p in pts) {
      canvas.drawCircle(p, 8, halo);
      canvas.drawCircle(p, 2.8, dot);
    }
  }

  @override
  bool shouldRepaint(covariant _NetworkPainter old) =>
      old.phase != phase || old.intro != intro;
}

/// "Made with ❤ in India" — navy text, brand-cyan heart (never the common red).
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
            color: _navy,
            fontSize: 13.5,
            fontWeight: FontWeight.w600,
          ),
        ),
        Icon(Icons.favorite, size: 14, color: _cyan),
        Text(
          ' in India',
          style: TextStyle(
            color: _navy,
            fontSize: 13.5,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
