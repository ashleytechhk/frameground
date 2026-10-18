import type { IncomingMessage, ServerResponse } from 'http'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { createProject, listProjects, projectDir, projectExists, projectsRoot, resolveFrameFile, validProjectId } from './projects.ts'
import { appendFrame, patchFrame, readManifest, removeFrame } from './manifest.ts'
import { patchLayoutEntry, readLayout, removeLayoutEntry } from './layout.ts'
import { readProjectDesign, tokensToCss, writeDesignTokens } from './design.ts'
import { isValidSuggestionId, listSuggestions, removeSuggestion } from './suggestions.ts'
import { subscribe } from './watcher.ts'
import { promptChat, cancelChat, resetChat, respondPermission, restartAllSessions, subscribeChat, testAgent, getModels, setModel } from './acp.ts'
import { getAdapter } from './agents.ts'
import {
  readGlobalSettings,
  writeGlobalSettings,
  readProjectSettings,
  writeProjectSettings,
} from './settings.ts'
import type { FrameEntry, LayoutEntry } from './types.ts'

type Handler = (req: IncomingMessage, res: ServerResponse, match: RegExpMatchArray) => Promise<void> | void

class RequestBodyTooLargeError extends Error {
  status = 413
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function error(res: ServerResponse, status: number, message: string): void {
  json(res, status, { error: message })
}

async function readBody(req: IncomingMessage, maxBytes?: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let rejected = false
    req.on('data', c => {
      if (rejected) return
      size += c.length
      if (maxBytes !== undefined && size > maxBytes) {
        rejected = true
        reject(new RequestBodyTooLargeError('Request body is too large'))
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (rejected) return
      const raw = Buffer.concat(chunks).toString('utf-8')
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

const MAX_PASTED_IMAGE_BYTES = 12 * 1024 * 1024
const MAX_PASTED_IMAGE_REQUEST_BYTES = 17 * 1024 * 1024
const PASTED_IMAGE_DIR = 'assets/pasted-images'
const PASTED_FRAME_DIR = 'frames/pasted-images'

type PastedImageKind = { extension: string; mime: string }

function identifyRasterImage(data: Buffer): PastedImageKind | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: 'png', mime: 'image/png' }
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { extension: 'jpg', mime: 'image/jpeg' }
  if (data.length >= 6 && (data.subarray(0, 6).equals(Buffer.from('GIF87a')) || data.subarray(0, 6).equals(Buffer.from('GIF89a')))) {
    return { extension: 'gif', mime: 'image/gif' }
  }
  if (data.length >= 12 && data.subarray(0, 4).equals(Buffer.from('RIFF')) && data.subarray(8, 12).equals(Buffer.from('WEBP'))) {
    return { extension: 'webp', mime: 'image/webp' }
  }
  if (data.length >= 12 && data.subarray(4, 8).equals(Buffer.from('ftyp')) && ['avif', 'avis'].includes(data.subarray(8, 12).toString('ascii'))) {
    return { extension: 'avif', mime: 'image/avif' }
  }
  return null
}

function decodePastedImage(value: unknown): { data: Buffer; kind: PastedImageKind } | null {
  if (typeof value !== 'string') return null
  const match = value.match(/^data:image\/(?:png|jpeg|gif|webp|avif);base64,([A-Za-z0-9+/]+={0,2})$/)
  if (!match) return null
  const data = Buffer.from(match[1], 'base64')
  if (data.length === 0 || data.length > MAX_PASTED_IMAGE_BYTES) return null
  const kind = identifyRasterImage(data)
  return kind ? { data, kind } : null
}

function optionalPositiveNumber(value: unknown): number | null {
  const number = asNumber(value)
  return number !== null && number > 0 && number <= 20_000 ? number : null
}

function pastedImageLayout(width: number | null, height: number | null): LayoutEntry {
  const sourceWidth = width ?? 800
  const sourceHeight = height ?? 600
  const scale = Math.min(1, 1200 / sourceWidth, 1200 / sourceHeight)
  return {
    x: 200,
    y: 200,
    w: Math.max(240, Math.round(sourceWidth * scale)),
    h: Math.max(180, Math.round(sourceHeight * scale)),
  }
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

const routes: { method: string; pattern: RegExp; handler: Handler }[] = [
  {
    method: 'GET',
    pattern: /^\/api\/workspace$/,
    handler: (_req, res) => {
      const root = projectsRoot()
      json(res, 200, {
        root,
        projects: listProjects().map(id => ({ id, path: projectDir(id) })),
      })
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/projects$/,
    handler: (_req, res) => json(res, 200, { projects: listProjects() }),
  },
  {
    method: 'POST',
    pattern: /^\/api\/projects$/,
    handler: async (req, res) => {
      const body = (await readBody(req)) as { name?: unknown }
      const name = asString(body.name)
      if (!name || !validProjectId(name)) return error(res, 400, 'Invalid project name')
      if (projectExists(name)) return error(res, 409, 'Project already exists')
      createProject(name)
      json(res, 201, { id: name })
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/projects\/([^/]+)\/manifest$/,
    handler: (_req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      json(res, 200, readManifest(id))
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/projects\/([^/]+)\/layout$/,
    handler: (_req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      json(res, 200, readLayout(id))
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/projects\/([^/]+)\/design$/,
    handler: (_req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      json(res, 200, readProjectDesign(id))
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/projects\/([^/]+)\/tokens\.css$/,
    handler: (_req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      const { design, parseError } = readProjectDesign(id)
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/css; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.end(tokensToCss(design.tokens, parseError))
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/projects\/([^/]+)\/design\/tokens$/,
    handler: async (req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      const body = (await readBody(req)) as { tokens?: unknown }
      const patch = body.tokens
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        return error(res, 400, 'tokens object required')
      }
      writeDesignTokens(id, patch as Record<string, unknown>)
      json(res, 200, { ok: true })
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/projects\/([^/]+)\/frames$/,
    handler: async (req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      const body = (await readBody(req)) as {
        id?: unknown; name?: unknown; file?: unknown; html?: unknown
        x?: unknown; y?: unknown; w?: unknown; h?: unknown
      }
      const frameId = asString(body.id)
      const name = asString(body.name)
      const file = asString(body.file)
      if (!frameId || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(frameId)) return error(res, 400, 'Invalid frame id')
      if (!name || !file) return error(res, 400, 'name and file required')
      const resolved = resolveFrameFile(id, file)
      if (!resolved) return error(res, 400, 'Invalid file path')

      const html = asString(body.html)
      if (html !== null) fs.writeFileSync(resolved, html)

      const entry: FrameEntry = { id: frameId, name, file }
      try {
        appendFrame(id, entry)
      } catch (e) {
        return error(res, 409, (e as Error).message)
      }

      const layoutPatch: Partial<LayoutEntry> = {}
      const x = asNumber(body.x); if (x !== null) layoutPatch.x = x
      const y = asNumber(body.y); if (y !== null) layoutPatch.y = y
      const w = asNumber(body.w); if (w !== null) layoutPatch.w = w
      const h = asNumber(body.h); if (h !== null) layoutPatch.h = h
      const layout = patchLayoutEntry(id, frameId, layoutPatch)

      json(res, 201, { frame: entry, layout })
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/projects\/([^/]+)\/pasted-images$/,
    handler: async (req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      const body = (await readBody(req, MAX_PASTED_IMAGE_REQUEST_BYTES)) as { dataUrl?: unknown; width?: unknown; height?: unknown; x?: unknown; y?: unknown }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return error(res, 400, 'object body required')
      const image = decodePastedImage(body.dataUrl)
      if (!image) return error(res, 400, 'A PNG, JPEG, GIF, WebP, or AVIF image up to 12 MB is required')

      const imageId = `pasted-image-${randomUUID()}`
      const imageFile = `${imageId}.${image.kind.extension}`
      const imageRelativePath = path.posix.join(PASTED_IMAGE_DIR, imageFile)
      const frameRelativePath = path.posix.join(PASTED_FRAME_DIR, `${imageId}.html`)
      const imagePath = resolveFrameFile(id, imageRelativePath)
      const framePath = resolveFrameFile(id, frameRelativePath)
      if (!imagePath || !framePath) return error(res, 500, 'Could not create pasted image paths')

      const layout = pastedImageLayout(optionalPositiveNumber(body.width), optionalPositiveNumber(body.height))
      const x = asNumber(body.x); if (x !== null) layout.x = x
      const y = asNumber(body.y); if (y !== null) layout.y = y
      const frame: FrameEntry = { id: imageId, name: 'Pasted image', file: frameRelativePath }
      fs.mkdirSync(path.dirname(imagePath), { recursive: true })
      fs.mkdirSync(path.dirname(framePath), { recursive: true })
      fs.writeFileSync(imagePath, image.data, { flag: 'wx' })
      try {
        fs.writeFileSync(framePath, `<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pasted image</title><style>html,body{margin:0;width:100%;height:100%;background:#f6f6f6}img{display:block;width:100%;height:100%;object-fit:contain}</style></head><body><img src="../../${imageRelativePath}" alt="Pasted image"></body></html>\n`, { flag: 'wx' })
        appendFrame(id, frame)
        patchLayoutEntry(id, imageId, layout)
      } catch (e) {
        fs.rmSync(imagePath, { force: true })
        fs.rmSync(framePath, { force: true })
        throw e
      }
      json(res, 201, { frame, layout, asset: { file: imageRelativePath, mime: image.kind.mime } })
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/projects\/([^/]+)\/frames\/([^/]+)$/,
    handler: async (req, res, m) => {
      const [, id, frameId] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      const body = (await readBody(req)) as { name?: unknown; file?: unknown }
      const patch: Partial<Omit<FrameEntry, 'id'>> = {}
      const name = asString(body.name); if (name !== null) patch.name = name
      const file = asString(body.file); if (file !== null) {
        if (!resolveFrameFile(id, file)) return error(res, 400, 'Invalid file path')
        patch.file = file
      }
      const updated = patchFrame(id, frameId, patch)
      if (!updated) return error(res, 404, 'Frame not found')
      json(res, 200, updated)
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/projects\/([^/]+)\/frames\/([^/]+)$/,
    handler: async (req, res, m) => {
      const [, id, frameId] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      const url = new URL(req.url ?? '', 'http://localhost')
      const deleteFile = url.searchParams.get('deleteFile') === 'true'
      const removed = removeFrame(id, frameId)
      if (!removed) return error(res, 404, 'Frame not found')
      removeLayoutEntry(id, frameId)
      if (deleteFile) {
        const resolved = resolveFrameFile(id, removed.file)
        if (resolved && fs.existsSync(resolved)) fs.unlinkSync(resolved)
      }
      json(res, 200, { ok: true })
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/projects\/([^/]+)\/layout\/([^/]+)$/,
    handler: async (req, res, m) => {
      const [, id, frameId] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      const body = (await readBody(req)) as { x?: unknown; y?: unknown; w?: unknown; h?: unknown }
      const patch: Partial<LayoutEntry> = {}
      const x = asNumber(body.x); if (x !== null) patch.x = x
      const y = asNumber(body.y); if (y !== null) patch.y = y
      const w = asNumber(body.w); if (w !== null) patch.w = w
      const h = asNumber(body.h); if (h !== null) patch.h = h
      const updated = patchLayoutEntry(id, frameId, patch)
      json(res, 200, updated)
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/projects\/([^/]+)\/suggestions$/,
    handler: (_req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      json(res, 200, { suggestions: listSuggestions(id) })
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/projects\/([^/]+)\/suggestions\/([^/]+)$/,
    handler: (_req, res, m) => {
      const [, id, sid] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      if (!isValidSuggestionId(sid)) return error(res, 400, 'Invalid suggestion id')
      const ok = removeSuggestion(id, sid)
      if (!ok) return error(res, 404, 'Suggestion not found')
      json(res, 200, { ok: true })
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/settings\/global$/,
    handler: (_req, res) => json(res, 200, readGlobalSettings()),
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/settings\/global$/,
    handler: async (req, res) => {
      const body = (await readBody(req)) as Record<string, unknown>
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return error(res, 400, 'object body required')
      }
      const prev = readGlobalSettings().agent
      // If provider changed and the caller didn't also patch the model, reset
      // model to the new provider's first fallback so we don't end up with a
      // mismatched (provider, model) pair.
      const agentPatch = (body.agent && typeof body.agent === 'object') ? body.agent as Record<string, unknown> : null
      const providerInPatch = agentPatch?.provider
      const modelInPatch = agentPatch?.model
      let effectivePatch: unknown = body
      if (typeof providerInPatch === 'string' && providerInPatch !== prev.provider && modelInPatch === undefined) {
        const nextAdapter = getAdapter(providerInPatch as Parameters<typeof getAdapter>[0])
        const defaultModel = nextAdapter?.fallbackModels[0]?.modelId
        if (defaultModel) {
          effectivePatch = { ...body, agent: { ...agentPatch, model: defaultModel } }
        }
      }
      const merged = writeGlobalSettings(effectivePatch)
      if (merged.agent.provider !== prev.provider) {
        restartAllSessions(`provider switched ${prev.provider}→${merged.agent.provider}`)
      }
      // Model changes are routed through POST /agent/model so the caller can
      // see whether the switch happened in-session or via restart. We don't
      // restart sessions here for model-only edits — that would silently kill
      // the chat from the user's perspective.
      json(res, 200, merged)
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/settings\/agent\/test$/,
    handler: async (_req, res) => {
      const result = await testAgent()
      json(res, 200, result)
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/projects\/([^/]+)\/settings$/,
    handler: (_req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      json(res, 200, readProjectSettings(id))
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/projects\/([^/]+)\/settings$/,
    handler: async (req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      const body = await readBody(req)
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return error(res, 400, 'object body required')
      }
      json(res, 200, writeProjectSettings(id, body))
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/projects\/([^/]+)\/events$/,
    handler: (_req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) { error(res, 404, 'Project not found'); return }
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.write(': connected\n\n')
      const ok = subscribe(id, res)
      if (!ok) { res.end(); return }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/projects\/([^/]+)\/chat\/prompt$/,
    handler: async (req, res, m) => {
      const [, id] = m
      console.log(`[api] POST /chat/prompt project=${id}`)
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      const body = (await readBody(req)) as { text?: unknown }
      const text = asString(body.text)
      if (!text || !text.trim()) return error(res, 400, 'text required')
      promptChat(id, text).catch(() => {})
      json(res, 200, { ok: true })
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/projects\/([^/]+)\/chat\/cancel$/,
    handler: async (_req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      await cancelChat(id)
      json(res, 200, { ok: true })
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/projects\/([^/]+)\/chat\/reset$/,
    handler: (_req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      resetChat(id)
      json(res, 200, { ok: true })
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/projects\/([^/]+)\/chat\/permission$/,
    handler: async (req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      const body = (await readBody(req)) as { requestId?: unknown; optionId?: unknown; cancelled?: unknown }
      const requestId = asString(body.requestId)
      if (!requestId) return error(res, 400, 'requestId required')
      const outcome = body.cancelled === true
        ? { outcome: 'cancelled' as const }
        : (() => {
            const optionId = asString(body.optionId)
            if (!optionId) return null
            return { outcome: 'selected' as const, optionId }
          })()
      if (!outcome) return error(res, 400, 'optionId or cancelled required')
      const ok = respondPermission(id, requestId, outcome)
      if (!ok) return error(res, 404, 'Pending permission not found')
      json(res, 200, { ok: true })
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/projects\/([^/]+)\/agent\/models$/,
    handler: (_req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      json(res, 200, getModels(id))
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/projects\/([^/]+)\/agent\/model$/,
    handler: async (req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      const body = (await readBody(req)) as { modelId?: unknown }
      const modelId = asString(body.modelId)
      if (!modelId) return error(res, 400, 'modelId required')
      // Persist globally first so a kill+respawn fallback comes back with the
      // new model, then attempt the in-session switch.
      writeGlobalSettings({ agent: { model: modelId } })
      const result = await setModel(id, modelId)
      if (!result.ok) return error(res, 500, result.error)
      json(res, 200, result)
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/projects\/([^/]+)\/chat\/events$/,
    handler: (_req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) { error(res, 404, 'Project not found'); return }
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.write(': connected\n\n')
      const ok = subscribeChat(id, res)
      if (!ok) { res.end(); return }
    },
  },
]

export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const urlPath = (req.url ?? '').split('?')[0]
  if (!urlPath.startsWith('/api/')) return false
  for (const route of routes) {
    if (route.method !== req.method) continue
    const match = urlPath.match(route.pattern)
    if (!match) continue
    try {
      await route.handler(req, res, match)
    } catch (e) {
      const status = e instanceof RequestBodyTooLargeError ? e.status : 500
      error(res, status, (e as Error).message)
    }
    return true
  }
  error(res, 404, 'Not found')
  return true
}

export function handleFrames(req: IncomingMessage, res: ServerResponse): boolean {
  const urlPath = (req.url ?? '').split('?')[0]
  const match = urlPath.match(/^\/frames\/([^/]+)\/(.+)$/)
  if (!match) return false
  const [, projectId, file] = match
  if (!projectExists(projectId)) return false
  const resolved = resolveFrameFile(projectId, file)
  if (!resolved) return false
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return false
  const ext = path.extname(resolved).toLowerCase()
  const contentTypes: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.md': 'text/markdown; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
  }
  const type = contentTypes[ext] ?? 'application/octet-stream'
  res.setHeader('Content-Type', type)
  res.setHeader('Cache-Control', 'no-cache')
  fs.createReadStream(resolved).pipe(res)
  return true
}

export { projectDir }
