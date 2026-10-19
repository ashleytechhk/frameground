import { describe, expect, test } from 'vitest'
import { flutterScreenUrl, shouldReplaceFlutterIframe } from './flutterPreview'

describe('flutterScreenUrl', () => {
  test('adds the selected screen to a runner origin without reading iframe state', () => {
    const result = new URL(flutterScreenUrl('http://127.0.0.1:48123', 'welcome'))

    expect(result.origin).toBe('http://127.0.0.1:48123')
    expect(result.pathname).toBe('/')
    expect(result.searchParams.get('fg_screen')).toBe('welcome')
    expect(result.searchParams.get('fg_instance')).toBe('welcome')
  })

  test('preserves runner path, existing query values, and hash while replacing a stale screen id', () => {
    const result = new URL(flutterScreenUrl(
      'http://127.0.0.1:48123/preview?theme=dark&fg_screen=stale#app',
      'activity details',
    ))

    expect(result.pathname).toBe('/preview')
    expect(result.searchParams.get('theme')).toBe('dark')
    expect(result.searchParams.get('fg_screen')).toBe('activity details')
    expect(result.searchParams.get('fg_instance')).toBe('activity details')
    expect(result.hash).toBe('#app')
  })

  test('keeps duplicate screen previews in separate DWDS instances', () => {
    const first = new URL(flutterScreenUrl('http://127.0.0.1:48123', 'settings', { instanceId: 'settings-phone' }))
    const second = new URL(flutterScreenUrl('http://127.0.0.1:48123', 'settings', { instanceId: 'settings-tablet' }))

    expect(first.searchParams.get('fg_instance')).toBe('settings-phone')
    expect(second.searchParams.get('fg_instance')).toBe('settings-tablet')
  })

  test('marks non-anchor frames as DWDS-free and refreshes them only at a new revision', () => {
    const result = new URL(flutterScreenUrl('http://127.0.0.1:48123', 'activity', {
      instanceId: 'activity-preview',
      bypassDwds: true,
      revision: 7,
    }))

    expect(result.searchParams.get('fg_no_dwds')).toBe('1')
    expect(result.searchParams.get('fg_revision')).toBe('7')
  })

})

describe('shouldReplaceFlutterIframe', () => {
  test.each([
    [undefined, undefined, false],
    ['http://127.0.0.1:48123/?fg_screen=welcome', 'http://127.0.0.1:48123/?fg_screen=welcome', false],
    [undefined, 'http://127.0.0.1:48123/?fg_screen=welcome', true],
    ['http://127.0.0.1:48123/?fg_screen=welcome', undefined, true],
    ['http://127.0.0.1:48123/?fg_screen=welcome', 'http://127.0.0.1:48123/?fg_screen=settings', true],
    ['http://127.0.0.1:48123/?fg_screen=welcome', 'http://127.0.0.1:48124/?fg_screen=welcome', true],
  ] as const)('source-only iframe refresh is %s → %s = %s', (previous, next, expected) => {
    expect(shouldReplaceFlutterIframe(previous, next)).toBe(expected)
  })
})
