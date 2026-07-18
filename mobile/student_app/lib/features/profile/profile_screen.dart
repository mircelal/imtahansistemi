import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:student_app/core/api_client.dart';
import 'package:student_app/core/api_errors.dart';
import 'package:student_app/core/models.dart';
import 'package:student_app/core/repositories.dart';
import 'package:student_app/design/theme.dart';
import 'package:student_app/features/auth/auth_controller.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _saving = false;
  bool _uploading = false;
  int _avatarEpoch = 0;

  Future<Map<String, String>> _authHeaders() async {
    final token = await ref.read(tokenStoreProvider).getAccess();
    if (token == null || token.isEmpty) return {};
    return {'Authorization': 'Bearer $token'};
  }

  Future<void> _pickAvatar() async {
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1200,
      maxHeight: 1200,
      imageQuality: 85,
    );
    if (file == null) return;
    setState(() => _uploading = true);
    try {
      final bytes = await file.readAsBytes();
      final name = file.name.toLowerCase();
      final ct = name.endsWith('.png')
          ? 'image/png'
          : name.endsWith('.webp')
              ? 'image/webp'
              : 'image/jpeg';
      await ref.read(portalRepositoryProvider).uploadAvatar(
            bytes,
            filename: file.name.isEmpty ? 'avatar.jpg' : file.name,
            contentType: ct,
          );
      ref.invalidate(authStateProvider);
      ref.invalidate(profileProvider);
      setState(() => _avatarEpoch++);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profil fotosu yeniləndi')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(apiErrorMessage(e, fallback: 'Foto yüklənmədi'))),
        );
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _editProfile(StudentProfile p) async {
    final nameCtrl = TextEditingController(text: p.fullName);
    final phoneCtrl = TextEditingController(text: p.phone ?? '');
    final schoolCtrl = TextEditingController(text: p.schoolName ?? '');
    final gradeCtrl = TextEditingController(text: p.gradeLabel ?? '');
    final bioCtrl = TextEditingController(text: p.bio ?? '');
    int? regionId = p.preferredRegionId;
    int? areaId = p.preferredAreaId;

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setModal) {
            final regions = ref.watch(regionsProvider);
            final areas = regionId == null ? null : ref.watch(areasProvider(regionId!));
            return Padding(
              padding: EdgeInsets.fromLTRB(
                20,
                8,
                20,
                MediaQuery.of(ctx).viewInsets.bottom + 24,
              ),
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Profili redaktə et',
                      style: Theme.of(ctx).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: nameCtrl,
                      decoration: const InputDecoration(labelText: 'Ad, soyad'),
                      textCapitalization: TextCapitalization.words,
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: phoneCtrl,
                      decoration: const InputDecoration(labelText: 'Telefon'),
                      keyboardType: TextInputType.phone,
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: schoolCtrl,
                      decoration: const InputDecoration(labelText: 'Məktəb / kurs'),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: gradeCtrl,
                      decoration: const InputDecoration(labelText: 'Sinif / kurs səviyyəsi'),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: bioCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Qısa bio',
                        alignLabelWithHint: true,
                      ),
                      maxLines: 3,
                      maxLength: 280,
                    ),
                    const SizedBox(height: 8),
                    regions.when(
                      data: (list) => DropdownButtonFormField<int?>(
                        key: ValueKey('edit-reg-$regionId'),
                        initialValue: regionId,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Üstünlük verdiyi bölgə'),
                        items: [
                          const DropdownMenuItem(value: null, child: Text('Seçilməyib')),
                          ...list.map((r) => DropdownMenuItem(value: r.id, child: Text(r.name))),
                        ],
                        onChanged: (v) => setModal(() {
                          regionId = v;
                          areaId = null;
                        }),
                      ),
                      loading: () => const LinearProgressIndicator(),
                      error: (_, __) => const SizedBox.shrink(),
                    ),
                    if (areas != null) ...[
                      const SizedBox(height: 12),
                      areas.when(
                        data: (list) => DropdownButtonFormField<int?>(
                          key: ValueKey('edit-area-$areaId-$regionId'),
                          initialValue: areaId,
                          isExpanded: true,
                          decoration: const InputDecoration(labelText: 'Ərazi'),
                          items: [
                            const DropdownMenuItem(value: null, child: Text('Seçilməyib')),
                            ...list.map((a) => DropdownMenuItem(value: a.id, child: Text(a.name))),
                          ],
                          onChanged: (v) => setModal(() => areaId = v),
                        ),
                        loading: () => const SizedBox.shrink(),
                        error: (_, __) => const SizedBox.shrink(),
                      ),
                    ],
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      child: const Text('Yadda saxla'),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    if (saved != true) return;
    setState(() => _saving = true);
    try {
      await ref.read(portalRepositoryProvider).updateProfile(
            fullName: nameCtrl.text.trim(),
            phone: phoneCtrl.text.trim(),
            schoolName: schoolCtrl.text.trim(),
            gradeLabel: gradeCtrl.text.trim(),
            bio: bioCtrl.text.trim(),
            preferredRegionId: regionId,
            preferredAreaId: areaId,
          );
      ref.invalidate(authStateProvider);
      ref.invalidate(profileProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profil yeniləndi')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(apiErrorMessage(e, fallback: 'Saxlanılmadı'))),
        );
      }
    } finally {
      nameCtrl.dispose();
      phoneCtrl.dispose();
      schoolCtrl.dispose();
      gradeCtrl.dispose();
      bioCtrl.dispose();
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authStateProvider).asData?.value;
    final profile = ref.watch(profileProvider);
    final avatarUrl =
        '${ref.read(portalRepositoryProvider).avatarUrl()}?v=$_avatarEpoch';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Profil'),
        actions: [
          if (profile.asData != null)
            TextButton(
              onPressed: _saving ? null : () => _editProfile(profile.asData!.value),
              child: const Text('Redaktə'),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          Center(
            child: Column(
              children: [
                Stack(
                  children: [
                    FutureBuilder<Map<String, String>>(
                      future: _authHeaders(),
                      builder: (context, snap) {
                        final headers = snap.data ?? {};
                        final hasAvatar = (user?.hasAvatar ?? false) ||
                            (profile.asData?.value.hasAvatar ?? false);
                        return CircleAvatar(
                          radius: 52,
                          backgroundColor: AppColors.brandSoft,
                          backgroundImage: hasAvatar
                              ? NetworkImage(avatarUrl, headers: headers)
                              : null,
                          child: hasAvatar
                              ? null
                              : Text(
                                  _initial(user?.fullName ?? profile.asData?.value.fullName),
                                  style: const TextStyle(
                                    fontSize: 36,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.brand,
                                  ),
                                ),
                        );
                      },
                    ),
                    Positioned(
                      right: 0,
                      bottom: 0,
                      child: Material(
                        color: AppColors.brand,
                        shape: const CircleBorder(),
                        child: InkWell(
                          customBorder: const CircleBorder(),
                          onTap: _uploading ? null : _pickAvatar,
                          child: Padding(
                            padding: const EdgeInsets.all(8),
                            child: _uploading
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Icon(Icons.camera_alt_rounded, size: 18, color: Colors.white),
                          ),
                        ),
                      ),
                    ),
                  ],
                ).animate().fadeIn().scale(begin: const Offset(0.94, 0.94)),
                const SizedBox(height: 14),
                Text(
                  user?.fullName ?? profile.asData?.value.fullName ?? '',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 4),
                Text(
                  user?.email ?? profile.asData?.value.email ?? '',
                  style: const TextStyle(color: AppColors.muted),
                ),
                if ((user?.finCode ?? profile.asData?.value.finCode) != null) ...[
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppColors.brandSoft,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      'FIN · ${user?.finCode ?? profile.asData?.value.finCode}',
                      style: const TextStyle(
                        color: AppColors.brand,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 28),
          profile.when(
            data: (p) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if ((p.bio ?? '').isNotEmpty ||
                    (p.schoolName ?? '').isNotEmpty ||
                    (p.gradeLabel ?? '').isNotEmpty ||
                    (p.phone ?? '').isNotEmpty) ...[
                  _InfoCard(
                    title: 'Şəxsi məlumat',
                    children: [
                      if ((p.bio ?? '').isNotEmpty) _InfoRow(Icons.info_outline, p.bio!),
                      if ((p.schoolName ?? '').isNotEmpty)
                        _InfoRow(Icons.school_outlined, p.schoolName!),
                      if ((p.gradeLabel ?? '').isNotEmpty)
                        _InfoRow(Icons.badge_outlined, p.gradeLabel!),
                      if ((p.phone ?? '').isNotEmpty)
                        _InfoRow(Icons.phone_outlined, p.phone!),
                    ],
                  ),
                  const SizedBox(height: 14),
                ],
                _InfoCard(
                  title: 'Təhsil statistikası',
                  children: [
                    _StatRow(
                      label: 'Ortalama',
                      value: p.averagePercent != null
                          ? '${p.averagePercent!.toStringAsFixed(1)}%'
                          : '—',
                    ),
                    _StatRow(label: 'Səviyyə', value: p.performanceBand ?? '—'),
                    _StatRow(label: 'Biletlər', value: '${p.registrations.length}'),
                    _StatRow(label: 'Nəticələr', value: '${p.results.length}'),
                  ],
                ),
                const SizedBox(height: 14),
                _InfoCard(
                  title: 'Təhlükəsizlik və məxfilik',
                  children: const [
                    Text(
                      'FIN və ödəniş məlumatları şifrələnmiş kanallarla ötürülür. '
                      'Cihaz sessiyası refresh token ilə idarə olunur. '
                      'SİMA ilə rəqəmsal imza girişi tezliklə aktiv olacaq.',
                      style: TextStyle(color: AppColors.muted, height: 1.45),
                    ),
                  ],
                ),
              ],
            ).animate().fadeIn(delay: 80.ms),
            loading: () => const Padding(
              padding: EdgeInsets.all(32),
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (e, _) => Text('Profil yüklənmədi: $e'),
          ),
          const SizedBox(height: 28),
          FilledButton.tonal(
            onPressed: () async {
              await ref.read(authStateProvider.notifier).logout();
              if (context.mounted) context.go('/onboarding');
            },
            child: const Text('Çıxış'),
          ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: () async {
              final ok = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: const Text('Hesabı sil'),
                  content: const Text(
                    'Bütün biletlər, nəticələr və profil məlumatları silinəcək. Bu geri qaytarılmır.',
                  ),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Xeyr')),
                    TextButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      child: Text('Sil', style: TextStyle(color: Theme.of(ctx).colorScheme.error)),
                    ),
                  ],
                ),
              );
              if (ok == true) {
                await ref.read(authStateProvider.notifier).deleteAccount();
                if (context.mounted) context.go('/onboarding');
              }
            },
            child: Text(
              'Hesabı sil',
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        ],
      ),
    );
  }

  String _initial(String? name) {
    final t = (name ?? '').trim();
    if (t.isEmpty) return 'Ş';
    return t.characters.first.toUpperCase();
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow(this.icon, this.text);
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: AppColors.muted),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: const TextStyle(height: 1.35))),
        ],
      ),
    );
  }
}

class _StatRow extends StatelessWidget {
  const _StatRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Text(label, style: const TextStyle(color: AppColors.muted)),
          const Spacer(),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
