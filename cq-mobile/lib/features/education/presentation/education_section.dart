import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../data/education_models.dart';
import '../data/education_repository.dart';
import 'education_editor_sheet.dart';

/// Profile card: the candidate's education with add / edit / delete. Backed by
/// `/me/education`; existing entries are loaded and editable in place.
class EducationSection extends ConsumerStatefulWidget {
  const EducationSection({super.key});

  @override
  ConsumerState<EducationSection> createState() => _EducationSectionState();
}

class _EducationSectionState extends ConsumerState<EducationSection> {
  List<EducationItem>? _items;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final repo = await ref.read(educationRepositoryProvider.future);
      final items = await repo.list();
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e is EducationException ? e.message : 'Could not load your education.';
        _loading = false;
      });
    }
  }

  Future<void> _add() async {
    if (await showEducationEditor(context) == true) _load();
  }

  Future<void> _edit(EducationItem item) async {
    if (await showEducationEditor(context, existing: item) == true) _load();
  }

  Future<void> _delete(EducationItem item) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove this education?'),
        content: Text('${item.degree} at ${item.institute} will be removed.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: ctx.cq.danger),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      final repo = await ref.read(educationRepositoryProvider.future);
      await repo.remove(item.id);
      if (!mounted) return;
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e is EducationException ? e.message : 'Could not remove.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    final items = _items;

    return Container(
      decoration: BoxDecoration(
        color: cq.surfaceMuted,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: cq.border),
      ),
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.school_outlined, size: 18, color: cq.fgMuted),
              const SizedBox(width: AppSpacing.sm),
              Text('Education', style: text.titleSmall),
              const Spacer(),
              if (!_loading)
                TextButton.icon(
                  onPressed: _add,
                  icon: const Icon(Icons.add_rounded, size: 18),
                  label: const Text('Add'),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: AppSpacing.md),
              child: Center(
                child: SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            )
          else if (_error != null)
            _inlineError(_error!)
          else if (items == null || items.isEmpty)
            _emptyPrompt()
          else
            for (var i = 0; i < items.length; i++) ...[
              _entryTile(items[i]),
              if (i < items.length - 1) Divider(height: 1, color: cq.border),
            ],
        ],
      ),
    );
  }

  Widget _entryTile(EducationItem item) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    final subtitle = [
      item.institute,
      if ((item.fieldOfStudy ?? '').isNotEmpty) item.fieldOfStudy!,
    ].join(' · ');
    return InkWell(
      onTap: () => _edit(item),
      borderRadius: BorderRadius.circular(AppRadius.sm),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: cq.accent.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(AppRadius.sm),
              ),
              child: Icon(Icons.school_rounded, color: cq.accent, size: 20),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.degree,
                    style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 1),
                  Text(
                    subtitle,
                    style: text.bodySmall,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    item.grade == null || item.grade!.isEmpty
                        ? item.yearRange
                        : '${item.yearRange} · ${item.grade}',
                    style: text.labelSmall?.copyWith(color: cq.fgMuted),
                  ),
                ],
              ),
            ),
            IconButton(
              tooltip: 'Remove',
              visualDensity: VisualDensity.compact,
              icon: Icon(Icons.delete_outline_rounded, size: 20, color: cq.fgMuted),
              onPressed: () => _delete(item),
            ),
          ],
        ),
      ),
    );
  }

  Widget _emptyPrompt() {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Add your degrees and schooling.',
          style: text.bodyMedium?.copyWith(color: cq.fgMuted),
        ),
        const SizedBox(height: AppSpacing.md),
        OutlinedButton.icon(
          onPressed: _add,
          icon: const Icon(Icons.add_rounded, size: 18),
          label: const Text('Add education'),
        ),
      ],
    );
  }

  Widget _inlineError(String message) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Row(
      children: [
        Expanded(child: Text(message, style: text.bodySmall?.copyWith(color: cq.fgMuted))),
        TextButton(onPressed: _load, child: const Text('Retry')),
      ],
    );
  }
}
