import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';

/// A minimal Markdown renderer for job/article bodies: `##`/`###` headings,
/// `**bold**`, and `-`/`*` bullet lists, split into paragraphs on blank lines.
///
/// The backend serves raw markdown for JD/article bodies. This covers the shape
/// those bodies actually use; swap for a full Markdown package later if richer
/// formatting (links, tables, code) is needed.
class SimpleMarkdown extends StatelessWidget {
  const SimpleMarkdown(this.source, {super.key});

  final String source;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final cq = context.cq;
    final blocks = <Widget>[];
    final lines = source.replaceAll('\r\n', '\n').split('\n');
    final para = <String>[];

    void flushPara() {
      if (para.isEmpty) return;
      blocks.add(
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.md),
          child: _rich(para.join(' '), text.bodyMedium!, cq),
        ),
      );
      para.clear();
    }

    for (final raw in lines) {
      final trimmed = raw.trim();
      if (trimmed.isEmpty) {
        flushPara();
      } else if (trimmed.startsWith('### ')) {
        flushPara();
        blocks.add(
          Padding(
            padding: const EdgeInsets.only(
              top: AppSpacing.sm,
              bottom: AppSpacing.xs,
            ),
            child: _rich(trimmed.substring(4), text.titleSmall!, cq),
          ),
        );
      } else if (trimmed.startsWith('## ')) {
        flushPara();
        blocks.add(
          Padding(
            padding: const EdgeInsets.only(
              top: AppSpacing.md,
              bottom: AppSpacing.xs,
            ),
            child: _rich(trimmed.substring(3), text.titleMedium!, cq),
          ),
        );
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        flushPara();
        blocks.add(
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.xs),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.only(top: 7, right: AppSpacing.sm),
                  child: Container(
                    width: 5,
                    height: 5,
                    decoration: BoxDecoration(
                      color: cq.fgMuted,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
                Expanded(child: _rich(trimmed.substring(2), text.bodyMedium!, cq)),
              ],
            ),
          ),
        );
      } else {
        para.add(trimmed);
      }
    }
    flushPara();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: blocks,
    );
  }

  /// Renders `**bold**` inline spans within a line.
  Widget _rich(String src, TextStyle base, CqColors cq) {
    final spans = <TextSpan>[];
    final re = RegExp(r'\*\*(.+?)\*\*');
    var i = 0;
    for (final m in re.allMatches(src)) {
      if (m.start > i) spans.add(TextSpan(text: src.substring(i, m.start)));
      spans.add(
        TextSpan(
          text: m.group(1),
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
      );
      i = m.end;
    }
    if (i < src.length) spans.add(TextSpan(text: src.substring(i)));
    return Text.rich(
      TextSpan(style: base.copyWith(color: cq.fg, height: 1.5), children: spans),
    );
  }
}
