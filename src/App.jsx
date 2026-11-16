import { useState, useMemo, useEffect, useRef } from 'react'
import { decodeDXF, parseDXF } from './engine/dxf.js'
import { collectSources, buildLoteamento, lotMemorial, computeQuadroAreas } from './engine/loteamento.js'
import { nb } from './engine/extenso.js'
import { toGMS, quadAbbr } from './engine/geometry.js'
import { exportMemoriaisDocx } from './export/docx.js'
import Modal from './components/Modal.jsx'
import Viewer from './components/Viewer.jsx'
import ModelosPage from './components/ModelosPage.jsx'
import MarcosPage from './components/MarcosPage.jsx'
import Login from './components/Login.jsx'
import ProjetosPage from './components/ProjetosPage.jsx'
import { listModelos, getModelo, saveModelo } from './models/modelo.js'
import { QuadroAreasPanel, GlebaPanel, ViasAreasPanel, ConferenciaPanel } from './components/panels.jsx'
import { supabase } from './supabase.js'
import { criarProjeto, carregarProjeto, salvarProjeto } from './cloud.js'

// ---- App: porta de autenticação (login Google @young) ----
export default function App() {
  const [session, setSession] = useState(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(prev => (prev && s && prev.user?.id === s.user?.id ? prev : s)))  // não reseta no refresh de token
    return () => sub.subscription.unsubscribe()
  }, [])
  if (session === undefined) return <div className="app"><main className="empty-state"><div className="detail-empty">Carregando…</div></main></div>
  if (!session) return <div className="app"><Login /></div>
  return <Workspace session={session} />
}

// ---- Workspace: o app em si, com projetos na nuvem ----
function Workspace({ session }) {
  const [state, setState] = useState(null)
  const [projetoId, setProjetoId] = useState(null)
  const [resolutions, setResolutions] = useState({})
  const [glebaConf, setGlebaConf] = useState({})
  const [fileName, setFileName] = useState('')
  const [sel, setSel] = useState(-1)
  const [modal, setModal] = useState(null)
  const [erro, setErro] = useState('')
  const [exporting, setExporting] = useState(false)
  const [view, setView] = useState('projetos')   // projetos | memorial | modelos | marcos
  const [numeracao, setNumeracaoState] = useState('dxf')
  const [dxfRaw, setDxfRaw] = useState('')
  const [salvo, setSalvo] = useState(true)
  const [modelos, setModelos] = useState(() => listModelos())
  const [modeloId, setModeloId] = useState('alegrete-rs')
  const modelo = useMemo(() => getModelo(modeloId), [modeloId, modelos])
  const loteamento = modelo.loteamento || '—'
  const municipio = modelo.municipio || '—'
  const opts = { loteamento, municipio, modelo }

  function setNumeracao(mode) {
    setNumeracaoState(mode)
    setState(s => s ? buildLoteamento(s.model, s.sources, { resolutions, numeracao: mode, lotLayer: s.lotLayer }) : s)
  }

  // AUTO-SAVE na nuvem: toda edição do projeto aberto vai sendo salva (debounce). Espelho síncrono
  // em localStorage por projeto garante que nada se perde nem se fechar a aba no meio.
  useEffect(() => {
    if (!projetoId || !dxfRaw) return
    const dados = { resolutions, glebaConf, numeracao, modeloId, sel }
    try { localStorage.setItem('prancheta-proj-' + projetoId, JSON.stringify(dados)) } catch { /* ignora */ }
    setSalvo(false)
    const t = setTimeout(() => { salvarProjeto(projetoId, { dados }).then(() => setSalvo(true)).catch(() => { }) }, 600)
    return () => clearTimeout(t)
  }, [projetoId, dxfRaw, resolutions, glebaConf, numeracao, modeloId, sel])
  // flush ao trocar de aba / fechar
  useEffect(() => {
    const flush = () => { if (projetoId && dxfRaw) salvarProjeto(projetoId, { dados: { resolutions, glebaConf, numeracao, modeloId, sel } }).catch(() => { }) }
    const onVis = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [projetoId, dxfRaw, resolutions, glebaConf, numeracao, modeloId, sel])

  function limparAberto() {
    setState(null); setProjetoId(null); setResolutions({}); setGlebaConf({}); setDxfRaw(''); setFileName(''); setSel(-1); setNumeracaoState('dxf'); setModal(null)
  }
  function voltarProjetos() { limparAberto(); setView('projetos'); setErro('') }

  // abre um projeto já salvo na nuvem
  async function onAbrir(p) {
    setErro('')
    try {
      const proj = await carregarProjeto(p.id)
      if (!proj.dxfRaw) { setErro('Projeto sem DXF salvo.'); return }
      const model = parseDXF(proj.dxfRaw), sources = collectSources(model)
      const dados = proj.dados || {}
      const st = buildLoteamento(model, sources, { resolutions: dados.resolutions || {}, numeracao: dados.numeracao || 'dxf' })
      setProjetoId(p.id); setState(st); setResolutions(dados.resolutions || {}); setGlebaConf(dados.glebaConf || {})
      setNumeracaoState(dados.numeracao || 'dxf'); if (dados.modeloId) setModeloId(dados.modeloId)
      setFileName(proj.arquivo || ''); setSel(dados.sel ?? -1); setDxfRaw(proj.dxfRaw); setView('memorial'); setSalvo(true)
    } catch (err) { setErro('Falha ao abrir: ' + err.message) }
  }

  // novo projeto: lê o DXF, cria na nuvem e abre
  async function onNovo(e) {
    const f = e.target.files[0]; if (!f) return
    e.target.value = ''; setErro('')
    try {
      if (/\.dwg$/i.test(f.name)) { setErro('Arquivo .dwg não é lido diretamente — exporte como .dxf no AutoCAD.'); return }
      const raw = decodeDXF(await f.arrayBuffer())
      const model = parseDXF(raw), sources = collectSources(model)
      const st = buildLoteamento(model, sources, { resolutions: {}, numeracao: 'dxf' })
      if (!st.lots.length) {
        const temGeo = (model.entities || []).some(x => x.type === 'line' || x.type === 'arc' || x.type === 'lwpolyline')
        setErro(temGeo
          ? 'O desenho foi lido, mas nenhum LOTE foi reconhecido. Cada lote precisa ser uma POLILINHA FECHADA (na camada "LOTE") com um texto "LOTE nn" dentro. Desenho de agrimensor com linhas soltas e pontos numerados não é lido — abra a planta do loteamento com os lotes fechados.'
          : 'Nenhum lote encontrado. Confirme que é um DXF de loteamento (lotes como polilinha fechada na camada "LOTE", com rótulo "LOTE nn").')
      }
      const nome = f.name.replace(/\.(dxf|txt)$/i, '')
      const id = await criarProjeto({ nome, dxfRaw: raw, arquivo: f.name, dados: {} })
      setProjetoId(id); setState(st); setResolutions({}); setGlebaConf({}); setFileName(f.name); setSel(-1); setDxfRaw(raw); setNumeracaoState('dxf'); setView('memorial'); setSalvo(true)
    } catch (err) { setErro('Falha ao criar o projeto: ' + err.message) }
  }

  function resolveSide(sk, kind, val) {
    const nr = { ...resolutions }; if (!kind) delete nr[sk]; else nr[sk] = { kind, val }
    setResolutions(nr)
    setState(s => buildLoteamento(s.model, s.sources, { resolutions: nr, lotLayer: s.lotLayer, numeracao }))
  }
  function onSideSelect(sk, v) {
    if (!v) return resolveSide(sk, null)
    if (v.startsWith('rua|')) return resolveSide(sk, 'rua', v.slice(4))
    if (v.startsWith('conf|')) return resolveSide(sk, 'livre', v.slice(5))
    if (v.startsWith('lote|')) { const n = prompt('Confronta qual lote? (ex.: Lote 12)'); if (n) resolveSide(sk, 'livre', /lote/i.test(n) ? n.trim() : 'Lote ' + n.trim()) }
    else { const t = prompt('Descreva a confrontação (fica salva no modelo da cidade para reusar):'); if (t) { const val = t.trim(); addConfrontacao(val); resolveSide(sk, 'livre', val) } }
  }
  function addConfrontacao(val) {
    if (!val || (modelo.confrontacoes || []).includes(val)) return
    saveModelo({ ...modelo, confrontacoes: [...(modelo.confrontacoes || []), val] })
    setModelos(listModelos())
  }
  async function onExport() {
    if (!state) return
    setExporting(true)
    try { await exportMemoriaisDocx(state, { loteamento, municipio, glebaConf, modelo }) }
    catch (err) { setErro('Falha ao gerar o Word: ' + err.message) }
    setExporting(false)
  }

  const quadro = useMemo(() => state ? computeQuadroAreas(state) : null, [state])
  const nPend = state ? state.lots.reduce((a, l) => a + l.pend, 0) : 0
  const lot = state && sel >= 0 ? state.lots[sel] : null
  const email = session.user?.email || ''
  const sair = () => supabase.auth.signOut({ scope: 'local' })

  if (view === 'modelos') return <div className="app"><ModelosPage onClose={() => { setModelos(listModelos()); setView(state ? 'memorial' : 'projetos') }} /></div>
  if (view === 'marcos') return <div className="app"><MarcosPage state={state} numeracao={numeracao} setNumeracao={setNumeracao} loteamento={loteamento} dxfRaw={dxfRaw} onClose={() => setView('memorial')} /></div>

  if (view === 'projetos') return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="mark">📐</span><span className="name">Prancheta</span><span className="tag">memorial de loteamento · Young</span></div>
        <div className="actions">
          <button className="btn" onClick={() => setView('modelos')} title="Definir a redação do memorial por cidade/cartório">⚙ Modelos</button>
          <span className="tb-div" />
          <span className="user-chip" title={email}>{email}</span>
          <button className="btn ghost sm" onClick={sair}>Sair</button>
        </div>
      </header>
      {erro && <div className="banner">{erro}</div>}
      <ProjetosPage onAbrir={onAbrir} onNovo={onNovo} onErro={setErro} />
    </div>
  )

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="mark">📐</span><span className="name">Prancheta</span><span className="tag">memorial de loteamento · Young</span></div>
        <div className="actions">
          <button className="btn" onClick={voltarProjetos} title="Voltar aos projetos (o atual fica salvo)">← Projetos</button>
          <label className="fields-inline">Modelo (cidade)
            <select value={modeloId} onChange={e => setModeloId(e.target.value)}>
              {modelos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </label>
          <div className="fields-inline">Loteamento <span className="field-ro">{loteamento}</span></div>
          <button className="btn" onClick={() => setView('modelos')} title="Definir a redação do memorial por cidade/cartório">⚙ Modelos</button>
          <span className="tb-div" />
          {state && <>
            <button className="btn primary" onClick={onExport} disabled={exporting}>{exporting ? 'Gerando…' : '⬇ Word'}</button>
            <span className="saved-chip" title="Salvo na nuvem automaticamente">{salvo ? '✓ salvo na nuvem' : 'salvando…'}</span>
          </>}
        </div>
      </header>

      {state && (
        <nav className="subnav">
          <span className="snav-group">
            <span className="snav-label">Projeto</span>
            <button className={'tab' + (!modal ? ' active' : '')} onClick={() => setModal(null)}>Lotes</button>
            <button className={'tab' + (modal === 'gleba' ? ' active' : '')} onClick={() => setModal('gleba')}>Gleba</button>
            <button className={'tab' + (modal === 'vias' ? ' active' : '')} onClick={() => setModal('vias')}>Vias e áreas</button>
            <button className={'tab' + (modal === 'quadro' ? ' active' : '')} onClick={() => setModal('quadro')}>Quadro de áreas</button>
            <button className={'tab' + (modal === 'conferencia' ? ' active' : '')} onClick={() => setModal('conferencia')}>Conferência{nPend > 0 && <span className="tab-badge">{nPend}</span>}</button>
          </span>
          <span className="snav-group right">
            <span className="snav-label">Ferramentas</span>
            <button className="tab" onClick={() => setView('marcos')}>◉ Marcos &amp; exportar DXF</button>
          </span>
        </nav>
      )}

      {erro && <div className="banner">{erro}</div>}

      {!state ? (
        <main className="empty-state"><div className="detail-empty">Carregando projeto…</div></main>
      ) : (
        <main className="workspace">
          <aside className="panel">
            <div className="ptop">
              <div className="fileline"><span className="dot" /> {fileName}</div>
              <div className="kpis">
                <div className="kpi"><div className="v">{state.lots.length}</div><div className="l">Lotes</div></div>
                <div className="kpi"><div className="v">{quadro ? nb(quadro.lotes, 0) : '—'} <small>m²</small></div><div className="l">Área lotes</div></div>
                <div className="kpi"><div className="v">{quadro?.quadras ?? '—'}</div><div className="l">Quadras</div></div>
                <div className="kpi warn"><div className="v">{nPend}</div><div className="l">A definir</div></div>
              </div>
            </div>
            <div className="sec-title">Lotes <span className="count">{state.lots.length}</span></div>
            <div className="lot-list">
              {state.lots.map((l, i) => (
                <button key={i} className={'lot-row' + (i === sel ? ' active' : '')} onClick={() => setSel(i)}>
                  <span className="lid">Q{String(l.quadra).padStart(2, '0')}·L{String(l.num).padStart(2, '0')}</span>
                  <span className="lsub">{l.verts.length} lados</span>
                  {(l.pend > 0 || l.issues.length > 0) && <span className="flag">▲</span>}
                  <span className="larea">{nb(l.area, 2)} <small>m²</small></span>
                </button>
              ))}
            </div>
          </aside>

          <section className="detail">
            {!lot ? (
              <div className="detail-empty">Selecione um lote na lista para ver o memorial.</div>
            ) : (
              <div className="detail-body">
                <Viewer model={state.model} lot={lot} />
                <div className="dhead">
                  <div className="lt">LOTE {String(lot.num).padStart(2, '0')} · QUADRA {String(lot.quadra).padStart(2, '0')}</div>
                  <div className="chips">
                    <span className="chip">Área <b>{nb(lot.area, 2)} m²</b></span>
                    <span className="chip">Perímetro <b>{nb(lot.perim, 2)} m</b></span>
                    <span className="chip">{lot.verts.length} vértices</span>
                    {lot.pend > 0 ? <span className="chip warn">▲ {lot.pend} a definir</span> : <span className="chip ok">✓ completo</span>}
                    {lot.issues.map((iss, k) => <span key={k} className="chip warn">⚠ {iss}</span>)}
                  </div>
                </div>
                <div className="dsub">Lados — confrontação, azimute e distância</div>
                <div className="tblwrap">
                  <table>
                    <thead><tr><th>Trecho</th><th>Confrontação</th><th>Azimute</th><th>Sent.</th><th className="num">Dist.</th></tr></thead>
                    <tbody>
                      {lot.sides.map((s, k) => (
                        <tr key={k}>
                          <td className="v">{s.from}→{s.to}</td>
                          <td className={'cf ' + s.kind}>
                            {(s.kind === 'wd' || s.kind === 'rua' || s.kind === 'livre' || s.kind === 'perimetro') ? (
                              <span className="side-edit">
                                <select value={s.kind === 'rua' ? 'rua|' + s.val : (s.kind === 'livre' ? 'conf|' + s.val : '')} onChange={e => onSideSelect(s.sk, e.target.value)}>
                                  <option value="">{s.kind === 'perimetro' ? '— limite (definir vizinho) —' : '— a definir —'}</option>
                                  {(modelo.confrontacoes || []).length > 0 && <optgroup label="Confrontações do modelo">{modelo.confrontacoes.map(c => <option key={'c' + c} value={'conf|' + c}>{c}</option>)}</optgroup>}
                                  {(state.textosLivres || []).length > 0 && <optgroup label="Textos da planta">{state.textosLivres.map(c => <option key={'t' + c} value={'conf|' + c}>{c.length > 44 ? c.slice(0, 44) + '…' : c}</option>)}</optgroup>}
                                  <optgroup label="Ruas / avenidas">{state.streets.map(r => <option key={'r' + r} value={'rua|' + r}>{r}</option>)}</optgroup>
                                  <option value="lote|">confronta outro Lote…</option>
                                  <option value="outro|">outro (digitar)…</option>
                                </select>
                                {s.auto && <span className="autotag">auto</span>}
                              </span>
                            ) : s.conf}
                          </td>
                          <td>{toGMS(s.az)}</td>
                          <td>{quadAbbr(s.az)}</td>
                          <td className="num">{s.arc.arc ? '⌒ ' + nb(s.arc.desenv, 2) : nb(s.dist, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="memo"><div className="mh"><span>Memorial descritivo</span></div><div className="mt">{lotMemorial(lot, opts)}</div></div>
              </div>
            )}
          </section>
        </main>
      )}

      {modal === 'conferencia' && <Modal title="Conferência do desenho" wide onClose={() => setModal(null)}><ConferenciaPanel state={state} onGoLot={i => { setSel(i); setModal(null) }} /></Modal>}
      {modal === 'quadro' && <Modal title="Quadro de áreas do parcelamento" onClose={() => setModal(null)}><QuadroAreasPanel state={state} tipo={modelo.tipo} /></Modal>}
      {modal === 'gleba' && <Modal title="Memorial descritivo da gleba (perímetro)" wide onClose={() => setModal(null)}><GlebaPanel state={state} opts={opts} conf={glebaConf} setConf={setGlebaConf} /></Modal>}
      {modal === 'vias' && <Modal title="Sistema viário e áreas públicas" wide onClose={() => setModal(null)}><ViasAreasPanel state={state} opts={opts} /></Modal>}
    </div>
  )
}
