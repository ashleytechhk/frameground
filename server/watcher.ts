import path from 'path'
import chokidar, { type FSWatcher } from 'chokidar'
import type { ServerResponse } from 'http'
import { projectDir, projectExists } from './projects.ts'
import {
  classifyFlutterChange,
  flutterRunnerEvents,
  flutterRunners,
  isFlutterWorkspace,
  type FlutterRunnerStatus,
} from './flutter.ts'

type Channel = {
  watcher: FSWatcher
  subs: Set<ServerResponse>
}

const channels = new Map<string, Channel>()
const DEBOUNCE_MS = 80

type FlutterWatcherGlobals = typeof globalThis & {
  __framegroundFlutterStatusBridge?: (workspaceId: string, status: FlutterRunnerStatus) => void
  __framegroundFlutterStatusListenerInstalled?: boolean
}

const watcherGlobals = globalThis as FlutterWatcherGlobals

/** Convert an absolute chokidar path into the URL/manifest-style project path. */
export function projectRelativeFile(projectPath: string, changedPath: string): string {
  return path.relative(projectPath, changedPath).split(path.sep).join('/')
}

function broadcast(projectId: string, event: string, data: unknown): void {
  const ch = channels.get(projectId)
  if (!ch) return
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of ch.subs) {
    try {
      res.write(payload)
    } catch {
      ch.subs.delete(res)
    }
  }
}

// The runner registry deliberately has no HTTP/SSE knowledge. Keep a single
// global listener across Vite server-module HMR, while pointing it at the
// latest module's channel map.
watcherGlobals.__framegroundFlutterStatusBridge = (workspaceId, status) => {
  broadcast(workspaceId, 'flutter-runner', status)
}
if (!watcherGlobals.__framegroundFlutterStatusListenerInstalled) {
  flutterRunnerEvents.on('status', (workspaceId: string, status: FlutterRunnerStatus) => {
    watcherGlobals.__framegroundFlutterStatusBridge?.(workspaceId, status)
  })
  watcherGlobals.__framegroundFlutterStatusListenerInstalled = true
}

function debounce<T extends (...a: never[]) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout> | null = null
  return ((...args: Parameters<T>) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }) as T
}

function ensureChannel(projectId: string): Channel {
  const existing = channels.get(projectId)
  if (existing) return existing

  const dir = projectDir(projectId)
  const watcher = chokidar.watch(dir, {
    ignoreInitial: true,
    ignored: (p: string) => {
      const rel = path.relative(dir, p)
      if (!rel || rel === '.') return false
      if (rel === 'node_modules' || rel.startsWith('node_modules' + path.sep)) return true
      if (isFlutterWorkspace(projectId) && (
        rel === 'flutter/build' || rel.startsWith('flutter/build' + path.sep) ||
        rel === 'flutter/.dart_tool' || rel.startsWith('flutter/.dart_tool' + path.sep)
      )) return true
      return false
    },
  })

  const emitManifest = debounce(() => broadcast(projectId, 'manifest-changed', {}), DEBOUNCE_MS)
  const emitLayout = debounce(() => broadcast(projectId, 'layout-changed', {}), DEBOUNCE_MS)
  const fileTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const emitFile = (file: string) => {
    const previous = fileTimers.get(file)
    if (previous) clearTimeout(previous)
    fileTimers.set(file, setTimeout(() => {
      fileTimers.delete(file)
      broadcast(projectId, 'file-changed', { file })
    }, DEBOUNCE_MS))
  }
  const emitDesign = debounce(() => broadcast(projectId, 'design-changed', {}), DEBOUNCE_MS)
  const emitSuggestions = debounce(() => broadcast(projectId, 'suggestions-changed', {}), DEBOUNCE_MS)
  const emitSettings = debounce(() => broadcast(projectId, 'settings-changed', {}), DEBOUNCE_MS)

  const layoutFile = '.opendesign/layout.json'
  const settingsFile = '.opendesign/settings.json'
  const suggestionsPrefix = '.opendesign/suggestions/'

  const onChange = (p: string) => {
    const rel = projectRelativeFile(dir, p)
    if (isFlutterWorkspace(projectId)) {
      const action = classifyFlutterChange(rel)
      if (action !== 'ignore') flutterRunners.requestUpdate(projectId, action)

      const canvasChange = rel.match(/^canvases\/([^/]+)\/(frames\.json|\.opendesign\/layout\.json|canvas\.json)$/)
      if (canvasChange) {
        broadcast(projectId, 'flutter-canvas-changed', {
          canvasId: canvasChange[1],
          file: rel,
        })
      } else if (rel === 'workspace.json') {
        broadcast(projectId, 'flutter-workspace-changed', {})
      }
      return
    }
    if (rel === 'frames.json') emitManifest()
    else if (rel === layoutFile) emitLayout()
    else if (rel === settingsFile) emitSettings()
    else if (rel === 'DESIGN.md' || rel === 'FEEL.md') emitDesign()
    else if (rel.startsWith(suggestionsPrefix) && rel.endsWith('.json')) emitSuggestions()
    else if (rel.startsWith('.opendesign/')) { /* canvas metadata is not frame content */ }
    else emitFile(rel)
  }

  watcher.on('add', onChange)
  watcher.on('change', onChange)
  watcher.on('unlink', onChange)

  const channel: Channel = { watcher, subs: new Set() }
  channels.set(projectId, channel)
  return channel
}

export function subscribe(projectId: string, res: ServerResponse): boolean {
  if (!projectExists(projectId)) return false
  const ch = ensureChannel(projectId)
  ch.subs.add(res)
  res.on('close', () => {
    ch.subs.delete(res)
    if (ch.subs.size === 0) {
      ch.watcher.close()
      channels.delete(projectId)
    }
  })
  return true
}
