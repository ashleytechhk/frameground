import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'
import { fileURLToPath } from 'url'

const PROJECT_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/
const REGISTRY_FILE = '.frameground-registry.json'
const BUNDLED_SAMPLE_IDS = ['flutter-sample', 'html-sample'] as const
const BUNDLED_PROJECTS_ROOT = path.resolve(fileURLToPath(new URL('../projects/', import.meta.url)))
const BUNDLED_SAMPLES_ROOT = path.resolve(fileURLToPath(new URL('../samples/', import.meta.url)))
const CARD_COLOR_RE = /^#[0-9a-f]{6}$/i

export interface ProjectCardMetadata {
  color?: string
}

export interface ProjectRegistryMetadata {
  projectOrder: string[]
  projects: Record<string, ProjectCardMetadata>
}

type RegistryDocument = Record<string, unknown> & {
  version?: unknown
  mode?: unknown
}

/** An expected metadata request failure which routes can safely return to clients. */
export class ProjectRegistryMetadataError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const DESIGN_REFERENCE = {
  id: 'design-reference',
  name: 'Design reference',
  file: 'design-reference.html',
  layout: { x: 200, y: 200, w: 1200, h: 900 },
}

const DESIGN_REFERENCE_HTML = fs.readFileSync(
  fileURLToPath(new URL('./templates/design-reference.html', import.meta.url)),
  'utf-8',
)

const PROJECT_MD_TEMPLATE = `# Project

TODO: one-paragraph description of what this project is.

## Concept

TODO

## Frames

- **Design reference** — live view of the project's design language (from DESIGN.md).
`

const DESIGN_MD_TEMPLATE = `---
version: alpha
name: TODO
description: TODO one-line description of this project's aesthetic commitment.
colors: {}
typography: {}
rounded: {}
spacing: {}
components: {}
---

# Design Language

TODO: the committed aesthetic direction for this project. Every frame must follow it.
Frames are built via the \`frontend-design\` skill — it emits tokens (front-matter above)
plus the prose below. The first frame in this project commits these choices.

The structured tokens in this file are authoritative. Project-specific prose about
motion, spatial composition, and background/texture treatment lives in FEEL.md.

## Overview

TODO: one bold, specific tone (e.g. brutalist/raw, editorial/magazine, retro-futuristic,
organic/natural, luxury/refined, maximalist chaos). No hedging — pick one.

## Colors

TODO: describe the palette intent. Hex values live in the \`colors\` front-matter.

## Typography

TODO: describe the type pairing intent (distinctive display + refined body).
Not Inter, Roboto, Arial, or system fonts. Values live in the \`typography\` front-matter.

## Layout

TODO: spacing scale rationale. Values live in \`spacing\` front-matter.

## Elevation & Depth

TODO: how depth is expressed — shadows, rims, layered transparencies, or none.

## Shapes

TODO: corner radii intent. Values live in \`rounded\` front-matter.

## Components

TODO: reusable component patterns as they emerge. Structured values live in
\`components\` front-matter.

## Do's and Don'ts

TODO: short bullets of what the aesthetic requires and what it forbids.
`

const SHARED_CSS_TEMPLATE = `/* Project-level CSS shared across every frame.
   Add resets, @font-face declarations, and utility classes here.
   DESIGN.md tokens are exposed automatically as CSS variables
   (e.g. var(--colors-primary), var(--spacing-md)). */
`

const FEEL_MD_TEMPLATE = `# Feel

How this project moves, occupies space, and treats atmosphere. Frame implementations
must follow these rules alongside the tokens in DESIGN.md.

## Motion

TODO: motion language — entrance choreography, hover behavior, scroll interactions,
durations, easings.

## Spatial Composition

TODO: grid vs. asymmetry, density vs. negative space, overlap/diagonal flow rules.

## Backgrounds & Textures

TODO: atmospheric treatment — gradient meshes, noise, grain, patterns, shadows, etc.
`

export function projectsRoot(): string {
  return path.resolve(process.env.PROJECTS_ROOT || 'projects')
}

export function ensureRoot(): string {
  const root = projectsRoot()
  fs.mkdirSync(root, { recursive: true })
  // The repository-owned registry is deliberately link-only. Populate it
  // lazily so a clean checkout becomes usable as soon as bundled sources
  // arrive, while a caller-provided PROJECTS_ROOT remains untouched.
  if (path.resolve(root) === BUNDLED_PROJECTS_ROOT) bootstrapBundledSamples(root)
  return root
}

/**
 * Register repository-owned sample workspaces in a link-only registry without
 * overwriting anything already registered. The relative links survive a repo
 * relocation, unlike absolute links to a developer's workspace.
 *
 * ensureRoot calls this only for the repository-owned projects directory.
 * The parameters make fresh-registry behavior directly testable without
 * mutating a real checkout.
 */
export function bootstrapBundledSamples(
  root = BUNDLED_PROJECTS_ROOT,
  samplesRoot = BUNDLED_SAMPLES_ROOT,
): void {
  const registryRoot = path.resolve(root)
  const sourceRoot = path.resolve(samplesRoot)
  fs.mkdirSync(registryRoot, { recursive: true })

  const marker = path.join(registryRoot, REGISTRY_FILE)
  try {
    fs.lstatSync(marker)
  } catch {
    fs.writeFileSync(marker, JSON.stringify({ version: 1, mode: 'symlink' }, null, 2))
  }
  if (!isSymlinkProjectRegistry(registryRoot)) return

  for (const id of BUNDLED_SAMPLE_IDS) {
    const source = path.join(sourceRoot, id)
    try {
      if (!fs.statSync(source).isDirectory()) continue
    } catch {
      // The HTML sample may be added after the server begins. A later
      // ensureRoot/listProjects call will pick it up without a restart.
      continue
    }

    const entry = path.join(registryRoot, id)
    try {
      fs.lstatSync(entry)
      // A user-owned symlink, file, or directory always wins. Never replace
      // it merely because it shares a bundled sample's id.
      continue
    } catch {
      // Absent (including no dangling symlink, because lstat would find one).
    }

    const target = path.relative(registryRoot, source)
    if (!target || path.isAbsolute(target)) continue
    try {
      fs.symlinkSync(target, entry, 'dir')
    } catch (error) {
      // A concurrent registry writer may have added the entry after lstat.
      // Preserve that entry rather than overwriting it.
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
}

export function validProjectId(id: string): boolean {
  return PROJECT_ID_RE.test(id)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readRegistryDocument(root: string): RegistryDocument | null {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(root, REGISTRY_FILE), 'utf-8')) as unknown
    return isPlainObject(value) ? value : null
  } catch {
    return null
  }
}

function hasLocalRegistryMarker(root: string): boolean {
  try {
    // Never write through a symlinked marker, even inside the repository-owned
    // registry. Metadata must remain a local registry concern.
    return fs.lstatSync(path.join(root, REGISTRY_FILE)).isFile()
  } catch {
    return false
  }
}

function normalizeCardColor(value: unknown): string | null {
  return typeof value === 'string' && CARD_COLOR_RE.test(value) ? value.toLowerCase() : null
}

function emptyRegistryMetadata(): ProjectRegistryMetadata {
  return { projectOrder: [], projects: {} }
}

function parseRegistryMetadata(document: RegistryDocument | null): ProjectRegistryMetadata {
  if (!document) return emptyRegistryMetadata()

  const seen = new Set<string>()
  const projectOrder = Array.isArray(document.projectOrder)
    ? document.projectOrder.flatMap(value => {
        if (typeof value !== 'string' || !validProjectId(value) || seen.has(value)) return []
        seen.add(value)
        return [value]
      })
    : []

  const projects: Record<string, ProjectCardMetadata> = {}
  if (isPlainObject(document.projects)) {
    for (const [id, value] of Object.entries(document.projects)) {
      if (!validProjectId(id) || !isPlainObject(value)) continue
      const color = normalizeCardColor(value.color)
      if (color) projects[id] = { color }
    }
  }
  return { projectOrder, projects }
}

/**
 * A registry marker makes one projects root deliberately opt into link-only
 * discovery. This keeps Frameground's normal local-project workflow intact,
 * while letting a managed root reference source workspaces scattered across
 * multiple repositories without scanning unrelated folders.
 */
export function isSymlinkProjectRegistry(root = projectsRoot()): boolean {
  const value = readRegistryDocument(root)
  return value?.version === 1 && value.mode === 'symlink'
}

function logicalProjectDir(id: string): string {
  return path.join(projectsRoot(), id)
}

function isDirectorySymlink(root: string, id: string): boolean {
  try {
    const candidate = path.join(root, id)
    return fs.lstatSync(candidate).isSymbolicLink() && fs.statSync(candidate).isDirectory()
  } catch {
    // This includes broken links and links to ordinary files.
    return false
  }
}

function discoveredProjectIds(root: string): string[] {
  const linksOnly = isSymlinkProjectRegistry(root)
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter(entry => validProjectId(entry.name) && (linksOnly ? isDirectorySymlink(root, entry.name) : entry.isDirectory()))
      .map(entry => entry.name)
      .sort()
  } catch {
    return []
  }
}

function orderProjectIds(ids: string[], projectOrder: string[]): string[] {
  const known = new Set(ids)
  const ordered = projectOrder.filter(id => known.delete(id))
  return [...ordered, ...ids.filter(id => known.has(id))]
}

/**
 * The production store defaults to Frameground's own `projects/` directory.
 * `repoOwnedRoot` is injectable only to keep isolated filesystem tests from
 * touching a real checkout; HTTP requests never control either value.
 */
export class ProjectRegistryMetadataStore {
  private readonly root: string
  private readonly repoOwnedRoot: string

  constructor(root = projectsRoot(), repoOwnedRoot = BUNDLED_PROJECTS_ROOT) {
    this.root = path.resolve(root)
    this.repoOwnedRoot = path.resolve(repoOwnedRoot)
  }

  read(): ProjectRegistryMetadata {
    // Caller-specified PROJECTS_ROOT values remain data-only project sources.
    // Do not read or surface arbitrary metadata from them.
    if (this.root !== this.repoOwnedRoot || !hasLocalRegistryMarker(this.root) || !isSymlinkProjectRegistry(this.root)) {
      return emptyRegistryMetadata()
    }
    return parseRegistryMetadata(readRegistryDocument(this.root))
  }

  listProjectIds(): string[] {
    return orderProjectIds(discoveredProjectIds(this.root), this.read().projectOrder)
  }

  private assertWritable(): void {
    if (this.root !== this.repoOwnedRoot) {
      throw new ProjectRegistryMetadataError('Project card metadata is only available in the repo-owned registry', 409)
    }
    if (!hasLocalRegistryMarker(this.root) || !isSymlinkProjectRegistry(this.root)) {
      throw new ProjectRegistryMetadataError('Project card metadata requires a local symlink registry', 409)
    }
  }

  private assertRegisteredProject(id: string): void {
    if (!validProjectId(id) || !discoveredProjectIds(this.root).includes(id)) {
      throw new ProjectRegistryMetadataError('Registered project not found', 404)
    }
  }

  private write(metadata: ProjectRegistryMetadata): void {
    const document = readRegistryDocument(this.root)
    if (!document) throw new ProjectRegistryMetadataError('Project registry metadata is invalid', 409)

    const next: RegistryDocument = { ...document }
    if (metadata.projectOrder.length > 0) next.projectOrder = metadata.projectOrder
    else delete next.projectOrder
    if (Object.keys(metadata.projects).length > 0) next.projects = metadata.projects
    else delete next.projects

    const file = path.join(this.root, REGISTRY_FILE)
    const temp = `${file}.${process.pid}.${randomUUID()}.tmp`
    fs.writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' })
    try {
      fs.renameSync(temp, file)
    } catch (error) {
      try { fs.unlinkSync(temp) } catch { /* preserve the original write error */ }
      throw error
    }
  }

  setColor(id: string, color: string | null): ProjectCardMetadata {
    if (color !== null && !normalizeCardColor(color)) {
      throw new ProjectRegistryMetadataError('color must be a #RRGGBB value or null', 400)
    }
    this.assertWritable()
    this.assertRegisteredProject(id)

    const metadata = this.read()
    if (color === null) {
      delete metadata.projects[id]
    } else {
      metadata.projects[id] = { color: normalizeCardColor(color)! }
    }
    this.write(metadata)
    return metadata.projects[id] ?? {}
  }

  setOrder(projectIds: unknown): string[] {
    if (!Array.isArray(projectIds) || projectIds.some(id => typeof id !== 'string' || !validProjectId(id))) {
      throw new ProjectRegistryMetadataError('projectIds must be an array of project ids', 400)
    }

    const ids = projectIds as string[]
    const unique = new Set(ids)
    if (unique.size !== ids.length) {
      throw new ProjectRegistryMetadataError('projectIds must not contain duplicates', 400)
    }

    this.assertWritable()
    const registered = discoveredProjectIds(this.root)
    const known = new Set(registered)
    if (ids.some(id => !known.has(id))) {
      throw new ProjectRegistryMetadataError('Registered project not found', 404)
    }
    if (ids.length !== registered.length) {
      throw new ProjectRegistryMetadataError('projectIds must include every registered project exactly once', 400)
    }

    const metadata = this.read()
    metadata.projectOrder = [...ids]
    this.write(metadata)
    return metadata.projectOrder
  }
}

export function readProjectRegistryMetadata(): ProjectRegistryMetadata {
  return new ProjectRegistryMetadataStore().read()
}

export function setProjectCardColor(id: string, color: string | null): ProjectCardMetadata {
  return new ProjectRegistryMetadataStore().setColor(id, color)
}

export function setProjectOrder(projectIds: unknown): string[] {
  return new ProjectRegistryMetadataStore().setOrder(projectIds)
}

function canonicalExistingProjectDir(id: string): string | null {
  if (!validProjectId(id)) return null
  const root = projectsRoot()
  const candidate = path.join(root, id)
  try {
    if (isSymlinkProjectRegistry(root)) {
      if (!isDirectorySymlink(root, id)) return null
    } else if (!fs.statSync(candidate).isDirectory()) {
      return null
    }
    return fs.realpathSync(candidate)
  } catch {
    return null
  }
}

export function projectDir(id: string): string {
  if (!validProjectId(id)) throw new Error(`Invalid project id: ${id}`)
  // A managed registry exposes source workspaces through symlinks; use the
  // canonical source directory for its API writes and ACP sessions. Preserve
  // the historical lexical path behavior for ordinary project roots.
  return isSymlinkProjectRegistry() ? (canonicalExistingProjectDir(id) ?? logicalProjectDir(id)) : logicalProjectDir(id)
}

export function projectExists(id: string): boolean {
  return canonicalExistingProjectDir(id) !== null
}

export function listProjects(): string[] {
  const root = ensureRoot()
  return new ProjectRegistryMetadataStore(root).listProjectIds()
}

export function createProject(id: string): void {
  if (!validProjectId(id)) throw new Error(`Invalid project id: ${id}`)
  if (isSymlinkProjectRegistry()) {
    throw new Error('This managed registry only accepts registered directory symlinks')
  }
  const dir = projectDir(id)
  if (fs.existsSync(dir)) throw new Error(`Project already exists: ${id}`)
  fs.mkdirSync(path.join(dir, '.opendesign'), { recursive: true })
  const manifest = {
    frames: [{ id: DESIGN_REFERENCE.id, name: DESIGN_REFERENCE.name, file: DESIGN_REFERENCE.file }],
  }
  const layout = { [DESIGN_REFERENCE.id]: DESIGN_REFERENCE.layout }
  fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify(manifest, null, 2))
  fs.writeFileSync(path.join(dir, '.opendesign', 'layout.json'), JSON.stringify(layout, null, 2))
  fs.writeFileSync(path.join(dir, 'PROJECT.md'), PROJECT_MD_TEMPLATE)
  fs.writeFileSync(path.join(dir, 'DESIGN.md'), DESIGN_MD_TEMPLATE)
  fs.writeFileSync(path.join(dir, 'FEEL.md'), FEEL_MD_TEMPLATE)
  fs.writeFileSync(path.join(dir, 'shared.css'), SHARED_CSS_TEMPLATE)
  fs.writeFileSync(path.join(dir, DESIGN_REFERENCE.file), DESIGN_REFERENCE_HTML)
}

export function resolveFrameFile(projectId: string, file: string): string | null {
  const dir = projectDir(projectId)
  const resolved = path.resolve(dir, file)
  if (!resolved.startsWith(dir + path.sep)) return null
  return isCanonicalPathInsideProject(projectId, resolved) ? resolved : null
}

export function resolveProjectPath(projectId: string, p: string): string | null {
  const dir = projectDir(projectId)
  const resolved = path.isAbsolute(p) ? path.resolve(p) : path.resolve(dir, p)
  if (resolved !== dir && !resolved.startsWith(dir + path.sep)) return null
  return isCanonicalPathInsideProject(projectId, resolved) ? resolved : null
}

function isPathInside(parent: string, candidate: string): boolean {
  return candidate === parent || candidate.startsWith(parent + path.sep)
}

/**
 * Resolve the nearest existing ancestor before an API reads or writes a
 * project-relative path. Lexical checks alone do not catch a nested symlink
 * such as `assets -> /outside`; canonical containment does.
 */
function isCanonicalPathInsideProject(projectId: string, candidate: string): boolean {
  const root = canonicalExistingProjectDir(projectId)
  if (!root) return false

  let existing = candidate
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing)
    if (parent === existing) return false
    existing = parent
  }

  try {
    return isPathInside(root, fs.realpathSync(existing))
  } catch {
    return false
  }
}
