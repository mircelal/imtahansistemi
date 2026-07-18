import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:student_app/design/theme.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _motion;
  late final Animation<double> _fade;
  late final Animation<Offset> _slide;

  @override
  void initState() {
    super.initState();
    _motion = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
    _fade = CurvedAnimation(parent: _motion, curve: Curves.easeOutCubic);
    _slide = Tween<Offset>(begin: const Offset(0, 0.08), end: Offset.zero).animate(
      CurvedAnimation(parent: _motion, curve: Curves.easeOutCubic),
    );
    _motion.forward();
  }

  @override
  void dispose() {
    _motion.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);

    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Atmosphere — full-bleed gradient plane (not a card collage)
          DecoratedBox(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Color(0xFF043A3A),
                  Color(0xFF0A6B6B),
                  Color(0xFF0E3D3D),
                ],
                stops: [0.0, 0.45, 1.0],
              ),
            ),
          ),
          // Soft radial light
          Positioned(
            top: -size.height * 0.15,
            right: -size.width * 0.2,
            child: IgnorePointer(
              child: Container(
                width: size.width * 0.9,
                height: size.width * 0.9,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      AppColors.accent.withValues(alpha: 0.22),
                      Colors.transparent,
                    ],
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            bottom: size.height * 0.28,
            left: -40,
            child: IgnorePointer(
              child: Container(
                width: 180,
                height: 180,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: 0.04),
                ),
              ),
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(28, 24, 28, 28),
              child: FadeTransition(
                opacity: _fade,
                child: SlideTransition(
                  position: _slide,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: Colors.white24),
                            ),
                            child: const Icon(Icons.menu_book_rounded, color: Colors.white, size: 22),
                          ),
                          const Spacer(),
                          Text(
                            'Şagird kabineti',
                            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                                  color: Colors.white70,
                                  letterSpacing: 0.3,
                                ),
                          ),
                        ],
                      ),
                      const Spacer(flex: 2),
                      Text(
                        'İmtahan',
                        style: Theme.of(context).textTheme.displayLarge?.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                              height: 1.0,
                              letterSpacing: -1.8,
                              fontSize: 56,
                            ),
                      ),
                      const SizedBox(height: 16),
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 340),
                        child: Text(
                          'Elan olunan imtahanları bölgənizə görə seçin, bilet alın və nəticələrinizi izləyin.',
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                color: Colors.white.withValues(alpha: 0.88),
                                height: 1.45,
                                fontWeight: FontWeight.w400,
                              ),
                        ),
                      ),
                      const SizedBox(height: 36),
                      _FeatureRow(
                        icon: Icons.place_outlined,
                        label: 'Bölgə və ərazi üzrə kataloq',
                      ),
                      const SizedBox(height: 12),
                      _FeatureRow(
                        icon: Icons.qr_code_2_rounded,
                        label: 'Rəqəmsal admit bileti',
                      ),
                      const SizedBox(height: 12),
                      _FeatureRow(
                        icon: Icons.insights_outlined,
                        label: 'Nəticə və inkişaf analitikas',
                      ),
                      const Spacer(flex: 3),
                      FilledButton(
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.accent,
                          foregroundColor: AppColors.ink,
                          minimumSize: const Size.fromHeight(54),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                          textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                        ),
                        onPressed: () => context.go('/register'),
                        child: const Text('Başla — Qeydiyyat'),
                      ),
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        height: 54,
                        child: OutlinedButton(
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.white,
                            side: BorderSide(color: Colors.white.withValues(alpha: 0.35)),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                            textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
                          ),
                          onPressed: () => context.go('/login'),
                          child: const Text('Artıq hesabım var'),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Center(
                        child: Text(
                          'FIN kodu ilə təhlükəsiz giriş',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: Colors.white54,
                              ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FeatureRow extends StatelessWidget {
  const _FeatureRow({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, color: AppColors.accent, size: 20),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            label,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: Colors.white.withValues(alpha: 0.9),
                  fontWeight: FontWeight.w500,
                ),
          ),
        ),
      ],
    );
  }
}
