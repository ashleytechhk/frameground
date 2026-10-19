import { EventEmitter } from 'events'
import type { ChildProcess } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createProject } from './projects.ts'
import {
  FlutterRunnerRegistry,
  appendFlutterScreen,
  classifyFlutterChange,
  createFlutterCanvas,
  createFlutterWorkspace,
  flutterAppDir,
  flutterCanvasDir,
  isFlutterWorkspace,
  isIgnoredFlutterPath,
  listFlutterCanvases,
  readFlutterCanvasLayout,
  readFlutterCanvasManifest,
  resolveFlutterBinary,
  type FlutterSpawn,
} from './flutter.ts'

let tmp: string
let previousProjectsRoot: string | undefined

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frameground-flutter-'))
  previousProjectsRoot = process.env.PROJECTS_ROOT
  process.env.PROJECTS_ROOT = tmp
})

afterEach(() => {
  vi.useRealTimers()
  fs.rmSync(tmp, { recursive: true, force: true })
  if (previousProjectsRoot === undefined) delete process.env.PROJECTS_ROOT
  else process.env.PROJECTS_ROOT = previousProjectsRoot
})

describe('Flutter workspace and canvas schema', () => {
  test('creates one shared Flutter source tree and its initial canvas', () => {
    const workspace = createFlutterWorkspace('wellness-app', 'onboarding')

    expect(workspace).toEqual({
      id: 'wellness-app',
      kind: 'flutter',
      version: 1,
      defaultCanvasId: 'onboarding',
    })
    expect(isFlutterWorkspace('wellness-app')).toBe(true)

    const projectDir = path.join(tmp, 'wellness-app')
    expect(JSON.parse(fs.readFileSync(path.join(projectDir, 'workspace.json'), 'utf-8'))).toEqual({
      kind: 'flutter',
      version: 1,
      defaultCanvasId: 'onboarding',
    })
    expect(fs.existsSync(path.join(flutterAppDir('wellness-app'), 'lib', 'main.dart'))).toBe(true)
    expect(fs.existsSync(path.join(flutterAppDir('wellness-app'), 'lib', 'preview_catalog.dart'))).toBe(true)
    const webIndex = path.join(flutterAppDir('wellness-app'), 'web', 'index.html')
    expect(fs.existsSync(webIndex)).toBe(true)
    expect(fs.readFileSync(webIndex, 'utf-8')).toContain('fg_no_dwds')

    expect(listFlutterCanvases('wellness-app')).toEqual([{ id: 'onboarding', name: 'onboarding' }])
    expect(readFlutterCanvasManifest('wellness-app', 'onboarding')).toEqual({
      frames: [{ id: 'welcome', name: 'Welcome', kind: 'flutter', screenId: 'welcome' }],
    })
    expect(readFlutterCanvasLayout('wellness-app', 'onboarding')).toEqual({
      welcome: { x: 200, y: 200, w: 393, h: 852 },
    })
  })

  test('keeps canvases as metadata only while every canvas shares the same Flutter app', () => {
    createFlutterWorkspace('preview', 'main-flow')
    createFlutterCanvas('preview', 'settings', 'Settings')
    createFlutterCanvas('preview', 'activity', 'Activity')

    expect(listFlutterCanvases('preview')).toEqual([
      { id: 'activity', name: 'Activity' },
      { id: 'main-flow', name: 'main-flow' },
      { id: 'settings', name: 'Settings' },
    ])
    expect(fs.existsSync(path.join(flutterCanvasDir('preview', 'settings'), 'flutter'))).toBe(false)
    expect(fs.existsSync(path.join(flutterCanvasDir('preview', 'activity'), 'lib'))).toBe(false)
    expect(fs.existsSync(path.join(flutterAppDir('preview'), 'lib', 'preview_catalog.dart'))).toBe(true)

    appendFlutterScreen(
      'preview',
      'settings',
      { id: 'preferences', name: 'Preferences', kind: 'flutter', screenId: 'preferences' },
      { x: 640, y: 200, w: 393, h: 852 },
    )
    expect(readFlutterCanvasManifest('preview', 'settings').frames).toContainEqual({
      id: 'preferences', name: 'Preferences', kind: 'flutter', screenId: 'preferences',
    })
    expect(readFlutterCanvasLayout('preview', 'settings').preferences).toEqual({
      x: 640, y: 200, w: 393, h: 852,
    })
  })

  test('does not mistake an HTML project for a Flutter workspace', () => {
    createProject('html-project')
    expect(isFlutterWorkspace('html-project')).toBe(false)
    expect(listFlutterCanvases('html-project')).toEqual([])
    expect(() => createFlutterCanvas('html-project', 'onboarding')).toThrow('Flutter workspace not found')
  })

  test('does not create an unregistered Flutter workspace in a managed registry', () => {
    fs.writeFileSync(path.join(tmp, '.frameground-registry.json'), JSON.stringify({ version: 1, mode: 'symlink' }))
    expect(() => createFlutterWorkspace('preview')).toThrow(/registered directory symlinks/)
  })

  test.each(['../escape', 'path/segment', '', '-leading-dash'])('rejects unsafe canvas id %j', canvasId => {
    createFlutterWorkspace('preview')
    expect(() => flutterCanvasDir('preview', canvasId)).toThrow('Invalid Flutter canvas id')
    expect(() => createFlutterCanvas('preview', canvasId)).toThrow('Invalid Flutter canvas id')
  })

  test('rejects duplicate workspaces and canvases without modifying the existing canvas', () => {
    createFlutterWorkspace('preview', 'onboarding')
    const manifestBefore = readFlutterCanvasManifest('preview', 'onboarding')

    expect(() => createFlutterWorkspace('preview')).toThrow('Project already exists')
    expect(() => createFlutterCanvas('preview', 'onboarding')).toThrow('Flutter canvas already exists')
    expect(readFlutterCanvasManifest('preview', 'onboarding')).toEqual(manifestBefore)
  })
})

describe('Flutter watcher classification', () => {
  test.each([
    ['flutter/lib/main.dart', 'hot-reload'],
    ['flutter/lib/widgets/app_shell.DART', 'hot-reload'],
    ['flutter/assets/hero.png', 'hot-restart'],
    ['flutter/fonts/Display.ttf', 'hot-restart'],
    ['flutter/pubspec.yaml', 'restart'],
    ['flutter/web/index.html', 'restart'],
    ['flutter/web/flutter_bootstrap.js', 'restart'],
    ['flutter/build/web/main.dart.js', 'ignore'],
    ['flutter/.dart_tool/package_config.json', 'ignore'],
    ['flutter/.git/index', 'ignore'],
    ['flutter/pubspec.lock', 'ignore'],
    ['canvases/onboarding/frames.json', 'ignore'],
    ['flutter/README.md', 'ignore'],
  ] as const)('classifies %s as %s', (file, action) => {
    expect(classifyFlutterChange(file)).toBe(action)
  })

  test('normalizes watcher paths before classifying them', () => {
    expect(classifyFlutterChange('.\\flutter\\lib\\preview_catalog.dart')).toBe('hot-reload')
    expect(isIgnoredFlutterPath('flutter\\build\\web\\main.dart.js')).toBe(true)
  })
})

describe('Flutter executable resolution', () => {
  test('discovers an initialized workspace SDK from Flutter package_config.json', () => {
    createFlutterWorkspace('preview')
    const sdk = path.join(tmp, 'flutter-sdk')
    const binary = path.join(sdk, 'bin', 'flutter')
    fs.mkdirSync(path.dirname(binary), { recursive: true })
    fs.writeFileSync(binary, '#!/usr/bin/env bash\nexit 0\n')
    fs.chmodSync(binary, 0o755)

    const appDir = flutterAppDir('preview')
    fs.mkdirSync(path.join(appDir, '.dart_tool'), { recursive: true })
    fs.writeFileSync(path.join(appDir, '.dart_tool', 'package_config.json'), JSON.stringify({
      configVersion: 2,
      packages: [{
        name: 'flutter',
        rootUri: pathToFileURL(path.join(sdk, 'packages', 'flutter')).href,
        packageUri: 'lib/',
      }],
    }))

    expect(resolveFlutterBinary('preview', {})).toBe(binary)
  })

  test('prefers an explicit Flutter binary over package config discovery', () => {
    createFlutterWorkspace('preview')
    expect(resolveFlutterBinary('preview', { FRAMEGROUND_FLUTTER_BIN: '/custom/flutter' })).toBe('/custom/flutter')
  })
})

class FakeChild extends EventEmitter {
  readonly stdout = new EventEmitter()
  readonly stderr = new EventEmitter()
  readonly stdin = { write: vi.fn(() => true) }
  readonly killedSignals: string[] = []
  readonly pid: number

  constructor(pid: number) {
    super()
    this.pid = pid
  }

  kill(signal?: string): boolean {
    this.killedSignals.push(signal ?? 'SIGTERM')
    return true
  }

  asChildProcess(): ChildProcess {
    return this as unknown as ChildProcess
  }
}

type SpawnCall = {
  command: string
  args: readonly string[]
  child: FakeChild
}

function fakeSpawn(exitPubGet = true): { spawn: FlutterSpawn; calls: SpawnCall[] } {
  let nextPid = 4000
  const calls: SpawnCall[] = []
  const spawn = ((command, args, options) => {
    void options
    const child = new FakeChild(nextPid++)
    calls.push({ command, args, child })
    if (exitPubGet && args[0] === 'pub') queueMicrotask(() => child.emit('exit', 0))
    return child.asChildProcess()
  }) as FlutterSpawn
  return { spawn, calls }
}

describe('FlutterRunnerRegistry', () => {
  test('starts exactly one runner for a workspace and keeps runtime state out of the workspace files', async () => {
    vi.useFakeTimers()
    createFlutterWorkspace('preview')
    const runtime = fakeSpawn()
    const registry = new FlutterRunnerRegistry({
      spawn: runtime.spawn,
      reservePort: async () => 48123,
      now: () => 1_700_000_000_000,
    })

    const initial = await registry.start('preview')
    const duplicate = await registry.start('preview')

    expect(initial.state).toBe('starting')
    expect(duplicate).toEqual(initial)
    expect(runtime.calls).toHaveLength(2)
    expect(runtime.calls[0]).toMatchObject({ command: 'flutter', args: ['pub', 'get'] })
    expect(runtime.calls[1]).toMatchObject({
      command: process.execPath,
      args: [
        expect.stringMatching(/flutter-supervisor\.mjs$/),
        'flutter', 'run', '-d', 'web-server',
        '--web-server-debug-protocol=sse',
        '--web-server-debug-backend-protocol=sse',
        '--web-server-debug-injected-client-protocol=sse',
        '--web-hostname=127.0.0.1', '--web-port=48123',
      ],
    })

    const runner = runtime.calls[1].child
    runner.stdout.emit('data', 'Serving at http://127.0.0.1:48123')
    expect(registry.status('preview')).toMatchObject({
      state: 'ready',
      url: 'http://127.0.0.1:48123',
      pid: runner.pid,
      updatedAt: 1_700_000_000_000,
    })
    expect(fs.existsSync(path.join(tmp, 'preview', '.opendesign', 'runner.json'))).toBe(false)

    registry.stop('preview')
    expect(runner.killedSignals).toEqual(['SIGTERM'])
    expect(registry.status('preview')).toEqual({ state: 'stopped', updatedAt: 1_700_000_000_000 })
    vi.clearAllTimers()
  })

  test('deduplicates concurrent start requests before port allocation', async () => {
    createFlutterWorkspace('preview')
    const runtime = fakeSpawn()
    let resolvePort: ((port: number) => void) | undefined
    const reservePort = vi.fn(() => new Promise<number>(resolve => { resolvePort = resolve }))
    const registry = new FlutterRunnerRegistry({ spawn: runtime.spawn, reservePort })

    const firstStart = registry.start('preview')
    const secondStart = registry.start('preview')
    expect(reservePort).toHaveBeenCalledTimes(1)

    resolvePort?.(48124)
    await Promise.all([firstStart, secondStart])
    expect(runtime.calls.filter(call => call.args.includes('run'))).toHaveLength(1)
    registry.stop('preview')
  })

  test('debounces Dart updates to one hot reload without replacing the runner process', async () => {
    vi.useFakeTimers()
    createFlutterWorkspace('preview')
    const runtime = fakeSpawn()
    const registry = new FlutterRunnerRegistry({
      spawn: runtime.spawn,
      reservePort: async () => 48125,
    })
    await registry.start('preview')
    const runner = runtime.calls[1].child
    runner.stdout.emit('data', 'Serving at http://127.0.0.1:48125')

    registry.requestUpdate('preview', 'hot-reload')
    registry.requestUpdate('preview', 'hot-reload')
    expect(registry.status('preview').state).toBe('reloading')
    vi.advanceTimersByTime(649)
    expect(runner.killedSignals).toEqual([])
    vi.advanceTimersByTime(1)
    expect(runner.killedSignals).toEqual(['SIGUSR1'])
    expect(runtime.calls.filter(call => call.args.includes('run'))).toHaveLength(1)

    registry.stop('preview')
    vi.clearAllTimers()
  })

  test('upgrades a pending reload to a hot restart and writes the resident restart command once', async () => {
    vi.useFakeTimers()
    createFlutterWorkspace('preview')
    const runtime = fakeSpawn()
    const registry = new FlutterRunnerRegistry({
      spawn: runtime.spawn,
      reservePort: async () => 48126,
    })
    await registry.start('preview')
    const runner = runtime.calls[1].child

    registry.requestUpdate('preview', 'hot-reload')
    registry.requestUpdate('preview', 'hot-restart')
    expect(registry.status('preview').state).toBe('restarting')
    vi.advanceTimersByTime(650)
    expect(runner.killedSignals).toEqual([])
    expect(runner.stdin.write).toHaveBeenCalledTimes(1)
    expect(runner.stdin.write).toHaveBeenCalledWith('R\n')

    registry.stop('preview')
    vi.clearAllTimers()
  })

  test('reuses the live runner after a compile error so switching canvases cannot spawn a duplicate', async () => {
    vi.useFakeTimers()
    createFlutterWorkspace('preview')
    const runtime = fakeSpawn()
    const registry = new FlutterRunnerRegistry({
      spawn: runtime.spawn,
      reservePort: async () => 48127,
    })
    await registry.start('preview')
    const runner = runtime.calls[1].child
    runner.stdout.emit('data', 'Serving at http://127.0.0.1:48127')
    runner.stderr.emit('data', 'lib/preview_catalog.dart:42: Error: broken widget')

    expect(registry.status('preview')).toMatchObject({
      state: 'error',
      url: 'http://127.0.0.1:48127',
      pid: runner.pid,
    })
    const afterError = await registry.start('preview')

    expect(afterError).toMatchObject({ state: 'error', pid: runner.pid })
    expect(runtime.calls.filter(call => call.args[0] === 'pub')).toHaveLength(1)
    expect(runtime.calls.filter(call => call.args.includes('run'))).toHaveLength(1)

    registry.stop('preview')
    vi.clearAllTimers()
  })

  test('reports a missing workspace without invoking Flutter', async () => {
    const runtime = fakeSpawn()
    const registry = new FlutterRunnerRegistry({ spawn: runtime.spawn, now: () => 42 })

    await expect(registry.start('missing')).resolves.toEqual({
      state: 'error', message: 'Flutter workspace not found', updatedAt: 42,
    })
    expect(runtime.calls).toEqual([])
  })
})
