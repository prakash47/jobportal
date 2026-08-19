import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cq_buttons.dart';
import '../application/auth_controller.dart';
import '../data/auth_repository.dart';

/// Explains an unverified email address and offers the two actions that can
/// resolve it: send the email again, or re-check after clicking the link.
///
/// **Why this screen has to exist.** The server refuses an application from an
/// unverified address (`applications.service.ts`: "Verify your email before
/// applying."). The app showed that refusal as a toast that faded in three
/// seconds and offered nothing — so a user who registered in the app hit a wall
/// with no route past it, on the app's single most important action.
///
/// The verification link in the email opens the WEBSITE, not the app, so the app
/// cannot observe the moment it is clicked. That is what "I've verified it" is
/// for: it re-reads the user from the server on demand.
///
/// Returns true when the address came back verified, so the caller can carry on
/// with whatever the user was trying to do.
Future<bool> showVerifyEmailSheet(
  BuildContext context,
  WidgetRef ref, {
  required String email,
  String? reason,
}) async {
  final verified = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Theme.of(context).scaffoldBackgroundColor,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _VerifyEmailSheet(email: email, reason: reason),
  );
  return verified ?? false;
}

class _VerifyEmailSheet extends ConsumerStatefulWidget {
  const _VerifyEmailSheet({required this.email, this.reason});

  final String email;

  /// Why the user is seeing this now, e.g. "You need a verified email to apply."
  final String? reason;

  @override
  ConsumerState<_VerifyEmailSheet> createState() => _VerifyEmailSheetState();
}

class _VerifyEmailSheetState extends ConsumerState<_VerifyEmailSheet> {
  bool _sending = false;
  bool _checking = false;
  String? _error;
  String? _sent;

  Future<void> _resend() async {
    setState(() {
      _sending = true;
      _error = null;
      _sent = null;
    });
    try {
      final repo = await ref.read(authRepositoryProvider.future);
      await repo.resendVerification();
      if (!mounted) return;
      setState(() {
        _sending = false;
        _sent = 'Sent. Check your inbox — and your spam folder.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = e is AuthException ? e.message : 'Could not send the email.';
      });
    }
  }

  Future<void> _recheck() async {
    setState(() {
      _checking = true;
      _error = null;
      _sent = null;
    });
    final user = await ref.read(authControllerProvider.notifier).refreshUser();
    if (!mounted) return;
    if (user != null && user.emailVerified) {
      Navigator.pop(context, true);
      return;
    }
    setState(() {
      _checking = false;
      _error = user == null
          // Deliberately not "still unverified": we could not reach the server,
          // so we genuinely do not know.
          ? 'Could not reach the server. Check your connection and try again.'
          : 'Not verified yet. Open the link in the email, then check again.';
    });
  }

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;

    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.xl2,
        AppSpacing.xl,
        AppSpacing.xl2,
        AppSpacing.xl + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.mark_email_unread_outlined, size: 22, color: cq.warning),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text('Verify your email', style: text.titleLarge),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            widget.reason ??
                'Employers only see applications from verified accounts.',
            style: text.bodyLarge?.copyWith(color: cq.fgMuted),
          ),
          const SizedBox(height: AppSpacing.lg),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: cq.surfaceMuted,
              borderRadius: BorderRadius.circular(AppRadius.sm),
              border: Border.all(color: cq.border),
            ),
            child: Text(widget.email, style: text.titleSmall),
          ),
          const SizedBox(height: AppSpacing.lg),
          Text(
            'Open the link in that email, then come back and tap '
            "“I've verified it”.",
            style: text.bodyMedium?.copyWith(color: cq.fgMuted),
          ),

          if (_sent != null) ...[
            const SizedBox(height: AppSpacing.lg),
            _Note(text: _sent!, color: cq.success, icon: Icons.check_rounded),
          ],
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.lg),
            _Note(
              text: _error!,
              color: cq.danger,
              icon: Icons.error_outline_rounded,
            ),
          ],

          const SizedBox(height: AppSpacing.xl),
          CqPrimaryButton(
            label: "I've verified it",
            loading: _checking,
            onPressed: _sending ? null : _recheck,
          ),
          const SizedBox(height: AppSpacing.md),
          SizedBox(
            width: double.infinity,
            height: 52,
            child: OutlinedButton(
              onPressed: (_sending || _checking) ? null : _resend,
              child: Text(_sending ? 'Sending…' : 'Send the email again'),
            ),
          ),
        ],
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({required this.text, required this.color, required this.icon});

  final String text;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 17, color: color),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Text(
            text,
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: color),
          ),
        ),
      ],
    );
  }
}
