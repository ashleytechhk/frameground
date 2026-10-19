import 'package:flutter/widgets.dart';

import 'screens.dart';

typedef PreviewBuilder = Widget Function();

class ScreenSpec {
  const ScreenSpec({
    required this.id,
    required this.canvasId,
    required this.name,
    required this.builder,
  });

  final String id;
  final String canvasId;
  final String name;
  final PreviewBuilder builder;
}

class PreviewCatalog {
  static final Map<String, ScreenSpec> _screens = {
    'welcome': ScreenSpec(
      id: 'welcome',
      canvasId: 'onboarding',
      name: 'Welcome',
      builder: WelcomeScreen.new,
    ),
    'permissions': ScreenSpec(
      id: 'permissions',
      canvasId: 'onboarding',
      name: 'Permissions',
      builder: PermissionsScreen.new,
    ),
    'plan': ScreenSpec(
      id: 'plan',
      canvasId: 'onboarding',
      name: 'Plan',
      builder: PlanScreen.new,
    ),
    'home': ScreenSpec(
      id: 'home',
      canvasId: 'main-flow',
      name: 'Home',
      builder: HomeScreen.new,
    ),
    'activity': ScreenSpec(
      id: 'activity',
      canvasId: 'main-flow',
      name: 'Activity',
      builder: ActivityScreen.new,
    ),
    'settings': ScreenSpec(
      id: 'settings',
      canvasId: 'main-flow',
      name: 'Settings',
      builder: SettingsScreen.new,
    ),
  };

  static String resolveId(String? requestedId) {
    return _screens.containsKey(requestedId) ? requestedId! : 'welcome';
  }

  static ScreenSpec byId(String id) => _screens[resolveId(id)]!;

  static Iterable<ScreenSpec> get all => _screens.values;
}
