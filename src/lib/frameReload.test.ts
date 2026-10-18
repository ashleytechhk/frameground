import { describe, expect, test } from 'vitest'
import { shouldReloadFrameForFile } from './frameReload'

describe('shouldReloadFrameForFile', () => {
  test('matches a changed HTML file by its manifest path, not its frame id', () => {
    expect(shouldReloadFrameForFile('frames/scene/index.html', 'frames/scene/index.html')).toBe(true)
    expect(shouldReloadFrameForFile('frames/other/index.html', 'frames/scene/index.html')).toBe(false)
  })

  test('reloads only frames below the changed asset directory', () => {
    expect(shouldReloadFrameForFile('frames/scene/index.html', 'frames/scene/assets/hero.png')).toBe(true)
    expect(shouldReloadFrameForFile('frames/scene/detail/index.html', 'frames/scene/assets/hero.png')).toBe(false)
    expect(shouldReloadFrameForFile('frames/other/index.html', 'frames/scene/assets/hero.png')).toBe(false)
  })

  test('treats project-root dependencies as shared', () => {
    expect(shouldReloadFrameForFile('index.html', 'shared.css')).toBe(true)
    expect(shouldReloadFrameForFile('frames/scene/index.html', 'shared.css')).toBe(true)
  })

  test('normalizes Windows separators from watcher paths', () => {
    expect(shouldReloadFrameForFile('frames/scene/index.html', 'frames\\scene\\theme.css')).toBe(true)
  })
})
