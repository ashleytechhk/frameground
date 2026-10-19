import 'dart:async';

import 'package:flutter/material.dart';

import 'theme.dart';
import 'widgets/demo_widgets.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DemoPage(
      eyebrow: 'A calmer day',
      title: 'Make a little room for focus.',
      subtitle: 'A tiny ritual for the moments you want to protect.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Spacer(flex: 2),
          const StaggeredEntrance(
            delay: Duration(milliseconds: 100),
            child: Column(
              children: [
                PulseRing(
                  icon: Icons.auto_awesome_rounded,
                  color: DemoPalette.indigo,
                  size: 122,
                ),
                SizedBox(height: 24),
                Text(
                  'Your space is waiting.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: DemoPalette.ink,
                    fontSize: 19,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                SizedBox(height: 8),
                Text(
                  'Start with one intentional minute.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: DemoPalette.muted, height: 1.4),
                ),
              ],
            ),
          ),
          const Spacer(flex: 3),
          const StaggeredEntrance(
            delay: Duration(milliseconds: 280),
            child: PrimaryButton(label: 'Let’s begin'),
          ),
          const SizedBox(height: 12),
          const Text(
            'Takes less than a minute',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: DemoPalette.muted,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class PermissionsScreen extends StatefulWidget {
  const PermissionsScreen({super.key});

  @override
  State<PermissionsScreen> createState() => _PermissionsScreenState();
}

class _PermissionsScreenState extends State<PermissionsScreen> {
  var _notifications = false;
  var _calendar = false;

  @override
  void initState() {
    super.initState();
    unawaited(_animateInitialState());
  }

  Future<void> _animateInitialState() async {
    await Future<void>.delayed(const Duration(milliseconds: 420));
    if (!mounted) return;
    setState(() => _notifications = true);
    await Future<void>.delayed(const Duration(milliseconds: 260));
    if (mounted) {
      setState(() => _calendar = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DemoPage(
      eyebrow: 'Set your rhythm',
      title: 'A gentle nudge, right on time.',
      subtitle: 'Choose the permissions that make this feel effortless.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const StaggeredEntrance(
            delay: Duration(milliseconds: 90),
            child: GlassCard(
              child: Row(
                children: [
                  _FeatureIcon(
                    icon: Icons.light_mode_rounded,
                    color: DemoPalette.violet,
                  ),
                  SizedBox(width: 13),
                  Expanded(
                    child: Text(
                      'Small reminders beat big resolutions.',
                      style: TextStyle(
                        color: DemoPalette.ink,
                        fontWeight: FontWeight.w700,
                        height: 1.25,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          StaggeredEntrance(
            delay: const Duration(milliseconds: 190),
            child: _PermissionTile(
              icon: Icons.notifications_none_rounded,
              title: 'Gentle reminders',
              subtitle: 'A quiet prompt when you need it.',
              enabled: _notifications,
              onChanged: (value) => setState(() => _notifications = value),
            ),
          ),
          const SizedBox(height: 12),
          StaggeredEntrance(
            delay: const Duration(milliseconds: 290),
            child: _PermissionTile(
              icon: Icons.calendar_today_outlined,
              title: 'Calendar rhythm',
              subtitle: 'Protect focus around your day.',
              enabled: _calendar,
              onChanged: (value) => setState(() => _calendar = value),
            ),
          ),
          const Spacer(),
          const StaggeredEntrance(
            delay: Duration(milliseconds: 390),
            child: PrimaryButton(label: 'Continue'),
          ),
        ],
      ),
    );
  }
}

class PlanScreen extends StatefulWidget {
  const PlanScreen({super.key});

  @override
  State<PlanScreen> createState() => _PlanScreenState();
}

class _PlanScreenState extends State<PlanScreen> {
  var _selectedPlan = 'monthly';

  @override
  void initState() {
    super.initState();
    unawaited(_chooseRecommendedPlan());
  }

  Future<void> _chooseRecommendedPlan() async {
    await Future<void>.delayed(const Duration(milliseconds: 620));
    if (mounted) {
      setState(() => _selectedPlan = 'yearly');
    }
  }

  @override
  Widget build(BuildContext context) {
    return DemoPage(
      eyebrow: 'Your pace, your plan',
      title: 'Keep the good momentum.',
      subtitle: 'Simple pricing, no pressure. Change or cancel whenever.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          StaggeredEntrance(
            delay: const Duration(milliseconds: 100),
            child: _PlanChoice(
              name: 'Monthly',
              price: 'HK\$38',
              detail: 'A flexible fresh start',
              selected: _selectedPlan == 'monthly',
              onTap: () => setState(() => _selectedPlan = 'monthly'),
            ),
          ),
          const SizedBox(height: 12),
          StaggeredEntrance(
            delay: const Duration(milliseconds: 220),
            child: _PlanChoice(
              name: 'Yearly',
              price: 'HK\$228',
              detail: 'Best value · 7 days free',
              selected: _selectedPlan == 'yearly',
              highlighted: true,
              onTap: () => setState(() => _selectedPlan = 'yearly'),
            ),
          ),
          const Spacer(),
          StaggeredEntrance(
            delay: const Duration(milliseconds: 360),
            child: PrimaryButton(
              label: _selectedPlan == 'yearly'
                  ? 'Start 7-day free trial'
                  : 'Continue monthly',
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'Restore purchases · Terms apply',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: DemoPalette.muted,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DemoPage(
      eyebrow: 'Tuesday, 9:41 AM',
      title: 'Good morning, Alex.',
      subtitle: 'You already made room for what matters.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const StaggeredEntrance(
            delay: Duration(milliseconds: 100),
            child: GlassCard(
              child: Row(
                children: [
                  PulseRing(
                    icon: Icons.favorite_rounded,
                    color: DemoPalette.mint,
                    size: 76,
                  ),
                  SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Today’s intention',
                          style: TextStyle(
                            color: DemoPalette.muted,
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        SizedBox(height: 5),
                        Text(
                          'Take a proper pause.',
                          style: TextStyle(
                            color: DemoPalette.ink,
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          const StaggeredEntrance(
            delay: Duration(milliseconds: 230),
            child: GlassCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'FOCUS STREAK',
                    style: TextStyle(
                      color: DemoPalette.indigo,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.2,
                    ),
                  ),
                  SizedBox(height: 9),
                  Text(
                    '5 of 7 days',
                    style: TextStyle(
                      color: DemoPalette.ink,
                      fontSize: 25,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  SizedBox(height: 14),
                  MetricProgress(value: 0.72, color: DemoPalette.indigo),
                ],
              ),
            ),
          ),
          const Spacer(),
          const StaggeredEntrance(
            delay: Duration(milliseconds: 350),
            child: PrimaryButton(label: 'Start a focus minute'),
          ),
        ],
      ),
    );
  }
}

class ActivityScreen extends StatefulWidget {
  const ActivityScreen({super.key});

  @override
  State<ActivityScreen> createState() => _ActivityScreenState();
}

class _ActivityScreenState extends State<ActivityScreen> {
  var _showBars = false;

  @override
  void initState() {
    super.initState();
    unawaited(_startBars());
  }

  Future<void> _startBars() async {
    await Future<void>.delayed(const Duration(milliseconds: 230));
    if (mounted) {
      setState(() => _showBars = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const List<double> values = [
      0.35,
      0.60,
      0.46,
      0.82,
      0.64,
      0.95,
      0.54,
    ];
    return DemoPage(
      eyebrow: 'Your week',
      title: 'A bit more present.',
      subtitle: 'You are building a steadier rhythm, one pause at a time.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const StaggeredEntrance(
            delay: Duration(milliseconds: 80),
            child: GlassCard(
              child: Row(
                children: [
                  _FeatureIcon(
                    icon: Icons.insights_rounded,
                    color: DemoPalette.indigo,
                  ),
                  SizedBox(width: 13),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '14 mindful minutes',
                          style: TextStyle(
                            color: DemoPalette.ink,
                            fontWeight: FontWeight.w800,
                            fontSize: 17,
                          ),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Up 18% from last week',
                          style: TextStyle(color: DemoPalette.muted),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 18),
          Expanded(
            child: StaggeredEntrance(
              delay: const Duration(milliseconds: 180),
              child: GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'A WEEK IN PAUSES',
                      style: TextStyle(
                        color: DemoPalette.muted,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.1,
                      ),
                    ),
                    const SizedBox(height: 18),
                    Expanded(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: List.generate(days.length, (index) {
                          final active = index == 5;
                          return Expanded(
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 4),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  AnimatedContainer(
                                    duration: Duration(
                                      milliseconds: 500 + index * 90,
                                    ),
                                    curve: Curves.easeOutBack,
                                    height: _showBars
                                        ? 30.0 + values[index] * 130
                                        : 12.0,
                                    decoration: BoxDecoration(
                                      color: active
                                          ? DemoPalette.violet
                                          : DemoPalette.indigo
                                              .withOpacity(0.22),
                                      borderRadius: BorderRadius.circular(18),
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  Text(
                                    days[index],
                                    style: TextStyle(
                                      color: active
                                          ? DemoPalette.violet
                                          : DemoPalette.muted,
                                      fontSize: 11,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        }),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 18),
          const StaggeredEntrance(
            delay: Duration(milliseconds: 350),
            child: PrimaryButton(label: 'View your patterns'),
          ),
        ],
      ),
    );
  }
}

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  var _reminders = false;
  var _sound = true;

  @override
  void initState() {
    super.initState();
    unawaited(_enableReminder());
  }

  Future<void> _enableReminder() async {
    await Future<void>.delayed(const Duration(milliseconds: 540));
    if (mounted) {
      setState(() => _reminders = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DemoPage(
      eyebrow: 'Your space',
      title: 'Make it feel like yours.',
      subtitle: 'A few small details can change the way a routine lands.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          StaggeredEntrance(
            delay: const Duration(milliseconds: 100),
            child: _SettingsCard(
              title: 'Gentle reminders',
              subtitle: 'A quiet afternoon nudge',
              icon: Icons.notifications_none_rounded,
              value: _reminders,
              onChanged: (value) => setState(() => _reminders = value),
            ),
          ),
          const SizedBox(height: 12),
          StaggeredEntrance(
            delay: const Duration(milliseconds: 210),
            child: _SettingsCard(
              title: 'Ambient sound',
              subtitle: 'Soft rain for focus sessions',
              icon: Icons.graphic_eq_rounded,
              value: _sound,
              onChanged: (value) => setState(() => _sound = value),
            ),
          ),
          const SizedBox(height: 12),
          const StaggeredEntrance(
            delay: Duration(milliseconds: 310),
            child: GlassCard(
              child: Row(
                children: [
                  _FeatureIcon(
                    icon: Icons.lock_outline_rounded,
                    color: DemoPalette.mint,
                  ),
                  SizedBox(width: 13),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Private by default',
                          style: TextStyle(
                            color: DemoPalette.ink,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Your moments stay on your device.',
                          style: TextStyle(color: DemoPalette.muted),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const Spacer(),
          const StaggeredEntrance(
            delay: Duration(milliseconds: 410),
            child: PrimaryButton(label: 'Save preferences'),
          ),
        ],
      ),
    );
  }
}

class _FeatureIcon extends StatelessWidget {
  const _FeatureIcon({required this.icon, required this.color});

  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(
        color: color.withOpacity(0.13),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Icon(icon, color: color),
    );
  }
}

class _PermissionTile extends StatelessWidget {
  const _PermissionTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.enabled,
    required this.onChanged,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool enabled;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: enabled ? DemoPalette.indigo.withOpacity(0.06) : Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: enabled ? DemoPalette.indigo.withOpacity(0.32) : DemoPalette.line,
        ),
      ),
      child: Row(
        children: [
          _FeatureIcon(
            icon: icon,
            color: enabled ? DemoPalette.indigo : DemoPalette.muted,
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: DemoPalette.ink,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  style: const TextStyle(
                    color: DemoPalette.muted,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          Switch(value: enabled, onChanged: onChanged),
        ],
      ),
    );
  }
}

class _PlanChoice extends StatelessWidget {
  const _PlanChoice({
    required this.name,
    required this.price,
    required this.detail,
    required this.selected,
    required this.onTap,
    this.highlighted = false,
  });

  final String name;
  final String price;
  final String detail;
  final bool selected;
  final VoidCallback onTap;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final accent = highlighted ? DemoPalette.violet : DemoPalette.indigo;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 360),
        curve: Curves.easeOutCubic,
        padding: const EdgeInsets.all(17),
        decoration: BoxDecoration(
          color: selected ? accent.withOpacity(0.10) : Colors.white,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(
            color: selected ? accent : DemoPalette.line,
            width: selected ? 2 : 1,
          ),
          boxShadow: selected
              ? [
                  BoxShadow(
                    color: accent.withOpacity(0.13),
                    blurRadius: 20,
                    offset: const Offset(0, 9),
                  ),
                ]
              : null,
        ),
        child: Row(
          children: [
            Icon(
              selected
                  ? Icons.radio_button_checked_rounded
                  : Icons.radio_button_off_rounded,
              color: selected ? accent : DemoPalette.muted,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    style: const TextStyle(
                      color: DemoPalette.ink,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    detail,
                    style: TextStyle(
                      color: selected ? accent : DemoPalette.muted,
                      fontSize: 12,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            Text(
              price,
              style: const TextStyle(
                color: DemoPalette.ink,
                fontWeight: FontWeight.w800,
                fontSize: 16,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SettingsCard extends StatelessWidget {
  const _SettingsCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.value,
    required this.onChanged,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 280),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: value ? DemoPalette.indigo.withOpacity(0.06) : Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: value ? DemoPalette.indigo.withOpacity(0.25) : DemoPalette.line,
        ),
      ),
      child: Row(
        children: [
          _FeatureIcon(
            icon: icon,
            color: value ? DemoPalette.indigo : DemoPalette.muted,
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: DemoPalette.ink,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  style: const TextStyle(
                    color: DemoPalette.muted,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          Switch(value: value, onChanged: onChanged),
        ],
      ),
    );
  }
}
