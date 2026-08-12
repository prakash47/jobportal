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

/// Create a Career Queue candidate account (email + password, optional phone).
/// [initialEmail] prefills the address when arriving from the email-first flow.
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key, this.initialEmail});

  final String? initialEmail;

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();

  bool _obscure = true;
  bool _updates = true;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _email.text = widget.initialEmail ?? '';
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _phone.dispose();
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
          .register(
            name: _name.text.trim(),
            email: _email.text.trim(),
            password: _password.text,
            phone: _phone.text.trim(),
          );
      // Success → the API auto-logs-in and the router sends us to /home.
    } on AuthException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () =>
              context.canPop() ? context.pop() : context.go(AppRoutes.login),
        ),
      ),
      body: LoadingOverlay(
        loading: _submitting,
        message: 'Creating your account…',
        child: SafeArea(
          child: Align(
            alignment: Alignment.topCenter,
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.xl2,
                0,
                AppSpacing.xl2,
                AppSpacing.xl3,
              ),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text('Create your account', style: text.headlineMedium),
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        'Join Career Queue — free for job seekers, always.',
                        style: text.bodyLarge?.copyWith(
                          color: context.cq.fgMuted,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.xl2),

                      if (_error != null) ...[
                        AuthErrorBanner(_error!),
                        const SizedBox(height: AppSpacing.lg),
                      ],

                      const AuthFieldLabel('Full name'),
                      TextFormField(
                        controller: _name,
                        textCapitalization: TextCapitalization.words,
                        textInputAction: TextInputAction.next,
                        autofillHints: const [AutofillHints.name],
                        decoration: const InputDecoration(
                          hintText: 'e.g. Priya Sharma',
                          prefixIcon: Icon(Icons.person_outline_rounded),
                        ),
                        validator: validateName,
                      ),
                      const SizedBox(height: AppSpacing.lg),

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

                      const AuthFieldLabel('Phone (optional)'),
                      TextFormField(
                        controller: _phone,
                        keyboardType: TextInputType.phone,
                        textInputAction: TextInputAction.next,
                        autofillHints: const [AutofillHints.telephoneNumber],
                        decoration: const InputDecoration(
                          hintText: '+91 98765 43210',
                          prefixIcon: Icon(Icons.phone_outlined),
                        ),
                        validator: validateOptionalPhone,
                      ),
                      const SizedBox(height: AppSpacing.lg),

                      const AuthFieldLabel('Password'),
                      TextFormField(
                        controller: _password,
                        obscureText: _obscure,
                        textInputAction: TextInputAction.done,
                        autofillHints: const [AutofillHints.newPassword],
                        onFieldSubmitted: (_) => _submit(),
                        decoration: InputDecoration(
                          hintText: 'Create a password',
                          helperText:
                              'At least 8 characters, with a number and a special character.',
                          helperMaxLines: 2,
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
                        validator: validateNewPassword,
                      ),
                      const SizedBox(height: AppSpacing.lg),

                      // Marketing consent — captured now, honoured once
                      // notifications ship (the backend has no field for it yet).
                      InkWell(
                        onTap: () => setState(() => _updates = !_updates),
                        borderRadius: BorderRadius.circular(AppRadius.sm),
                        child: Row(
                          children: [
                            Checkbox(
                              value: _updates,
                              onChanged: (v) =>
                                  setState(() => _updates = v ?? false),
                            ),
                            Expanded(
                              child: Text(
                                'Send me job alerts & updates by email or SMS.',
                                style: text.bodyMedium?.copyWith(
                                  color: context.cq.fg,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: AppSpacing.md),

                      Text(
                        'By creating an account you agree to our Terms of Service and Privacy Policy.',
                        textAlign: TextAlign.center,
                        style: text.bodySmall?.copyWith(
                          color: context.cq.fgSubtle,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.lg),

                      CqPrimaryButton(
                        label: 'Create account',
                        loading: _submitting,
                        onPressed: _submit,
                      ),
                      const SizedBox(height: AppSpacing.xl),
                      const OrDivider(),
                      const SizedBox(height: AppSpacing.lg),
                      CqProviderButton(
                        icon: googleGIcon(),
                        label: 'Sign up with Google',
                        onTap: () => showComingSoon(context, 'Google sign-up'),
                      ),
                      const SizedBox(height: AppSpacing.xl2),

                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            'Already have an account? ',
                            style: text.bodyMedium?.copyWith(
                              color: context.cq.fgMuted,
                            ),
                          ),
                          GestureDetector(
                            onTap: () => context.canPop()
                                ? context.pop()
                                : context.go(AppRoutes.login),
                            child: Text(
                              'Log in',
                              style: text.labelLarge?.copyWith(
                                color: context.cq.accent,
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
