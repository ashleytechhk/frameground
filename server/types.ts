export interface FrameEntry {
  id: string
  name: string
  /** HTML source for legacy Frameground frames. */
  file?: string
  /** Shared Flutter PreviewCatalog key for a live Flutter frame. */
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
