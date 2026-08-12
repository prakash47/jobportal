import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cq_buttons.dart';
import '../data/alerts_repository.dart';
import '../data/job_alert.dart';

const _freqs = [
  ('instant', 'Instant'),
  ('daily', 'Daily'),
  ('weekly', 'Weekly'),
];

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
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _keywords.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final repo = await ref.read(alertsRepositoryProvider.future);
      // Preserve any website-set filters (skills/cities) we don't edit here.
      final query = Map<String, dynamic>.from(widget.existing?.query ?? const {});
      final kw = _keywords.text.trim();
      if (kw.isNotEmpty) {
        query['q'] = kw;
      } else {
        query.remove('q');
      }

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
                    child: Text(
                      _error!,
                      style: text.bodyMedium?.copyWith(color: cq.fg),
                    ),
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
                const SizedBox(height: 6),
                Text(
                  'Skill & city filters come with a later update.',
                  style: text.bodySmall?.copyWith(color: cq.fgSubtle),
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
