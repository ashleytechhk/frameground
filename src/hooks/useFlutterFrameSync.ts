import { useCallback, useEffect, useRef, useState } from 'react'
import type { Node } from '@xyflow/react'
import {
  getFlutterCanvasLayout,
  getFlutterCanvasManifest,
  getFlutterRunnerStatus,
  startFlutterRunner,
  type FlutterRunnerStatus,
} from '../lib/api'
import { flutterScreenUrl } from '../lib/flutterPreview'
import { DEFAULT_LAYOUT, type FrameEntry } from '../lib/manifest'
import { FLUTTER_FRAME_TYPE } from '../shapes/FlutterFrameShape'
import { useProjectEvent } from '../lib/projectEvents'

type SetNodes = React.Dispatch<React.SetStateAction<Node[]>>

const STOPPED: FlutterRunnerStatus = { state: 'stopped', updatedAt: 0 }

function buildNode(
  entry: FrameEntry,
  layout = DEFAULT_LAYOUT,
  runner = STOPPED,
  bypassDwds = false,
  revision = 0,
): Node {
  const screenId = entry.screenId ?? entry.id
  return {
    id: entry.id,
    type: FLUTTER_FRAME_TYPE,
    position: { x: layout.x, y: layout.y },
    style: { width: layout.w, height: layout.h + 32 },
    data: {
      name: entry.name,
      screenId,
      instanceId: entry.id,
      bypassDwds,
      url: runner.url
        ? flutterScreenUrl(runner.url, screenId, { instanceId: entry.id, bypassDwds, revision: bypassDwds ? revision : undefined })
        : undefined,
      runnerState: runner.state,
      runnerMessage: runner.message,
      editMode: false,
    },
  }
}

export function useFlutterFrameSync(workspaceId: string, canvasId: string, setNodes: SetNodes) {
  const [loading, setLoading] = useState(true)
  const [runner, setRunner] = useState<FlutterRunnerStatus>(STOPPED)
  const [revision, setRevision] = useState(0)
  const previousRunnerState = useRef<FlutterRunnerStatus['state']>(STOPPED.state)

  const reloadCanvas = useCallback(async () => {
    const [manifest, layout] = await Promise.all([
      getFlutterCanvasManifest(workspaceId, canvasId),
      getFlutterCanvasLayout(workspaceId, canvasId),
    ])
    setNodes(manifest.frames.map((frame, index) => buildNode(
      frame,
      layout[frame.id] ?? DEFAULT_LAYOUT,
      runner,
      index !== 0,
      revision,
    )))
  }, [workspaceId, canvasId, setNodes, runner, revision])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getFlutterCanvasManifest(workspaceId, canvasId),
      getFlutterCanvasLayout(workspaceId, canvasId),
      startFlutterRunner(workspaceId),
    ]).then(([manifest, layout, nextRunner]) => {
      if (cancelled) return
      setRunner(nextRunner)
      setNodes(manifest.frames.map((frame, index) => buildNode(
        frame,
        layout[frame.id] ?? DEFAULT_LAYOUT,
        nextRunner,
        index !== 0,
        0,
      )))
      setLoading(false)
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [workspaceId, canvasId, setNodes])

  useEffect(() => {
    if (runner.state === 'ready' && previousRunnerState.current !== 'ready') {
      setRevision(current => current + 1)
    }
    previousRunnerState.current = runner.state
  }, [runner.state])

  useEffect(() => {
    // Keep a status fallback when an SSE connection is being re-established.
    if (runner.state === 'ready' || runner.state === 'error') return
    const id = window.setInterval(() => {
      getFlutterRunnerStatus(workspaceId).then(setRunner).catch(() => {})
    }, 1_000)
    return () => window.clearInterval(id)
  }, [workspaceId, runner.state])

  useEffect(() => {
    setNodes(current => current.map(node => {
      const data = node.data as { screenId?: string; instanceId?: string; bypassDwds?: boolean; url?: string }
      const nextUrl = runner.url && data.screenId
        ? flutterScreenUrl(runner.url, data.screenId, {
          instanceId: data.instanceId ?? node.id,
          bypassDwds: data.bypassDwds,
          revision: data.bypassDwds ? revision : undefined,
        })
        : data.url
      return {
        ...node,
        data: { ...node.data, url: nextUrl, runnerState: runner.state, runnerMessage: runner.message },
      }
    }))
  }, [runner, revision, setNodes])

  useProjectEvent('flutter-runner', event => {
    try { setRunner(JSON.parse(event.data) as FlutterRunnerStatus) } catch { /* ignore malformed SSE */ }
  })
  useProjectEvent('flutter-canvas-changed', event => {
    try {
      const value = JSON.parse(event.data) as { canvasId?: string }
      if (value.canvasId === canvasId) void reloadCanvas()
    } catch { /* ignore malformed SSE */ }
  })

  return { loading, runner, reloadCanvas }
}
