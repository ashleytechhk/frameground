import 'package:flutter/material.dart';

class DemoPalette {
  static const canvas = Color(0xFFF3F5FA);
  static const ink = Color(0xFF20233A);
  static const muted = Color(0xFF777B92);
  static const indigo = Color(0xFF665BFF);
  static const violet = Color(0xFF9E70FF);
  static const mint = Color(0xFF5DD7BF);
  static const card = Colors.white;
  static const line = Color(0xFFE6E8F0);
}

final ThemeData demoTheme = ThemeData(
  useMaterial3: true,
  colorScheme: ColorScheme.fromSeed(
    seedColor: DemoPalette.indigo,
    brightness: Brightness.light,
  ),
  scaffoldBackgroundColor: DemoPalette.canvas,
  textTheme: const TextTheme(
    headlineMedium: TextStyle(
      color: DemoPalette.ink,
      fontSize: 30,
      fontWeight: FontWeight.w800,
      height: 1.08,
      letterSpacing: -0.9,
    ),
    titleMedium: TextStyle(
      color: DemoPalette.ink,
      fontSize: 16,
      fontWeight: FontWeight.w700,
    ),
    bodyMedium: TextStyle(
      color: DemoPalette.muted,
      fontSize: 14,
      height: 1.4,
    ),
  ),
);
