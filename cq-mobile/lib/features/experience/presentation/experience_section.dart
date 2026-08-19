import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../data/experience_models.dart';
import '../data/experience_repository.dart';
import 'experience_editor_sheet.dart';

/// Profile card: the candidate's work history with add / edit / delete. Backed
/// by `/me/experience`; self-contained (loads its own state), same shape as the
/// resume card.
class WorkExperienceSection extends ConsumerStatefulWidget {
  const WorkExperienceSection({super.key});

  @override
  ConsumerState<WorkExperienceSection> createState() => _WorkExperienceSectionState();
}

class _WorkExperienceSectionState extends ConsumerState<WorkExperienceSection> {
  List<WorkExperienceItem>? _items;
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
      final repo = await ref.read(experienceRepositoryProvider.future);
      final items = await repo.list();
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e is ExperienceException ? e.message : 'Could not load your experience.';
        _loading = false;
      });
    }
  }

  Future<void> _add() async {
    final saved = await showExperienceEditor(context);
    if (saved == true) _load();
  }

  Future<void> _edit(WorkExperienceItem item) async {
    final saved = await showExperienceEditor(context, existing: item);
    if (saved == true) _load();
  }

  Future<void> _delete(WorkExperienceItem item) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove this experience?'),
        content: Text('${item.title} at ${item.companyName} will be removed.'),
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
      final repo = await ref.read(experienceRepositoryProvider.future);
      await repo.remove(item.id);
      if (!mounted) return;
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e is ExperienceException ? e.message : 'Could not remove.')),
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
              Icon(Icons.business_center_outlined, size: 18, color: cq.fgMuted),
              const SizedBox(width: AppSpacing.sm),
              Text('Work experience', style: text.titleSmall),
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

  Widget _entryTile(WorkExperienceItem item) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    final duration = item.durationLabel;
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
              child: Icon(Icons.work_outline_rounded, color: cq.accent, size: 20),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          item.title,
                          style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (item.isCurrent) _currentBadge(),
                    ],
                  ),
                  const SizedBox(height: 1),
                  Text(
                    item.companyName,
                    style: text.bodySmall,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    duration.isEmpty
                        ? item.dateRangeLabel
                        : '${item.dateRangeLabel} · $duration',
                    style: text.labelSmall?.copyWith(color: cq.fgMuted),
                  ),
                  if ((item.description ?? '').isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      item.description!,
                      style: text.bodySmall?.copyWith(color: cq.fgMuted),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
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

  Widget _currentBadge() {
    final cq = context.cq;
    return Container(
      margin: const EdgeInsets.only(left: AppSpacing.sm),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: cq.success.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Text(
        'Current',
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: cq.success,
          fontWeight: FontWeight.w600,
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
          'Add your work history so recruiters see your journey.',
          style: text.bodyMedium?.copyWith(color: cq.fgMuted),
        ),
        const SizedBox(height: AppSpacing.md),
        OutlinedButton.icon(
          onPressed: _add,
          icon: const Icon(Icons.add_rounded, size: 18),
          label: const Text('Add experience'),
        ),
      ],
    );
  }

  Widget _inlineError(String message) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Row(
      children: [
        Expanded(
          child: Text(message, style: text.bodySmall?.copyWith(color: cq.fgMuted)),
        ),
        TextButton(onPressed: _load, child: const Text('Try again')),
      ],
    );
  }
}
