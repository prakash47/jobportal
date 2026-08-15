import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../data/project_models.dart';
import '../data/projects_repository.dart';
import 'project_editor_sheet.dart';

/// Profile card: portfolio projects with add / edit / delete. Backed by
/// `/me/projects`; self-contained, same shape as the experience card.
class ProjectsSection extends ConsumerStatefulWidget {
  const ProjectsSection({super.key});

  @override
  ConsumerState<ProjectsSection> createState() => _ProjectsSectionState();
}

class _ProjectsSectionState extends ConsumerState<ProjectsSection> {
  List<ProjectItem>? _items;
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
      final repo = await ref.read(projectsRepositoryProvider.future);
      final items = await repo.list();
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e is ProjectsException ? e.message : 'Could not load your projects.';
        _loading = false;
      });
    }
  }

  Future<void> _add() async {
    if (await showProjectEditor(context) == true) _load();
  }

  Future<void> _edit(ProjectItem item) async {
    if (await showProjectEditor(context, existing: item) == true) _load();
  }

  Future<void> _delete(ProjectItem item) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove this project?'),
        content: Text('"${item.title}" will be removed from your profile.'),
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
      final repo = await ref.read(projectsRepositoryProvider.future);
      await repo.remove(item.id);
      if (!mounted) return;
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e is ProjectsException ? e.message : 'Could not remove.')),
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
              Icon(Icons.folder_outlined, size: 18, color: cq.fgMuted),
              const SizedBox(width: AppSpacing.sm),
              Text('Projects', style: text.titleSmall),
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

  Widget _entryTile(ProjectItem item) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return InkWell(
      onTap: () => _edit(item),
      borderRadius: BorderRadius.circular(AppRadius.sm),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
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
                      if ((item.url ?? '').isNotEmpty)
                        Icon(Icons.link_rounded, size: 16, color: cq.accent),
                    ],
                  ),
                  if ((item.description ?? '').isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      item.description!,
                      style: text.bodySmall?.copyWith(color: cq.fgMuted),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                  if (item.techStack.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.sm),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [for (final t in item.techStack) _techChip(t)],
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

  Widget _techChip(String label) {
    final cq = context.cq;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: cq.accent.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(AppRadius.sm),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(color: cq.accent),
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
          'Show off what you have built.',
          style: text.bodyMedium?.copyWith(color: cq.fgMuted),
        ),
        const SizedBox(height: AppSpacing.md),
        OutlinedButton.icon(
          onPressed: _add,
          icon: const Icon(Icons.add_rounded, size: 18),
          label: const Text('Add project'),
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
