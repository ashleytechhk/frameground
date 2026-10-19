import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createFlutterWorkspace, createProject, listWorkspaces, patchProjectCardColor, patchProjectOrder, type WorkspaceSummary } from '../lib/api'

type ProjectCard = WorkspaceSummary & { color?: string; order?: number }
const PALETTE = [{ name: 'Moss', value: '#3c725d' }, { name: 'Cobalt', value: '#3d5b9b' }, { name: 'Saffron', value: '#b87220' }, { name: 'Berry', value: '#9b4b5f' }, { name: 'Slate', value: '#4d6876' }]
const labelFor = (id: string) => id.replace(/[-_]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
const projectPath = (project: WorkspaceSummary) => project.kind === 'flutter' ? `/p/${project.id}/${project.defaultCanvasId}` : `/p/${project.id}`

export function ProjectPicker() {
  const [workspaces, setWorkspaces] = useState<ProjectCard[]>([])
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'html' | 'flutter'>('html')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [colorMenuId, setColorMenuId] = useState<string | null>(null)
  const navigate = useNavigate()
  const countLabel = useMemo(() => `${workspaces.length} ${workspaces.length === 1 ? 'project' : 'projects'}`, [workspaces.length])

  useEffect(() => {
    listWorkspaces().then(result => setWorkspaces(result.workspaces as ProjectCard[])).catch(e => setError(String(e)))
  }, [])
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); if (!name.trim()) return
    setCreating(true); setError(null)
    try {
      if (kind === 'flutter') { const workspace = await createFlutterWorkspace(name.trim()); navigate(`/p/${workspace.id}/${workspace.defaultCanvasId}`) }
      else { const { id } = await createProject(name.trim()); navigate(`/p/${id}`) }
    } catch (e) { setError((e as Error).message) } finally { setCreating(false) }
  }
  function moveProject(id: string, destinationId: string) {
    if (id === destinationId) return
    const previous = workspaces
    const from = previous.findIndex(p => p.id === id), to = previous.findIndex(p => p.id === destinationId)
    if (from < 0 || to < 0) return
    const next = [...previous], [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setError(null)
    setWorkspaces(next)
    patchProjectOrder(next.map(project => project.id)).catch(() => {
      setWorkspaces(previous)
      setError('Could not save the project order. It has been restored.')
    })
  }
  function onDrop(e: DragEvent<HTMLElement>, destinationId: string) {
    e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || draggingId
    if (id) moveProject(id, destinationId)
    setDraggingId(null); setOverId(null)
  }
  function setColor(id: string, color: string) {
    const previous = workspaces
    const next = previous.map(p => p.id === id ? { ...p, color } : p)
    setError(null)
    setWorkspaces(next)
    setColorMenuId(null)
    patchProjectCardColor(id, color).catch(() => {
      setWorkspaces(previous)
      setError('Could not save that project colour. It has been restored.')
    })
  }
  return <main style={styles.page}>
    <style>{responsiveCss}</style>
    <header style={styles.header}><div><p style={styles.kicker}>Frameground</p><h1 style={styles.title}>Project library</h1></div><p style={styles.count}>{countLabel}</p></header>
    <section aria-labelledby="library-heading">
      <div style={styles.sectionHeader}><div><h2 id="library-heading" style={styles.sectionTitle}>Your workspaces</h2><p style={styles.hint}>Drag projects to arrange your shelf.</p></div></div>
      {workspaces.length === 0 ? <div style={styles.empty}><span aria-hidden="true" style={styles.emptyMark}>+</span><h2 style={{ ...styles.sectionTitle, marginTop: 12 }}>Start a small library</h2><p style={styles.hint}>Create a workspace below, then add frames when you are ready.</p></div> :
      <div className="project-grid" role="list" aria-label="Projects">{workspaces.map((workspace, index) => {
        const accent = workspace.color || PALETTE[index % PALETTE.length].value
        const dragging = draggingId === workspace.id, over = overId === workspace.id && !dragging
        return <article key={workspace.id} role="listitem" draggable
          onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', workspace.id); setDraggingId(workspace.id) }}
          onDragEnd={() => { setDraggingId(null); setOverId(null) }} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverId(workspace.id) }}
          onDragLeave={() => setOverId(current => current === workspace.id ? null : current)} onDrop={e => onDrop(e, workspace.id)}
          style={{ ...styles.card, borderColor: over ? accent : '#d8e0de', opacity: dragging ? .52 : 1, transform: over ? 'translateY(-3px)' : 'translateY(0)' }}>
          <div style={{ ...styles.accentBand, background: accent }} />
          <div style={styles.cardTopline}><span style={{ ...styles.typeTag, color: accent, background: `${accent}18` }}>{workspace.kind === 'flutter' ? 'Flutter' : 'HTML'}</span>
            <div style={styles.cardTools}><button type="button" style={styles.toolButton} aria-label={`Move ${labelFor(workspace.id)} earlier`} disabled={index === 0} onClick={() => moveProject(workspace.id, workspaces[index - 1].id)}>↑</button><button type="button" style={styles.toolButton} aria-label={`Move ${labelFor(workspace.id)} later`} disabled={index === workspaces.length - 1} onClick={() => moveProject(workspace.id, workspaces[index + 1].id)}>↓</button><button type="button" style={styles.swatchButton} aria-label={`Choose colour for ${labelFor(workspace.id)}`} onClick={() => setColorMenuId(current => current === workspace.id ? null : workspace.id)}><i style={{ background: accent }} /></button></div>
          </div>
          <Link to={projectPath(workspace)} style={styles.projectLink} aria-label={`Open ${labelFor(workspace.id)}`}><span style={styles.projectName}>{labelFor(workspace.id)}</span><span style={styles.projectId}>/{workspace.id}</span><span style={{ ...styles.openArrow, color: accent }}>↗</span></Link>
          {workspace.kind === 'flutter' ? <p style={styles.meta}>{workspace.canvases.length} {workspace.canvases.length === 1 ? 'canvas' : 'canvases'} · shared runner</p> : <p style={styles.meta}>HTML workspace · local frames</p>}
          {colorMenuId === workspace.id && <div style={styles.colorMenu} role="group" aria-label="Project colour">{PALETTE.map(swatch => <button key={swatch.value} type="button" title={swatch.name} aria-label={swatch.name} aria-pressed={accent === swatch.value} onClick={() => setColor(workspace.id, swatch.value)} style={{ ...styles.colorOption, background: swatch.value, outline: accent === swatch.value ? `2px solid ${swatch.value}` : 'none', outlineOffset: 3 }} />)}</div>}
        </article>
      })}</div>}
    </section>
    <section style={styles.createSection} aria-labelledby="create-heading"><div><p style={styles.kicker}>New shelf label</p><h2 id="create-heading" style={styles.createTitle}>Make a workspace</h2></div><form onSubmit={handleCreate} className="create-form" style={styles.form}><label style={styles.field}><span>Project name</span><input value={name} onChange={e => setName(e.target.value)} placeholder="my-project" pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}" title="Letters, numbers, dashes, underscores (max 64 characters)" /></label><label style={styles.field}><span>Format</span><select value={kind} onChange={e => setKind(e.target.value as 'html' | 'flutter')}><option value="html">HTML</option><option value="flutter">Flutter</option></select></label><button type="submit" disabled={creating || !name.trim()} style={styles.createButton}>{creating ? 'Creating…' : 'Create project'}</button></form></section>
    {error && <p role="alert" style={styles.error}>{error}</p>}
  </main>
}

const styles: Record<string, React.CSSProperties> = {
  page:{minHeight:'100dvh',padding:'clamp(28px, 6vw, 84px)',background:'#f3f6f4',color:'#163139',fontFamily:'ui-rounded, "Avenir Next", Avenir, "Segoe UI", sans-serif'},header:{maxWidth:1180,margin:'0 auto 52px',display:'flex',alignItems:'end',justifyContent:'space-between',borderBottom:'1px solid #cfdad6',paddingBottom:22},kicker:{margin:0,color:'#4c746a',fontSize:11,fontWeight:800,letterSpacing:'.15em',textTransform:'uppercase'},title:{margin:'7px 0 0',fontSize:'clamp(36px, 5vw, 62px)',lineHeight:'.94',letterSpacing:'-.065em'},count:{margin:0,color:'#61777a',fontSize:13,fontWeight:700},sectionHeader:{maxWidth:1180,margin:'0 auto 18px'},sectionTitle:{margin:0,fontSize:18,letterSpacing:'-.035em'},hint:{color:'#61777a',margin:'6px 0 0',fontSize:13,lineHeight:1.4},
  card:{position:'relative',minHeight:194,overflow:'visible',padding:'19px 19px 17px',border:'1px solid #d8e0de',borderRadius:16,background:'#fbfdfc',transition:'transform .16s ease, opacity .16s ease, border-color .16s ease',boxShadow:'0 8px 20px rgba(26,61,58,.045)'},accentBand:{position:'absolute',left:0,top:0,width:5,height:'100%',borderRadius:'16px 0 0 16px'},cardTopline:{display:'flex',justifyContent:'space-between',alignItems:'center'},typeTag:{padding:'4px 8px',borderRadius:999,fontSize:10,fontWeight:800,letterSpacing:'.08em',textTransform:'uppercase'},cardTools:{display:'flex',gap:3,alignItems:'center'},toolButton:{width:26,height:26,border:0,background:'transparent',color:'#587075',borderRadius:7,cursor:'pointer',fontSize:15},swatchButton:{width:27,height:27,padding:0,border:0,background:'transparent',cursor:'pointer',display:'grid',placeItems:'center',borderRadius:7},projectLink:{display:'grid',gap:6,marginTop:28,textDecoration:'none',color:'#163139',position:'relative',paddingRight:25},projectName:{fontSize:22,lineHeight:1,letterSpacing:'-.045em',fontWeight:760},projectId:{color:'#708487',fontSize:11,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},openArrow:{position:'absolute',right:0,top:0,fontSize:23,lineHeight:.8},meta:{margin:'22px 0 0',color:'#61777a',fontSize:12},colorMenu:{position:'absolute',zIndex:2,right:17,top:49,padding:9,background:'#fff',border:'1px solid #d8e0de',borderRadius:12,display:'flex',gap:8,boxShadow:'0 12px 28px rgba(20,48,47,.14)'},colorOption:{width:18,height:18,border:0,borderRadius:'50%',cursor:'pointer'},
  empty:{maxWidth:1180,margin:'0 auto',padding:'52px 26px',textAlign:'center',border:'1px dashed #aabcb7',borderRadius:16,background:'#fbfdfc'},emptyMark:{fontSize:26,color:'#3c725d'},createSection:{maxWidth:1180,margin:'66px auto 0',paddingTop:27,borderTop:'1px solid #cfdad6',display:'flex',gap:36,justifyContent:'space-between',alignItems:'end'},createTitle:{margin:'6px 0 0',fontSize:27,letterSpacing:'-.05em'},form:{display:'grid',gridTemplateColumns:'minmax(190px,1fr) 110px auto',gap:10,alignItems:'end',minWidth:'min(100%,590px)'},field:{display:'grid',gap:6,color:'#526b6d',fontSize:11,fontWeight:800,letterSpacing:'.04em',textTransform:'uppercase'},createButton:{height:43,padding:'0 17px',border:0,borderRadius:11,background:'#163139',color:'#fff',cursor:'pointer',fontWeight:750,whiteSpace:'nowrap'},error:{maxWidth:1180,margin:'12px auto 0',color:'#a13345',fontSize:13}
}
const responsiveCss = `.project-grid{max-width:1180px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(248px,1fr));gap:14px}.project-grid article:hover{box-shadow:0 13px 26px rgba(26,61,58,.09)!important;transform:translateY(-2px)!important}button:disabled{opacity:.38;cursor:not-allowed}input,select{height:43px;width:100%;border:1px solid #bfd0ca;border-radius:11px;background:#fbfdfc;padding:0 12px;color:#163139;font:inherit;font-size:14px}input:focus,select:focus{outline:3px solid #e6c46f;outline-offset:2px}button:focus-visible,a:focus-visible{outline:3px solid #e6c46f;outline-offset:3px}button:active{transform:scale(.97)}.swatchButton i{width:14px;height:14px;border-radius:50%;display:block}@media(max-width:720px){.create-form{grid-template-columns:1fr 1fr!important;min-width:0!important;width:100%}.create-form .field:first-child{grid-column:1/-1}.create-form button{grid-column:1/-1}}@media(max-width:520px){.project-grid{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){*,*:before,*:after{transition-duration:.01ms!important}}`
