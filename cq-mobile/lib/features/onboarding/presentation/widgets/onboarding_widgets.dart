import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';

/// A small bold label above a field or a group of choices.
class OnboardingLabel extends StatelessWidget {
  const OnboardingLabel(this.text, {super.key, this.optional = false});

  final String text;
  final bool optional;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Row(
        children: [
          Text(text, style: Theme.of(context).textTheme.titleSmall),
          if (optional) ...[
            const SizedBox(width: AppSpacing.sm),
            Text(
              'Optional',
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: context.cq.fgSubtle),
            ),
          ],
        ],
      ),
    );
  }
}

/// One choice in a [CqSegmented].
class CqOption<T> {
  const CqOption(this.value, this.label);
  final T value;
  final String label;
}

/// A single-select group of pill choices (Fresher/Experienced, gender, …).
/// Wraps to the next line on narrow screens.
class CqSegmented<T> extends StatelessWidget {
  const CqSegmented({
    super.key,
    required this.options,
    required this.value,
    required this.onChanged,
  });

  final List<CqOption<T>> options;
  final T? value;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      children: [
        for (final o in options)
          _Segment(
            label: o.label,
            selected: o.value == value,
            onTap: () => onChanged(o.value),
            accent: cq.accent,
            onAccent: cq.onAccent,
            fg: cq.fg,
            surface: cq.surfaceMuted,
            border: cq.border,
          ),
      ],
    );
  }
}

class _Segment extends StatelessWidget {
  const _Segment({
    required this.label,
    required this.selected,
    required this.onTap,
    required this.accent,
    required this.onAccent,
    required this.fg,
    required this.surface,
    required this.border,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final Color accent, onAccent, fg, surface, border;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? accent : surface,
      borderRadius: BorderRadius.circular(AppRadius.md),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.md,
          ),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: selected ? accent : border),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? onAccent : fg,
              fontWeight: FontWeight.w600,
              fontSize: 14,
            ),
          ),
        ),
      ),
    );
  }
}

/// Free-text skill entry: type a skill, press enter (or +) to add it as a chip.
/// No catalogue needed — the API find-or-creates each name server-side.
class SkillTagsInput extends StatefulWidget {
  const SkillTagsInput({
    super.key,
    required this.skills,
    required this.onChanged,
    this.max = 50,
  });

  final List<String> skills;
  final ValueChanged<List<String>> onChanged;
  final int max;

  @override
  State<SkillTagsInput> createState() => _SkillTagsInputState();
}

class _SkillTagsInputState extends State<SkillTagsInput> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _add() {
    final raw = _controller.text.trim();
    if (raw.isEmpty) return;
    final value = raw.length > 60 ? raw.substring(0, 60) : raw;
    final exists = widget.skills.any((s) => s.toLowerCase() == value.toLowerCase());
    if (!exists && widget.skills.length < widget.max) {
      widget.onChanged([...widget.skills, value]);
    }
    _controller.clear();
  }

  void _remove(String skill) =>
      widget.onChanged(widget.skills.where((s) => s != skill).toList());

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          controller: _controller,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _add(),
          decoration: InputDecoration(
            hintText: 'e.g. Flutter, Python, Excel',
            suffixIcon: IconButton(
              tooltip: 'Add skill',
              icon: const Icon(Icons.add_rounded),
              onPressed: _add,
            ),
          ),
        ),
        if (widget.skills.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              for (final s in widget.skills)
                Chip(
                  label: Text(s),
                  onDeleted: () => _remove(s),
                  deleteIcon: const Icon(Icons.close_rounded, size: 16),
                  backgroundColor: cq.surfaceMuted,
                  side: BorderSide(color: cq.border),
                ),
            ],
          ),
        ],
      ],
    );
  }
}
