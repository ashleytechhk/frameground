import 'package:flutter_test/flutter_test.dart';
import 'package:frameground_flutter_sample/preview_catalog.dart';

void main() {
  test('the preview catalogue has exactly the two planned canvas groups', () {
    final specs = PreviewCatalog.all.toList();

    expect(specs.map((spec) => spec.id), [
      'welcome',
      'permissions',
      'plan',
      'home',
      'activity',
      'settings',
    ]);
    expect(
      specs.where((spec) => spec.canvasId == 'onboarding').length,
      3,
    );
    expect(
      specs.where((spec) => spec.canvasId == 'main-flow').length,
      3,
    );
  });

  test('an unknown iframe query screen falls back to welcome', () {
    expect(PreviewCatalog.resolveId(null), 'welcome');
    expect(PreviewCatalog.resolveId('unknown-screen'), 'welcome');
    expect(PreviewCatalog.resolveId('activity'), 'activity');
  });
}
