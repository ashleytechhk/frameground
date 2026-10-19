# Frameground Flutter sample workspace

This durable sample demonstrates one shared Flutter source tree supplying
multiple Frameground canvases. It has no network, database, production service,
or dependencies beyond Flutter.

## Layout

~~~
flutter-sample/
  workspace.json                     # workspace-level Flutter metadata
  flutter/                           # one shared Flutter app / one runner
    lib/preview_catalog.dart          # screen-id-to-widget catalogue
  canvases/
    onboarding/                      # three frame entries + canvas layout
    main-flow/                       # three frame entries + canvas layout
~~~

Each frame uses the same Flutter runner and varies only through the
fg_screen query value:

~~~
?fg_screen=welcome
?fg_screen=permissions
?fg_screen=plan
?fg_screen=home
?fg_screen=activity
?fg_screen=settings
~~~

The manifests are data-only: each Flutter frame has a screen id and layout,
without copied UI sources or a runner per frame.

## Frameground lifecycle

Frameground does not start a Flutter runner on server boot or while listing
projects. It starts one on demand when this workspace's Canvas is opened.
Canvas changes reuse that workspace's resident runner; the runner stops only
through the runner stop API or when Frameground shuts down.

## Optional standalone validation

~~~
cd /Volumes/MyPassport/ai/frameground/samples/flutter-sample
./scripts/validate_workspace.py
./scripts/start_flutter_web.sh
~~~

The standalone helper stores only transient PID, URL, and log data under
/tmp/frameground-flutter-sample/. It does not write runner metadata into the
workspace or Git. Stop it with:

~~~
./scripts/stop_flutter_web.sh
~~~

## Screens and animation evidence

| Canvas | Screens | Visible motion |
| --- | --- | --- |
| onboarding | Welcome, Permissions, Plan | pulsing hero, entrance cards, plan selector |
| main-flow | Home, Activity, Settings | pulsing metric, chart bars, delayed toggle |

The selected Canvas mounts its live previews while inactive Canvas previews are
unmounted. See notes/validation.md and captures/contact-sheet.png for the
original verification record.
