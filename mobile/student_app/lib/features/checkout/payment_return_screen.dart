import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:student_app/core/api_client.dart';
import 'package:student_app/features/auth/auth_controller.dart';

class PaymentReturnScreen extends ConsumerStatefulWidget {
  const PaymentReturnScreen({super.key, this.intentId, required this.paid});
  final String? intentId;
  final bool paid;

  @override
  ConsumerState<PaymentReturnScreen> createState() => _PaymentReturnScreenState();
}

class _PaymentReturnScreenState extends ConsumerState<PaymentReturnScreen> {
  String? _status;

  @override
  void initState() {
    super.initState();
    _poll();
  }

  Future<void> _poll() async {
    if (widget.intentId == null) {
      setState(() => _status = widget.paid ? 'paid' : 'cancelled');
      return;
    }
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.get('/api/payments/intents/${widget.intentId}');
      setState(() => _status = res.data['status'] as String?);
      ref.invalidate(profileProvider);
    } catch (_) {
      setState(() => _status = widget.paid ? 'paid' : 'unknown');
    }
  }

  @override
  Widget build(BuildContext context) {
    final ok = _status == 'paid' || widget.paid;
    return Scaffold(
      appBar: AppBar(title: const Text('Ödəniş')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Icon(ok ? Icons.check_circle : Icons.info_outline, size: 64, color: ok ? Colors.green : Colors.orange),
            const SizedBox(height: 16),
            Text(
              ok ? 'Biletiniz hazırdır' : 'Ödəniş tamamlanmadı',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            Text(ok ? 'Admit kartınızı Biletlər bölməsində görə bilərsiniz.' : 'Yenidən cəhd edin və ya dəstəyə yazın.'),
            const Spacer(),
            FilledButton(
              onPressed: () => context.go(ok ? '/tickets' : '/exams'),
              child: Text(ok ? 'Biletlərə keç' : 'İmtahanlara qayıt'),
            ),
          ],
        ),
      ),
    );
  }
}
