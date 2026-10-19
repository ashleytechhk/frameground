import 'package:flutter/material.dart';

import 'preview_catalog.dart';
import 'theme.dart';
import 'widgets/preview_shell.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final requestedScreen = Uri.base.queryParameters['fg_screen'];
  final screenId = PreviewCatalog.resolveId(requestedScreen);
  runApp(FramegroundFlutterDemo(screenId: screenId));
}

class FramegroundFlutterDemo extends StatelessWidget {
  const FramegroundFlutterDemo({super.key, required this.screenId});

  final String screenId;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Frameground Flutter demo',
      theme: demoTheme,
      home: PreviewShell(spec: PreviewCatalog.byId(screenId)),
    );
  }
}
