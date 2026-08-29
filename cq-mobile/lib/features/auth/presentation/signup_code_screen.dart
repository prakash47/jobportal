import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cq_buttons.dart';
import '../application/auth_controller.dart';
import '../data/auth_repository.dart';

/// Step two of signing up: confirm the six-digit code, then create the account.
///
/// The server will not create a `User` row for an address it has not just
/// verified — `POST /auth/register` refuses a body without a `signupId` that
/// has been verified for that exact email. So the details the candidate typed
/// are carried here unsaved, and the account comes into existence only after
/// the code checks out.
///
/// Nothing is persisted before that point. Backing out loses the form, which is
/// the correct trade: the alternative is a half-made account for an address
/// nobody has proved they own.
class SignupCodeScreen extends ConsumerStatefulWidget {
  const SignupCodeScreen({
    super.key,
    required this.name,
    required this.email,
    required this.password,
    required this.phone,
    required this.challenge,
  });

  final String name;
  final String email;
  final String password;
  final String? phone;

  /// From the request that sent the first code.
  final SignupChallenge challenge;

  @override
  ConsumerState<SignupCodeScreen> createState() => _SignupCodeScreenState();
}

class _SignupCodeScreenState extends ConsumerState<SignupCodeScreen> {
  final _code = TextEditingController();
  late String _signupId;
  Timer? _timer;
  int _resendSecs = 0;
  bool _busy = false;
  String? _error;
  String? _notice;

  @override
  void initState() {
    super.initState();
    _signupId = widget.challenge.signupId;
    _startCountdown(widget.challenge.resendInSeconds);
  }

  @override
  void dispose() {
    _timer?.cancel();
    _code.dispose();
    super.dispose();
  }

  Future<AuthRepository> get _repo => ref.read(authRepositoryProvider.future);

  /// Counts down from a DURATION the server gave us.
  ///
  /// Deliberately not `resendAvailableAt - DateTime.now()`: that subtracts the
  /// phone's clock from the server's, so a device running a few minutes fast
  /// shows a resend button that is already available when it is not — a bug the
  /// web client shipped and had to fix.
  void _startCountdown(int seconds) {
    _timer?.cancel();
    setState(() => _resendSecs = seconds);
    if (seconds <= 0) return;
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      if (_resendSecs <= 1) {
        t.cancel();
        setState(() => _resendSecs = 0);
      } else {
        setState(() => _resendSecs--);
      }
    });
  }

  Future<void> _resend() async {
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      // The same signupId goes back, so the server replaces that challenge
      // rather than opening a second one for the same address.
      final next = await (await _repo).requestSignupOtp(
        name: widget.name,
        email: widget.email,
        signupId: _signupId,
      );
      if (!mounted) return;
      setState(() {
        _signupId = next.signupId;
        _notice = 'We sent another code to ${widget.email}.';
      });
      _startCountdown(next.resendInSeconds);
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
      // A refused resend still says when the next one is allowed, so the button
      // re-arms at the right moment instead of guessing.
      if (e.resendInSeconds != null) _startCountdown(e.resendInSeconds!);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    final code = _code.text.trim();
    if (code.length != 6) {
      setState(() => _error = 'Enter the 6-digit code from your email.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      final repo = await _repo;
      // Two calls, in this order and not merged: verify tells the user
      // precisely what is wrong with the CODE ("2 attempts left", "expired"),
      // and only a verified handle is allowed to create the account.
      await repo.verifySignupOtp(signupId: _signupId, code: code);
      if (!mounted) return;
      await ref
          .read(authControllerProvider.notifier)
          .register(
            name: widget.name,
            email: widget.email,
            password: widget.password,
            signupId: _signupId,
            phone: widget.phone,
          );
      // The router moves to /home on the state change; nothing to pop.
    } on AuthException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(title: const Text('Confirm your email')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          children: [
            Text('Enter the code we sent', style: text.headlineSmall),
            const SizedBox(height: AppSpacing.sm),
            Text(
              'We sent a 6-digit code to ${widget.email}. Your account is '
              'created once the code checks out.',
              style: text.bodyMedium?.copyWith(color: cq.fgMuted),
            ),
            const SizedBox(height: AppSpacing.xl),

            TextField(
              controller: _code,
              autofocus: true,
              keyboardType: TextInputType.number,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(6),
              ],
              textAlign: TextAlign.center,
              style: text.headlineSmall?.copyWith(letterSpacing: 8),
              decoration: const InputDecoration(hintText: '000000'),
              onSubmitted: (_) => _busy ? null : _submit(),
            ),

            if (_error != null) ...[
              const SizedBox(height: AppSpacing.md),
              Text(_error!, style: text.bodyMedium?.copyWith(color: cq.danger)),
            ],
            if (_notice != null) ...[
              const SizedBox(height: AppSpacing.md),
              Text(_notice!, style: text.bodyMedium?.copyWith(color: cq.fgMuted)),
            ],

            const SizedBox(height: AppSpacing.xl),
            CqPrimaryButton(
              label: 'Create account',
              loading: _busy,
              onPressed: _busy ? null : _submit,
            ),
            const SizedBox(height: AppSpacing.md),
            Center(
              child: TextButton(
                onPressed: (_busy || _resendSecs > 0) ? null : _resend,
                child: Text(
                  _resendSecs > 0
                      ? 'Send another code in ${_resendSecs}s'
                      : 'Send another code',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
