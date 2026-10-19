import { memo } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import type { FlutterFrameData } from './FlutterFrameShape'

const TITLE_BAR_HEIGHT = 32

function FlutterFrameNodeComponent({ data, selected }: NodeProps) {
  const frame = data as unknown as FlutterFrameData
  const statusColor = frame.runnerState === 'ready'
    ? '#16803c'
    : frame.runnerState === 'error' ? '#bd3030' : '#8a5c00'

  return (
    <>
      <NodeResizer isVisible={!!selected} minWidth={200} minHeight={150} />
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          overflow: 'hidden', borderRadius: 8,
          boxShadow: selected ? '0 0 0 2px #2a4dff, 0 4px 16px rgba(42,77,255,0.25)' : '0 2px 12px rgba(0,0,0,0.15)',
          border: `1px solid ${selected ? '#2a4dff' : '#e0e0e0'}`,
          background: '#fff',
        }}
      >
        <div
          style={{
            height: TITLE_BAR_HEIGHT, background: '#f5f5f5', borderBottom: '1px solid #e0e0e0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 8px', flexShrink: 0, gap: 8,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {frame.name}
          </span>
          <span title={frame.runnerMessage ?? frame.runnerState} style={{ fontSize: 11, color: statusColor, whiteSpace: 'nowrap' }}>
            Flutter · {frame.runnerState}
          </span>
        </div>
        {frame.url ? (
          <iframe
            // `src` may point at a different localhost port. Do not use an
            // iframe ref/contentWindow here: cross-origin refresh is source-only.
            src={frame.url}
            sandbox="allow-scripts allow-same-origin"
            style={{ width: '100%', flex: 1, border: 'none', pointerEvents: frame.editMode ? 'auto' : 'none', background: '#fff' }}
            title={`${frame.name} Flutter preview`}
          />
        ) : (
          <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 20, color: '#777', textAlign: 'center', fontSize: 13 }}>
            {frame.runnerMessage ?? 'Starting shared Flutter runner…'}
          </div>
        )}
        {frame.runnerState === 'error' && (
          <div style={{ position: 'absolute', right: 8, bottom: 8, maxWidth: '85%', padding: '5px 7px', borderRadius: 5, background: 'rgba(130,20,20,.88)', color: '#fff', fontSize: 11 }}>
            {frame.runnerMessage ?? 'Flutter compile error — last successful preview is retained.'}
          </div>
        )}
      </div>
    </>
  )
}

export const FlutterFrameNode = memo(FlutterFrameNodeComponent)
