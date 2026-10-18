import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  Background,
  Controls,
  ControlButton,
  SelectionMode,
  type NodeChange,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { HtmlFrameNode } from '../shapes/HtmlFrameNode'
import { useFrameSync } from '../hooks/useFrameSync'
import { useTokenSync } from '../hooks/useTokenSync'
import { useDesignDoc } from '../hooks/useDesignDoc'
import { useSuggestions } from '../hooks/useSuggestions'
import { TokensSyncContext } from '../context/TokensSyncContext'
import { ProjectEventsProvider } from '../lib/ProjectEventsProvider'
import { TokensPanel } from '../components/TokensPanel'
import { ChatDock } from '../components/ChatDock'
import { SettingsPanel } from '../components/SettingsPanel'
import { HelperLines } from '../components/HelperLines'
import { deleteFrame, dismissSuggestion, pasteImage, patchLayout } from '../lib/api'
import { getHelperLines } from '../lib/helperLines'
import { useSettings } from '../hooks/useSettings'
import type { LayoutEntry } from '../lib/manifest'

const nodeTypes = { 'html-frame': HtmlFrameNode }
const TITLE_BAR_HEIGHT = 32
const LAYOUT_DEBOUNCE_MS = 250

type PendingLayout = Partial<LayoutEntry>

function useLayoutWriter(projectId: string) {
  const pending = useRef<Map<string, PendingLayout>>(new Map())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    const batch = pending.current
    pending.current = new Map()
    timer.current = null
    for (const [frameId, patch] of batch) {
      patchLayout(projectId, frameId, patch).catch(() => {})
    }
  }, [projectId])

  const enqueue = useCallback((frameId: string, patch: PendingLayout) => {
    const current = pending.current.get(frameId) ?? {}
    pending.current.set(frameId, { ...current, ...patch })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, LAYOUT_DEBOUNCE_MS)
  }, [flush])

  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current)
      flush()
    }
  }, [flush])

  return enqueue
}

function toKebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

function pathToCssVar(path: string[]): string {
  return '--' + path.map(toKebab).join('-')
}

function buildOverridesCss(overrides: Map<string, string>): string {
  if (overrides.size === 0) return ''
  const families: string[] = []
  const decls: string[] = []
  for (const [key, value] of overrides) {
    decls.push(`  ${pathToCssVar(key.split('.'))}: ${value};`)
    if (key.split('.').pop() === 'fontFamily' && !value.startsWith('var(')) {
      families.push(value)
    }
  }
  const imports = families
    .map(f => `@import url('https://fonts.googleapis.com/css2?family=${f.replace(/\s+/g, '+')}:wght@200;300;400;500;600;700&display=swap');`)
    .join('\n')
  const root = `:root {\n${decls.join('\n')}\n}\n`
  return imports ? `${imports}\n${root}` : root
}

async function clipboardImage(): Promise<{ dataUrl: string; width: number; height: number }> {
  if (!navigator.clipboard?.read) {
    throw new Error('This browser does not allow reading images from the clipboard.')
  }
  const items = await navigator.clipboard.read()
  const item = items.find(candidate => candidate.types.some(type => /^image\/(png|jpeg|gif|webp|avif)$/.test(type)))
  const type = item?.types.find(candidate => /^image\/(png|jpeg|gif|webp|avif)$/.test(candidate))
  if (!item || !type) throw new Error('No supported image found in the clipboard.')
  const blob = await item.getType(type)
  if (blob.size > 12 * 1024 * 1024) throw new Error('The image is larger than 12 MB.')
  const [dataUrl, dimensions] = await Promise.all([
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('Could not read the clipboard image.'))
      reader.onload = () => resolve(String(reader.result))
      reader.readAsDataURL(blob)
    }),
    new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image()
      const url = URL.createObjectURL(blob)
      image.onload = () => {
        URL.revokeObjectURL(url)
        resolve({ width: image.naturalWidth, height: image.naturalHeight })
      }
      image.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Could not inspect the clipboard image.'))
      }
      image.src = url
    }),
  ])
  return { dataUrl, ...dimensions }
}

function CanvasInner({ projectId }: { projectId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const { loading } = useFrameSync(projectId, setNodes)
  const { tokensCss } = useTokenSync(projectId)
  const { design } = useDesignDoc(projectId)
  const { suggestions } = useSuggestions(projectId)
  const writeLayout = useLayoutWriter(projectId)
  const { getNodes, getViewport, fitView, screenToFlowPosition } = useReactFlow()

  const [panelOpen, setPanelOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map())
  const [helperLines, setHelperLines] = useState<{ horizontal?: number; vertical?: number }>({})
  const [pasteStatus, setPasteStatus] = useState<string | null>(null)
  const [canvasMode, setCanvasMode] = useState<'pan' | 'select'>('pan')

  const settings = useSettings(projectId)
  const { snap: snapEnabled, snapPx, fitDurationMs } = settings.global.canvas

  const overridesCss = useMemo(() => buildOverridesCss(overrides), [overrides])
  const tokensSyncValue = useMemo(() => ({ tokensCss, overridesCss }), [tokensCss, overridesCss])

  const setOverride = useCallback((path: string[], value: string | null) => {
    setOverrides(prev => {
      const next = new Map(prev)
      const key = path.join('.')
      if (value === null) next.delete(key)
      else next.set(key, value)
      return next
    })
  }, [])

  const applyVariant = useCallback((tokens: Record<string, unknown>) => {
    setOverrides(prev => {
      const next = new Map(prev)
      const visit = (val: unknown, path: string[]) => {
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          for (const k of Object.keys(val as Record<string, unknown>)) {
            visit((val as Record<string, unknown>)[k], [...path, k])
          }
        } else if (typeof val === 'string' || typeof val === 'number') {
          next.set(path.join('.'), String(val))
        }
      }
      visit(tokens, [])
      return next
    })
  }, [])

  const handleDismissSuggestion = useCallback((id: string) => {
    dismissSuggestion(projectId, id).catch(() => {})
  }, [projectId])

  const resetOverrides = useCallback(() => setOverrides(new Map()), [])

  const changeCanvasMode = useCallback((mode: 'pan' | 'select') => {
    setCanvasMode(mode)
    // Pan mode is deliberately navigation-only. Clearing the old selection
    // prevents an accidental drag over a previously selected frame from moving it.
    if (mode === 'pan') {
      setNodes(nds => nds.map(node => node.selected ? { ...node, selected: false } : node))
    }
  }, [setNodes])

  const handlePasteImage = useCallback(async () => {
    try {
      setPasteStatus('Reading clipboard…')
      const image = await clipboardImage()
      const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      const scale = Math.min(1, 1200 / image.width, 1200 / image.height)
      const width = Math.max(240, Math.round(image.width * scale))
      const height = Math.max(180, Math.round(image.height * scale))
      await pasteImage(projectId, {
        ...image,
        x: Math.round(center.x - width / 2),
        y: Math.round(center.y - height / 2),
      })
      setPasteStatus('Image added')
      window.setTimeout(() => setPasteStatus(null), 2000)
    } catch (error) {
      setPasteStatus(error instanceof Error ? error.message : 'Could not paste the image.')
    }
  }, [projectId, screenToFlowPosition])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        setPanelOpen(o => !o)
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault()
        setChatOpen(o => !o)
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        setSettingsOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const jumpToFrame = useCallback((frameId: string) => {
    fitView({ nodes: [{ id: frameId }], duration: fitDurationMs, maxZoom: 1.2 })
  }, [fitView, fitDurationMs])

  const frameIds = useMemo(() => nodes.map(n => n.id), [nodes])

  const wrappedOnNodesChange = useCallback((changes: NodeChange[]) => {
    let nextLines: { horizontal?: number; vertical?: number } | null = null
    for (const change of changes) {
      if (change.type !== 'position' || !change.position) continue
      if (change.dragging) {
        if (snapEnabled) {
          const zoom = getViewport().zoom
          const lines = getHelperLines(change, getNodes(), snapPx / zoom)
          if (lines.snapPosition.x !== undefined) change.position.x = lines.snapPosition.x
          if (lines.snapPosition.y !== undefined) change.position.y = lines.snapPosition.y
          nextLines = { horizontal: lines.horizontal, vertical: lines.vertical }
        } else {
          nextLines = {}
        }
      } else if (change.dragging === false) {
        nextLines = {}
      }
    }
    if (nextLines !== null) setHelperLines(nextLines)
    onNodesChange(changes)
    for (const change of changes) {
      if (change.type === 'position' && change.position && change.dragging === false) {
        writeLayout(change.id, { x: change.position.x, y: change.position.y })
      }
      if (change.type === 'dimensions' && change.dimensions && change.resizing === false) {
        writeLayout(change.id, {
          w: change.dimensions.width,
          h: Math.max(0, change.dimensions.height - TITLE_BAR_HEIGHT),
        })
      }
    }
  }, [onNodesChange, writeLayout, getNodes, getViewport, snapEnabled, snapPx])

  const handleBeforeDelete = useCallback(async ({ nodes: deleted }: { nodes: Node[] }) => {
    const confirmed = deleted.filter(node =>
      confirm(`Delete frame "${(node.data as { name?: string }).name ?? node.id}"?`)
    )
    for (const node of confirmed) {
      deleteFrame(projectId, node.id).catch(() => {})
    }
    return false
  }, [projectId])

  const nodesWithProject = useMemo(
    // In Pan mode every drag is navigation. Select mode delegates selection and
    // multi-node dragging to React Flow, so selected frames move together.
    () => nodes.map(n => ({
      ...n,
      draggable: canvasMode === 'select',
      data: { ...n.data, projectId },
    })),
    [nodes, projectId, canvasMode],
  )

  return (
    <TokensSyncContext.Provider value={tokensSyncValue}>
    <div style={{ position: 'fixed', inset: 0, display: 'flex' }}>
      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            zIndex: 10,
            background: 'rgba(255,255,255,0.9)',
            padding: '6px 12px',
            borderRadius: 6,
            boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
            fontSize: 13,
            fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
          }}
        >
          <Link to="/" style={{ color: '#666', textDecoration: 'none' }}>← Projects</Link>
          <span style={{ margin: '0 8px', color: '#ccc' }}>/</span>
          <span style={{ fontWeight: 600 }}>{projectId}</span>
        </div>
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 10,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          {loading && <span style={{ fontSize: 13, color: '#666' }}>Loading…</span>}
          <button
            onClick={() => { void handlePasteImage() }}
            title="Paste an image from the clipboard"
            style={toolbarBtnStyle}
          >
            Paste image
          </button>
          {!chatOpen && (
            <button
              onClick={() => setChatOpen(true)}
              title="Chat (C)"
              style={toolbarBtnStyle}
            >
              Chat
            </button>
          )}
          {!panelOpen && (
            <button
              onClick={() => setPanelOpen(true)}
              title="Tokens (T)"
              style={toolbarBtnStyle}
            >
              Tokens
            </button>
          )}
          {!settingsOpen && (
            <button
              onClick={() => setSettingsOpen(true)}
              title="Settings (S)"
              style={toolbarBtnStyle}
            >
              Settings
            </button>
          )}
        </div>
        {pasteStatus && (
          <div
            role="status"
            style={{
              position: 'absolute', top: 52, right: 12, zIndex: 10,
              maxWidth: 320, background: 'rgba(35,35,35,0.88)', color: '#fff',
              padding: '7px 10px', borderRadius: 6, fontSize: 12,
              fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
            }}
          >
            {pasteStatus}
          </div>
        )}
        <ReactFlow
          nodes={nodesWithProject}
          edges={[]}
          onNodesChange={wrappedOnNodesChange}
          onBeforeDelete={handleBeforeDelete}
          nodeTypes={nodeTypes}
          nodesConnectable={false}
          nodesDraggable={canvasMode === 'select'}
          elementsSelectable={canvasMode === 'select'}
          panOnDrag={canvasMode === 'pan'}
          selectionOnDrag={canvasMode === 'select'}
          selectionMode={SelectionMode.Partial}
          fitView
          minZoom={0.1}
          maxZoom={4}
          style={{ cursor: canvasMode === 'pan' ? 'grab' : 'default' }}
          onNodeDoubleClick={(_, node) => {
            setNodes(nds => nds.map(n =>
              n.id === node.id ? { ...n, data: { ...n.data, editMode: true } } : n
            ))
          }}
          onPaneClick={() => {
            setNodes(nds => nds.map(n => {
              const editMode = n.data.editMode ? false : n.data.editMode
              return n.selected || editMode !== n.data.editMode
                ? { ...n, selected: false, data: { ...n.data, editMode } }
                : n
            }))
          }}
        >
          <Background />
          <Controls position="bottom-left">
            <ControlButton
              onClick={() => changeCanvasMode('pan')}
              title="Pan mode — drag anywhere to move the canvas"
              aria-label="Pan mode"
              style={canvasModeButtonStyle(canvasMode === 'pan')}
            >
              ✋
            </ControlButton>
            <ControlButton
              onClick={() => changeCanvasMode('select')}
              title="Select mode — drag empty canvas to select multiple frames"
              aria-label="Select mode"
              style={canvasModeButtonStyle(canvasMode === 'select')}
            >
              ↖
            </ControlButton>
          </Controls>
          <HelperLines horizontal={helperLines.horizontal} vertical={helperLines.vertical} />
        </ReactFlow>
      </div>
      {panelOpen && (
        <TokensPanel
          projectId={projectId}
          design={design}
          overrides={overrides}
          suggestions={suggestions}
          onSetOverride={setOverride}
          onApplyVariant={applyVariant}
          onDismissSuggestion={handleDismissSuggestion}
          onReset={resetOverrides}
          onClose={() => setPanelOpen(false)}
        />
      )}
      {chatOpen && (
        <ChatDock
          projectId={projectId}
          frameIds={frameIds}
          onClose={() => setChatOpen(false)}
          onJumpToFrame={jumpToFrame}
        />
      )}
      {settingsOpen && (
        <SettingsPanel
          projectId={projectId}
          settings={settings}
          design={design}
          frameCount={nodes.length}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
    </TokensSyncContext.Provider>
  )
}

const toolbarBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.9)',
  border: '1px solid #d8d8d8',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
}

function canvasModeButtonStyle(active: boolean): React.CSSProperties {
  return {
    color: active ? '#fff' : '#222',
    background: active ? '#2a4dff' : undefined,
    fontSize: 16,
    fontWeight: active ? 700 : 400,
  }
}

export function Canvas() {
  const { projectId } = useParams<{ projectId: string }>()
  if (!projectId) return <div>Missing project id</div>
  return (
    <ProjectEventsProvider projectId={projectId}>
      <ReactFlowProvider key={projectId}>
        <CanvasInner projectId={projectId} />
      </ReactFlowProvider>
    </ProjectEventsProvider>
  )
}
