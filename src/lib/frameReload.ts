function normalizePath(file: string): string {
  return file.replace(/\\/g, '/').replace(/^\.\//, '')
}

/**
 * Whether a filesystem change can affect a frame's iframe.
 *
 * HTML changes reload only the exact manifest entry. Other files reload frames
 * in the same directory subtree; a project-root file is treated as shared.
 */
export function shouldReloadFrameForFile(frameFile: string, changedFile: string): boolean {
  const frame = normalizePath(frameFile)
  const changed = normalizePath(changedFile)

  if (changed.toLowerCase().endsWith('.html')) return frame === changed

  const slash = changed.lastIndexOf('/')
  if (slash === -1) return true

  const changedDir = changed.slice(0, slash)
  const frameSlash = frame.lastIndexOf('/')
  const frameDir = frameSlash === -1 ? '' : frame.slice(0, frameSlash)
  return frameDir === changedDir || changedDir.startsWith(`${frameDir}/`)
}
