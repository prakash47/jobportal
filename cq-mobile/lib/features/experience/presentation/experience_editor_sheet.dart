import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cq_buttons.dart';
import '../data/experience_models.dart';
import '../data/experience_repository.dart';

const List<String> _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/// Add or edit one work-experience entry. Returns true if it was saved.
Future<bool?> showExperienceEditor(
  BuildContext context, {
  WorkExperienceItem? existing,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Theme.of(context).scaffoldBackgroundColor,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.lg)),
    ),
    builder: (_) => _ExperienceEditor(existing: existing),
  );
}

class _ExperienceEditor extends ConsumerStatefulWidget {
  const _ExperienceEditor({this.existing});
  final WorkExperienceItem? existing;

  @override
  ConsumerState<_ExperienceEditor> createState() => _ExperienceEditorState();
}

class _ExperienceEditorState extends ConsumerState<_ExperienceEditor> {
  late final TextEditingController _company;
  late final TextEditingController _title;
  late final TextEditingController _desc;

  late int _startMonth;
  late int _startYear;
  late int _endMonth;
  late int _endYear;
  late bool _isCurrent;

  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    final now = DateTime.now();
    _company = TextEditingController(text: e?.companyName ?? '');
    _title = TextEditingController(text: e?.title ?? '');
    _desc = TextEditingController(text: e?.description ?? '');
    _startMonth = e?.startDate.month ?? now.month;
    _startYear = e?.startDate.year ?? now.year;
    _endMonth = e?.endDate?.month ?? now.month;
    _endYear = e?.endDate?.year ?? now.year;
    _isCurrent = e?.isCurrent ?? false;
  }

  @override
  void dispose() {
    _company.dispose();
    _title.dispose();
    _desc.dispose();
    super.dispose();
  }

  String _isoUtcMonth(int year, int month) =>
      DateTime.utc(year, month, 1).toIso8601String();

  Future<void> _save() async {
    final company = _company.text.trim();
    final title = _title.text.trim();
    final desc = _desc.text.trim();

    if (company.isEmpty || title.isEmpty) {
      setState(() => _error = 'Company and title are required.');
      return;
    }
    if (!_isCurrent) {
      final start = DateTime(_startYear, _startMonth);
      final end = DateTime(_endYear, _endMonth);
      if (end.isBefore(start)) {
        setState(() => _error = 'End date must be after the start date.');
        return;
      }
    }

    final body = <String, dynamic>{
      'companyName': company,
      'title': title,
      'startDate': _isoUtcMonth(_startYear, _startMonth),
      'isCurrent': _isCurrent,
      if (!_isCurrent) 'endDate': _isoUtcMonth(_endYear, _endMonth),
      'description': desc,
    };

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final repo = await ref.read(experienceRepositoryProvider.future);
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
        _error = e is ExperienceException ? e.message : 'Could not save. Please try again.';
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
            Text(editing ? 'Edit experience' : 'Add experience', style: text.titleLarge),
            const SizedBox(height: AppSpacing.lg),

            _label('Company'),
            TextField(
              controller: _company,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(hintText: 'e.g. Nimbus Technologies'),
            ),
            const SizedBox(height: AppSpacing.md),

            _label('Title'),
            TextField(
              controller: _title,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(hintText: 'e.g. Senior Flutter Developer'),
            ),
            const SizedBox(height: AppSpacing.lg),

            _label('Start date'),
            _monthYearRow(
              month: _startMonth,
              year: _startYear,
              onMonth: (m) => setState(() => _startMonth = m),
              onYear: (y) => setState(() => _startYear = y),
            ),
            const SizedBox(height: AppSpacing.sm),

            CheckboxListTile(
              value: _isCurrent,
              onChanged: (v) => setState(() => _isCurrent = v ?? false),
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              dense: true,
              title: Text('I currently work here', style: text.bodyMedium),
            ),

            if (!_isCurrent) ...[
              const SizedBox(height: AppSpacing.sm),
              _label('End date'),
              _monthYearRow(
                month: _endMonth,
                year: _endYear,
                onMonth: (m) => setState(() => _endMonth = m),
                onYear: (y) => setState(() => _endYear = y),
              ),
            ],
            const SizedBox(height: AppSpacing.lg),

            _label('Description (optional)'),
            TextField(
              controller: _desc,
              minLines: 3,
              maxLines: 6,
              maxLength: 2000,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                hintText: 'What did you work on? Key achievements, tech, impact…',
                alignLabelWithHint: true,
              ),
            ),

            if (_error != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(_error!, style: text.bodySmall?.copyWith(color: cq.danger)),
            ],
            const SizedBox(height: AppSpacing.lg),

            CqPrimaryButton(
              label: editing ? 'Save changes' : 'Add experience',
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

  Widget _monthYearRow({
    required int month,
    required int year,
    required ValueChanged<int> onMonth,
    required ValueChanged<int> onYear,
  }) {
    final now = DateTime.now();
    final years = [for (var y = now.year; y >= now.year - 50; y--) y];
    return Row(
      children: [
        Expanded(
          flex: 3,
          child: DropdownButtonFormField<int>(
            initialValue: month,
            isExpanded: true,
            items: [
              for (var m = 1; m <= 12; m++)
                DropdownMenuItem(value: m, child: Text(_months[m - 1])),
            ],
            onChanged: (v) => v == null ? null : onMonth(v),
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          flex: 2,
          child: DropdownButtonFormField<int>(
            initialValue: year,
            isExpanded: true,
            items: [
              for (final y in years) DropdownMenuItem(value: y, child: Text('$y')),
            ],
            onChanged: (v) => v == null ? null : onYear(v),
          ),
        ),
      ],
    );
  }
}
