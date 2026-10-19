import 'package:flutter/material.dart';

import '../preview_catalog.dart';
import '../theme.dart';

class PreviewShell extends StatelessWidget {
  const PreviewShell({super.key, required this.spec});

  final ScreenSpec spec;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DemoPalette.canvas,
      body: LayoutBuilder(
        builder: (context, constraints) {
          final hasOuterFrame = constraints.maxWidth > 430;
          return Center(
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxWidth: 390,
                maxHeight: constraints.maxHeight,
              ),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(hasOuterFrame ? 30 : 0),
                  boxShadow: hasOuterFrame
                      ? const [
                          BoxShadow(
                            color: Color(0x1A20233A),
                            blurRadius: 32,
                            offset: Offset(0, 16),
                          ),
                        ]
                      : null,
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(hasOuterFrame ? 30 : 0),
                  child: SizedBox.expand(child: spec.builder()),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
