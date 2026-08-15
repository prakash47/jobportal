import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cq_buttons.dart';
import '../../../shared/widgets/cq_loader.dart';
import '../data/alerts_repository.dart';
import '../data/job_alert.dart';
import 'alert_editor_screen.dart';

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
String _fmtDate(DateTime d) => '${d.day} ${_months[d.month - 1]} ${d.year}';
String _freqLabel(String f) => f.isEmpty ? f : f[0].toUpperCase() + f.substring(1);

/// Job alerts tab (`/me/alerts`) — list, create, edit, pause/resume, delete.
class AlertsScreen extends ConsumerStatefulWidget {
  const AlertsScreen({super.key});

  @override
  ConsumerState<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends ConsumerState<AlertsScreen> {
  AlertsRepository? _repo;
  List<JobAlert>? _alerts;
  bool _loading = true;
  String? _error;

  /// Alert ids with a test send in flight, so a double tap can't queue twice.
  final _testing = <int>{};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<AlertsRepository> _repository() async {
    final existing = _repo;
    if (existing != null) return existing;
    final repo = await ref.read(alertsRepositoryProvider.future);
    _repo = repo;
    return repo;
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await (await _repository()).list();
      if (!mounted) return;
      setState(() {
        _alerts = data;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e is AlertsException ? e.message : 'Could not load your alerts.';
        _loading = false;
      });
    }
  }

  Future<void> _openEditor([JobAlert? existing]) async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => AlertEditorScreen(existing: existing)),
    );
    if (saved == true) _load();
  }

  Future<void> _togglePause(JobAlert alert) async {
    final alerts = _alerts;
    if (alerts == null) return;
    setState(() {
      _alerts = [
        for (final a in alerts)
          a.id == alert.id
              ? JobAlert(
                  id: a.id,
                  name: a.name,
                  frequency: a.frequency,
                  isActive: !a.isActive,
                  query: a.query,
                  lastSentAt: a.lastSentAt,
                )
              : a,
      ];
    });
    try {
      await (await _repository()).setActive(alert.id, !alert.isActive);
    } catch (e) {
      if (!mounted) return;
      _load();
      _snack(e is AlertsException ? e.message : 'Could not update the alert.');
    }
  }

  Future<void> _delete(JobAlert alert) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete alert?'),
        content: Text('Delete "${alert.name}"? This can\'t be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await (await _repository()).remove(alert.id);
      if (!mounted) return;
      setState(() =>
          _alerts = (_alerts ?? []).where((a) => a.id != alert.id).toList());
      _snack('Alert deleted');
    } catch (e) {
      if (!mounted) return;
      _snack(e is AlertsException ? e.message : 'Could not delete the alert.');
    }
  }

  /// Queue a test send. Ids currently in flight are held so a jittery double
  /// tap doesn't fire twice — the route has no throttle of its own and shares
  /// the global request budget.
  Future<void> _sendTest(JobAlert alert) async {
    if (!_testing.add(alert.id)) return;
    try {
      await (await _repository()).sendTest(alert.id);
      if (!mounted) return;
      // "Queued", never "sent" — a 202 is not delivery, and a repeat test with
      // no newly indexed jobs legitimately emails nothing.
      _snack('Test queued. If new jobs match, the email arrives shortly.');
    } catch (e) {
      if (!mounted) return;
      _snack(e is AlertsException ? e.message : 'Could not send a test.');
    } finally {
      _testing.remove(alert.id);
    }
  }

  void _snack(String msg) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(msg)));

  @override
  Widget build(BuildContext context) {
    final hasAlerts = (_alerts?.isNotEmpty ?? false);
    final atCap = (_alerts?.length ?? 0) >= AlertsRepository.maxAlerts;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Job alerts'),
        actions: [
          if (!_loading && _error == null && hasAlerts)
            IconButton(
              tooltip: atCap
                  ? 'You have used all ${AlertsRepository.maxAlerts} alerts'
                  : 'New alert',
              icon: const Icon(Icons.add_rounded),
              // Genuinely disabled at the cap rather than letting the user fill
              // in an editor only to be refused with a 409 on save.
              onPressed: atCap ? null : () => _openEditor(),
            ),
          const SizedBox(width: AppSpacing.sm),
        ],
      ),
      body: SafeArea(child: _body()),
    );
  }

  Widget _body() {
    if (_loading) {
      return const Center(child: CqLoader(message: 'Loading alerts…'));
    }
    if (_error != null) {
      return _ErrorView(message: _error!, onRetry: _load);
    }
    final alerts = _alerts!;
    if (alerts.isEmpty) return _Empty(onCreate: () => _openEditor());

    final atCap = alerts.length >= AlertsRepository.maxAlerts;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        padding: const EdgeInsets.all(AppSpacing.lg),
        // +1 for the usage header at index 0.
        itemCount: alerts.length + 1,
        separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
        itemBuilder: (context, i) {
          if (i == 0) {
            return Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.xs),
              child: Text(
                atCap
                    ? '${alerts.length} of ${AlertsRepository.maxAlerts} alerts used — delete one to add another'
                    : '${alerts.length} of ${AlertsRepository.maxAlerts} alerts used',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: atCap ? context.cq.warning : context.cq.fgMuted,
                ),
              ),
            );
          }
          final alert = alerts[i - 1];
          return _AlertCard(
            alert: alert,
            onEdit: () => _openEditor(alert),
            onTogglePause: () => _togglePause(alert),
            onDelete: () => _delete(alert),
            onSendTest: () => _sendTest(alert),
          );
        },
      ),
    );
  }
}

class _AlertCard extends StatelessWidget {
  const _AlertCard({
    required this.alert,
    required this.onEdit,
    required this.onTogglePause,
    required this.onDelete,
    required this.onSendTest,
  });

  final JobAlert alert;
  final VoidCallback onEdit, onTogglePause, onDelete, onSendTest;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Material(
      color: cq.surfaceMuted,
      borderRadius: BorderRadius.circular(AppRadius.md),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onEdit,
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.lg),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: cq.border),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(alert.name, style: text.titleMedium),
                    const SizedBox(height: AppSpacing.xs),
                    Wrap(
                      spacing: AppSpacing.sm,
                      runSpacing: AppSpacing.xs,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        _Badge(
                          _freqLabel(alert.frequency),
                          bg: cq.accent.withValues(alpha: 0.14),
                          fg: cq.accent,
                          border: cq.accent.withValues(alpha: 0.4),
                        ),
                        if (!alert.isActive)
                          _Badge(
                            'Paused',
                            bg: cq.surfaceMuted,
                            fg: cq.fgMuted,
                            border: cq.border,
                          ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      alert.lastSentAt != null
                          ? 'Last sent ${_fmtDate(alert.lastSentAt!)}'
                          : 'Not sent yet',
                      style: text.bodySmall?.copyWith(color: cq.fgSubtle),
                    ),
                  ],
                ),
              ),
              PopupMenuButton<String>(
                onSelected: (v) {
                  switch (v) {
                    case 'edit':
                      onEdit();
                    case 'pause':
                      onTogglePause();
                    case 'test':
                      onSendTest();
                    case 'delete':
                      onDelete();
                  }
                },
                itemBuilder: (_) => [
                  const PopupMenuItem(value: 'edit', child: Text('Edit')),
                  PopupMenuItem(
                    value: 'pause',
                    child: Text(alert.isActive ? 'Pause' : 'Resume'),
                  ),
                  PopupMenuItem(
                    value: 'test',
                    // A paused alert is skipped by the worker, so testing it
                    // would queue a scan that can never email anything.
                    enabled: alert.isActive,
                    child: const Text('Send test email'),
                  ),
                  const PopupMenuItem(value: 'delete', child: Text('Delete')),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge(this.label, {required this.bg, required this.fg, required this.border});
  final String label;
  final Color bg, fg, border;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppRadius.sm),
        border: Border.all(color: border),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(color: fg),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.onCreate});
  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.notifications_none_rounded, size: 48, color: cq.fgSubtle),
            const SizedBox(height: AppSpacing.lg),
            Text('No job alerts yet', style: text.titleLarge),
            const SizedBox(height: AppSpacing.sm),
            Text(
              'Create an alert and get notified about matching roles.',
              textAlign: TextAlign.center,
              style: text.bodyMedium?.copyWith(color: cq.fgMuted),
            ),
            const SizedBox(height: AppSpacing.xl),
            CqPrimaryButton(
              label: 'Create alert',
              icon: Icons.add_rounded,
              onPressed: onCreate,
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_rounded, size: 40, color: context.cq.fgSubtle),
            const SizedBox(height: AppSpacing.lg),
            Text(message, textAlign: TextAlign.center, style: text.bodyLarge),
            const SizedBox(height: AppSpacing.lg),
            OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
          ],
        ),
      ),
    );
  }
}
