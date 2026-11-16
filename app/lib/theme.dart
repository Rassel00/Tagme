import 'package:flutter/material.dart';

/// 시안(image/) 기준 색. 응급 지원 웹(server/web/public/css/common.css)과 같은 값.
class AppColors {
  static const red = Color(0xFFE5484D);
  static const redStrong = Color(0xFFD63A40);
  static const redSoft = Color(0xFFFDECED);
  static const green = Color(0xFF1F9D63);
  static const greenSoft = Color(0xFFE8F6EF);
  static const background = Color(0xFFF6F6F8);
  static const surface = Colors.white;
  static const text = Color(0xFF1D1D20);
  static const text2 = Color(0xFF5C5E66);
  static const text3 = Color(0xFF8E9098);
  static const line = Color(0xFFECECF0);
}

ThemeData buildAppTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: AppColors.red, primary: AppColors.red, surface: AppColors.surface);
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: AppColors.background,
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.background,
      foregroundColor: AppColors.text,
      centerTitle: true,
      elevation: 0,
      scrolledUnderElevation: 0,
      titleTextStyle: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.text),
    ),
    cardTheme: CardThemeData(
      color: AppColors.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.red,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(56),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.red,
        minimumSize: const Size.fromHeight(50),
        side: const BorderSide(color: AppColors.line),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.background,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    ),
    navigationBarTheme: const NavigationBarThemeData(
      backgroundColor: AppColors.surface,
      indicatorColor: AppColors.redSoft,
    ),
  );
}
