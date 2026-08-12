import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cq_buttons.dart';
import 'widgets/auth_alternatives.dart';
import 'widgets/auth_widgets.dart';

/// Step 1 of phone sign-in: collect the mobile number (India, +91).
///
/// **Sending / verifying the OTP needs a backend endpoint that doesn't exist
/// yet** (and the website is off-limits), so "Continue" surfaces a polite
/// "coming soon" for now — but the screen itself is finished and ready to wire
/// up the moment the `/auth/otp/*` endpoints land.
class PhoneContinueScreen extends StatefulWidget {
  const PhoneContinueScreen({super.key});

  @override
  State<PhoneContinueScreen> createState() => _PhoneContinueScreenState();
}

class _PhoneContinueScreenState extends State<PhoneContinueScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phone = TextEditingController();

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  void _continue() {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;
    // Real OTP delivery requires backend endpoints we can't add here.
    showComingSoon(context, 'Phone OTP');
  }

  String? _validatePhone(String? value) {
    final v = (value ?? '').trim();
    if (v.length != 10) return 'Enter a 10-digit mobile number';
    if (!v.startsWith(RegExp(r'[6-9]'))) return 'Enter a valid Indian number';
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final cq = context.cq;

    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: Align(
          alignment: Alignment.topCenter,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.xl2,
              AppSpacing.lg,
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
                      'Enter your mobile number',
                      style: text.headlineMedium,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      "We'll send a one-time code to verify it's you.",
                      style: text.bodyLarge?.copyWith(color: cq.fgMuted),
                    ),
                    const SizedBox(height: AppSpacing.xl2),

                    const AuthFieldLabel('Mobile number'),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _CountryPrefix(),
                        const SizedBox(width: AppSpacing.md),
                        Expanded(
                          child: TextFormField(
                            controller: _phone,
                            keyboardType: TextInputType.phone,
                            textInputAction: TextInputAction.done,
                            autofocus: true,
                            autofillHints: const [
                              AutofillHints.telephoneNumberNational,
                            ],
                            maxLength: 10,
                            inputFormatters: [
                              FilteringTextInputFormatter.digitsOnly,
                            ],
                            onFieldSubmitted: (_) => _continue(),
                            decoration: const InputDecoration(
                              hintText: '98765 43210',
                              counterText: '',
                            ),
                            validator: _validatePhone,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.xl),

                    CqPrimaryButton(
                      label: 'Continue',
                      showArrow: true,
                      onPressed: _continue,
                    ),
                    const SizedBox(height: AppSpacing.xl),
                    const OrDivider(),
                    const SizedBox(height: AppSpacing.lg),

                    CqProviderButton(
                      icon: Icon(
                        Icons.mail_outline_rounded,
                        size: 20,
                        color: cq.fg,
                      ),
                      label: 'Continue with Email',
                      onTap: () => context.push(AppRoutes.login),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    CqProviderButton(
                      icon: googleGIcon(),
                      label: 'Continue with Google',
                      onTap: () => showComingSoon(context, 'Google sign-in'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The fixed "🇮🇳 +91" prefix box, styled to match the number field.
class _CountryPrefix extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    return Container(
      height: 52,
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
      decoration: BoxDecoration(
        color: cq.surfaceMuted,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: cq.border),
      ),
      alignment: Alignment.center,
      child: Text(
        '🇮🇳  +91',
        style: Theme.of(
          context,
        ).textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
      ),
    );
  }
}
