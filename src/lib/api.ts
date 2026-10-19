import type { Manifest, Layout, LayoutEntry, FrameEntry } from './manifest'

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${text}`)
  }
  return res.json() as Promise<T>
}

export function listProjects(): Promise<{ projects: string[] }> {
  return req('/api/projects')
}

export function createProject(name: string): Promise<{ id: string }> {
  return req('/api/projects', { method: 'POST', body: JSON.stringify({ name }) })
}

export interface ProjectCardMetadata {
  /** Optional user-selected project card color, serialized as `#RRGGBB`. */
  color?: string
}

export type WorkspaceSummary =
  | ({ id: string; kind: 'html' } & ProjectCardMetadata)
  | ({
      id: string
      kind: 'flutter'
      version: 1
      defaultCanvasId: string
      canvases: FlutterCanvas[]
    } & ProjectCardMetadata)

export interface FlutterCanvas {
  id: string
  name: string
}

export interface FlutterWorkspace {
  id: string
  kind: 'flutter'
  version: 1
  defaultCanvasId: string
  canvases: FlutterCanvas[]
}

export type FlutterRunnerState = 'stopped' | 'starting' | 'ready' | 'reloading' | 'restarting' | 'error'

export interface FlutterRunnerStatus {
  state: FlutterRunnerState
  url?: string
  pid?: number
  message?: string
  updatedAt: number
}

export function listWorkspaces(): Promise<{ workspaces: WorkspaceSummary[] }> {
  return req('/api/workspaces')
}

export function createFlutterWorkspace(name: string, canvasId = 'onboarding'): Promise<FlutterWorkspace> {
  return req('/api/flutter-workspaces', {
    method: 'POST',
    body: JSON.stringify({ name, canvasId }),
  })
}

export function patchProjectCardColor(projectId: string, color: string | null): Promise<{ id: string } & ProjectCardMetadata> {
  return req(`/api/projects/${projectId}/card`, {
    method: 'PATCH',
    body: JSON.stringify({ color }),
  })
}

export function patchProjectOrder(projectIds: string[]): Promise<{ projectIds: string[] }> {
  return req('/api/projects/order', {
    method: 'PATCH',
    body: JSON.stringify({ projectIds }),
  })
}

export function getFlutterWorkspace(workspaceId: string): Promise<FlutterWorkspace> {
  return req(`/api/flutter-workspaces/${workspaceId}`)
}

export function createFlutterCanvas(workspaceId: string, id: string, name = id): Promise<FlutterCanvas> {
  return req(`/api/flutter-workspaces/${workspaceId}/canvases`, {
    method: 'POST',
    body: JSON.stringify({ id, name }),
  })
}

export function getFlutterCanvasManifest(workspaceId: string, canvasId: string): Promise<Manifest> {
  return req(`/api/flutter-workspaces/${workspaceId}/canvases/${canvasId}/manifest`)
}

export function getFlutterCanvasLayout(workspaceId: string, canvasId: string): Promise<Layout> {
  return req(`/api/flutter-workspaces/${workspaceId}/canvases/${canvasId}/layout`)
}

export function patchFlutterCanvasLayout(
  workspaceId: string,
  canvasId: string,
  frameId: string,
  patch: Partial<LayoutEntry>,
): Promise<LayoutEntry> {
  return req(`/api/flutter-workspaces/${workspaceId}/canvases/${canvasId}/layout/${frameId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function getFlutterRunnerStatus(workspaceId: string): Promise<FlutterRunnerStatus> {
  return req(`/api/flutter-workspaces/${workspaceId}/runner`)
}

export function startFlutterRunner(workspaceId: string): Promise<FlutterRunnerStatus> {
  return req(`/api/flutter-workspaces/${workspaceId}/runner/start`, { method: 'POST' })
}

export function getManifest(projectId: string): Promise<Manifest> {
  return req(`/api/projects/${projectId}/manifest`)
}

export function getLayout(projectId: string): Promise<Layout> {
  return req(`/api/projects/${projectId}/layout`)
}

export function patchFrame(projectId: string, frameId: string, patch: Partial<Omit<FrameEntry, 'id'>>): Promise<FrameEntry> {
  return req(`/api/projects/${projectId}/frames/${frameId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function renameFrameFile(projectId: string, frameId: string, filename: string): Promise<FrameEntry> {
  return req(`/api/projects/${projectId}/frames/${frameId}/rename-file`, {
    method: 'POST',
    body: JSON.stringify({ filename }),
  })
}

export function deleteFrame(projectId: string, frameId: string, deleteFile = false): Promise<{ ok: true }> {
  const qs = deleteFile ? '?deleteFile=true' : ''
  return req(`/api/projects/${projectId}/frames/${frameId}${qs}`, { method: 'DELETE' })
}

export interface PastedImageResult {
  frame: FrameEntry
  layout: LayoutEntry
  asset: { file: string; mime: string }
}

export function pasteImage(projectId: string, body: {
  dataUrl: string
  width: number
  height: number
  x: number
  y: number
}): Promise<PastedImageResult> {
  return req(`/api/projects/${projectId}/pasted-images`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function patchLayout(projectId: string, frameId: string, patch: Partial<LayoutEntry>): Promise<LayoutEntry> {
  return req(`/api/projects/${projectId}/layout/${frameId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function patchDesignTokens(projectId: string, tokens: Record<string, unknown>): Promise<{ ok: true }> {
  return req(`/api/projects/${projectId}/design/tokens`, {
    method: 'PATCH',
    body: JSON.stringify({ tokens }),
  })
}

export interface SuggestionVariant {
  name: string
  description?: string
  tokens: Record<string, unknown>
}

export interface Suggestion {
  id: string
  tweak: string
  createdAt?: string
  prompt?: string
  source?: string
  variants: SuggestionVariant[]
}

export function fetchSuggestions(projectId: string): Promise<{ suggestions: Suggestion[] }> {
  return req(`/api/projects/${projectId}/suggestions`)
}

export function dismissSuggestion(projectId: string, suggestionId: string): Promise<{ ok: true }> {
  return req(`/api/projects/${projectId}/suggestions/${suggestionId}`, { method: 'DELETE' })
}

export type AgentProvider = 'claude-code' | 'codex' | 'gemini' | 'opencode'

export interface GlobalSettings {
  version: number
  agent: {
    provider: AgentProvider
    model: string
    debugAcp: boolean
    debugAcpFrames: boolean
  }
  canvas: {
    snap: boolean
    snapPx: number
    fitDurationMs: number
  }
}

export interface ProjectSettings {
  version: number
  canvas: {
    backgroundColor: string
  }
}

export type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T

export function getGlobalSettings(): Promise<GlobalSettings> {
  return req('/api/settings/global')
}

export function patchGlobalSettings(patch: DeepPartial<GlobalSettings>): Promise<GlobalSettings> {
  return req('/api/settings/global', { method: 'PATCH', body: JSON.stringify(patch) })
}

export type AgentTestResult =
  | { ok: true; provider: AgentProvider; label: string; durationMs: number; protocolVersion: number }
  | { ok: false; provider: AgentProvider; label: string; error: string; command: string; stderr: string }

export function testAgent(): Promise<AgentTestResult> {
  return req('/api/settings/agent/test', { method: 'POST' })
}

export function getProjectSettings(projectId: string): Promise<ProjectSettings> {
  return req(`/api/projects/${projectId}/settings`)
}

export function patchProjectSettings(projectId: string, patch: DeepPartial<ProjectSettings>): Promise<ProjectSettings> {
  return req(`/api/projects/${projectId}/settings`, { method: 'PATCH', body: JSON.stringify(patch) })
}

export interface ModelInfo {
  modelId: string
  name: string
  description?: string | null
}

export interface ModelState {
  availableModels: ModelInfo[]
  currentModelId: string | null
  source: 'acp' | 'fallback'
}

export type SetModelResult = { ok: true; via: 'session' | 'restart'; modelId: string }

export function getAgentModels(projectId: string): Promise<ModelState> {
  return req(`/api/projects/${projectId}/agent/models`)
}

export function setAgentModel(projectId: string, modelId: string): Promise<SetModelResult> {
  return req(`/api/projects/${projectId}/agent/model`, {
    method: 'POST',
    body: JSON.stringify({ modelId }),
  })
}
