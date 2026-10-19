import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Background,
  ControlButton,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  type Node,
  type NodeChange,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { createFlutterCanvas, getFlutterWorkspace, patchFlutterCanvasLayout, type FlutterWorkspace } from '../lib/api'
import { ProjectEventsProvider } from '../lib/ProjectEventsProvider'
import { useFlutterFrameSync } from '../hooks/useFlutterFrameSync'
import { FlutterFrameNode } from '../shapes/FlutterFrameNode'
import type { LayoutEntry } from '../lib/manifest'

const nodeTypes = { 'flutter-frame': FlutterFrameNode }
const TITLE_BAR_HEIGHT = 32
const LAYOUT_DEBOUNCE_MS = 250

type PendingLayout = Partial<LayoutEntry>

function useFlutterLayoutWriter(workspaceId: string, canvasId: string) {
  const pending = useRef<Map<string, PendingLayout>>(new Map())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    const batch = pending.current
    pending.current = new Map()
    timer.current = null
    for (const [frameId, patch] of batch) {
      patchFlutterCanvasLayout(workspaceId, canvasId, frameId, patch).catch(() => {})
    }
  }, [workspaceId, canvasId])

  const enqueue = useCallback((frameId: string, patch: PendingLayout) => {
    pending.current.set(frameId, { ...pending.current.get(frameId), ...patch })
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

function FlutterCanvasInner({ workspace, canvasId }: { workspace: FlutterWorkspace; canvasId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const { loading, runner } = useFlutterFrameSync(workspace.id, canvasId, setNodes)
  const writeLayout = useFlutterLayoutWriter(workspace.id, canvasId)
  const navigate = useNavigate()
  const { getNodes, getViewport } = useReactFlow()
  const [canvasMode, setCanvasMode] = useState<'pan' | 'select'>('pan')
  const [creatingCanvas, setCreatingCanvas] = useState(false)

  const changeCanvasMode = useCallback((mode: 'pan' | 'select') => {
    setCanvasMode(mode)
    if (mode === 'pan') setNodes(current => current.map(node => node.selected ? { ...node, selected: false } : node))
  }, [setNodes])

  const wrappedOnNodesChange = useCallback((changes: NodeChange[]) => {
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
  }, [onNodesChange, writeLayout])

  const createCanvas = useCallback(async () => {
    const id = prompt('New Canvas id (for example: settings):')?.trim()
    if (!id) return
    setCreatingCanvas(true)
    try {
      const canvas = await createFlutterCanvas(workspace.id, id)
      // Routing replaces this tree, which unmounts prior iframe previews. The
      // shared runner remains alive in the server registry.
      navigate(`/p/${workspace.id}/${canvas.id}`)
    } catch (error) {
      alert(error instanceof Error ? error.message.replace(/^\d+ [^:]+: /, '') : 'Could not create canvas')
    } finally {
      setCreatingCanvas(false)
    }
  }, [workspace.id, navigate])

  const nodesWithInteraction = useMemo(() => nodes.map(node => ({
    ...node,
    draggable: canvasMode === 'select',
  })), [nodes, canvasMode])

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex' }}>
      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <div style={leftBarStyle}>
          <Link to="/" style={{ color: '#666', textDecoration: 'none' }}>← Projects</Link>
          <span style={{ color: '#ccc' }}>/</span>
          <strong>{workspace.id}</strong>
          <span style={flutterBadgeStyle}>Flutter</span>
        </div>
        <div style={canvasTabsStyle}>
          {workspace.canvases.map(canvas => (
            <Link
              key={canvas.id}
              to={`/p/${workspace.id}/${canvas.id}`}
              style={{ ...canvasTabStyle, ...(canvas.id === canvasId ? activeCanvasTabStyle : {}) }}
            >
              {canvas.name}
            </Link>
          ))}
          <button onClick={() => { void createCanvas() }} disabled={creatingCanvas} style={newCanvasStyle}>
            {creatingCanvas ? 'Creating…' : '+ Canvas'}
          </button>
        </div>
        <div style={runnerStatusStyle(runner.state)} role="status">
          {loading ? 'Loading canvas…' : `Runner: ${runner.state}`}
          {runner.message ? ` — ${runner.message}` : ''}
          {runner.pid ? ` (pid ${runner.pid})` : ''}
        </div>
        <ReactFlow
          nodes={nodesWithInteraction}
          edges={[]}
          onNodesChange={wrappedOnNodesChange}
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
          style={{ cursor: canvasMode === 'pan' ? 'grab' : 'default', background: '#252525' }}
          onNodeDoubleClick={(_, node) => {
            setNodes(current => current.map(item => item.id === node.id
              ? { ...item, data: { ...item.data, editMode: true } }
              : item,
            ))
          }}
          onPaneClick={() => {
            setNodes(current => current.map(node => {
              const editMode = node.data.editMode ? false : node.data.editMode
              return node.selected || editMode !== node.data.editMode
                ? { ...node, selected: false, data: { ...node.data, editMode } }
                : node
            }))
          }}
          onMoveEnd={() => { void getNodes(); void getViewport() }}
        >
          <Background color="rgba(255,255,255,0.18)" />
          <Controls position="bottom-left">
            <ControlButton onClick={() => changeCanvasMode('pan')} title="Pan mode" aria-label="Pan mode" style={modeButtonStyle(canvasMode === 'pan')}>✋</ControlButton>
            <ControlButton onClick={() => changeCanvasMode('select')} title="Select mode" aria-label="Select mode" style={modeButtonStyle(canvasMode === 'select')}>↖</ControlButton>
          </Controls>
        </ReactFlow>
      </div>
    </div>
  )
}

export function FlutterCanvas({ workspaceId, canvasId }: { workspaceId: string; canvasId?: string }) {
  const [workspace, setWorkspace] = useState<FlutterWorkspace | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getFlutterWorkspace(workspaceId).then(value => {
      if (!cancelled) setWorkspace(value)
    }).catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load Flutter workspace')
    })
    return () => { cancelled = true }
  }, [workspaceId])

  if (error) return <div style={messageStyle}>{error}</div>
  if (!workspace) return <div style={messageStyle}>Loading Flutter workspace…</div>
  const activeCanvas = workspace.canvases.some(canvas => canvas.id === canvasId)
    ? canvasId!
    : workspace.defaultCanvasId
  if (!activeCanvas) return <div style={messageStyle}>This Flutter workspace has no canvas.</div>

  return (
    <ProjectEventsProvider projectId={workspace.id}>
      <ReactFlowProvider key={`${workspace.id}/${activeCanvas}`}>
        <FlutterCanvasInner workspace={workspace} canvasId={activeCanvas} />
      </ReactFlowProvider>
    </ProjectEventsProvider>
  )
}

const leftBarStyle: React.CSSProperties = {
  position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', alignItems: 'center', gap: 8,
  background: 'rgba(255,255,255,0.92)', padding: '6px 12px', borderRadius: 6,
  boxShadow: '0 1px 4px rgba(0,0,0,.16)', fontSize: 13,
  fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
}

const flutterBadgeStyle: React.CSSProperties = {
  borderRadius: 999, padding: '2px 6px', color: '#006a9e', background: '#e5f5fc', fontSize: 11, fontWeight: 700,
}

const canvasTabsStyle: React.CSSProperties = {
  position: 'absolute', top: 56, left: 12, zIndex: 10, display: 'flex', gap: 6, alignItems: 'center',
  maxWidth: 'calc(100% - 24px)', overflowX: 'auto', padding: 3,
  background: 'rgba(37,37,37,.84)', borderRadius: 7,
}

const canvasTabStyle: React.CSSProperties = {
  color: '#ddd', textDecoration: 'none', borderRadius: 5, padding: '5px 9px', fontSize: 12,
  fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif', whiteSpace: 'nowrap',
}

const activeCanvasTabStyle: React.CSSProperties = { background: '#fff', color: '#222', fontWeight: 650 }
const newCanvasStyle: React.CSSProperties = { ...canvasTabStyle, border: '1px dashed #888', background: 'transparent', cursor: 'pointer' }

function runnerStatusStyle(state: string): React.CSSProperties {
  const color = state === 'ready' ? '#16803c' : state === 'error' ? '#bd3030' : '#8a5c00'
  return {
    position: 'absolute', top: 12, right: 12, zIndex: 10, maxWidth: 460,
    background: 'rgba(255,255,255,.92)', color, padding: '6px 10px', borderRadius: 6,
    boxShadow: '0 1px 4px rgba(0,0,0,.16)', fontSize: 12,
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  }
}

function modeButtonStyle(active: boolean): React.CSSProperties {
  return { color: active ? '#fff' : '#222', background: active ? '#2a4dff' : undefined, fontWeight: active ? 700 : 400 }
}

const messageStyle: React.CSSProperties = {
  padding: 30, fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif', color: '#333',
}
