import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/format/patch_body.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cq_buttons.dart';
import '../data/education_models.dart';
import '../data/education_repository.dart';

/// Add or edit one education entry. Returns true if it was saved.
Future<bool?> showEducationEditor(BuildContext context, {EducationItem? existing}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Theme.of(context).scaffoldBackgroundColor,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.lg)),
    ),
    builder: (_) => _EducationEditor(existing: existing),
  );
}

class _EducationEditor extends ConsumerStatefulWidget {
  const _EducationEditor({this.existing});
  final EducationItem? existing;

  @override
  ConsumerState<_EducationEditor> createState() => _EducationEditorState();
}

class _EducationEditorState extends ConsumerState<_EducationEditor> {
  late final TextEditingController _institute;
  late final TextEditingController _degree;
  late final TextEditingController _field;
  late final TextEditingController _grade;
  late int _startYear;
  late int _endYear;
  late bool _pursuing;

  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    final now = DateTime.now().year;
    _institute = TextEditingController(text: e?.institute ?? '');
    _degree = TextEditingController(text: e?.degree ?? '');
    _field = TextEditingController(text: e?.fieldOfStudy ?? '');
    _grade = TextEditingController(text: e?.grade ?? '');
    _startYear = e?.startYear ?? now - 4;
    _endYear = e?.endYear ?? now;
    _pursuing = e != null && e.endYear == null;
  }

  @override
  void dispose() {
    _institute.dispose();
    _degree.dispose();
    _field.dispose();
    _grade.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final institute = _institute.text.trim();
    final degree = _degree.text.trim();
    final field = _field.text.trim();
    final grade = _grade.text.trim();

    if (institute.isEmpty || degree.isEmpty) {
      setState(() => _error = 'Institute and degree are required.');
      return;
    }
    if (!_pursuing && _endYear < _startYear) {
      setState(() => _error = 'End year must be after the start year.');
      return;
    }

    final body = <String, dynamic>{
      'institute': institute,
      'degree': degree,
      'startYear': _startYear,
      'endYear': _pursuing ? null : _endYear,
    };
    // Editing is a PATCH, so these have to be sent even when emptied or they
    // cannot be cleared — see patch_body.dart.
    putClearable(body, 'fieldOfStudy', field);
    putClearable(body, 'grade', grade);

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final repo = await ref.read(educationRepositoryProvider.future);
      final existing = widget.existing;
      if (existing != null) {
        await repo.update(existing.id, body);
      } else {
        await repo.create(body);
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = e is EducationException ? e.message : 'Could not save. Please try again.';
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
      child: SingleChildScrollView(
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
            Text(editing ? 'Edit education' : 'Add education', style: text.titleLarge),
            const SizedBox(height: AppSpacing.lg),

            _label('Institute / University'),
            TextField(
              controller: _institute,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(hintText: 'e.g. Delhi University'),
            ),
            const SizedBox(height: AppSpacing.md),

            _label('Degree'),
            TextField(
              controller: _degree,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(hintText: 'e.g. B.Tech, B.Com, Class 12'),
            ),
            const SizedBox(height: AppSpacing.md),

            _label('Field of study (optional)'),
            TextField(
              controller: _field,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(hintText: 'e.g. Computer Science'),
            ),
            const SizedBox(height: AppSpacing.lg),

            Row(
              children: [
                Expanded(
                  child: _YearDropdown(
                    label: 'Start year',
                    value: _startYear,
                    onChanged: (y) => setState(() => _startYear = y),
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: _pursuing
                      ? const _DisabledYear(label: 'End year')
                      : _YearDropdown(
                          label: 'End year',
                          value: _endYear,
                          onChanged: (y) => setState(() => _endYear = y),
                        ),
                ),
              ],
            ),
            CheckboxListTile(
              value: _pursuing,
              onChanged: (v) => setState(() => _pursuing = v ?? false),
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              dense: true,
              title: Text('I am currently pursuing this', style: text.bodyMedium),
            ),
            const SizedBox(height: AppSpacing.sm),

            _label('Grade / CGPA (optional)'),
            TextField(
              controller: _grade,
              decoration: const InputDecoration(hintText: 'e.g. 8.6 CGPA / 85%'),
            ),

            if (_error != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(_error!, style: text.bodySmall?.copyWith(color: cq.danger)),
            ],
            const SizedBox(height: AppSpacing.lg),

            CqPrimaryButton(
              label: editing ? 'Save changes' : 'Add education',
              icon: Icons.check_rounded,
              loading: _saving,
              onPressed: _save,
            ),
          ],
        ),
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

class _YearDropdown extends StatelessWidget {
  const _YearDropdown({required this.label, required this.value, required this.onChanged});
  final String label;
  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now().year;
    final years = [for (var y = now + 6; y >= 1950; y--) y];
    return DropdownButtonFormField<int>(
      initialValue: value,
      isExpanded: true,
      decoration: InputDecoration(labelText: label),
      items: [
        for (final y in years) DropdownMenuItem(value: y, child: Text('$y')),
      ],
      onChanged: (v) => v == null ? null : onChanged(v),
    );
  }
}

class _DisabledYear extends StatelessWidget {
  const _DisabledYear({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return InputDecorator(
      decoration: InputDecoration(labelText: label),
      child: Text('Present', style: TextStyle(color: context.cq.fgMuted)),
    );
  }
}
