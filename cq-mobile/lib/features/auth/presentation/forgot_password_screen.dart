import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cq_buttons.dart';
import '../../../shared/widgets/cq_loader.dart';
import '../application/auth_controller.dart';
import '../data/auth_repository.dart';
import 'auth_validators.dart';
import 'widgets/auth_widgets.dart';

/// Password reset — a 3-step OTP flow on one screen: email → 6-digit code → new
/// password. The final step sets fresh session cookies, so the user lands signed
/// in (the router redirect takes them home).
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key, this.initialEmail});

  final String? initialEmail;

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _email = TextEditingController();
  final _code = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();

  int _step = 0; // 0 = email, 1 = code, 2 = new password
  String? _ticket;
  int _resendSecs = 0;
  Timer? _timer;
  bool _busy = false;
  bool _obscure = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _email.text = widget.initialEmail ?? '';
  }

  @override
  void dispose() {
    _timer?.cancel();
    _email.dispose();
    _code.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<AuthRepository> get _repo => ref.read(authRepositoryProvider.future);

  void _startCountdown(int seconds) {
    _timer?.cancel();
    setState(() => _resendSecs = seconds);
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

  Future<void> _sendCode() async {
    FocusScope.of(context).unfocus();
    final emailError = validateEmail(_email.text);
    if (emailError != null) {
      setState(() => _error = emailError);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final challenge = await (await _repo).requestPasswordResetOtp(_email.text.trim());
      if (!mounted) return;
      setState(() => _step = _step == 0 ? 1 : _step);
      _startCountdown(challenge.resendInSeconds);
    } on AuthException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    FocusScope.of(context).unfocus();
    final code = _code.text.trim();
    if (code.length != 6) {
      setState(() => _error = 'Enter the 6-digit code.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final ticket = await (await _repo).verifyResetOtp(email: _email.text.trim(), code: code);
      if (!mounted) return;
      setState(() {
        _ticket = ticket;
        _step = 2;
      });
    } on AuthException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reset() async {
    FocusScope.of(context).unfocus();
    final pwError = validateNewPassword(_password.text);
    if (pwError != null) {
      setState(() => _error = pwError);
      return;
    }
    if (_confirm.text != _password.text) {
      setState(() => _error = 'Passwords do not match.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final user = await (await _repo).resetPassword(
        ticket: _ticket!,
        password: _password.text,
      );
      if (!mounted) return;
      // Session cookies are set → sign in; the router redirect moves to home.
      ref.read(authControllerProvider.notifier).completePasswordReset(user);
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final cq = context.cq;
    return Scaffold(
      appBar: AppBar(title: const Text('Reset password')),
      body: LoadingOverlay(
        loading: _busy,
        message: 'Please wait…',
        child: SafeArea(
          child: Align(
            alignment: Alignment.topCenter,
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.xl2,
                0,
                AppSpacing.xl2,
                AppSpacing.xl2,
              ),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Step ${_step + 1} of 3', style: text.labelMedium?.copyWith(color: cq.accent)),
                    const SizedBox(height: AppSpacing.sm),
                    if (_error != null) ...[
                      AuthErrorBanner(_error!),
                      const SizedBox(height: AppSpacing.lg),
                    ],
                    if (_step == 0) ..._emailStep(text, cq),
                    if (_step == 1) ..._codeStep(text, cq),
                    if (_step == 2) ..._passwordStep(text, cq),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _emailStep(TextTheme text, CqColors cq) => [
    Text('Forgot your password?', style: text.headlineMedium),
    const SizedBox(height: AppSpacing.sm),
    Text(
      'Enter your email and we\'ll send you a 6-digit code.',
      style: text.bodyLarge?.copyWith(color: cq.fgMuted),
    ),
    const SizedBox(height: AppSpacing.xl2),
    const AuthFieldLabel('Email'),
    TextField(
      controller: _email,
      keyboardType: TextInputType.emailAddress,
      autofillHints: const [AutofillHints.email],
      decoration: const InputDecoration(
        hintText: 'you@example.com',
        prefixIcon: Icon(Icons.mail_outline_rounded),
      ),
    ),
    const SizedBox(height: AppSpacing.xl),
    CqPrimaryButton(label: 'Send code', loading: _busy, onPressed: _sendCode),
  ];

  List<Widget> _codeStep(TextTheme text, CqColors cq) => [
    Text('Enter the code', style: text.headlineMedium),
    const SizedBox(height: AppSpacing.sm),
    Text(
      'We sent a 6-digit code to ${_email.text.trim()}.',
      style: text.bodyLarge?.copyWith(color: cq.fgMuted),
    ),
    const SizedBox(height: AppSpacing.xl2),
    const AuthFieldLabel('6-digit code'),
    TextField(
      controller: _code,
      keyboardType: TextInputType.number,
      maxLength: 6,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      style: text.headlineSmall?.copyWith(letterSpacing: 8),
      textAlign: TextAlign.center,
      decoration: const InputDecoration(counterText: '', hintText: '••••••'),
    ),
    const SizedBox(height: AppSpacing.md),
    Align(
      alignment: Alignment.centerLeft,
      child: TextButton(
        onPressed: _resendSecs > 0 || _busy ? null : _sendCode,
        child: Text(_resendSecs > 0 ? 'Resend code in ${_resendSecs}s' : 'Resend code'),
      ),
    ),
    const SizedBox(height: AppSpacing.md),
    CqPrimaryButton(label: 'Verify', loading: _busy, onPressed: _verify),
  ];

  List<Widget> _passwordStep(TextTheme text, CqColors cq) => [
    Text('Set a new password', style: text.headlineMedium),
    const SizedBox(height: AppSpacing.sm),
    Text(
      'Choose a strong password you don\'t use elsewhere.',
      style: text.bodyLarge?.copyWith(color: cq.fgMuted),
    ),
    const SizedBox(height: AppSpacing.xl2),
    const AuthFieldLabel('New password'),
    TextField(
      controller: _password,
      obscureText: _obscure,
      decoration: InputDecoration(
        hintText: 'At least 8 characters',
        prefixIcon: const Icon(Icons.lock_outline_rounded),
        suffixIcon: IconButton(
          icon: Icon(_obscure ? Icons.visibility_off_rounded : Icons.visibility_rounded),
          onPressed: () => setState(() => _obscure = !_obscure),
        ),
      ),
    ),
    const SizedBox(height: AppSpacing.lg),
    const AuthFieldLabel('Confirm password'),
    TextField(
      controller: _confirm,
      obscureText: _obscure,
      onSubmitted: (_) => _reset(),
      decoration: const InputDecoration(
        hintText: 'Re-enter your password',
        prefixIcon: Icon(Icons.lock_outline_rounded),
      ),
    ),
    const SizedBox(height: AppSpacing.xl),
    CqPrimaryButton(label: 'Reset password', loading: _busy, onPressed: _reset),
  ];
}
