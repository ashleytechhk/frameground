export interface FrameEntry {
  id: string
  name: string
  file?: string
  screenId?: string
  kind?: 'html' | 'flutter'
}

export interface Manifest {
  frames: FrameEntry[]
}

export interface LayoutEntry {
  x: number
  y: number
  w: number
  h: number
}

export type Layout = Record<string, LayoutEntry>

export const DEFAULT_LAYOUT: LayoutEntry = { x: 200, y: 200, w: 800, h: 600 }
