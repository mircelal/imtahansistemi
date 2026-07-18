import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:student_app/core/repositories.dart';

class ResultDetailScreen extends ConsumerWidget {
  const ResultDetailScreen({super.key, required this.examId});
  final int examId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FutureBuilder(
      future: ref.read(portalRepositoryProvider).examDetail(examId),
      builder: (context, snap) {
        if (!snap.hasData) {
          return Scaffold(
            appBar: AppBar(),
            body: Center(
              child: snap.hasError ? const Text('Tapılmadı') : const CircularProgressIndicator(),
            ),
          );
        }
        final d = snap.data!;
        final attempts = (d['attempts'] as List?) ?? [];
        return Scaffold(
          appBar: AppBar(title: Text(d['exam_title'] as String? ?? 'Nəticə')),
          body: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(
                'Ən yaxşı: ${(d['best_percent'] as num?)?.toStringAsFixed(1) ?? '—'}%',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              Text(
                'Reytinq: ${d['rank'] ?? '—'} / ${d['total_participants'] ?? '—'}'
                ' · Percentile: ${(d['percentile'] as num?)?.toStringAsFixed(0) ?? '—'}',
              ),
              const SizedBox(height: 20),
              Text('Cəhdlər', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
              ...attempts.map((a) {
                final m = a as Map<String, dynamic>;
                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('${(m['percent'] as num?)?.toStringAsFixed(1) ?? '—'}%'),
                  subtitle: Text(m['status'] as String? ?? ''),
                );
              }),
            ],
          ),
        );
      },
    );
  }
}
