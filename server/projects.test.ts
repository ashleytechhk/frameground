import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  validProjectId,
  projectsRoot,
  ensureRoot,
  bootstrapBundledSamples,
  isSymlinkProjectRegistry,
  projectDir,
  projectExists,
  listProjects,
  createProject,
  resolveFrameFile,
  resolveProjectPath,
} from './projects.ts'

let tmp: string
let prevRoot: string | undefined

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opendesign-projects-'))
  prevRoot = process.env.PROJECTS_ROOT
  process.env.PROJECTS_ROOT = tmp
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
  if (prevRoot === undefined) delete process.env.PROJECTS_ROOT
  else process.env.PROJECTS_ROOT = prevRoot
})

describe('validProjectId', () => {
  test.each([
    ['demo', true],
    ['my-app', true],
    ['my_app', true],
    ['App123', true],
    ['a', true],
    ['A'.repeat(64), true],
    ['A'.repeat(65), false],
    ['', false],
    ['-leading-dash', false],
    ['_leading-underscore', false],
    ['with space', false],
    ['with.dot', false],
    ['with/slash', false],
    ['../escape', false],
    ['a/b', false],
  ])('%s -> %s', (id, expected) => {
    expect(validProjectId(id)).toBe(expected)
  })
})

describe('projectsRoot / ensureRoot', () => {
  test('returns resolved absolute path from env', () => {
    expect(projectsRoot()).toBe(path.resolve(tmp))
  })

  test('ensureRoot creates the directory', () => {
    fs.rmSync(tmp, { recursive: true, force: true })
    expect(fs.existsSync(tmp)).toBe(false)
    ensureRoot()
    expect(fs.existsSync(tmp)).toBe(true)
  })

  test('does not bootstrap bundled samples into a caller-provided root', () => {
    ensureRoot()
    expect(fs.existsSync(path.join(tmp, '.frameground-registry.json'))).toBe(false)
    expect(fs.existsSync(path.join(tmp, 'flutter-sample'))).toBe(false)
  })
})

describe('bundled sample bootstrap', () => {
  function makeSampleRoot(): { registry: string; samples: string } {
    const registry = path.join(tmp, 'registry')
    const samples = path.join(tmp, 'samples')
    fs.mkdirSync(path.join(samples, 'flutter-sample'), { recursive: true })
    fs.mkdirSync(path.join(samples, 'html-sample'), { recursive: true })
    return { registry, samples }
  }

  test('creates a link-only marker and portable relative symlinks in an empty registry', () => {
    const { registry, samples } = makeSampleRoot()

    bootstrapBundledSamples(registry, samples)

    expect(isSymlinkProjectRegistry(registry)).toBe(true)
    for (const id of ['flutter-sample', 'html-sample']) {
      const entry = path.join(registry, id)
      expect(fs.lstatSync(entry).isSymbolicLink()).toBe(true)
      expect(fs.readlinkSync(entry)).toBe(path.relative(registry, path.join(samples, id)))
      expect(fs.statSync(entry).isDirectory()).toBe(true)
    }

    process.env.PROJECTS_ROOT = registry
    expect(listProjects()).toEqual(['flutter-sample', 'html-sample'])
  })

  test('waits for a missing sample and registers it on a later bootstrap', () => {
    const registry = path.join(tmp, 'registry')
    const samples = path.join(tmp, 'samples')
    fs.mkdirSync(path.join(samples, 'flutter-sample'), { recursive: true })

    bootstrapBundledSamples(registry, samples)
    expect(fs.existsSync(path.join(registry, 'flutter-sample'))).toBe(true)
    expect(fs.existsSync(path.join(registry, 'html-sample'))).toBe(false)

    fs.mkdirSync(path.join(samples, 'html-sample'))
    bootstrapBundledSamples(registry, samples)
    expect(fs.lstatSync(path.join(registry, 'html-sample')).isSymbolicLink()).toBe(true)
  })

  test('does not overwrite a user-owned registry entry', () => {
    const { registry, samples } = makeSampleRoot()
    fs.mkdirSync(registry, { recursive: true })
    fs.writeFileSync(path.join(registry, '.frameground-registry.json'), JSON.stringify({ version: 1, mode: 'symlink' }))
    const external = path.join(tmp, 'external-flutter')
    fs.mkdirSync(external)
    const existing = path.join(registry, 'flutter-sample')
    fs.symlinkSync(external, existing, 'dir')
    const htmlFile = path.join(registry, 'html-sample')
    fs.writeFileSync(htmlFile, 'leave this alone')

    bootstrapBundledSamples(registry, samples)

    expect(fs.readlinkSync(existing)).toBe(external)
    expect(fs.readFileSync(htmlFile, 'utf-8')).toBe('leave this alone')
  })
})

describe('createProject', () => {
  test('creates dir, frames.json, layout.json, PROJECT.md, DESIGN.md, FEEL.md, design-reference.html', () => {
    createProject('demo')
    const dir = path.join(tmp, 'demo')
    expect(fs.existsSync(dir)).toBe(true)

    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'frames.json'), 'utf-8'))
    expect(manifest.frames).toHaveLength(1)
    expect(manifest.frames[0]).toEqual({
      id: 'design-reference',
      name: 'Design reference',
      file: 'design-reference.html',
    })

    const layout = JSON.parse(fs.readFileSync(path.join(dir, '.opendesign', 'layout.json'), 'utf-8'))
    expect(layout['design-reference']).toEqual({ x: 200, y: 200, w: 1200, h: 900 })

    const designHtml = fs.readFileSync(path.join(dir, 'design-reference.html'), 'utf-8')
    expect(designHtml).toContain('<!DOCTYPE html>')
    expect(designHtml).toContain('DESIGN.md')

    const projectMd = fs.readFileSync(path.join(dir, 'PROJECT.md'), 'utf-8')
    expect(projectMd).toContain('# Project')
    expect(projectMd).toContain('Design reference')
    expect(projectMd).toContain('TODO')

    const designMd = fs.readFileSync(path.join(dir, 'DESIGN.md'), 'utf-8')
    expect(designMd).toMatch(/^---\r?\n/)
    expect(designMd).toContain('version: alpha')
    expect(designMd).toContain('colors: {}')
    expect(designMd).toContain('typography: {}')
    expect(designMd).toContain('# Design Language')
    expect(designMd).toContain('## Overview')
    expect(designMd).toContain('## Colors')
    expect(designMd).toContain('## Typography')
    expect(designMd).toContain('## Layout')
    expect(designMd).toContain("## Do's and Don'ts")
    expect(designMd).not.toContain('## Motion')
    expect(designMd).not.toContain('## Spatial Composition')
    expect(designMd).not.toContain('## Backgrounds')
    expect(designMd).toContain('TODO:')

    const feelMd = fs.readFileSync(path.join(dir, 'FEEL.md'), 'utf-8')
    expect(feelMd).toContain('# Feel')
    expect(feelMd).toContain('## Motion')
    expect(feelMd).toContain('## Spatial Composition')
    expect(feelMd).toContain('## Backgrounds & Textures')
    expect(feelMd).toContain('TODO:')
  })

  test('throws on invalid id', () => {
    expect(() => createProject('../evil')).toThrow(/Invalid/)
    expect(() => createProject('')).toThrow(/Invalid/)
  })

  test('throws on duplicate', () => {
    createProject('demo')
    expect(() => createProject('demo')).toThrow(/already exists/)
  })
})

describe('projectExists / listProjects', () => {
  test('projectExists reflects filesystem', () => {
    expect(projectExists('demo')).toBe(false)
    createProject('demo')
    expect(projectExists('demo')).toBe(true)
  })

  test('projectExists rejects invalid ids without throwing', () => {
    expect(projectExists('../escape')).toBe(false)
  })

  test('listProjects returns sorted ids, ignoring files and invalid names', () => {
    createProject('zebra')
    createProject('apple')
    createProject('mango')
    fs.writeFileSync(path.join(tmp, 'stray-file.txt'), 'x')
    fs.mkdirSync(path.join(tmp, '.hidden'))
    expect(listProjects()).toEqual(['apple', 'mango', 'zebra'])
  })
})

describe('managed symlink registry', () => {
  function enableRegistry(): void {
    fs.writeFileSync(path.join(tmp, '.frameground-registry.json'), JSON.stringify({ version: 1, mode: 'symlink' }))
  }

  test('lists only a valid direct directory symlink', () => {
    enableRegistry()
    const source = path.join(tmp, 'source-workspace')
    fs.mkdirSync(source)
    fs.symlinkSync(source, path.join(tmp, 'registered-demo'), 'dir')

    expect(isSymlinkProjectRegistry()).toBe(true)
    expect(listProjects()).toEqual(['registered-demo'])
    expect(projectExists('registered-demo')).toBe(true)
    expect(projectDir('registered-demo')).toBe(fs.realpathSync(source))
  })

  test('excludes regular directories, broken links, and links to files', () => {
    enableRegistry()
    fs.mkdirSync(path.join(tmp, 'regular-project'))
    fs.symlinkSync(path.join(tmp, 'missing-project'), path.join(tmp, 'broken-project'), 'dir')
    const file = path.join(tmp, 'not-a-directory')
    fs.writeFileSync(file, 'not a project')
    fs.symlinkSync(file, path.join(tmp, 'file-project'))

    expect(listProjects()).toEqual([])
    expect(projectExists('regular-project')).toBe(false)
    expect(projectExists('broken-project')).toBe(false)
    expect(projectExists('file-project')).toBe(false)
  })

  test('rejects nested symlink escapes for frame reads and writes', () => {
    enableRegistry()
    const source = path.join(tmp, 'source-workspace')
    const outside = path.join(tmp, 'outside')
    fs.mkdirSync(source)
    fs.mkdirSync(outside)
    fs.symlinkSync(source, path.join(tmp, 'registered-demo'), 'dir')
    fs.symlinkSync(outside, path.join(source, 'escape'), 'dir')

    expect(resolveFrameFile('registered-demo', 'safe/new.html')).toBe(path.join(fs.realpathSync(source), 'safe', 'new.html'))
    expect(resolveFrameFile('registered-demo', 'escape/new.html')).toBeNull()
    expect(resolveProjectPath('registered-demo', 'escape/new.txt')).toBeNull()
  })

  test('does not create an unregistered regular project', () => {
    enableRegistry()
    expect(() => createProject('new-project')).toThrow(/registered directory symlinks/)
  })
})

describe('projectDir', () => {
  test('returns path under root', () => {
    expect(projectDir('demo')).toBe(path.join(path.resolve(tmp), 'demo'))
  })

  test('throws on invalid id', () => {
    expect(() => projectDir('../escape')).toThrow(/Invalid/)
  })
})

describe('resolveFrameFile', () => {
  beforeEach(() => createProject('demo'))

  test('resolves normal file path', () => {
    const r = resolveFrameFile('demo', 'login.html')
    expect(r).toBe(path.join(path.resolve(tmp), 'demo', 'login.html'))
  })

  test('blocks path traversal with ..', () => {
    expect(resolveFrameFile('demo', '../outside.html')).toBeNull()
    expect(resolveFrameFile('demo', '../../etc/passwd')).toBeNull()
  })

  test('blocks absolute paths outside project dir', () => {
    expect(resolveFrameFile('demo', '/etc/passwd')).toBeNull()
  })

  test('allows subdirectories', () => {
    const r = resolveFrameFile('demo', 'assets/img.png')
    expect(r).toBe(path.join(path.resolve(tmp), 'demo', 'assets', 'img.png'))
  })
})
