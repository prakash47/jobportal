import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cq_buttons.dart';
import '../../../shared/widgets/cq_loader.dart';
import '../../auth/application/auth_controller.dart';
import '../data/notification_preferences.dart';
import '../data/settings_repository.dart';

/// Settings — currently the email notification preferences (`/me/notifications`),
/// mirroring the website's Settings › Notification preferences page. Structured
/// as a section so future settings slot in below without a redesign.
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  NotificationPreferences? _saved; // last-known server truth
  NotificationPreferences? _draft; // the edited copy
  bool _loading = true;
  bool _saving = false;
  bool _deleting = false;
  String? _error;

  bool get _dirty => _saved != null && _draft != _saved;

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
      final repo = await ref.read(settingsRepositoryProvider.future);
      final prefs = await repo.load();
      if (!mounted) return;
      setState(() {
        _saved = prefs;
        _draft = prefs;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error =
            e is SettingsException ? e.message : 'Could not load your settings.';
        _loading = false;
      });
    }
  }

  Future<void> _save() async {
    final draft = _draft;
    if (draft == null || _saving) return;
    setState(() => _saving = true);
    try {
      final repo = await ref.read(settingsRepositoryProvider.future);
      final result = await repo.save(draft);
      if (!mounted) return;
      setState(() {
        _saved = result;
        _draft = result;
        _saving = false;
      });
      _toast('Preferences saved');
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      _toast(
        e is SettingsException ? e.message : 'Could not save. Please try again.',
        error: true,
      );
    }
  }

  /// Permanent, store-required account deletion. Requires the user to type
  /// DELETE, then wipes the account server-side and logs them out.
  Future<void> _confirmDelete() async {
    final controller = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        final cq = ctx.cq;
        return StatefulBuilder(
          builder: (ctx, setDialog) {
            final canDelete =
                controller.text.trim().toUpperCase() == 'DELETE';
            return AlertDialog(
              title: const Text('Delete your account?'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'This permanently deletes your account and all your data — '
                    'profile, saved jobs, applications, and alerts. This cannot '
                    'be undone.',
                    style: Theme.of(ctx).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text(
                    'Type DELETE to confirm',
                    style: Theme.of(ctx).textTheme.labelMedium?.copyWith(
                      color: cq.fgMuted,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  TextField(
                    controller: controller,
                    autofocus: true,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(hintText: 'DELETE'),
                    onChanged: (_) => setDialog(() {}),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: const Text('Cancel'),
                ),
                TextButton(
                  onPressed: canDelete ? () => Navigator.pop(ctx, true) : null,
                  style: TextButton.styleFrom(foregroundColor: cq.danger),
                  child: const Text('Delete account'),
                ),
              ],
            );
          },
        );
      },
    );
    if (confirmed != true) return;

    setState(() => _deleting = true);
    try {
      final repo = await ref.read(settingsRepositoryProvider.future);
      await repo.deleteAccount();
      if (!mounted) return;
      // Account is gone server-side — clear the local session; the router
      // redirect returns the user to the welcome screen.
      await ref.read(authControllerProvider.notifier).logout();
    } catch (e) {
      if (!mounted) return;
      setState(() => _deleting = false);
      _toast(
        e is SettingsException ? e.message : 'Could not delete your account.',
        error: true,
      );
    }
  }

  void _toast(String message, {bool error = false}) {
    final cq = context.cq;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          behavior: SnackBarBehavior.floating,
          backgroundColor: error ? cq.danger : cq.fg,
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: SafeArea(child: _body()),
    );
  }

  Widget _body() {
    if (_loading) {
      return const Center(child: CqLoader(message: 'Loading your settings…'));
    }
    if (_error != null) {
      return _ErrorView(message: _error!, onRetry: _load);
    }
    final cq = context.cq;
    final text = Theme.of(context).textTheme;

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.xl2),
      children: [
        Text('Notification preferences', style: text.titleMedium),
        const SizedBox(height: AppSpacing.xs),
        Text(
          'Choose which emails you want from Career Queue. Account emails — '
          'verification, password reset, receipts — are always sent.',
          style: text.bodySmall?.copyWith(color: cq.fgMuted),
        ),
        const SizedBox(height: AppSpacing.lg),

        // ── Toggles ──
        Container(
          decoration: BoxDecoration(
            color: cq.surfaceMuted,
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: cq.border),
          ),
          child: Column(
            children: [
              _ToggleRow(
                label: 'Job alerts',
                description:
                    'Daily and weekly digests of new jobs matching your saved searches.',
                value: _draft!.jobAlerts,
                onChanged: (v) =>
                    setState(() => _draft = _draft!.copyWith(jobAlerts: v)),
              ),
              Divider(height: 1, color: cq.border),
              _ToggleRow(
                label: 'Application updates',
                description:
                    'When a recruiter moves your application forward, rejects it, or you withdraw.',
                value: _draft!.applicationUpdates,
                onChanged: (v) => setState(
                    () => _draft = _draft!.copyWith(applicationUpdates: v)),
              ),
              Divider(height: 1, color: cq.border),
              _ToggleRow(
                label: 'Product news',
                description:
                    'Occasional announcements about new Career Queue features.',
                value: _draft!.productNews,
                onChanged: (v) =>
                    setState(() => _draft = _draft!.copyWith(productNews: v)),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.xl),

        // Save is greyed until there's an actual change to write.
        AnimatedOpacity(
          duration: const Duration(milliseconds: 150),
          opacity: (_dirty || _saving) ? 1.0 : 0.45,
          child: CqPrimaryButton(
            label: 'Save changes',
            icon: Icons.check_rounded,
            loading: _saving,
            onPressed: _dirty ? _save : null,
          ),
        ),

        // ── Danger zone ──
        const SizedBox(height: AppSpacing.xl3),
        Divider(height: 1, color: cq.border),
        const SizedBox(height: AppSpacing.xl),
        Text(
          'Danger zone',
          style: text.titleMedium?.copyWith(color: cq.danger),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          'Permanently delete your account and all associated data. This cannot '
          'be undone.',
          style: text.bodySmall?.copyWith(color: cq.fgMuted),
        ),
        const SizedBox(height: AppSpacing.md),
        OutlinedButton.icon(
          onPressed: _deleting ? null : _confirmDelete,
          icon: _deleting
              ? SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(cq.danger),
                  ),
                )
              : const Icon(Icons.delete_outline_rounded, size: 18),
          label: const Text('Delete account'),
          style: OutlinedButton.styleFrom(
            foregroundColor: cq.danger,
            side: BorderSide(color: cq.danger.withValues(alpha: 0.5)),
          ),
        ),
      ],
    );
  }
}

class _ToggleRow extends StatelessWidget {
  const _ToggleRow({
    required this.label,
    required this.description,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final String description;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.md,
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: text.titleSmall),
                const SizedBox(height: 2),
                Text(
                  description,
                  style: text.bodySmall?.copyWith(color: cq.fgMuted),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.lg),
          Switch(
            value: value,
            onChanged: onChanged,
            thumbColor: WidgetStateProperty.resolveWith(
              (s) =>
                  s.contains(WidgetState.selected) ? Colors.white : cq.fgSubtle,
            ),
            trackColor: WidgetStateProperty.resolveWith(
              (s) => s.contains(WidgetState.selected)
                  ? cq.accent
                  : cq.surfaceMuted,
            ),
            trackOutlineColor: WidgetStateProperty.resolveWith(
              (s) => s.contains(WidgetState.selected)
                  ? Colors.transparent
                  : cq.border,
            ),
          ),
        ],
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
