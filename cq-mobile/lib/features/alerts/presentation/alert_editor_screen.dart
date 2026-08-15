import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cq_buttons.dart';
import '../../catalogs/data/catalog_models.dart';
import '../../catalogs/presentation/catalog_picker.dart';
import '../data/alerts_repository.dart';
import '../data/job_alert.dart';

const _freqs = [
  ('instant', 'Instant'),
  ('daily', 'Daily'),
  ('weekly', 'Weekly'),
];

const _paisePerLpa = 10000000; // 1 LPA = 1,00,00,000 paise
const _salaryOptionsLpa = <int>[3, 5, 7, 10, 12, 15, 20, 25, 30, 40, 50];

CatalogItem _fromSlug(String slug) => CatalogItem(
  id: slug.hashCode & 0x7fffffff,
  slug: slug,
  name: slug
      .split('-')
      .map((w) => w.isEmpty ? w : w[0].toUpperCase() + w.substring(1))
      .join(' '),
);

/// Create or edit a job alert. Pass [existing] to edit. On success pops `true`.
class AlertEditorScreen extends ConsumerStatefulWidget {
  const AlertEditorScreen({super.key, this.existing});

  final JobAlert? existing;

  @override
  ConsumerState<AlertEditorScreen> createState() => _AlertEditorScreenState();
}

class _AlertEditorScreenState extends ConsumerState<AlertEditorScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _keywords = TextEditingController();
  String _frequency = 'daily';
  bool _active = true;
  bool _saving = false;
  String? _error;

  List<CatalogItem> _skills = [];
  List<CatalogItem> _cities = [];
  int? _expMinYears; // null = Any
  int? _expMaxYears;
  int? _salaryLpa;

  bool get _isEdit => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final a = widget.existing;
    if (a != null) {
      _name.text = a.name;
      _keywords.text = a.keywords;
      _frequency = a.frequency;
      _active = a.isActive;
      _skills = a.skillSlugs.map(_fromSlug).toList();
      _cities = a.citySlugs.map(_fromSlug).toList();
      final minM = a.minExperienceMonths;
      final maxM = a.maxExperienceMonths;
      if (minM != null) _expMinYears = (minM ~/ 12).clamp(0, 30);
      if (maxM != null) _expMaxYears = (maxM ~/ 12).clamp(0, 30);
      final paise = a.salaryMinPaise;
      if (paise != null) _salaryLpa = (paise / _paisePerLpa).round();
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _keywords.dispose();
    super.dispose();
  }

  Future<void> _pickSkills() async {
    final result = await showCatalogPicker(
      context: context,
      kind: CatalogKind.skills,
      title: 'Skills',
      multi: true,
      initial: _skills,
    );
    if (result != null) setState(() => _skills = result);
  }

  Future<void> _pickCities() async {
    final result = await showCatalogPicker(
      context: context,
      kind: CatalogKind.cities,
      title: 'Cities',
      multi: true,
      initial: _cities,
    );
    if (result != null) setState(() => _cities = result);
  }

  Future<void> _save() async {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;
    if (_expMinYears != null && _expMaxYears != null && _expMinYears! > _expMaxYears!) {
      setState(() => _error = 'Minimum experience can’t be more than the maximum.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final repo = await ref.read(alertsRepositoryProvider.future);
      // Merge over the existing query so anything we don't edit is preserved.
      final query = Map<String, dynamic>.from(widget.existing?.query ?? const {});

      void put(String key, Object? value) {
        if (value == null) {
          query.remove(key);
        } else {
          query[key] = value;
        }
      }

      final kw = _keywords.text.trim();
      put('q', kw.isEmpty ? null : kw);
      put('skillSlugs', _skills.isEmpty ? null : [for (final s in _skills) s.slug]);
      put('citySlugs', _cities.isEmpty ? null : [for (final c in _cities) c.slug]);
      put('minExperienceMonths', _expMinYears == null ? null : _expMinYears! * 12);
      put('maxExperienceMonths', _expMaxYears == null ? null : _expMaxYears! * 12);
      put('salaryMin', _salaryLpa == null ? null : _salaryLpa! * _paisePerLpa);

      if (_isEdit) {
        await repo.update(
          widget.existing!.id,
          name: _name.text.trim(),
          frequency: _frequency,
          query: query,
          isActive: _active,
        );
      } else {
        await repo.create(
          name: _name.text.trim(),
          frequency: _frequency,
          query: query,
          isActive: _active,
        );
      }
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e is AlertsException ? e.message : 'Could not save the alert.';
        _saving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(_isEdit ? 'Edit alert' : 'New alert')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.xl2),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_error != null) ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(AppSpacing.md),
                    decoration: BoxDecoration(
                      color: cq.danger.withValues(alpha: 0.08),
                      border: Border.all(color: cq.danger.withValues(alpha: 0.35)),
                      borderRadius: BorderRadius.circular(AppRadius.md),
                    ),
                    child: Text(_error!, style: text.bodyMedium?.copyWith(color: cq.fg)),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                ],

                Text('Alert name', style: text.titleSmall),
                const SizedBox(height: AppSpacing.sm),
                TextFormField(
                  controller: _name,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(
                    hintText: 'e.g. Flutter jobs in Bengaluru',
                    prefixIcon: Icon(Icons.label_outline_rounded),
                  ),
                  validator: (v) =>
                      (v ?? '').trim().isEmpty ? 'Give your alert a name' : null,
                ),
                const SizedBox(height: AppSpacing.lg),

                Text('Keywords', style: text.titleSmall),
                const SizedBox(height: AppSpacing.sm),
                TextFormField(
                  controller: _keywords,
                  decoration: const InputDecoration(
                    hintText: 'e.g. Flutter developer',
                    prefixIcon: Icon(Icons.search_rounded),
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),

                _PickerField(
                  label: 'Skills',
                  items: _skills,
                  emptyHint: 'Any skill',
                  onAdd: _pickSkills,
                  onRemove: (item) => setState(() => _skills.remove(item)),
                ),
                const SizedBox(height: AppSpacing.lg),

                _PickerField(
                  label: 'Cities',
                  items: _cities,
                  emptyHint: 'Any location',
                  onAdd: _pickCities,
                  onRemove: (item) => setState(() => _cities.remove(item)),
                ),
                const SizedBox(height: AppSpacing.lg),

                Text('Experience', style: text.titleSmall),
                const SizedBox(height: AppSpacing.sm),
                Row(
                  children: [
                    Expanded(
                      child: _YearsDropdown(
                        label: 'Min',
                        value: _expMinYears,
                        onChanged: (v) => setState(() => _expMinYears = v),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: _YearsDropdown(
                        label: 'Max',
                        value: _expMaxYears,
                        onChanged: (v) => setState(() => _expMaxYears = v),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.lg),

                Text('Minimum salary', style: text.titleSmall),
                const SizedBox(height: AppSpacing.sm),
                _SalaryDropdown(
                  value: _salaryLpa,
                  onChanged: (v) => setState(() => _salaryLpa = v),
                ),
                const SizedBox(height: AppSpacing.lg),

                Text('Frequency', style: text.titleSmall),
                const SizedBox(height: AppSpacing.sm),
                Row(
                  children: [
                    for (final f in _freqs) ...[
                      Expanded(
                        child: _FreqPill(
                          label: f.$2,
                          selected: _frequency == f.$1,
                          onTap: () => setState(() => _frequency = f.$1),
                        ),
                      ),
                      if (f != _freqs.last) const SizedBox(width: AppSpacing.sm),
                    ],
                  ],
                ),
                const SizedBox(height: AppSpacing.lg),

                SwitchListTile(
                  value: _active,
                  onChanged: (v) => setState(() => _active = v),
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Active'),
                  subtitle: Text(
                    _active
                        ? 'You\'ll receive this alert'
                        : 'Paused — no emails until you resume',
                    style: text.bodySmall?.copyWith(color: cq.fgMuted),
                  ),
                ),
                const SizedBox(height: AppSpacing.xl),

                CqPrimaryButton(
                  label: _isEdit ? 'Save changes' : 'Create alert',
                  loading: _saving,
                  onPressed: _save,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PickerField extends StatelessWidget {
  const _PickerField({
    required this.label,
    required this.items,
    required this.emptyHint,
    required this.onAdd,
    required this.onRemove,
  });
  final String label;
  final List<CatalogItem> items;
  final String emptyHint;
  final VoidCallback onAdd;
  final ValueChanged<CatalogItem> onRemove;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(label, style: text.titleSmall),
            const Spacer(),
            TextButton.icon(
              onPressed: onAdd,
              icon: const Icon(Icons.add_rounded, size: 18),
              label: Text(items.isEmpty ? 'Add' : 'Edit'),
            ),
          ],
        ),
        if (items.isEmpty)
          Text(emptyHint, style: text.bodySmall?.copyWith(color: cq.fgSubtle))
        else
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.xs,
            children: [
              for (final item in items)
                InputChip(label: Text(item.name), onDeleted: () => onRemove(item)),
            ],
          ),
      ],
    );
  }
}

class _YearsDropdown extends StatelessWidget {
  const _YearsDropdown({
    required this.label,
    required this.value,
    required this.onChanged,
  });
  final String label;
  final int? value;
  final ValueChanged<int?> onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<int?>(
      initialValue: value,
      isExpanded: true,
      decoration: InputDecoration(labelText: label),
      items: [
        const DropdownMenuItem(value: null, child: Text('Any')),
        for (var y = 0; y <= 30; y++)
          DropdownMenuItem(value: y, child: Text(y == 1 ? '1 year' : '$y years')),
      ],
      onChanged: onChanged,
    );
  }
}

class _SalaryDropdown extends StatelessWidget {
  const _SalaryDropdown({required this.value, required this.onChanged});
  final int? value;
  final ValueChanged<int?> onChanged;

  @override
  Widget build(BuildContext context) {
    final options = <int>{?value, ..._salaryOptionsLpa}.toList()..sort();
    return DropdownButtonFormField<int?>(
      initialValue: value,
      isExpanded: true,
      decoration: const InputDecoration(prefixIcon: Icon(Icons.currency_rupee_rounded)),
      items: [
        const DropdownMenuItem(value: null, child: Text('Any')),
        for (final lpa in options)
          DropdownMenuItem(value: lpa, child: Text('$lpa LPA+')),
      ],
      onChanged: onChanged,
    );
  }
}

class _FreqPill extends StatelessWidget {
  const _FreqPill({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    return Material(
      color: selected ? cq.accent : cq.surfaceMuted,
      borderRadius: BorderRadius.circular(AppRadius.md),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: selected ? cq.accent : cq.border),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? cq.onAccent : cq.fg,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}
