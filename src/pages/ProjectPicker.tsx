import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createFlutterWorkspace, createProject, listWorkspaces, type WorkspaceSummary } from '../lib/api'

export function ProjectPicker() {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'html' | 'flutter'>('html')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    listWorkspaces().then(r => setWorkspaces(r.workspaces)).catch(e => setError(String(e)))
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    setError(null)
    try {
      if (kind === 'flutter') {
        const workspace = await createFlutterWorkspace(name.trim())
        navigate(`/p/${workspace.id}/${workspace.defaultCanvasId}`)
      } else {
        const { id } = await createProject(name.trim())
        navigate(`/p/${id}`)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '80px auto', padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif' }}>
      <h1 style={{ fontSize: 28, marginBottom: 24 }}>Frameground</h1>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, color: '#666', marginBottom: 12 }}>Projects</h2>
        {workspaces.length === 0 ? (
          <p style={{ color: '#999' }}>No projects yet. Create one below.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {workspaces.map(workspace => (
              <li key={workspace.id} style={{ borderBottom: '1px solid #eee' }}>
                <Link
                  to={workspace.kind === 'flutter' ? `/p/${workspace.id}/${workspace.defaultCanvasId}` : `/p/${workspace.id}`}
                  style={{
                    display: 'block',
                    padding: '12px 0',
                    color: '#222',
                    textDecoration: 'none',
                    fontWeight: 500,
                  }}
                >
                  {workspace.id}
                  {workspace.kind === 'flutter' && (
                    <span style={{ marginLeft: 8, color: '#1685b2', fontSize: 12, fontWeight: 700 }}>Flutter</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 16, color: '#666', marginBottom: 12 }}>New project</h2>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="project-name"
            pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}"
            title="Letters, numbers, dashes, underscores (max 64 chars)"
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 14,
            }}
          />
          <select
            value={kind}
            onChange={e => setKind(e.target.value as 'html' | 'flutter')}
            aria-label="Project type"
            style={{ padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', fontSize: 14 }}
          >
            <option value="html">HTML</option>
            <option value="flutter">Flutter</option>
          </select>
          <button
            type="submit"
            disabled={creating || !name.trim()}
            style={{
              padding: '8px 16px',
              background: '#222',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Create {kind === 'flutter' ? 'workspace' : 'project'}
          </button>
        </form>
        {error && <p style={{ color: '#c33', marginTop: 8, fontSize: 13 }}>{error}</p>}
      </section>
    </div>
  )
}
