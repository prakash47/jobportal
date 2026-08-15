import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cq_buttons.dart';
import '../../../shared/widgets/cq_loader.dart';
import '../application/auth_controller.dart';
import '../data/auth_repository.dart';
import 'auth_validators.dart';
import 'widgets/auth_alternatives.dart';
import 'widgets/auth_widgets.dart';

/// The password step of email sign-in (Naukri-style flow, CQ theme). Reached
/// from the email-first step, which prefills [initialEmail] — so we drop the
/// user straight onto the password field.
///
/// **Email + password works today.** "Log in with OTP" and Google are shown for
/// a familiar, complete flow but need backend endpoints that don't exist yet, so
/// they surface a polite "coming soon".
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, this.initialEmail});

  final String? initialEmail;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();

  bool _obscure = true;
  bool _submitting = false;
  String? _error;

  bool get _cameFromEmailStep => (widget.initialEmail ?? '').isNotEmpty;

  @override
  void initState() {
    super.initState();
    _email.text = widget.initialEmail ?? '';
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    setState(() => _error = null);
    if (!_formKey.currentState!.validate()) return;

    setState(() => _submitting = true);
    try {
      await ref
          .read(authControllerProvider.notifier)
          .login(email: _email.text.trim(), password: _password.text);
      // Success → the router redirect sends us to /home automatically.
    } on AuthException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _soon(String feature) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text('$feature is coming soon.')));
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final cq = context.cq;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () =>
              context.canPop() ? context.pop() : context.go(AppRoutes.welcome),
        ),
      ),
      body: LoadingOverlay(
        loading: _submitting,
        message: 'Signing you in…',
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
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Log in to Career Queue',
                        style: text.headlineMedium,
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        'Welcome back — continue your job search.',
                        style: text.bodyLarge?.copyWith(color: cq.fgMuted),
                      ),
                      const SizedBox(height: AppSpacing.xl2),

                      if (_error != null) ...[
                        AuthErrorBanner(_error!),
                        const SizedBox(height: AppSpacing.lg),
                      ],

                      const AuthFieldLabel('Email'),
                      TextFormField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                        autofillHints: const [AutofillHints.email],
                        decoration: const InputDecoration(
                          hintText: 'you@example.com',
                          prefixIcon: Icon(Icons.mail_outline_rounded),
                        ),
                        validator: validateEmail,
                      ),
                      const SizedBox(height: AppSpacing.lg),

                      const AuthFieldLabel('Password'),
                      TextFormField(
                        controller: _password,
                        obscureText: _obscure,
                        textInputAction: TextInputAction.done,
                        autofocus: _cameFromEmailStep,
                        autofillHints: const [AutofillHints.password],
                        onFieldSubmitted: (_) => _submit(),
                        decoration: InputDecoration(
                          hintText: 'Your password',
                          prefixIcon: const Icon(Icons.lock_outline_rounded),
                          suffixIcon: IconButton(
                            tooltip: _obscure
                                ? 'Show password'
                                : 'Hide password',
                            icon: Icon(
                              _obscure
                                  ? Icons.visibility_off_rounded
                                  : Icons.visibility_rounded,
                            ),
                            onPressed: () =>
                                setState(() => _obscure = !_obscure),
                          ),
                        ),
                        validator: validateRequiredPassword,
                      ),
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(
                          onPressed: () => context.push(
                            AppRoutes.forgotPassword,
                            extra: _email.text.trim(),
                          ),
                          child: const Text('Forgot password?'),
                        ),
                      ),
                      const SizedBox(height: AppSpacing.md),

                      // Two-button row (Naukri pattern): OTP (secondary) + Log in.
                      Row(
                        children: [
                          Expanded(
                            child: SizedBox(
                              height: 54,
                              child: OutlinedButton(
                                onPressed: () => _soon('OTP login'),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: cq.accent,
                                  side: BorderSide(color: cq.accent),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: AppSpacing.sm,
                                  ),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(
                                      AppRadius.md,
                                    ),
                                  ),
                                ),
                                child: const FittedBox(
                                  fit: BoxFit.scaleDown,
                                  child: Text('Log in with OTP'),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: AppSpacing.md),
                          Expanded(
                            child: CqPrimaryButton(
                              label: 'Log in',
                              loading: _submitting,
                              onPressed: _submit,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.xl),
                      const OrDivider(),
                      const SizedBox(height: AppSpacing.lg),

                      CqProviderButton(
                        icon: googleGIcon(),
                        label: 'Continue with Google',
                        onTap: () => showComingSoon(context, 'Google sign-in'),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      CqProviderButton(
                        icon: Icon(
                          Icons.smartphone_rounded,
                          size: 20,
                          color: cq.fg,
                        ),
                        label: 'Continue with Phone',
                        onTap: () => context.push(AppRoutes.phoneContinue),
                      ),
                      const SizedBox(height: AppSpacing.xl2),

                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            'New to Career Queue? ',
                            style: text.bodyMedium?.copyWith(color: cq.fgMuted),
                          ),
                          GestureDetector(
                            onTap: () => context.push(
                              AppRoutes.register,
                              extra: _email.text.trim(),
                            ),
                            child: Text(
                              'Register',
                              style: text.labelLarge?.copyWith(
                                color: cq.accent,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
