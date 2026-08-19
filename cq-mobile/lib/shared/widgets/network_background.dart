import 'dart:math' as math;

import 'package:flutter/material.dart';

/// The CQ "network of opportunities" motif — a drifting constellation of nodes
/// that link and unlink as they move. Reused across the splash and the auth
/// screens so the brand feels continuous.
///
/// Everything is direct canvas paint with per-shape alpha (never a widget
/// opacity layer), so it fades in and renders reliably on every device —
/// including Vivo/BBK, whose Impeller path drops opacity-from-zero widgets.
class NetworkBackground extends StatefulWidget {
  const NetworkBackground({
    super.key,
    this.color = const Color(0xFF22A0DA),
    this.maxLineOpacity = 0.42,
    this.dotOpacity = 0.9,
    this.linkReach = 0.75,
  });

  /// Base colour for nodes + links.
  final Color color;

  /// Peak opacity of a link (nearest nodes) and of a node dot.
  final double maxLineOpacity;
  final double dotOpacity;

  /// How far two nodes can be (as a fraction of the shortest side) and still
  /// be linked. Higher = denser web.
  final double linkReach;

  @override
  State<NetworkBackground> createState() => _NetworkBackgroundState();
}

class _NetworkBackgroundState extends State<NetworkBackground>
    with TickerProviderStateMixin {
  late final AnimationController _drift;
  late final AnimationController _fade;

  @override
  void initState() {
    super.initState();
    _drift = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 11000),
    )..repeat();
    _fade = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    )..forward();
  }

  @override
  void dispose() {
    _drift.dispose();
    _fade.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: AnimatedBuilder(
        animation: Listenable.merge([_drift, _fade]),
        builder: (_, _) => CustomPaint(
          painter: _NetworkPainter(
            phase: _drift.value * 2 * math.pi,
            intro: Curves.easeOut.transform(_fade.value),
            color: widget.color,
            maxLineOpacity: widget.maxLineOpacity,
            dotOpacity: widget.dotOpacity,
            linkReach: widget.linkReach,
          ),
          child: const SizedBox.expand(),
        ),
      ),
    );
  }
}

/// One node: a home position ([x],[y] in 0..1 of the canvas) plus a small drift
/// orbit ([ax],[ay] amplitude, [px],[py] phase) so it wanders endlessly.
class _NetNode {
  const _NetNode(this.x, this.y, this.ax, this.ay, this.px, this.py);
  final double x, y, ax, ay, px, py;
}

const List<_NetNode> _nodes = [
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

class _NetworkPainter extends CustomPainter {
  _NetworkPainter({
    required this.phase,
    required this.intro,
    required this.color,
    required this.maxLineOpacity,
    required this.dotOpacity,
    required this.linkReach,
  });

  final double phase, intro, maxLineOpacity, dotOpacity, linkReach;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    if (intro <= 0) return;

    const amp = 1.7; // widen the orbit so movement reads clearly
    final pts = <Offset>[
      for (final n in _nodes)
        Offset(
          (n.x + n.ax * amp * math.sin(phase + n.px)) * size.width,
          (n.y + n.ay * amp * math.cos(phase + n.py)) * size.height,
        ),
    ];

    final threshold = size.shortestSide * linkReach;
    final linePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.1;
    for (var i = 0; i < pts.length; i++) {
      for (var j = i + 1; j < pts.length; j++) {
        final d = (pts[i] - pts[j]).distance;
        if (d < threshold) {
          final a = (1 - d / threshold) * maxLineOpacity * intro;
          linePaint.color = color.withAlpha((a * 255).round());
          canvas.drawLine(pts[i], pts[j], linePaint);
        }
      }
    }

    final halo = Paint()..color = color.withAlpha((0.12 * intro * 255).round());
    final dot = Paint()
      ..color = color.withAlpha((dotOpacity * intro * 255).round());
    for (final p in pts) {
      canvas.drawCircle(p, 8, halo);
      canvas.drawCircle(p, 2.8, dot);
    }
  }

  @override
  bool shouldRepaint(covariant _NetworkPainter old) =>
      old.phase != phase || old.intro != intro || old.color != color;
}
