import { useState, useMemo } from 'react'
import { decodeDXF, parseDXF } from './engine/dxf.js'
import { collectSources, buildLoteamento, lotMemorial, computeQuadroAreas } from './engine/loteamento.js'
import { nb } from './engine/extenso.js'
import { toGMS, quadAbbr } from './engine/geometry.js'
import { exportMemoriaisDocx } from './export/docx.js'
import Modal from './components/Modal.jsx'
import Viewer from './components/Viewer.jsx'
import ModelosPage from './components/ModelosPage.jsx'
import MarcosPage from './components/MarcosPage.jsx'
import { listModelos, getModelo } from './models/modelo.js'
import { QuadroAreasPanel, GlebaPanel, ViasAreasPanel, ConferenciaPanel } from './components/panels.jsx'

export default function App() {
  const [state, setState] = useState(null)
  const [resolutions, setResolutions] = useState({})
  const [glebaConf, setGlebaConf] = useState({})
  const [fileName, setFileName] = useState('')
  const [sel, setSel] = useState(-1)
  const [modal, setModal] = useState(null)
  const [erro, setErro] = useState('')
  const [exporting, setExporting] = useState(false)
  const [loteamento, setLoteamento] = useState('Novo Alegrete')
  const [municipio, setMunicipio] = useState('Alegrete/RS')
  const [view, setView] = useState('memorial')
  const [numeracao, setNumeracaoState] = useState('dxf')
  const [modelos, setModelos] = useState(() => listModelos())
  const [modeloId, setModeloId] = useState('alegrete-rs')
  const modelo = useMemo(() => getModelo(modeloId), [modeloId, modelos])
  const opts = { loteamento, municipio, modelo }

  function setNumeracao(mode) {
    setNumeracaoState(mode)
    setState(s => s ? buildLoteamento(s.model, s.sources, { resolutions, numeracao: mode, lotLayer: s.lotLayer }) : s)
  }

  async function onFile(e) {
    const f = e.target.files[0]; if (!f) return
    setErro('')
    try {
      if (/\.dwg$/i.test(f.name)) { setErro('Arquivo .dwg não é lido diretamente — exporte como .dxf no AutoCAD.'); return }
      const model = parseDXF(decodeDXF(await f.arrayBuffer()))
      const sources = collectSources(model)
      const st = buildLoteamento(model, sources, { resolutions: {}, numeracao })
      if (!st.lots.length) setErro('Nenhum lote encontrado. Confirme que é um DXF de loteamento (lotes com rótulo "LOTE nn").')
      setState(st); setResolutions({}); setGlebaConf({}); setFileName(f.name); setSel(-1)
    } catch (err) { setErro('Falha ao ler o arquivo: ' + err.message) }
    e.target.value = ''
  }
  function resolveSide(sk, kind, val) {
    const nr = { ...resolutions }; if (!kind) delete nr[sk]; else nr[sk] = { kind, val }
    setResolutions(nr)
    setState(s => buildLoteamento(s.model, s.sources, { resolutions: nr, lotLayer: s.lotLayer, numeracao }))
  }
  function onSideSelect(sk, v) {
    if (!v) return resolveSide(sk, null)
    if (v.startsWith('rua|')) return resolveSide(sk, 'rua', v.slice(4))
    if (v.startsWith('lote|')) { const n = prompt('Confronta qual lote? (ex.: Lote 12)'); if (n) resolveSide(sk, 'livre', /lote/i.test(n) ? n.trim() : 'Lote ' + n.trim()) }
    else { const t = prompt('Descreva a confrontação:'); if (t) resolveSide(sk, 'livre', t.trim()) }
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

  if (view === 'modelos') return (
    <div className="app">
      <ModelosPage onClose={() => { setModelos(listModelos()); setView('memorial') }} />
    </div>
  )

  if (view === 'marcos') return (
    <div className="app">
      <MarcosPage state={state} numeracao={numeracao} setNumeracao={setNumeracao} loteamento={loteamento} onClose={() => setView('memorial')} />
    </div>
  )

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="mark">📐</span><span className="name">Prancheta</span><span className="tag">memorial de loteamento · Young</span></div>
        <div className="actions">
          <label className="fields-inline">Loteamento <input value={loteamento} onChange={e => setLoteamento(e.target.value)} /></label>
          <label className="fields-inline">Município <input value={municipio} onChange={e => setMunicipio(e.target.value)} /></label>
          <label className="fields-inline">Modelo
            <select value={modeloId} onChange={e => setModeloId(e.target.value)}>
              {modelos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </label>
          <button className="btn" onClick={() => setView('modelos')}>⚙ Modelos</button>
          <button className="btn" onClick={() => setView('marcos')}>◉ Marcos</button>
          {state && <>
            <button className="btn" onClick={() => setModal('conferencia')}>Conferência</button>
            <button className="btn" onClick={() => setModal('quadro')}>Quadro de áreas</button>
            <button className="btn" onClick={() => setModal('gleba')}>Gleba</button>
            <button className="btn" onClick={() => setModal('vias')}>Vias e áreas</button>
            <button className="btn" onClick={onExport} disabled={exporting}>{exporting ? 'Gerando…' : '⬇ Word'}</button>
          </>}
          <label className="btn primary">Abrir .dxf<input type="file" accept=".dxf,.txt" hidden onChange={onFile} /></label>
        </div>
      </header>

      {erro && <div className="banner">{erro}</div>}

      {!state ? (
        <main className="empty-state">
          <div className="es-card">
            <div className="es-icon">📐</div>
            <h2>Abra o DXF do loteamento</h2>
            <p>A ferramenta lê o desenho e gera o memorial descritivo de cada lote, da gleba e das áreas públicas — com as confrontações identificadas automaticamente.</p>
            <label className="btn primary lg">Abrir arquivo .dxf<input type="file" accept=".dxf,.txt" hidden onChange={onFile} /></label>
          </div>
        </main>
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
                            {(s.kind === 'wd' || s.kind === 'rua' || s.kind === 'livre') ? (
                              <span className="side-edit">
                                <select value={s.kind === 'rua' ? 'rua|' + s.val : ''} onChange={e => onSideSelect(s.sk, e.target.value)}>
                                  <option value="">— a definir —</option>
                                  <optgroup label="Ruas do desenho">{state.streets.map(r => <option key={r} value={'rua|' + r}>{r}</option>)}</optgroup>
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
      {modal === 'quadro' && <Modal title="Quadro de áreas do parcelamento" onClose={() => setModal(null)}><QuadroAreasPanel state={state} /></Modal>}
      {modal === 'gleba' && <Modal title="Memorial descritivo da gleba (perímetro)" wide onClose={() => setModal(null)}><GlebaPanel state={state} opts={opts} conf={glebaConf} setConf={setGlebaConf} /></Modal>}
      {modal === 'vias' && <Modal title="Sistema viário e áreas públicas" wide onClose={() => setModal(null)}><ViasAreasPanel state={state} opts={opts} /></Modal>}
    </div>
  )
}
