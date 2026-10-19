import type { Node } from '@xyflow/react'
import type { FlutterRunnerState } from '../lib/api'

export const FLUTTER_FRAME_TYPE = 'flutter-frame' as const

export type FlutterFrameData = {
  name: string
  screenId: string
  instanceId: string
  bypassDwds: boolean
  url?: string
  runnerState: FlutterRunnerState
  runnerMessage?: string
  editMode: boolean
}

export type FlutterFrameNode = Node<FlutterFrameData, typeof FLUTTER_FRAME_TYPE>
