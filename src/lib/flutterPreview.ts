/**
 * Flutter previews run on their own localhost origin. Refreshing them therefore
 * means replacing iframe `src`, never reading cross-origin contentWindow.
 */
export type FlutterPreviewOptions = {
  instanceId?: string
  /** Non-anchor frames run the freshly compiled app without taking DWDS' one debug connection. */
  bypassDwds?: boolean
  /** Changes only after a successful runner update, preserving a failed preview. */
  revision?: number
}

export function flutterScreenUrl(
  runnerUrl: string,
  screenId: string,
  { instanceId = screenId, bypassDwds = false, revision }: FlutterPreviewOptions = {},
): string {
  const url = new URL(runnerUrl)
  url.searchParams.set('fg_screen', screenId)
  url.searchParams.set('fg_instance', instanceId)
  if (bypassDwds) url.searchParams.set('fg_no_dwds', '1')
  else url.searchParams.delete('fg_no_dwds')
  if (revision !== undefined) url.searchParams.set('fg_revision', String(revision))
  else url.searchParams.delete('fg_revision')
  return url.toString()
}

export function shouldReplaceFlutterIframe(previousUrl: string | undefined, nextUrl: string | undefined): boolean {
  return previousUrl !== nextUrl
}
