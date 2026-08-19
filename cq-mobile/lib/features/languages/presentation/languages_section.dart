import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../data/language_models.dart';
import '../data/languages_repository.dart';
import 'language_editor_sheet.dart';

/// Profile card: languages with add / edit / delete. Backed by `/me/languages`.
class LanguagesSection extends ConsumerStatefulWidget {
  const LanguagesSection({super.key});

  @override
  ConsumerState<LanguagesSection> createState() => _LanguagesSectionState();
}

class _LanguagesSectionState extends ConsumerState<LanguagesSection> {
  List<LanguageItem>? _items;
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
      final repo = await ref.read(languagesRepositoryProvider.future);
      final items = await repo.list();
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e is LanguagesException ? e.message : 'Could not load your languages.';
        _loading = false;
      });
    }
  }

  Future<void> _add() async {
    if (await showLanguageEditor(context) == true) _load();
  }

  Future<void> _edit(LanguageItem item) async {
    if (await showLanguageEditor(context, existing: item) == true) _load();
  }

  Future<void> _delete(LanguageItem item) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove this language?'),
        content: Text('${item.name} will be removed from your profile.'),
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
      final repo = await ref.read(languagesRepositoryProvider.future);
      await repo.remove(item.id);
      if (!mounted) return;
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e is LanguagesException ? e.message : 'Could not remove.')),
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
              Icon(Icons.translate_rounded, size: 18, color: cq.fgMuted),
              const SizedBox(width: AppSpacing.sm),
              Text('Languages', style: text.titleSmall),
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

  Widget _entryTile(LanguageItem item) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Row(
        children: [
          Expanded(
            child: Text(
              item.name,
              style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          Text(item.proficiencyLabel, style: text.bodySmall?.copyWith(color: cq.fgMuted)),
          IconButton(
            tooltip: 'Edit',
            visualDensity: VisualDensity.compact,
            icon: Icon(Icons.edit_outlined, size: 18, color: cq.fgMuted),
            onPressed: () => _edit(item),
          ),
          IconButton(
            tooltip: 'Remove',
            visualDensity: VisualDensity.compact,
            icon: Icon(Icons.delete_outline_rounded, size: 18, color: cq.fgMuted),
            onPressed: () => _delete(item),
          ),
        ],
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
          'Which languages do you speak?',
          style: text.bodyMedium?.copyWith(color: cq.fgMuted),
        ),
        const SizedBox(height: AppSpacing.md),
        OutlinedButton.icon(
          onPressed: _add,
          icon: const Icon(Icons.add_rounded, size: 18),
          label: const Text('Add language'),
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
        TextButton(onPressed: _load, child: const Text('Try again')),
      ],
    );
  }
}
