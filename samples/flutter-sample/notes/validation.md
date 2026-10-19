# Validation record for the Flutter sample — 2026-10-19

## Completed locally

| Check | Result |
| --- | --- |
| Workspace / canvas manifest agreement | PASS — scripts/validate_workspace.py found both canvases and all six IDs |
| JSON syntax | PASS — jq empty accepted workspace, manifests, and layouts |
| Shell scripts | PASS — bash -n accepted start and stop scripts |
| Python validator syntax | PASS — python3 -m py_compile completed |
| Flutter widget tests | PASS — 2 preview catalogue tests passed with Flutter 3.44.0 / Dart 3.12.0 |

## Full Frameground browser smoke — PASS

The Frameground integration started exactly one resident Flutter 3.44 web
runner for this workspace. The public runner PID is a stable supervisor; its
child is Flutter's CLI. Runner URL/PID stayed in process memory only.

| Check | Result |
| --- | --- |
| Six route previews | PASS — Welcome, Permissions, Plan, Home, Activity, Settings rendered through one runner |
| Active Canvas budget | PASS — each Canvas showed three iframe previews; after switch only Home, Activity, Settings remained |
| Shared-widget hot reload | PASS — watcher-debounced edit updated all onboarding frames; supervisor PID stayed unchanged |
| Animation | PASS — two captures 800 ms apart differed while the runner stayed ready |
| Syntax-error safety | PASS — the Canvas kept its last successful screens with an error overlay; fixing the Dart line recovered automatically with the same PID |
| Background cleanup | PASS — navigating onboarding → main-flow removed all onboarding iframe URLs |
| Runner count | PASS — one supervisor + one Flutter CLI child, no extra runner |

Flutter 3.44 exits when its CLI itself receives `SIGUSR1`, so Frameground's
small supervisor accepts that signal and forwards Flutter's documented `r`
command through stdin. This keeps the public runner PID stable.

The contact sheet is at:

~~~
captures/contact-sheet.png
~~~

The widget tests were rerun with the local proxy variables removed because they
otherwise force Flutter's localhost test WebSocket through Tinyproxy:

~~~
00:00 +2: All tests passed!
PASS: workspace, two canvases, six Flutter screen ids, and layouts agree.
~~~
