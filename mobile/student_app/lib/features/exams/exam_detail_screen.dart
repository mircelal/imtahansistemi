import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:student_app/core/api_errors.dart';
import 'package:student_app/core/az_geo.dart';
import 'package:student_app/core/repositories.dart';
import 'package:student_app/design/theme.dart';
import 'package:student_app/features/auth/auth_controller.dart';

class ExamDetailScreen extends ConsumerStatefulWidget {
  const ExamDetailScreen({super.key, required this.examId});
  final int examId;

  @override
  ConsumerState<ExamDetailScreen> createState() => _ExamDetailScreenState();
}

class _ExamDetailScreenState extends ConsumerState<ExamDetailScreen> {
  bool _buying = false;
  String? _error;

  Future<void> _buy(int ticketId) async {
    setState(() {
      _buying = true;
      _error = null;
    });
    try {
      final result = await ref.read(catalogRepositoryProvider).checkout(ticketId);
      final uri = Uri.parse(result.checkoutUrl);
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && mounted) {
        setState(() => _error = 'Ödəniş səhifəsi açıla bilmədi');
      } else {
        ref.invalidate(profileProvider);
      }
    } catch (e) {
      setState(() => _error = apiErrorMessage(e, fallback: 'Ödəniş başladılmadı'));
    } finally {
      if (mounted) setState(() => _buying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder(
      future: ref.read(catalogRepositoryProvider).examDetail(widget.examId),
      builder: (context, snap) {
        if (!snap.hasData) {
          return Scaffold(
            appBar: AppBar(),
            body: Center(
              child: snap.hasError ? const Text('Tapılmadı') : const CircularProgressIndicator(),
            ),
          );
        }
        final e = snap.data!;
        final fmt = DateFormat('dd MMMM yyyy, HH:mm', 'az');
        final place = [e.venueName ?? e.city, e.areaName, e.regionName]
            .whereType<String>()
            .where((s) => s.isNotEmpty)
            .join(' · ');
        final hasMap = AzGeo.resolve(
              latitude: e.latitude,
              longitude: e.longitude,
              regionName: e.regionName,
              areaName: e.areaName,
              city: e.city,
              venueName: e.venueName,
            ) !=
            null;

        return Scaffold(
          appBar: AppBar(title: Text(e.title)),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 36),
            children: [
              if (e.lifecycleStatus != null)
                Align(
                  alignment: Alignment.centerLeft,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: e.lifecycleStatus == 'live'
                          ? AppColors.success.withValues(alpha: 0.12)
                          : AppColors.accentSoft,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      e.lifecycleStatus == 'live' ? 'Qeydiyyat açıq' : 'Planlaşdırılıb',
                      style: TextStyle(
                        color: e.lifecycleStatus == 'live' ? AppColors.success : const Color(0xFF8A6A00),
                        fontWeight: FontWeight.w700,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ),
              if ((e.description ?? '').isNotEmpty) ...[
                const SizedBox(height: 14),
                Text(e.description!, style: const TextStyle(height: 1.45, fontSize: 15)),
              ],
              const SizedBox(height: 16),
              if (e.scheduledAt != null)
                _MetaRow(Icons.schedule, fmt.format(e.scheduledAt!.toLocal())),
              if (place.isNotEmpty) _MetaRow(Icons.place_outlined, place),
              if (hasMap) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: () => context.go('/map'),
                  icon: const Icon(Icons.map_outlined),
                  label: const Text('Xəritədə göstər'),
                ),
              ],
              const SizedBox(height: 24),
              Text(
                'Bilet seçin',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 10),
              if (e.tickets.isEmpty)
                const Text('Hazırda satışda bilet yoxdur', style: TextStyle(color: AppColors.muted))
              else
                ...e.tickets.map(
                  (t) => Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
                    decoration: BoxDecoration(
                      color: AppColors.card,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppColors.line),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(t.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                              const SizedBox(height: 4),
                              Text(
                                [
                                  '${t.priceAmount.toStringAsFixed(2)} ${t.currency}',
                                  if (t.remainingQuota != null) 'Qalıq: ${t.remainingQuota}',
                                ].join(' · '),
                                style: const TextStyle(color: AppColors.muted, fontSize: 13),
                              ),
                            ],
                          ),
                        ),
                        FilledButton(
                          onPressed: _buying || t.saleStatus == 'sold_out' ? null : () => _buy(t.id),
                          child: Text(t.saleStatus == 'sold_out' ? 'Bitib' : 'Bilet al'),
                        ),
                      ],
                    ),
                  ),
                ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: const TextStyle(color: AppColors.danger)),
              ],
              const SizedBox(height: 16),
              const Text(
                'Ödənişdən əvvəl qiymət və kontingenti yoxlayın. Uğurlu ödənişdən sonra bilet «Biletlər» bölməsində və QR ilə görünəcək.',
                style: TextStyle(color: AppColors.muted, height: 1.4, fontSize: 13),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow(this.icon, this.text);
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: AppColors.muted),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: const TextStyle(height: 1.35))),
        ],
      ),
    );
  }
}
