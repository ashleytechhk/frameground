import 'dart:async';

import 'package:flutter/material.dart';

import '../theme.dart';

class DemoPage extends StatelessWidget {
  const DemoPage({
    super.key,
    required this.eyebrow,
    required this.title,
    required this.subtitle,
    required this.child,
  });

  final String eyebrow;
  final String title;
  final String subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return ColoredBox(
      color: DemoPalette.canvas,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 22, 24, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                eyebrow.toUpperCase(),
                style: const TextStyle(
                  color: DemoPalette.indigo,
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.45,
                ),
              ),
              const SizedBox(height: 10),
              Text(title, style: textTheme.headlineMedium),
              const SizedBox(height: 9),
              Text(subtitle, style: textTheme.bodyMedium),
              const Padding(
                padding: EdgeInsets.only(top: 5),
                child: Text(
                  'Shared canvas shell',
                  style: TextStyle(
                    color: DemoPalette.muted,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Expanded(child: child),
            ],
          ),
        ),
      ),
    );
  }
}

class GlassCard extends StatelessWidget {
  const GlassCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.color,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? DemoPalette.card,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: DemoPalette.line),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0D20233A),
            blurRadius: 18,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: child,
    );
  }
}

class StaggeredEntrance extends StatefulWidget {
  const StaggeredEntrance({
    super.key,
    required this.child,
    this.delay = Duration.zero,
  });

  final Widget child;
  final Duration delay;

  @override
  State<StaggeredEntrance> createState() => _StaggeredEntranceState();
}

class _StaggeredEntranceState extends State<StaggeredEntrance> {
  var _visible = false;

  @override
  void initState() {
    super.initState();
    unawaited(_show());
  }

  Future<void> _show() async {
    await Future<void>.delayed(widget.delay);
    if (mounted) {
      setState(() => _visible = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedSlide(
      offset: _visible ? Offset.zero : const Offset(0, 0.08),
      duration: const Duration(milliseconds: 520),
      curve: Curves.easeOutCubic,
      child: AnimatedOpacity(
        opacity: _visible ? 1 : 0,
        duration: const Duration(milliseconds: 430),
        curve: Curves.easeOut,
        child: widget.child,
      ),
    );
  }
}

class PulseRing extends StatefulWidget {
  const PulseRing({
    super.key,
    required this.icon,
    required this.color,
    this.size = 104,
  });

  final IconData icon;
  final Color color;
  final double size;

  @override
  State<PulseRing> createState() => _PulseRingState();
}

class _PulseRingState extends State<PulseRing>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1500),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final scale = 1.0 + _controller.value * 0.075;
        return Transform.scale(scale: scale, child: child);
      },
      child: Container(
        width: widget.size,
        height: widget.size,
        decoration: BoxDecoration(
          color: widget.color.withOpacity(0.13),
          shape: BoxShape.circle,
        ),
        child: Center(
          child: Container(
            width: widget.size * 0.66,
            height: widget.size * 0.66,
            decoration: BoxDecoration(
              color: widget.color,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: widget.color.withOpacity(0.30),
                  blurRadius: 22,
                  spreadRadius: 3,
                ),
              ],
            ),
            child: Icon(
              widget.icon,
              color: Colors.white,
              size: widget.size * 0.30,
            ),
          ),
        ),
      ),
    );
  }
}

class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    this.onTap,
  });

  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 54,
      child: FilledButton(
        onPressed: onTap ?? () {},
        style: FilledButton.styleFrom(
          backgroundColor: DemoPalette.indigo,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(17),
          ),
        ),
        child: Text(
          label,
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
      ),
    );
  }
}

class MetricProgress extends StatelessWidget {
  const MetricProgress({
    super.key,
    required this.value,
    required this.color,
  });

  final double value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0.0, end: value),
      duration: const Duration(milliseconds: 900),
      curve: Curves.easeOutCubic,
      builder: (context, animatedValue, child) {
        return ClipRRect(
          borderRadius: BorderRadius.circular(99),
          child: LinearProgressIndicator(
            minHeight: 9,
            value: animatedValue,
            color: color,
            backgroundColor: color.withOpacity(0.14),
          ),
        );
      },
    );
  }
}
