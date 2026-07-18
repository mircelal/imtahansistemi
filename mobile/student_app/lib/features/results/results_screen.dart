import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:student_app/design/theme.dart';
import 'package:student_app/features/auth/auth_controller.dart';
import 'package:student_app/features/shell/main_shell.dart';

class ResultsScreen extends ConsumerWidget {
  const ResultsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(profileProvider);
    return Scaffold(
      appBar: studentAppBar(context, 'Nəticələr'),
      body: profile.when(
        data: (p) {
          if (p.results.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Text(
                  'Nəticə hələ yoxdur.\nİmtahan bitəndən sonra burada görünəcək.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.muted, height: 1.4),
                ),
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
            itemCount: p.results.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, i) {
              final r = p.results[i];
              final percent = r['percent'];
              final examId = r['exam_id'] as int?;
              final pct = percent is num ? percent.toDouble() : null;
              return Material(
                color: AppColors.card,
                borderRadius: BorderRadius.circular(18),
                child: InkWell(
                  borderRadius: BorderRadius.circular(18),
                  onTap: examId == null ? null : () => context.push('/results/$examId'),
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: AppColors.line),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 52,
                          height: 52,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: AppColors.brandSoft,
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Text(
                            pct != null ? '${pct.toStringAsFixed(0)}%' : '—',
                            style: const TextStyle(
                              color: AppColors.brand,
                              fontWeight: FontWeight.w800,
                              fontSize: 13,
                            ),
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                r['exam_title'] as String? ?? 'İmtahan',
                                style: const TextStyle(fontWeight: FontWeight.w800),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                r['exam_scope_label'] as String? ?? 'Detallı nəticəyə bax',
                                style: const TextStyle(color: AppColors.muted, fontSize: 13),
                              ),
                            ],
                          ),
                        ),
                        const Icon(Icons.chevron_right, color: AppColors.muted),
                      ],
                    ),
                  ),
                ),
              ).animate().fadeIn(delay: (40 * i).ms);
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
      ),
    );
  }
}
