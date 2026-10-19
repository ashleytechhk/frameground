import { EventEmitter } from 'events'
import fs from 'fs'
import http from 'http'
import net from 'net'
import path from 'path'
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'
import { isSymlinkProjectRegistry, projectDir, projectExists, validProjectId } from './projects.ts'
import type { FrameEntry, Layout } from './types.ts'

const WORKSPACE_FILE = 'workspace.json'
const CANVASES_DIR = 'canvases'
const FLUTTER_DIR = 'flutter'
const FLUTTER_DEBOUNCE_MS = 650
const RUNNER_READY_TIMEOUT_MS = 45_000
const FLUTTER_SUPERVISOR = fileURLToPath(new URL('./flutter-supervisor.mjs', import.meta.url))

export type WorkspaceKind = 'html' | 'flutter'
export type FlutterUpdateAction = 'hot-reload' | 'hot-restart' | 'restart'
export type FlutterRunnerState = 'stopped' | 'starting' | 'ready' | 'reloading' | 'restarting' | 'error'

export interface FlutterWorkspaceDescriptor {
  id: string
  kind: 'flutter'
  version: 1
  defaultCanvasId: string
}

export interface FlutterCanvasDescriptor {
  id: string
  name: string
}

export interface FlutterRunnerStatus {
  state: FlutterRunnerState
  url?: string
  pid?: number
  message?: string
  updatedAt: number
}

type RunnerEntry = {
  workspaceId: string
  port: number
  child?: ChildProcess
  status: FlutterRunnerStatus
  pendingAction?: FlutterUpdateAction
  updateTimer?: ReturnType<typeof setTimeout>
  intentionalStop: boolean
}

export type FlutterSpawn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess

export interface FlutterRunnerDependencies {
  spawn?: FlutterSpawn
  reservePort?: () => Promise<number>
  now?: () => number
  setTimeout?: typeof setTimeout
  clearTimeout?: typeof clearTimeout
}

/** Lifecycle changes are forwarded to the workspace SSE channel by watcher.ts. */
type FlutterRuntimeGlobals = typeof globalThis & {
  __framegroundFlutterRunnerEvents?: EventEmitter
  __framegroundFlutterRunners?: FlutterRunnerRegistry
}

const runtimeGlobals = globalThis as FlutterRuntimeGlobals
export const flutterRunnerEvents = runtimeGlobals.__framegroundFlutterRunnerEvents ??= new EventEmitter()

function workspaceFile(workspaceId: string): string {
  return path.join(projectDir(workspaceId), WORKSPACE_FILE)
}

function canvasMetadataFile(workspaceId: string, canvasId: string): string {
  return path.join(flutterCanvasDir(workspaceId, canvasId), 'canvas.json')
}

function validCanvasId(id: string): boolean {
  return validProjectId(id)
}

function readJson(file: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`)
  fs.renameSync(tmp, file)
}

export function isFlutterWorkspace(workspaceId: string): boolean {
  if (!projectExists(workspaceId)) return false
  const value = readJson(workspaceFile(workspaceId))
  const kind = value && typeof value === 'object' ? (value as Record<string, unknown>).kind : undefined
  return Boolean(
    kind === 'flutter' || kind === 'flutter-workspace',
  )
}

export function readFlutterWorkspace(workspaceId: string): FlutterWorkspaceDescriptor | null {
  if (!isFlutterWorkspace(workspaceId)) return null
  const value = readJson(workspaceFile(workspaceId)) as Partial<FlutterWorkspaceDescriptor> | null
  const legacyCanvases = Array.isArray((value as Record<string, unknown> | null)?.canvases)
    ? (value as Record<string, unknown>).canvases as unknown[]
    : []
  const fallbackCanvasId = legacyCanvases.find(item =>
    item && typeof item === 'object' && validCanvasId((item as Record<string, unknown>).id as string),
  )
  const defaultCanvasId = typeof value?.defaultCanvasId === 'string'
    ? value.defaultCanvasId
    : (fallbackCanvasId as { id: string } | undefined)?.id
  if (!value || typeof defaultCanvasId !== 'string' || !validCanvasId(defaultCanvasId)) return null
  return {
    id: workspaceId,
    kind: 'flutter',
    version: 1,
    defaultCanvasId,
  }
}

export function flutterAppDir(workspaceId: string): string {
  return path.join(projectDir(workspaceId), FLUTTER_DIR)
}

export function flutterCanvasDir(workspaceId: string, canvasId: string): string {
  if (!validCanvasId(canvasId)) throw new Error('Invalid Flutter canvas id')
  return path.join(projectDir(workspaceId), CANVASES_DIR, canvasId)
}

export function listFlutterCanvases(workspaceId: string): FlutterCanvasDescriptor[] {
  if (!isFlutterWorkspace(workspaceId)) return []
  const root = path.join(projectDir(workspaceId), CANVASES_DIR)
  if (!fs.existsSync(root)) return []
  const descriptor = readJson(workspaceFile(workspaceId)) as { canvases?: unknown } | null
  const declaredNames = new Map<string, string>()
  if (Array.isArray(descriptor?.canvases)) {
    for (const value of descriptor.canvases) {
      if (!value || typeof value !== 'object') continue
      const record = value as Record<string, unknown>
      if (typeof record.id === 'string' && validCanvasId(record.id) && typeof record.name === 'string') {
        declaredNames.set(record.id, record.name)
      }
    }
  }
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && validCanvasId(entry.name))
    .map(entry => {
      const value = readJson(canvasMetadataFile(workspaceId, entry.name)) as Partial<FlutterCanvasDescriptor> | null
      return {
        id: entry.name,
        name: typeof value?.name === 'string' ? value.name : (declaredNames.get(entry.name) ?? entry.name),
      }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function flutterCanvasExists(workspaceId: string, canvasId: string): boolean {
  return isFlutterWorkspace(workspaceId) &&
    validCanvasId(canvasId) &&
    fs.existsSync(flutterCanvasDir(workspaceId, canvasId))
}

export function readFlutterCanvasManifest(workspaceId: string, canvasId: string): { frames: FrameEntry[] } {
  if (!flutterCanvasExists(workspaceId, canvasId)) return { frames: [] }
  const file = path.join(flutterCanvasDir(workspaceId, canvasId), 'frames.json')
  const value = readJson(file) as { frames?: unknown } | null
  if (!value || !Array.isArray(value.frames)) return { frames: [] }
  const frames = value.frames.flatMap(frame => {
    if (!frame || typeof frame !== 'object') return []
    const record = frame as Record<string, unknown>
    if (typeof record.id !== 'string' || typeof record.name !== 'string') return []
    const file = typeof record.file === 'string' ? record.file : undefined
    const screenId = typeof record.screenId === 'string' ? record.screenId : undefined
    const kind: FrameEntry['kind'] = record.kind === 'flutter' || record.type === 'flutter' ? 'flutter' : 'html'
    return [{ id: record.id, name: record.name, ...(file ? { file } : {}), ...(screenId ? { screenId } : {}), kind }]
  })
  return { frames }
}

export function readFlutterCanvasLayout(workspaceId: string, canvasId: string): Layout {
  if (!flutterCanvasExists(workspaceId, canvasId)) return {}
  const file = path.join(flutterCanvasDir(workspaceId, canvasId), '.opendesign', 'layout.json')
  const value = readJson(file)
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Layout : {}
}

export function patchFlutterCanvasLayout(
  workspaceId: string,
  canvasId: string,
  frameId: string,
  patch: Partial<{ x: number; y: number; w: number; h: number }>,
): { x: number; y: number; w: number; h: number } {
  if (!flutterCanvasExists(workspaceId, canvasId)) throw new Error('Flutter canvas not found')
  const current = readFlutterCanvasLayout(workspaceId, canvasId)[frameId] ?? { x: 200, y: 200, w: 393, h: 852 }
  const next = { ...current, ...patch }
  writeJson(path.join(flutterCanvasDir(workspaceId, canvasId), '.opendesign', 'layout.json'), {
    ...readFlutterCanvasLayout(workspaceId, canvasId),
    [frameId]: next,
  })
  return next
}

function starterFrame(): FrameEntry {
  return { id: 'welcome', name: 'Welcome', kind: 'flutter', screenId: 'welcome' }
}

export function createFlutterCanvas(workspaceId: string, canvasId: string, name = canvasId): FlutterCanvasDescriptor {
  if (!isFlutterWorkspace(workspaceId)) throw new Error('Flutter workspace not found')
  if (!validCanvasId(canvasId)) throw new Error('Invalid Flutter canvas id')
  const dir = flutterCanvasDir(workspaceId, canvasId)
  if (fs.existsSync(dir)) throw new Error('Flutter canvas already exists')
  fs.mkdirSync(path.join(dir, '.opendesign'), { recursive: true })
  writeJson(canvasMetadataFile(workspaceId, canvasId), { id: canvasId, name })
  writeJson(path.join(dir, 'frames.json'), { frames: [starterFrame()] })
  writeJson(path.join(dir, '.opendesign', 'layout.json'), {
    welcome: { x: 200, y: 200, w: 393, h: 852 },
  })
  return { id: canvasId, name }
}

function flutterProjectName(id: string): string {
  const cleaned = id.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^[^a-z]/, 'ui_')
  return `frameground_${cleaned}`.slice(0, 64)
}

const MAIN_DART = `import 'package:flutter/material.dart';

import 'preview_catalog.dart';
import 'theme.dart';

void main() => runApp(const FramegroundPreviewApp());

class FramegroundPreviewApp extends StatelessWidget {
  const FramegroundPreviewApp({super.key});

  @override
  Widget build(BuildContext context) {
    final screenId = Uri.base.queryParameters['fg_screen'] ?? PreviewCatalog.firstId;
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: framegroundTheme,
      home: PreviewCatalog.screenFor(screenId),
    );
  }
}
`

const PREVIEW_CATALOG_DART = `import 'package:flutter/material.dart';

/// Shared catalog used by every Frameground canvas. Add every live preview
/// screen here and reference its id from canvases/<canvas>/frames.json.
class PreviewCatalog {
  static const firstId = 'welcome';

  static Widget screenFor(String id) {
    switch (id) {
      case 'welcome':
        return const _WelcomePreview();
      default:
        return _MissingPreview(id: id);
    }
  }
}

class _WelcomePreview extends StatefulWidget {
  const _WelcomePreview();

  @override
  State<_WelcomePreview> createState() => _WelcomePreviewState();
}

class _WelcomePreviewState extends State<_WelcomePreview>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1300),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, child) => Transform.scale(
            scale: 0.96 + _controller.value * 0.04,
            child: child,
          ),
          child: const Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.auto_awesome_rounded, size: 72, color: Color(0xff6657ff)),
              SizedBox(height: 20),
              Text('Welcome preview', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700)),
              SizedBox(height: 8),
              Text('Edit lib/preview_catalog.dart and add your screens.'),
            ],
          ),
        ),
      ),
    );
  }
}

class _MissingPreview extends StatelessWidget {
  const _MissingPreview({required this.id});

  final String id;

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(child: Text('No PreviewCatalog entry for “\\$id”')),
  );
}
`

const THEME_DART = `import 'package:flutter/material.dart';

final framegroundTheme = ThemeData(
  colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff6657ff)),
  useMaterial3: true,
);
`

const PUBSPEC = `name: __PROJECT_NAME__
description: Shared Flutter preview source for Frameground canvases.
publish_to: none
version: 0.1.0+1

environment:
  sdk: '>=3.0.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^6.0.0

flutter:
  uses-material-design: true
`

const WEB_INDEX = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Frameground Flutter Preview</title></head><body>
<script>
// A Canvas has one DWDS anchor and several sibling previews. Keep the anchor
// identity scoped before Flutter's bootstrap runs; sibling previews bypass
// DWDS and refresh from the same successful compile.
(() => {
  const params = new URL(window.location.href).searchParams
  // DWDS supports one active debug connection for the resident web-server
  // runner. One anchor preview owns it; sibling frames still run the same
  // compiled source and are source-refreshed after a successful reload.
  if (params.get('fg_no_dwds') === '1') {
    window.$dwdsInitialized = true
    window.$dartMainExecuted = true
  }
  const instanceId = params.get('fg_instance')
  if (!instanceId) return
  try {
    const key = 'dartAppInstanceId'
    const prototype = Object.getPrototypeOf(window.sessionStorage)
    const getItem = prototype.getItem
    const setItem = prototype.setItem
    Object.defineProperty(prototype, 'getItem', {
      configurable: true,
      value(name) { return name === key ? instanceId : getItem.call(this, name) },
    })
    Object.defineProperty(prototype, 'setItem', {
      configurable: true,
      value(name, value) { if (name !== key) setItem.call(this, name, value) },
    })
  } catch (_) {
    // A restrictive host may block Web Storage; the anchor still uses DWDS.
  }
})()
</script>
<script src="flutter_bootstrap.js" async></script></body></html>
`

/** Create a self-contained Flutter web workspace without touching an existing app. */
export function createFlutterWorkspace(workspaceId: string, initialCanvasId = 'onboarding'): FlutterWorkspaceDescriptor {
  if (!validProjectId(workspaceId)) throw new Error('Invalid project name')
  if (!validCanvasId(initialCanvasId)) throw new Error('Invalid Flutter canvas id')
  if (isSymlinkProjectRegistry()) {
    throw new Error('This managed registry only accepts registered directory symlinks')
  }
  const dir = projectDir(workspaceId)
  if (fs.existsSync(dir)) throw new Error('Project already exists')
  const appDir = path.join(dir, FLUTTER_DIR)
  fs.mkdirSync(path.join(appDir, 'lib'), { recursive: true })
  fs.mkdirSync(path.join(appDir, 'web'), { recursive: true })
  writeJson(path.join(dir, WORKSPACE_FILE), {
    kind: 'flutter',
    version: 1,
    defaultCanvasId: initialCanvasId,
  })
  fs.writeFileSync(path.join(appDir, 'pubspec.yaml'), PUBSPEC.replace('__PROJECT_NAME__', flutterProjectName(workspaceId)))
  fs.writeFileSync(path.join(appDir, 'analysis_options.yaml'), 'include: package:flutter_lints/flutter.yaml\n')
  fs.writeFileSync(path.join(appDir, '.gitignore'), '.dart_tool/\nbuild/\n.packages\n')
  fs.writeFileSync(path.join(appDir, 'web', 'index.html'), WEB_INDEX)
  fs.writeFileSync(path.join(appDir, 'lib', 'main.dart'), MAIN_DART)
  fs.writeFileSync(path.join(appDir, 'lib', 'preview_catalog.dart'), PREVIEW_CATALOG_DART)
  fs.writeFileSync(path.join(appDir, 'lib', 'theme.dart'), THEME_DART)
  createFlutterCanvas(workspaceId, initialCanvasId, initialCanvasId)
  return { id: workspaceId, kind: 'flutter', version: 1, defaultCanvasId: initialCanvasId }
}

function normalized(file: string): string {
  return file.replace(/\\/g, '/').replace(/^\.\//, '')
}

export function isIgnoredFlutterPath(file: string): boolean {
  const value = normalized(file)
  return value.startsWith('flutter/build/') ||
    value.startsWith('flutter/.dart_tool/') ||
    value.startsWith('flutter/.git/') ||
    value.startsWith('flutter/.idea/') ||
    value.endsWith('/.DS_Store') ||
    value === 'flutter/pubspec.lock'
}

/** Classify source changes without relying on generated Flutter output. */
export function classifyFlutterChange(file: string): FlutterUpdateAction | 'ignore' {
  const value = normalized(file)
  if (isIgnoredFlutterPath(value)) return 'ignore'
  if (!value.startsWith('flutter/')) return 'ignore'
  if (/^flutter\/lib\/.*\.dart$/i.test(value)) return 'hot-reload'
  if (value === 'flutter/pubspec.yaml' || value.startsWith('flutter/web/')) return 'restart'
  if (value.startsWith('flutter/assets/') || value.startsWith('flutter/fonts/')) return 'hot-restart'
  return 'ignore'
}

function actionRank(action: FlutterUpdateAction): number {
  return action === 'restart' ? 3 : action === 'hot-restart' ? 2 : 1
}

async function defaultReservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not reserve a local Flutter port')))
        return
      }
      server.close(error => error ? reject(error) : resolve(address.port))
    })
  })
}

function canReach(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 500 }, res => {
      res.resume()
      resolve(Boolean(res.statusCode && res.statusCode < 500))
    })
    req.once('error', () => resolve(false))
    req.once('timeout', () => { req.destroy(); resolve(false) })
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function flutterRunnerEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, CI: 'true' }
  // A system proxy can make Flutter's localhost debug WebSocket go through an
  // HTTP proxy, which breaks hot reload even though the web server itself runs.
  // Keep this scoped to spawned Flutter commands; Frameground/Vite retains its
  // normal environment.
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) {
    delete env[key]
  }
  return env
}

function executableFile(candidate: string): string | null {
  try {
    fs.accessSync(candidate, fs.constants.X_OK)
    return candidate
  } catch {
    return null
  }
}

/**
 * Find Flutter without baking a developer-specific SDK path into Frameground.
 *
 * An explicit binary always wins. For an already-initialized workspace,
 * Flutter's generated package_config.json records the SDK package location,
 * which lets a dev server started outside an interactive shell still find the
 * same SDK that produced the workspace's packages. A new workspace without
 * that file falls back to the normal `flutter` PATH lookup.
 */
export function resolveFlutterBinary(workspaceId: string, env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.FRAMEGROUND_FLUTTER_BIN || env.FLUTTER_BIN
  if (configured) return configured

  if (env.FLUTTER_ROOT) {
    const fromRoot = executableFile(path.join(env.FLUTTER_ROOT, 'bin', 'flutter'))
    if (fromRoot) return fromRoot
  }

  const packageConfig = path.join(flutterAppDir(workspaceId), '.dart_tool', 'package_config.json')
  const value = readJson(packageConfig) as { packages?: unknown } | null
  const flutterPackage = Array.isArray(value?.packages)
    ? value.packages.find(item => item && typeof item === 'object' && (item as Record<string, unknown>).name === 'flutter') as Record<string, unknown> | undefined
    : undefined
  const rootUri = flutterPackage?.rootUri
  if (typeof rootUri === 'string') {
    try {
      const flutterPackageDir = fileURLToPath(new URL(rootUri, pathToFileURL(packageConfig)))
      // <sdk>/packages/flutter -> <sdk>/bin/flutter
      const fromPackageConfig = executableFile(path.resolve(flutterPackageDir, '..', '..', 'bin', 'flutter'))
      if (fromPackageConfig) return fromPackageConfig
    } catch {
      // A malformed or non-file URI should not prevent the normal PATH lookup.
    }
  }

  return 'flutter'
}

/**
 * One in-memory Flutter web runner per workspace. Nothing in this registry is
 * persisted to the workspace or Git; a Frameground restart intentionally makes
 * it start a fresh local runner on demand.
 */
export class FlutterRunnerRegistry {
  private readonly entries = new Map<string, RunnerEntry>()
  private readonly starting = new Map<string, Promise<FlutterRunnerStatus>>()
  private readonly runSpawn: FlutterSpawn
  private readonly reservePort: () => Promise<number>
  private readonly now: () => number
  private readonly schedule: typeof setTimeout
  private readonly cancel: typeof clearTimeout

  constructor(deps: FlutterRunnerDependencies = {}) {
    this.runSpawn = deps.spawn ?? ((command, args, options) => nodeSpawn(command, args, options))
    this.reservePort = deps.reservePort ?? defaultReservePort
    this.now = deps.now ?? Date.now
    this.schedule = deps.setTimeout ?? setTimeout
    this.cancel = deps.clearTimeout ?? clearTimeout
  }

  status(workspaceId: string): FlutterRunnerStatus {
    return this.entries.get(workspaceId)?.status ?? { state: 'stopped', updatedAt: this.now() }
  }

  private publish(entry: RunnerEntry, patch: Omit<FlutterRunnerStatus, 'updatedAt'>): FlutterRunnerStatus {
    entry.status = { ...entry.status, ...patch, updatedAt: this.now() }
    flutterRunnerEvents.emit('status', entry.workspaceId, entry.status)
    return entry.status
  }

  private async runPubGet(workspaceId: string): Promise<void> {
    const binary = resolveFlutterBinary(workspaceId)
    const child = this.runSpawn(binary, ['pub', 'get'], {
      cwd: flutterAppDir(workspaceId),
      // Dependency resolution may legitimately require the developer's proxy.
      env: { ...process.env, CI: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    await new Promise<void>((resolve, reject) => {
      let stderr = ''
      child.stderr?.on('data', chunk => { stderr += String(chunk) })
      child.once('error', reject)
      child.once('exit', code => {
        if (code === 0) resolve()
        else reject(new Error(`flutter pub get failed${stderr ? `: ${stderr.trim()}` : ''}`))
      })
    })
  }

  async start(workspaceId: string): Promise<FlutterRunnerStatus> {
    const inFlight = this.starting.get(workspaceId)
    if (inFlight) return inFlight
    const task = this.startFresh(workspaceId)
    this.starting.set(workspaceId, task)
    try {
      return await task
    } finally {
      if (this.starting.get(workspaceId) === task) this.starting.delete(workspaceId)
    }
  }

  private async startFresh(workspaceId: string): Promise<FlutterRunnerStatus> {
    if (!isFlutterWorkspace(workspaceId)) return { state: 'error', message: 'Flutter workspace not found', updatedAt: this.now() }
    const existing = this.entries.get(workspaceId)
    // A Dart compile error leaves the resident web server alive with its last
    // successful page. Reusing it is essential: starting another runner here
    // would leak a second process whenever a user switches Canvas tabs.
    if (existing?.child && existing.status.state !== 'stopped') return existing.status
    if (existing && existing.status.state !== 'stopped' && existing.status.state !== 'error') return existing.status

    const port = await this.reservePort()
    const entry: RunnerEntry = {
      workspaceId,
      port,
      intentionalStop: false,
      status: { state: 'starting', message: 'Fetching Flutter packages…', updatedAt: this.now() },
    }
    this.entries.set(workspaceId, entry)
    flutterRunnerEvents.emit('status', workspaceId, entry.status)

    try {
      await this.runPubGet(workspaceId)
      const binary = resolveFlutterBinary(workspaceId)
      const url = `http://127.0.0.1:${port}`
      const child = this.runSpawn(process.execPath, [
        FLUTTER_SUPERVISOR,
        binary,
        'run', '-d', 'web-server',
        // Prefer SSE for the web-server bridge. Canvas keeps one DWDS anchor
        // and source-refreshes sibling previews after a successful reload.
        '--web-server-debug-protocol=sse',
        '--web-server-debug-backend-protocol=sse',
        '--web-server-debug-injected-client-protocol=sse',
        '--web-hostname=127.0.0.1', `--web-port=${port}`,
      ], {
        cwd: flutterAppDir(workspaceId),
        env: flutterRunnerEnvironment(),
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      entry.child = child
      this.publish(entry, { state: 'starting', url, pid: child.pid, message: 'Starting Flutter web runner…' })
      const output = (chunk: unknown) => this.observeOutput(entry, String(chunk))
      child.stdout?.on('data', output)
      child.stderr?.on('data', output)
      child.once('error', error => {
        if (!entry.intentionalStop) this.publish(entry, { state: 'error', message: error.message, pid: undefined })
      })
      child.once('exit', code => {
        entry.child = undefined
        if (entry.intentionalStop) {
          this.publish(entry, { state: 'stopped', pid: undefined, message: undefined })
        } else {
          this.publish(entry, {
            state: 'error',
            pid: undefined,
            message: `Flutter runner exited${code === null ? '' : ` with code ${code}`}`,
          })
        }
      })
      void this.waitForReady(entry)
      return entry.status
    } catch (error) {
      return this.publish(entry, {
        state: 'error',
        message: error instanceof Error ? error.message : 'Could not start Flutter',
      })
    }
  }

  private observeOutput(entry: RunnerEntry, output: string): void {
    if (!this.entries.has(entry.workspaceId) || entry.intentionalStop) return
    if (/\b(error|exception|failed)\b/i.test(output)) {
      // Retain the known URL so the iframe keeps its last successful paint.
      this.publish(entry, { state: 'error', message: output.trim().slice(-600) })
      return
    }
    if (/\b(reloaded|restarted|syncing files|serving at|running with sound null safety)\b/i.test(output)) {
      this.publish(entry, { state: 'ready', message: undefined })
    }
  }

  private async waitForReady(entry: RunnerEntry): Promise<void> {
    const deadline = this.now() + RUNNER_READY_TIMEOUT_MS
    while (!entry.intentionalStop && this.entries.get(entry.workspaceId) === entry && this.now() < deadline) {
      if (await canReach(entry.port)) {
        this.publish(entry, { state: 'ready', message: undefined })
        return
      }
      await sleep(250)
    }
    if (!entry.intentionalStop && this.entries.get(entry.workspaceId) === entry && entry.status.state === 'starting') {
      this.publish(entry, { state: 'error', message: 'Flutter runner did not become ready in time' })
    }
  }

  requestUpdate(workspaceId: string, action: FlutterUpdateAction): void {
    const entry = this.entries.get(workspaceId)
    if (!entry?.child || entry.intentionalStop) return
    if (!entry.pendingAction || actionRank(action) > actionRank(entry.pendingAction)) entry.pendingAction = action
    if (entry.updateTimer) this.cancel(entry.updateTimer)
    const state: FlutterRunnerState = entry.pendingAction === 'hot-reload' ? 'reloading' : 'restarting'
    this.publish(entry, { state, message: entry.pendingAction === 'hot-reload' ? 'Hot reloading…' : 'Refreshing Flutter preview…' })
    entry.updateTimer = this.schedule(() => {
      entry.updateTimer = undefined
      const next = entry.pendingAction
      entry.pendingAction = undefined
      if (next) void this.performUpdate(entry, next)
    }, FLUTTER_DEBOUNCE_MS)
  }

  private async performUpdate(entry: RunnerEntry, action: FlutterUpdateAction): Promise<void> {
    if (entry.intentionalStop || this.entries.get(entry.workspaceId) !== entry || !entry.child) return
    if (action === 'restart') {
      this.stop(entry.workspaceId)
      await this.start(entry.workspaceId)
      return
    }
    try {
      if (action === 'hot-reload') {
        // Flutter's resident runner accepts SIGUSR1 as a non-interactive reload
        // request. No iframe navigation occurs, so every active preview keeps
        // its same runner and page state.
        const signalled = entry.child.kill('SIGUSR1')
        if (!signalled) throw new Error('Could not signal Flutter hot reload')
      } else {
        // Flutter CLI's documented hot-restart command is uppercase R.
        entry.child.stdin?.write('R\n')
      }
      this.schedule(() => {
        if (!entry.intentionalStop && entry.status.state !== 'error') this.publish(entry, { state: 'ready', message: undefined })
      }, 1_500)
    } catch (error) {
      this.publish(entry, { state: 'error', message: error instanceof Error ? error.message : 'Flutter refresh failed' })
    }
  }

  stop(workspaceId: string): void {
    const entry = this.entries.get(workspaceId)
    if (!entry) return
    entry.intentionalStop = true
    if (entry.updateTimer) this.cancel(entry.updateTimer)
    entry.child?.kill('SIGTERM')
    this.entries.delete(workspaceId)
    flutterRunnerEvents.emit('status', workspaceId, { state: 'stopped', updatedAt: this.now() } satisfies FlutterRunnerStatus)
  }

  stopAll(): void {
    for (const workspaceId of [...this.entries.keys()]) this.stop(workspaceId)
  }
}

// Vite can reload a server module while keeping its HTTP process alive. Put the
// registry on globalThis so a module reload cannot orphan a running Flutter
// child and accidentally start a second web-server for the same workspace.
export const flutterRunners = runtimeGlobals.__framegroundFlutterRunners ??= new FlutterRunnerRegistry()

/** Append a Flutter screen reference without manufacturing an HTML file. */
export function appendFlutterScreen(
  workspaceId: string,
  canvasId: string,
  entry: FrameEntry,
  layout: { x: number; y: number; w: number; h: number },
): void {
  const dir = flutterCanvasDir(workspaceId, canvasId)
  const manifestFile = path.join(dir, 'frames.json')
  const existing = readFlutterCanvasManifest(workspaceId, canvasId)
  if (existing.frames.some(frame => frame.id === entry.id)) throw new Error(`Frame id already exists: ${entry.id}`)
  writeJson(manifestFile, { frames: [...existing.frames, entry] })
  writeJson(path.join(dir, '.opendesign', 'layout.json'), { ...readFlutterCanvasLayout(workspaceId, canvasId), [entry.id]: layout })
}
