import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:student_app/core/models.dart';
import 'package:student_app/design/theme.dart';
import 'package:student_app/features/auth/auth_controller.dart';
import 'package:student_app/features/shell/main_shell.dart';

class TicketsScreen extends ConsumerWidget {
  const TicketsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(profileProvider);
    return profile.when(
      data: (p) {
        final regs = p.registrations;
        return Scaffold(
          appBar: studentAppBar(context, 'Biletlərim'),
          body: regs.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.confirmation_number_outlined, size: 48, color: AppColors.muted),
                        const SizedBox(height: 12),
                        const Text(
                          'Hələ bilet yoxdur',
                          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Xəritədən və ya siyahıdan imtahan seçib bilet ala bilərsiniz.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: AppColors.muted),
                        ),
                        const SizedBox(height: 16),
                        FilledButton(
                          onPressed: () => context.go('/exams'),
                          child: const Text('İmtahanlara bax'),
                        ),
                      ],
                    ),
                  ),
                )
              : RefreshIndicator(
                  onRefresh: () async => ref.invalidate(profileProvider),
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
                    itemCount: regs.length,
                    itemBuilder: (context, i) => _AdmitCard(reg: regs[i])
                        .animate()
                        .fadeIn(delay: (40 * i).ms)
                        .slideY(begin: 0.05, end: 0),
                  ),
                ),
        );
      },
      loading: () => Scaffold(
        appBar: studentAppBar(context, 'Biletlərim'),
        body: const Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Scaffold(
        appBar: studentAppBar(context, 'Biletlərim'),
        body: Center(child: Text('$e')),
      ),
    );
  }
}

class _AdmitCard extends StatelessWidget {
  const _AdmitCard({required this.reg});
  final Registration reg;

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('dd MMM yyyy · HH:mm', 'az');
    final confirmed = reg.status == 'confirmed';
    final statusLabel = switch (reg.status) {
      'confirmed' => 'Təsdiqlənib',
      'pending' => 'Gözləyir',
      'cancelled' => 'Ləğv',
      _ => reg.status,
    };
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  reg.examTitle ?? reg.ticketTitle,
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: confirmed ? AppColors.brandSoft : AppColors.accentSoft,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  statusLabel,
                  style: TextStyle(
                    color: confirmed ? AppColors.brand : const Color(0xFF8A6A00),
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (reg.scheduledAt != null)
            Row(
              children: [
                const Icon(Icons.schedule, size: 16, color: AppColors.muted),
                const SizedBox(width: 6),
                Text(fmt.format(reg.scheduledAt!.toLocal()), style: const TextStyle(color: AppColors.muted)),
              ],
            ),
          if (reg.venueLabel != null || reg.city != null) ...[
            const SizedBox(height: 4),
            Row(
              children: [
                const Icon(Icons.place_outlined, size: 16, color: AppColors.muted),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    [reg.city, reg.venueLabel].whereType<String>().join(' · '),
                    style: const TextStyle(color: AppColors.muted),
                  ),
                ),
              ],
            ),
          ],
          if (confirmed && reg.admitQrPayload != null) ...[
            const SizedBox(height: 16),
            Center(
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.line),
                ),
                child: QrImageView(
                  data: reg.admitQrPayload!,
                  size: 168,
                  backgroundColor: Colors.white,
                ),
              ),
            ),
            const SizedBox(height: 10),
            const Center(
              child: Text(
                'İmtahan zalında QR-ı göstərin',
                style: TextStyle(color: AppColors.muted, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
