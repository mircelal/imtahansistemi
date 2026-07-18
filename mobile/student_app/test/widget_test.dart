import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:student_app/features/auth/onboarding_screen.dart';
import 'package:flutter/material.dart';

void main() {
  testWidgets('Onboarding shows brand and CTAs', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: OnboardingScreen()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('İmtahan'), findsOneWidget);
    expect(find.textContaining('Qeydiyyat'), findsWidgets);
    expect(find.textContaining('hesabım var'), findsOneWidget);
  });
}
