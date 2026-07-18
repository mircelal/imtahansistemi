import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:student_app/design/theme.dart';

class MainShell extends StatelessWidget {
  const MainShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: shell.goBranch,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home_rounded),
            label: 'Kabinet',
          ),
          NavigationDestination(
            icon: Icon(Icons.menu_book_outlined),
            selectedIcon: Icon(Icons.menu_book_rounded),
            label: 'İmtahanlar',
          ),
          NavigationDestination(
            icon: Icon(Icons.map_outlined),
            selectedIcon: Icon(Icons.map_rounded),
            label: 'Xəritə',
          ),
          NavigationDestination(
            icon: Icon(Icons.confirmation_number_outlined),
            selectedIcon: Icon(Icons.confirmation_number_rounded),
            label: 'Biletlər',
          ),
          NavigationDestination(
            icon: Icon(Icons.insights_outlined),
            selectedIcon: Icon(Icons.insights_rounded),
            label: 'Nəticələr',
          ),
        ],
      ),
    );
  }
}

PreferredSizeWidget studentAppBar(BuildContext context, String title, {List<Widget>? actions}) {
  return AppBar(
    title: Text(title),
    actions: [
      ...?actions,
      Padding(
        padding: const EdgeInsets.only(right: 8),
        child: IconButton(
          tooltip: 'Profil',
          onPressed: () => context.push('/profile'),
          icon: Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: AppColors.brandSoft,
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.line),
            ),
            child: const Icon(Icons.person_rounded, size: 18, color: AppColors.brand),
          ),
        ),
      ),
    ],
  );
}
