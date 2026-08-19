import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

import '../../core/network/external_link.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';

enum _Kind { para, h1, h2, h3, bullet, ordered, quote }

class _Block {
  const _Block(this.kind, this.text, {this.marker});
  final _Kind kind;
  final String text;

  /// The author's own numbering for an ordered item — a list that starts at 3
  /// stays starting at 3.
  final String? marker;
}

/// A small Markdown renderer for job and article bodies.
///
/// Blocks: `#`/`##`/`###` headings, `-`/`*` bullets, `1.` ordered items,
/// `>` quotes, and paragraphs split on blank lines. Inline: `**bold**`,
/// `*italic*`, inline code, and `[text](url)` links.
///
/// Scope is deliberate rather than lazy. The website renders these bodies with
/// the full remark/rehype pipeline, so a CMS author can write anything; what the
/// shipped corpus actually contains is headings, bullets and quotes — and quotes
/// were rendering as a literal "> " before this. Links and ordered lists follow
/// because they are the next thing an author reaches for. Tables, images and
/// fenced code are NOT handled: they carry real layout and network cost and
/// nothing in the corpus uses them. Unsupported syntax degrades to its plain
/// text rather than disappearing.
class SimpleMarkdown extends StatefulWidget {
  const SimpleMarkdown(this.source, {super.key});

  final String source;

  @override
  State<SimpleMarkdown> createState() => _SimpleMarkdownState();
}

class _SimpleMarkdownState extends State<SimpleMarkdown> {
  late List<_Block> _blocks;

  /// One recognizer per distinct destination, rebuilt only when the source
  /// changes. A recognizer created inside build() is never disposed, and this
  /// widget rebuilds on every theme change and relayout. Keyed by URL so
  /// repeated links share one, and so a URL that fails the safety check is
  /// simply absent and renders as plain text.
  final _links = <String, TapGestureRecognizer>{};

  @override
  void initState() {
    super.initState();
    _parse();
  }

  @override
  void didUpdateWidget(SimpleMarkdown old) {
    super.didUpdateWidget(old);
    if (old.source != widget.source) _parse();
  }

  @override
  void dispose() {
    _disposeLinks();
    super.dispose();
  }

  void _disposeLinks() {
    for (final r in _links.values) {
      r.dispose();
    }
    _links.clear();
  }

  void _parse() {
    _disposeLinks();
    final blocks = <_Block>[];
    final lines = widget.source.replaceAll('\r\n', '\n').split('\n');
    final para = <String>[];
    final quote = <String>[];

    void flushPara() {
      if (para.isEmpty) return;
      blocks.add(_Block(_Kind.para, para.join(' ')));
      para.clear();
    }

    void flushQuote() {
      if (quote.isEmpty) return;
      blocks.add(_Block(_Kind.quote, quote.join(' ')));
      quote.clear();
    }

    void flush() {
      flushPara();
      flushQuote();
    }

    for (final raw in lines) {
      final line = raw.trim();
      final ordered = _orderedItem.firstMatch(line);
      if (line.isEmpty) {
        flush();
      } else if (line.startsWith('> ') || line == '>') {
        // Consecutive quote lines form one block, so a wrapped pull-quote gets
        // a single bar down its side instead of one bar per line.
        flushPara();
        quote.add(line == '>' ? '' : line.substring(2));
      } else if (line.startsWith('### ')) {
        flush();
        blocks.add(_Block(_Kind.h3, line.substring(4)));
      } else if (line.startsWith('## ')) {
        flush();
        blocks.add(_Block(_Kind.h2, line.substring(3)));
      } else if (line.startsWith('# ')) {
        flush();
        blocks.add(_Block(_Kind.h1, line.substring(2)));
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        flush();
        blocks.add(_Block(_Kind.bullet, line.substring(2)));
      } else if (ordered != null) {
        flush();
        blocks.add(_Block(
          _Kind.ordered,
          line.substring(ordered.end),
          marker: ordered.group(1),
        ));
      } else {
        flushQuote();
        para.add(line);
      }
    }
    flush();
    _blocks = blocks;

    // Pre-build the tap target for every distinct link the source contains.
    for (final m in _inline.allMatches(widget.source)) {
      final url = m.group(2);
      if (url == null || _links.containsKey(url)) continue;
      // safeWebUri accepts only http(s), so a body carrying `javascript:` or a
      // custom app scheme can never become a tappable span.
      if (safeWebUri(url) == null) continue;
      _links[url] = TapGestureRecognizer()..onTap = () => _open(url);
    }
  }

  Future<void> _open(String url) async {
    if (await openExternalLink(url)) return;
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(content: Text('Could not open that link.')));
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final cq = context.cq;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [for (final b in _blocks) _block(b, text, cq)],
    );
  }

  Widget _block(_Block b, TextTheme text, CqColors cq) {
    switch (b.kind) {
      case _Kind.para:
        return Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.md),
          child: _rich(b.text, text.bodyMedium!, cq),
        );
      case _Kind.h1:
        return Padding(
          padding: const EdgeInsets.only(top: AppSpacing.md, bottom: AppSpacing.xs),
          child: _rich(b.text, text.titleLarge!, cq),
        );
      case _Kind.h2:
        return Padding(
          padding: const EdgeInsets.only(top: AppSpacing.md, bottom: AppSpacing.xs),
          child: _rich(b.text, text.titleMedium!, cq),
        );
      case _Kind.h3:
        return Padding(
          padding: const EdgeInsets.only(top: AppSpacing.sm, bottom: AppSpacing.xs),
          child: _rich(b.text, text.titleSmall!, cq),
        );
      case _Kind.bullet:
        return Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.xs),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 7, right: AppSpacing.sm),
                child: Container(
                  width: 5,
                  height: 5,
                  decoration: BoxDecoration(color: cq.fgMuted, shape: BoxShape.circle),
                ),
              ),
              Expanded(child: _rich(b.text, text.bodyMedium!, cq)),
            ],
          ),
        );
      case _Kind.ordered:
        return Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.xs),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(right: AppSpacing.sm),
                child: Text(
                  '${b.marker}.',
                  style: text.bodyMedium?.copyWith(
                    color: cq.fgMuted,
                    height: 1.5,
                    // Keeps 9. and 10. left-aligned with each other.
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ),
              Expanded(child: _rich(b.text, text.bodyMedium!, cq)),
            ],
          ),
        );
      case _Kind.quote:
        return Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.md),
          child: Container(
            padding: const EdgeInsets.only(left: AppSpacing.md),
            decoration: BoxDecoration(
              border: Border(left: BorderSide(color: cq.border, width: 3)),
            ),
            child: _rich(
              b.text,
              text.bodyMedium!.copyWith(
                color: cq.fgMuted,
                fontStyle: FontStyle.italic,
              ),
              cq,
            ),
          ),
        );
    }
  }

  /// Renders the inline spans of one line.
  Widget _rich(String src, TextStyle base, CqColors cq) {
    final spans = <InlineSpan>[];
    var i = 0;
    for (final m in _inline.allMatches(src)) {
      if (m.start > i) spans.add(TextSpan(text: src.substring(i, m.start)));
      final link = m.group(1);
      final bold = m.group(3);
      final italic = m.group(4) ?? m.group(5);
      final code = m.group(6);

      if (link != null) {
        final tap = _links[m.group(2)];
        spans.add(TextSpan(
          text: link,
          style: tap == null
              // Not a safe http(s) destination: keep the words, drop the
              // affordance, so nothing silently vanishes from the body.
              ? null
              : TextStyle(
                  color: cq.accent,
                  decoration: TextDecoration.underline,
                  decorationColor: cq.accent,
                ),
          recognizer: tap,
        ));
      } else if (bold != null) {
        spans.add(TextSpan(
          text: bold,
          style: const TextStyle(fontWeight: FontWeight.w700),
        ));
      } else if (italic != null) {
        spans.add(TextSpan(
          text: italic,
          style: const TextStyle(fontStyle: FontStyle.italic),
        ));
      } else if (code != null) {
        spans.add(TextSpan(
          text: code,
          style: TextStyle(
            fontFamily: 'monospace',
            fontSize: (base.fontSize ?? 14) * 0.92,
            color: cq.fg,
            backgroundColor: cq.surfaceMuted,
          ),
        ));
      }
      i = m.end;
    }
    if (i < src.length) spans.add(TextSpan(text: src.substring(i)));
    return Text.rich(
      TextSpan(
        style: base.copyWith(color: base.color ?? cq.fg, height: 1.5),
        children: spans,
      ),
    );
  }
}

final _orderedItem = RegExp(r'^(\d{1,3})[.)]\s+');

/// One pass over the line, so the constructs cannot fight over the same
/// characters. Groups: 1 link text, 2 link URL, 3 bold, 4/5 italic, 6 code.
///
/// The italic alternatives refuse to fire mid-word — `snake_case_names` and
/// `2 * 3 * 4` are far more common in a job description than emphasis is — and
/// bold is matched first so `**x**` is never read as two italics.
final _inline = RegExp(
  r'\[([^\]\n]+)\]\(([^)\s]+)\)'
  r'|\*\*(.+?)\*\*'
  r'|(?<![\w*])\*([^*\n]+)\*(?![\w*])'
  r'|(?<![\w_])_([^_\n]+)_(?![\w_])'
  r'|`([^`\n]+)`',
);
