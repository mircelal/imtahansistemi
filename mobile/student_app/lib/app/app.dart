import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:student_app/app/router.dart';
import 'package:student_app/design/theme.dart';

class StudentApp extends ConsumerStatefulWidget {
  const StudentApp({super.key});

  @override
  ConsumerState<StudentApp> createState() => _StudentAppState();
}

class _StudentAppState extends ConsumerState<StudentApp> {
  StreamSubscription<Uri>? _linkSub;

  @override
  void initState() {
    super.initState();
    final links = AppLinks();
    _linkSub = links.uriLinkStream.listen(_handleUri);
    links.getInitialLink().then((uri) {
      if (uri != null) _handleUri(uri);
    });
  }

  void _handleUri(Uri uri) {
    if (uri.scheme != 'imtahansistemi') return;
    if (uri.host == 'payments' && uri.path.startsWith('/return')) {
      final intent = uri.queryParameters['intent'];
      final paid = uri.queryParameters['paid'] ?? '0';
      final router = ref.read(routerProvider);
      router.go('/payments/return?intent=${intent ?? ''}&paid=$paid');
    }
  }

  @override
  void dispose() {
    _linkSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'İmtahan',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.system,
      locale: const Locale('az'),
      supportedLocales: const [Locale('az'), Locale('en'), Locale('ru')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      routerConfig: router,
    );
  }
}
