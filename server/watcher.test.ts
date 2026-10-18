import path from 'path'
import { describe, expect, test } from 'vitest'
import { projectRelativeFile } from './watcher.ts'

describe('projectRelativeFile', () => {
  test('uses manifest-compatible nested paths', () => {
    const project = path.join(path.sep, 'tmp', 'project')
    expect(projectRelativeFile(project, path.join(project, 'frames', 'scene', 'index.html')))
      .toBe('frames/scene/index.html')
  })
})
