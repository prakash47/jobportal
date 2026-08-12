import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';

/// A company logo, or a deterministic **initials tile** when there's no logo.
///
/// The backend confirmed every company currently has no logo (and logo URLs
/// still point at a dev machine), so the initials fallback is the *normal*
/// view, not an edge case. The tile colour is derived from the name, so a given
/// company always looks the same.
class CompanyAvatar extends StatelessWidget {
  const CompanyAvatar({
    super.key,
    required this.name,
    this.logoUrl,
    this.size = 46,
  });

  final String name;
  final String? logoUrl;
  final double size;

  @override
  Widget build(BuildContext context) {
    final url = logoUrl;
    // Skip logos that point at localhost — those never resolve from a phone.
    final usable = url != null && url.isNotEmpty && !url.contains('localhost');
    if (usable) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(AppRadius.sm),
        child: CachedNetworkImage(
          imageUrl: url,
          width: size,
          height: size,
          fit: BoxFit.cover,
          placeholder: (_, _) => _initials(context),
          errorWidget: (_, _, _) => _initials(context),
        ),
      );
    }
    return _initials(context);
  }

  Widget _initials(BuildContext context) {
    final palette = _palette(context.cq);
    final color = palette[_hash(name) % palette.length];
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(AppRadius.sm),
        border: Border.all(color: color.withValues(alpha: 0.30)),
      ),
      alignment: Alignment.center,
      child: Text(
        _letters(name),
        style: TextStyle(
          color: color,
          fontWeight: FontWeight.w700,
          fontSize: size * 0.36,
        ),
      ),
    );
  }

  static String _letters(String name) {
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty)
        .toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) {
      final p = parts.first;
      return (p.length >= 2 ? p.substring(0, 2) : p).toUpperCase();
    }
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  static int _hash(String s) {
    var h = 0;
    for (final c in s.codeUnits) {
      h = (h * 31 + c) & 0x7fffffff;
    }
    return h;
  }

  static List<Color> _palette(CqColors cq) => [
    cq.accent,
    const Color(0xFF6366F1), // indigo
    const Color(0xFF10B981), // emerald
    const Color(0xFFF59E0B), // amber
    const Color(0xFFEF4444), // red
    const Color(0xFF8B5CF6), // violet
    const Color(0xFF0EA5E9), // sky
  ];
}
