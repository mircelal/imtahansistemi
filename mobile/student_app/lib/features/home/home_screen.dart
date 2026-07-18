import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:student_app/core/config.dart';
import 'package:student_app/core/api_client.dart';
import 'package:student_app/design/theme.dart';
import 'package:student_app/features/auth/auth_controller.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(profileProvider);
    final user = ref.watch(authStateProvider).asData?.value;
    final avatarUrl = '${AppConfig.apiOrigin}/api/me/student/avatar';

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(profileProvider),
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverAppBar(
            pinned: true,
            expandedHeight: 0,
            title: const Text('Kabinet'),
            actions: [
              IconButton(
                onPressed: () => context.push('/profile'),
                icon: FutureBuilder<String?>(
                  future: ref.read(tokenStoreProvider).getAccess(),
                  builder: (context, snap) {
                    final hasAvatar = user?.hasAvatar ?? false;
                    final token = snap.data;
                    return CircleAvatar(
                      radius: 16,
                      backgroundColor: AppColors.brandSoft,
                      backgroundImage: hasAvatar && token != null
                          ? NetworkImage(avatarUrl, headers: {'Authorization': 'Bearer $token'})
                          : null,
                      child: hasAvatar
                          ? null
                          : Text(
                              _initial(user?.fullName),
                              style: const TextStyle(
                                color: AppColors.brand,
                                fontWeight: FontWeight.w800,
                                fontSize: 13,
                              ),
                            ),
                    );
                  },
                ),
              ),
              const SizedBox(width: 8),
            ],
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 36),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                Text(
                  _greeting(user?.fullName),
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.5,
                      ),
                ).animate().fadeIn().slideY(begin: 0.08, end: 0),
                const SizedBox(height: 6),
                Text(
                  'İmtahan yolu — planlaşdır, bilet al, nəticəni izlə.',
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: AppColors.muted),
                ),
                const SizedBox(height: 20),
                Row(
                  children: [
                    Expanded(
                      child: _QuickAction(
                        icon: Icons.map_rounded,
                        label: 'Xəritədən seç',
                        color: AppColors.brand,
                        onTap: () => context.go('/map'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _QuickAction(
                        icon: Icons.near_me_rounded,
                        label: 'Yaxınımda',
                        color: AppColors.info,
                        onTap: () {
                          ref.read(useNearMeProvider.notifier).state = true;
                          context.go('/exams');
                        },
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _QuickAction(
                        icon: Icons.qr_code_2_rounded,
                        label: 'Biletlərim',
                        color: AppColors.accent,
                        onTap: () => context.go('/tickets'),
                      ),
                    ),
                  ],
                ).animate().fadeIn(delay: 80.ms),
                const SizedBox(height: 22),
                profile.when(
                  data: (p) {
                    final next = p.registrations
                        .where((r) => r.status == 'confirmed' && !r.hasResult)
                        .toList();
                    final fmt = DateFormat('dd MMM, HH:mm', 'az');
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (p.averagePercent != null || p.performanceBand != null)
                          _HeroStat(
                            percent: p.averagePercent,
                            band: p.performanceBand,
                            exams: p.results.length,
                            tickets: p.registrations.length,
                          ).animate().fadeIn(delay: 120.ms),
                        const SizedBox(height: 18),
                        _SectionTitle(
                          title: next.isEmpty ? 'Növbəti addım' : 'Növbəti imtahan',
                          action: 'Hamısı',
                          onAction: () => context.go(next.isEmpty ? '/exams' : '/tickets'),
                        ),
                        const SizedBox(height: 10),
                        if (next.isEmpty)
                          _EmptyCard(
                            title: 'Hələ bilet yoxdur',
                            body: 'Bölgəniz üzrə açıq imtahanları xəritədən və ya siyahıdan seçin.',
                            cta: 'İmtahanlara bax',
                            onTap: () => context.go('/exams'),
                          )
                        else
                          ...next.take(2).map(
                                (r) => Padding(
                                  padding: const EdgeInsets.only(bottom: 10),
                                  child: _NextExamTile(
                                    title: r.examTitle ?? r.ticketTitle,
                                    subtitle: [
                                      if (r.scheduledAt != null) fmt.format(r.scheduledAt!.toLocal()),
                                      if (r.venueLabel != null) r.venueLabel!,
                                    ].join(' · '),
                                    onTap: () => context.go('/tickets'),
                                  ),
                                ),
                              ),
                        if (p.insights.isNotEmpty) ...[
                          const SizedBox(height: 18),
                          const _SectionTitle(title: 'Şəxsi məsləhət'),
                          const SizedBox(height: 10),
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: AppColors.accentSoft,
                              borderRadius: BorderRadius.circular(18),
                              border: Border.all(color: const Color(0xFFE8D59A)),
                            ),
                            child: Text(
                              p.insights.first['message'] as String? ?? '',
                              style: const TextStyle(height: 1.4, fontWeight: FontWeight.w500),
                            ),
                          ),
                        ],
                      ],
                    );
                  },
                  loading: () => const Padding(
                    padding: EdgeInsets.all(40),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                  error: (e, _) => _EmptyCard(
                    title: 'Kabinet hazırlanır',
                    body: '$e',
                    cta: 'Yenilə',
                    onTap: () => ref.invalidate(profileProvider),
                  ),
                ),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  String _greeting(String? fullName) {
    final hour = DateTime.now().hour;
    final part = hour < 12 ? 'Sabahınız xeyir' : (hour < 18 ? 'Günortanız xeyir' : 'Axşamınız xeyir');
    final first = (fullName ?? '').trim().split(' ').first;
    return first.isEmpty ? part : '$part, $first';
  }

  String _initial(String? name) {
    final t = (name ?? '').trim();
    if (t.isEmpty) return 'Ş';
    return t.characters.first.toUpperCase();
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({required this.icon, required this.label, required this.color, required this.onTap});
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
          child: Column(
            children: [
              Icon(icon, color: color),
              const SizedBox(height: 6),
              Text(
                label,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: color),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeroStat extends StatelessWidget {
  const _HeroStat({this.percent, this.band, required this.exams, required this.tickets});
  final double? percent;
  final String? band;
  final int exams;
  final int tickets;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.brandDark, AppColors.brand],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(22),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Ortalama nəticə', style: TextStyle(color: Colors.white70)),
                const SizedBox(height: 4),
                Text(
                  percent != null ? '${percent!.toStringAsFixed(1)}%' : '—',
                  style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w800),
                ),
                if (band != null)
                  Text(band!, style: const TextStyle(color: AppColors.accent, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              _MiniStat(label: 'Nəticə', value: '$exams'),
              const SizedBox(height: 8),
              _MiniStat(label: 'Bilet', value: '$tickets'),
            ],
          ),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(label, style: const TextStyle(color: Colors.white70, fontSize: 11)),
          Text(value, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, this.action, this.onAction});
  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
        const Spacer(),
        if (action != null) TextButton(onPressed: onAction, child: Text(action!)),
      ],
    );
  }
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({required this.title, required this.body, required this.cta, required this.onTap});
  final String title;
  final String body;
  final String cta;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 6),
          Text(body, style: const TextStyle(color: AppColors.muted, height: 1.4)),
          const SizedBox(height: 12),
          FilledButton(onPressed: onTap, child: Text(cta)),
        ],
      ),
    );
  }
}

class _NextExamTile extends StatelessWidget {
  const _NextExamTile({required this.title, required this.subtitle, required this.onTap});
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: onTap,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: AppColors.line),
      ),
      tileColor: AppColors.card,
      leading: const CircleAvatar(
        backgroundColor: AppColors.brandSoft,
        child: Icon(Icons.event_available, color: AppColors.brand),
      ),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right),
    );
  }
}
