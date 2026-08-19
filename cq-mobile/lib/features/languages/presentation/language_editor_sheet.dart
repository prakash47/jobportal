import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cq_buttons.dart';
import '../data/language_models.dart';
import '../data/languages_repository.dart';

/// Add or edit one language. Returns true if it was saved.
Future<bool?> showLanguageEditor(BuildContext context, {LanguageItem? existing}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Theme.of(context).scaffoldBackgroundColor,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.lg)),
    ),
    builder: (_) => _LanguageEditor(existing: existing),
  );
}

class _LanguageEditor extends ConsumerStatefulWidget {
  const _LanguageEditor({this.existing});
  final LanguageItem? existing;

  @override
  ConsumerState<_LanguageEditor> createState() => _LanguageEditorState();
}

class _LanguageEditorState extends ConsumerState<_LanguageEditor> {
  late final TextEditingController _name;
  late String _proficiency;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.existing?.name ?? '');
    _proficiency = widget.existing?.proficiency ?? 'INTERMEDIATE';
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'A language name is required.');
      return;
    }

    final body = <String, dynamic>{'name': name, 'proficiency': _proficiency};

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final repo = await ref.read(languagesRepositoryProvider.future);
      final existing = widget.existing;
      if (existing != null) {
        await repo.replace(existing, body);
      } else {
        await repo.create(body);
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = e is LanguagesException ? e.message : 'Could not save. Please try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    final editing = widget.existing != null;

    return Padding(
      padding: EdgeInsets.only(
        left: AppSpacing.xl2,
        right: AppSpacing.xl2,
        top: AppSpacing.lg,
        bottom: MediaQuery.of(context).viewInsets.bottom + AppSpacing.xl2,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: AppSpacing.lg),
              decoration: BoxDecoration(
                color: cq.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Text(editing ? 'Edit language' : 'Add language', style: text.titleLarge),
          const SizedBox(height: AppSpacing.lg),

          _label('Language'),
          TextField(
            controller: _name,
            textCapitalization: TextCapitalization.words,
            maxLength: 60,
            decoration: const InputDecoration(
              hintText: 'e.g. English',
              counterText: '',
            ),
          ),
          const SizedBox(height: AppSpacing.md),

          _label('Proficiency'),
          DropdownButtonFormField<String>(
            initialValue: _proficiency,
            isExpanded: true,
            items: [
              for (final p in languageProficiencies)
                DropdownMenuItem(value: p, child: Text(proficiencyLabelOf(p))),
            ],
            onChanged: (v) => setState(() => _proficiency = v ?? _proficiency),
          ),

          if (_error != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(_error!, style: text.bodySmall?.copyWith(color: cq.danger)),
          ],
          const SizedBox(height: AppSpacing.lg),

          CqPrimaryButton(
            label: editing ? 'Save changes' : 'Add language',
            icon: Icons.check_rounded,
            loading: _saving,
            onPressed: _save,
          ),
        ],
      ),
    );
  }

  Widget _label(String s) => Padding(
    padding: const EdgeInsets.only(bottom: AppSpacing.xs),
    child: Text(
      s,
      style: Theme.of(context).textTheme.labelMedium?.copyWith(color: context.cq.fgMuted),
    ),
  );
}
