import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:student_app/core/config.dart';
import 'package:student_app/design/theme.dart';
import 'package:student_app/features/auth/auth_controller.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _fin = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _useEmail = false;
  bool _obscure = true;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _fin.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      await ref.read(authStateProvider.notifier).login(
            finCode: _useEmail ? null : _fin.text.trim().toUpperCase(),
            email: _useEmail ? _email.text.trim() : null,
            password: _password.text,
          );
      // Router redirect takes signed-in user from /login → /home
      if (mounted) context.go('/home');
    } catch (e) {
      if (mounted) {
        setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
          onPressed: () => context.go('/onboarding'),
        ),
        title: const Text('Giriş'),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
          children: [
            Text(
              'Xoş gəlmisiniz',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            Text(
              _useEmail
                  ? 'E-poçt və şifrənizlə kabinetə daxil olun.'
                  : 'Şəxsiyyət vəsiqənizdəki FIN kodu ilə daxil olun.',
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: AppColors.muted, height: 1.4),
            ),
            const SizedBox(height: 28),
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: false, label: Text('FIN'), icon: Icon(Icons.badge_outlined, size: 18)),
                ButtonSegment(value: true, label: Text('E-poçt'), icon: Icon(Icons.mail_outline, size: 18)),
              ],
              selected: {_useEmail},
              onSelectionChanged: (s) => setState(() {
                _useEmail = s.first;
                _error = null;
              }),
            ),
            const SizedBox(height: 24),
            if (_useEmail)
              TextFormField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
                decoration: const InputDecoration(
                  labelText: 'E-poçt',
                  prefixIcon: Icon(Icons.mail_outline),
                ),
                validator: (v) {
                  if (v == null || v.trim().isEmpty) return 'E-poçt tələb olunur';
                  if (!v.contains('@')) return 'Düzgün e-poçt daxil edin';
                  return null;
                },
              )
            else
              TextFormField(
                controller: _fin,
                textCapitalization: TextCapitalization.characters,
                maxLength: 7,
                autofillHints: const [AutofillHints.username],
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9]')),
                  LengthLimitingTextInputFormatter(7),
                ],
                decoration: const InputDecoration(
                  labelText: 'FIN kodu',
                  hintText: '7 simvol',
                  counterText: '',
                  prefixIcon: Icon(Icons.badge_outlined),
                ),
                validator: (v) {
                  if (v == null || v.trim().length != 7) return 'FIN 7 simvol olmalıdır';
                  return null;
                },
              ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _password,
              obscureText: _obscure,
              autofillHints: const [AutofillHints.password],
              decoration: InputDecoration(
                labelText: 'Şifrə',
                prefixIcon: const Icon(Icons.lock_outline),
                suffixIcon: IconButton(
                  onPressed: () => setState(() => _obscure = !_obscure),
                  icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                ),
              ),
              validator: (v) {
                if (v == null || v.length < 6) return 'Şifrə ən azı 6 simvol';
                return null;
              },
              onFieldSubmitted: (_) => _submit(),
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              _ErrorBanner(message: _error!),
            ],
            const SizedBox(height: 28),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      height: 22,
                      width: 22,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Daxil ol'),
            ),
            const SizedBox(height: 16),
            TextButton(
              onPressed: () => context.go('/register'),
              child: const Text('Hesabınız yoxdur? Qeydiyyatdan keçin'),
            ),
            const SizedBox(height: 8),
            Center(
              child: Text(
                AppConfig.apiOrigin,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.muted),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.danger.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.danger.withValues(alpha: 0.25)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline, color: AppColors.danger, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(message, style: const TextStyle(color: AppColors.danger, height: 1.35)),
          ),
        ],
      ),
    );
  }
}
