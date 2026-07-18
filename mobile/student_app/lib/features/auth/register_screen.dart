import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:student_app/design/theme.dart';
import 'package:student_app/features/auth/auth_controller.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _fin = TextEditingController();
  final _name = TextEditingController();
  final _password = TextEditingController();
  final _email = TextEditingController();
  int? _regionId;
  int? _areaId;
  bool _obscure = true;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _fin.dispose();
    _name.dispose();
    _password.dispose();
    _email.dispose();
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
      await ref.read(authStateProvider.notifier).register(
            finCode: _fin.text.trim().toUpperCase(),
            fullName: _name.text.trim(),
            password: _password.text,
            email: _email.text.trim().isEmpty ? null : _email.text.trim(),
            preferredRegionId: _regionId,
            preferredAreaId: _areaId,
          );
      if (_regionId != null) {
        ref.read(filterRegionProvider.notifier).state = _regionId;
      }
      if (_areaId != null) {
        ref.read(filterAreaProvider.notifier).state = _areaId;
      }
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
    final regions = ref.watch(regionsProvider);
    final areas = _regionId == null ? null : ref.watch(areasProvider(_regionId!));

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
          onPressed: () => context.go('/onboarding'),
        ),
        title: const Text('Qeydiyyat'),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 40),
          children: [
            Text(
              'Hesab yaradın',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            Text(
              'FIN kodu ilə 1 dəqiqəyə qeydiyyatdan keçin. Sonra bölgənizə uyğun imtahanları görəcəksiniz.',
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: AppColors.muted, height: 1.4),
            ),
            const SizedBox(height: 28),
            Text(
              'Şəxsiyyət',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: AppColors.muted,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.4,
                  ),
            ),
            const SizedBox(height: 10),
            TextFormField(
              controller: _fin,
              textCapitalization: TextCapitalization.characters,
              maxLength: 7,
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9]')),
                LengthLimitingTextInputFormatter(7),
              ],
              decoration: const InputDecoration(
                labelText: 'FIN kodu',
                hintText: 'Məs: 1ABC2DE',
                counterText: '',
                prefixIcon: Icon(Icons.badge_outlined),
              ),
              validator: (v) {
                if (v == null || v.trim().length != 7) return 'FIN 7 simvol olmalıdır';
                return null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _name,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(
                labelText: 'Ad, soyad',
                prefixIcon: Icon(Icons.person_outline),
              ),
              validator: (v) {
                if (v == null || v.trim().length < 2) return 'Adınızı daxil edin';
                return null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _password,
              obscureText: _obscure,
              decoration: InputDecoration(
                labelText: 'Şifrə',
                helperText: 'Ən azı 6 simvol',
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
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(
                labelText: 'E-poçt (istəyə bağlı)',
                prefixIcon: Icon(Icons.mail_outline),
              ),
              validator: (v) {
                if (v != null && v.isNotEmpty && !v.contains('@')) {
                  return 'Düzgün e-poçt daxil edin';
                }
                return null;
              },
            ),
            const SizedBox(height: 28),
            Text(
              'Məkan',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: AppColors.muted,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.4,
                  ),
            ),
            const SizedBox(height: 10),
            regions.when(
              data: (list) => DropdownButtonFormField<int>(
                key: ValueKey('region-$_regionId'),
                initialValue: _regionId,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Bölgə',
                  prefixIcon: Icon(Icons.map_outlined),
                ),
                items: list
                    .map((r) => DropdownMenuItem(value: r.id, child: Text(r.name, overflow: TextOverflow.ellipsis)))
                    .toList(),
                onChanged: (v) => setState(() {
                  _regionId = v;
                  _areaId = null;
                }),
              ),
              loading: () => const LinearProgressIndicator(),
              error: (e, _) => Text(
                'Bölgələr yüklənmədi — sonra seçə bilərsiniz.\n$e',
                style: const TextStyle(color: AppColors.muted, fontSize: 13),
              ),
            ),
            if (areas != null) ...[
              const SizedBox(height: 12),
              areas.when(
                data: (list) => DropdownButtonFormField<int>(
                  key: ValueKey('area-$_areaId-$_regionId'),
                  initialValue: _areaId,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Ərazi',
                    prefixIcon: Icon(Icons.place_outlined),
                  ),
                  items: list
                      .map((a) => DropdownMenuItem(value: a.id, child: Text(a.name, overflow: TextOverflow.ellipsis)))
                      .toList(),
                  onChanged: (v) => setState(() => _areaId = v),
                ),
                loading: () => const LinearProgressIndicator(),
                error: (_, __) => const SizedBox.shrink(),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 16),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.danger.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.danger.withValues(alpha: 0.25)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.error_outline, color: AppColors.danger, size: 20),
                    const SizedBox(width: 10),
                    Expanded(child: Text(_error!, style: const TextStyle(color: AppColors.danger))),
                  ],
                ),
              ),
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
                  : const Text('Hesab yarat və davam et'),
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: () => context.go('/login'),
              child: const Text('Artıq hesabım var — Giriş'),
            ),
          ],
        ),
      ),
    );
  }
}
