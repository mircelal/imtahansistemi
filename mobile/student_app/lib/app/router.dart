import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:student_app/core/models.dart';
import 'package:student_app/features/auth/auth_controller.dart';
import 'package:student_app/features/auth/login_screen.dart';
import 'package:student_app/features/auth/onboarding_screen.dart';
import 'package:student_app/features/auth/register_screen.dart';
import 'package:student_app/features/auth/splash_screen.dart';
import 'package:student_app/features/checkout/payment_return_screen.dart';
import 'package:student_app/features/exams/exam_detail_screen.dart';
import 'package:student_app/features/exams/exams_map_screen.dart';
import 'package:student_app/features/exams/exams_screen.dart';
import 'package:student_app/features/home/home_screen.dart';
import 'package:student_app/features/profile/profile_screen.dart';
import 'package:student_app/features/results/result_detail_screen.dart';
import 'package:student_app/features/results/results_screen.dart';
import 'package:student_app/features/shell/main_shell.dart';
import 'package:student_app/features/tickets/tickets_screen.dart';

final _rootKey = GlobalKey<NavigatorState>();

/// Single GoRouter instance — do NOT recreate on auth changes (that reset nav to welcome).
final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _AuthRefresh(ref);

  return GoRouter(
    navigatorKey: _rootKey,
    initialLocation: '/splash',
    refreshListenable: refresh,
    redirect: (context, state) {
      final auth = ref.read(authStateProvider);
      final loc = state.matchedLocation;
      final isSplash = loc == '/splash';
      final isPublic = loc == '/login' || loc == '/register' || loc == '/onboarding';
      final isPaymentReturn = loc == '/payments/return';

      if (auth.isLoading) {
        return isSplash ? null : (isPublic ? null : '/splash');
      }

      final signedIn = auth.asData?.value != null;

      if (isSplash) {
        return signedIn ? '/home' : '/onboarding';
      }

      if (!signedIn && !isPublic && !isPaymentReturn) {
        return '/onboarding';
      }

      if (signedIn && isPublic) {
        return '/home';
      }

      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (context, state) => const SplashScreen()),
      GoRoute(path: '/onboarding', builder: (context, state) => const OnboardingScreen()),
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/register', builder: (context, state) => const RegisterScreen()),
      GoRoute(
        path: '/payments/return',
        builder: (context, state) => PaymentReturnScreen(
          intentId: state.uri.queryParameters['intent'],
          paid: state.uri.queryParameters['paid'] == '1',
        ),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) => MainShell(shell: navigationShell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(path: '/home', builder: (context, state) => const HomeScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/exams',
              builder: (context, state) => const ExamsScreen(),
              routes: [
                GoRoute(
                  path: ':id',
                  builder: (context, state) =>
                      ExamDetailScreen(examId: int.parse(state.pathParameters['id']!)),
                ),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/map', builder: (context, state) => const ExamsMapScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/tickets', builder: (context, state) => const TicketsScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/results',
              builder: (context, state) => const ResultsScreen(),
              routes: [
                GoRoute(
                  path: ':examId',
                  builder: (context, state) =>
                      ResultDetailScreen(examId: int.parse(state.pathParameters['examId']!)),
                ),
              ],
            ),
          ]),
        ],
      ),
      GoRoute(path: '/profile', builder: (context, state) => const ProfileScreen()),
    ],
  );
});

class _AuthRefresh extends ChangeNotifier {
  _AuthRefresh(this.ref) {
    ref.listen<AsyncValue<UserMe?>>(authStateProvider, (_, __) {
      notifyListeners();
    });
  }

  final Ref ref;
}
