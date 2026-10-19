import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getFlutterWorkspace } from '../lib/api'
import { Canvas } from './Canvas'
import { FlutterCanvas } from './FlutterCanvas'

/** Chooses the legacy HTML canvas or a Flutter workspace at the same project URL. */
export function CanvasRoute() {
  const { projectId, canvasId } = useParams<{ projectId: string; canvasId?: string }>()
  const [kind, setKind] = useState<'loading' | 'html' | 'flutter'>('loading')

  useEffect(() => {
    let cancelled = false
    if (!projectId) return
    getFlutterWorkspace(projectId)
      .then(() => { if (!cancelled) setKind('flutter') })
      .catch(() => { if (!cancelled) setKind('html') })
    return () => { cancelled = true }
  }, [projectId])

  if (!projectId || kind === 'loading') return <div style={{ padding: 30 }}>Loading workspace…</div>
  if (kind === 'flutter') return <FlutterCanvas key={`${projectId}/${canvasId ?? ''}`} workspaceId={projectId} canvasId={canvasId} />
  return <Canvas />
}
