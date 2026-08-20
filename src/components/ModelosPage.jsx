import { useState, useMemo } from 'react'
import { listModelos, saveModelo, deleteModelo, novoModeloBase, aplicarTipo } from '../models/modelo.js'
import { lotMemorial } from '../engine/loteamento.js'

// lote de exemplo (fixo) para o preview ao vivo da redação
const SAMPLE = {
  num: '10', quadra: '06', area: 300,
  sides: [
    { from: '1', to: '2', kind: 'rua', conf: 'Rua Projetada A', val: null, az: 22.407, dist: 12, arc: { arc: false } },
    { from: '2', to: '3', kind: 'lote', conf: 'Lote 11', val: null, az: 112.407, dist: 25, arc: { arc: false } },
    { from: '3', to: '4', kind: 'lote', conf: 'Lote 09', val: null, az: 202.407, dist: 12, arc: { arc: false } },
    { from: '4', to: '1', kind: 'area', conf: 'Área Verde 01', val: null, az: 292.407, dist: 25, arc: { arc: false } },
  ],
}

function Field({ label, children, hint }) {
  return <label className="mf"><span className="mf-l">{label}</span>{children}{hint && <span className="mf-h">{hint}</span>}</label>
}

export default function ModelosPage({ onClose }) {
  const [modelos, setModelos] = useState(() => listModelos())
  const [selId, setSelId] = useState(modelos[0]?.id)
  const [draft, setDraft] = useState(() => structuredClone(modelos[0]))
  const [dirty, setDirty] = useState(false)
  const [novaConf, setNovaConf] = useState('')

  function pick(id) {
    const m = modelos.find(x => x.id === id)
    setSelId(id); setDraft(structuredClone(m)); setDirty(false)
  }
  function novo() {
    const m = novoModeloBase('', '')
    setModelos(ms => [...ms, m]); setSelId(m.id); setDraft(structuredClone(m)); setDirty(true)
  }
  const upd = patch => { setDraft(d => ({ ...d, ...patch })); setDirty(true) }
  const updDesc = patch => { setDraft(d => ({ ...d, desc: { ...d.desc, ...patch } })); setDirty(true) }
  const updConf = patch => { setDraft(d => ({ ...d, desc: { ...d.desc, conf: { ...d.desc.conf, ...patch } } })); setDirty(true) }
  const updWord = patch => { setDraft(d => ({ ...d, word: { ...d.word, ...patch } })); setDirty(true) }
  const updSec = patch => { setDraft(d => ({ ...d, secoes: { ...d.secoes, ...patch } })); setDirty(true) }
  const updDados = patch => { setDraft(d => ({ ...d, dados: { ...(d.dados || {}), ...patch } })); setDirty(true) }
  const addConf = () => { const v = novaConf.trim(); if (!v || (draft.confrontacoes || []).includes(v)) return; setDraft(d => ({ ...d, confrontacoes: [...(d.confrontacoes || []), v] })); setDirty(true); setNovaConf('') }
  const rmConf = v => { setDraft(d => ({ ...d, confrontacoes: (d.confrontacoes || []).filter(x => x !== v) })); setDirty(true) }

  function salvar() {
    const m = { ...draft, nome: draft.nome || (draft.cidade && draft.uf ? `${draft.cidade}/${draft.uf}` : draft.cidade || 'Modelo') }
    saveModelo(m); setModelos(listModelos()); setDraft(structuredClone(m)); setDirty(false)
  }
  function excluir() {
    if (draft.id === 'alegrete-rs') return alert('O modelo de Alegrete é o modelo-base e não pode ser excluído.')
    if (!confirm('Excluir o modelo "' + draft.nome + '"?')) return
    const arr = deleteModelo(draft.id); setModelos(arr); pick(arr[0].id)
  }
  function exportar() {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = 'modelo-' + (draft.nome || 'cidade').replace(/[^\w-]+/g, '_') + '.json'
    a.click(); URL.revokeObjectURL(a.href)
  }
  function importar(e) {
    const f = e.target.files[0]; if (!f) return
    const r = new FileReader()
    r.onload = () => { try { const m = JSON.parse(r.result); m.id = draft.id; setDraft(m); setDirty(true) } catch { alert('JSON inválido.') } }
    r.readAsText(f); e.target.value = ''
  }

  const preview = useMemo(() => {
    try { return lotMemorial(SAMPLE, { loteamento: 'Exemplo', municipio: draft.nome || 'Cidade/UF', modelo: draft }) }
    catch (err) { return 'Erro no preview: ' + err.message }
  }, [draft])

  const d = draft.desc

  return (
    <div className="modelos">
      <aside className="mod-list">
        <div className="mod-list-top">
          <div className="sec-title">Modelos por cidade</div>
          <button className="btn primary sm" onClick={novo}>+ Nova cidade</button>
        </div>
        {modelos.map(m => (
          <button key={m.id} className={'mod-row' + (m.id === selId ? ' active' : '')} onClick={() => pick(m.id)}>
            <span className="mr-nome">{m.nome || '(sem nome)'}</span>
            <span className="mr-tags">{m.marcos?.exige === false ? 'sem pontos' : 'com pontos'} · {m.angulo}</span>
            {m.id === 'alegrete-rs' && <span className="mr-base">base</span>}
          </button>
        ))}
        <button className="btn ghost sm back" onClick={onClose}>← Voltar ao memorial</button>
      </aside>

      <div className="mod-edit">
        <div className="mod-edit-head">
          <h2>{draft.nome || 'Novo modelo'} {dirty && <em className="dirty">• não salvo</em>}</h2>
          <div className="mod-actions">
            <label className="btn ghost sm">Importar JSON<input type="file" accept=".json" hidden onChange={importar} /></label>
            <button className="btn ghost sm" onClick={exportar}>Exportar JSON</button>
            <button className="btn ghost sm danger" onClick={excluir}>Excluir</button>
            <button className="btn primary sm" onClick={salvar} disabled={!dirty}>Salvar modelo</button>
          </div>
        </div>

        <div className="mod-grid">
          <section className="mod-card">
            <h3>Identificação</h3>
            <Field label="Tipo do empreendimento" hint="muda termo, redação e quadro de áreas">
              <select value={draft.tipo || 'loteamento'} onChange={e => { const t = e.target.value; if (t !== (draft.tipo || 'loteamento') && confirm('Trocar o tipo redefine a redação padrão para ' + (t === 'condominio' ? 'condomínio' : 'loteamento') + '. Continuar?')) { setDraft(d => aplicarTipo(d, t)); setDirty(true) } }}>
                <option value="loteamento">Loteamento (Lei 6.766 — lotes, vias públicas)</option>
                <option value="condominio">Condomínio de lotes (Lei 13.465 — unidades, áreas comuns)</option>
              </select>
            </Field>
            <Field label="Termo da unidade" hint='como cada parcela é chamada'><input value={draft.termoUnidade || 'Lote'} onChange={e => upd({ termoUnidade: e.target.value })} placeholder="Lote / Unidade Autônoma" /></Field>
            <Field label="Nome do modelo"><input value={draft.nome} onChange={e => upd({ nome: e.target.value })} placeholder="ex.: Alegrete/RS" /></Field>
            <Field label={(draft.tipo === 'condominio' ? 'Condomínio' : 'Loteamento')} hint="puxado direto no memorial"><input value={draft.loteamento || ''} onChange={e => upd({ loteamento: e.target.value })} placeholder="ex.: Novo Alegrete" /></Field>
            <Field label="Município" hint="puxado direto no memorial"><input value={draft.municipio || ''} onChange={e => upd({ municipio: e.target.value })} placeholder="ex.: Alegrete/RS" /></Field>
          </section>

          <section className="mod-card">
            <h3>Definições da descrição</h3>
            <Field label="Marcos (pontos numerados)" hint="alguns cartórios não exigem pontos">
              <select value={draft.marcos?.exige === false ? 'nao' : 'sim'} onChange={e => { setDraft(d0 => ({ ...d0, marcos: { exige: e.target.value === 'sim' } })); setDirty(true) }}>
                <option value="sim">Exige pontos numerados</option>
                <option value="nao">Não usa pontos (só medidas/confrontações)</option>
              </select>
            </Field>
            <Field label="Medida angular">
              <select value={draft.angulo} onChange={e => upd({ angulo: e.target.value })}>
                <option value="azimute">Azimute (22°24'23")</option>
                <option value="rumo">Rumo / quadrante (NE 22°24'23")</option>
                <option value="ambos">Ambos</option>
              </select>
            </Field>
            <Field label="Coordenadas dos vértices" hint="cartórios georreferenciados">
              <select value={draft.coordenadas?.incluir ? 'sim' : 'nao'} onChange={e => { setDraft(d0 => ({ ...d0, coordenadas: { ...d0.coordenadas, incluir: e.target.value === 'sim' } })); setDirty(true) }}>
                <option value="nao">Não incluir</option>
                <option value="sim">Incluir N/E de cada marco</option>
              </select>
            </Field>
          </section>

          <section className="mod-card">
            <h3>Seções do documento</h3>
            {[['lotes', 'Memoriais dos lotes'], ['gleba', 'Memorial da gleba'], ['publicas', 'Áreas públicas'], ['quadro', 'Quadro de áreas']].map(([k, lb]) => (
              <label key={k} className="mf-check"><input type="checkbox" checked={draft.secoes?.[k] !== false} onChange={e => updSec({ [k]: e.target.checked })} /> {lb}</label>
            ))}
          </section>

          <section className="mod-card">
            <h3>Formatação do Word</h3>
            <Field label="Fonte"><input value={draft.word.fonte} onChange={e => updWord({ fonte: e.target.value })} /></Field>
            <Field label="Tamanho (pt)"><input type="number" value={draft.word.tamanhoPt} onChange={e => updWord({ tamanhoPt: +e.target.value || 12 })} /></Field>
            <Field label="Margem (cm)"><input type="number" step="0.5" value={draft.word.margemCm} onChange={e => updWord({ margemCm: +e.target.value || 2.5 })} /></Field>
            <Field label="Título"><input value={draft.word.titulo} onChange={e => updWord({ titulo: e.target.value })} /></Field>
          </section>

          <section className="mod-card wide">
            <h3>Redação das frases <span className="vars">variáveis: {'{num} {loteamento} {municipio} {quadra} {p0} {to} {c} {az} {quad} {rumo} {dist} {area} {extenso}'}</span></h3>
            <Field label="Cabeçalho do lote"><textarea rows={2} value={d.cabecalho} onChange={e => updDesc({ cabecalho: e.target.value })} /></Field>
            <div className="mf-row">
              <Field label="Confronta rua"><input value={d.conf.rua} onChange={e => updConf({ rua: e.target.value })} /></Field>
              <Field label="Confronta lote"><input value={d.conf.lote} onChange={e => updConf({ lote: e.target.value })} /></Field>
            </div>
            <div className="mf-row">
              <Field label="Confronta área"><input value={d.conf.area} onChange={e => updConf({ area: e.target.value })} /></Field>
              <Field label="Confronta limite"><input value={d.conf.perimetro} onChange={e => updConf({ perimetro: e.target.value })} /></Field>
            </div>
            <div className="mf-row">
              <Field label="Medida (azimute)"><input value={d.medidaAz} onChange={e => updDesc({ medidaAz: e.target.value })} /></Field>
              <Field label="Medida (rumo)"><input value={d.medidaRumo} onChange={e => updDesc({ medidaRumo: e.target.value })} /></Field>
            </div>
            <Field label="Fechamento"><input value={d.fechamento} onChange={e => updDesc({ fechamento: e.target.value })} /></Field>
          </section>

          <section className="mod-card wide">
            <h3>Confrontações de limite <span className="vars">vizinhos/avenidas recorrentes desta cidade — aparecem no dropdown dos lados de limite</span></h3>
            <div className="conf-add">
              <input value={novaConf} onChange={e => setNovaConf(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addConf() }} placeholder="ex.: Terras de João Silva · Estrada Municipal · Arroio do Salso" />
              <button className="btn sm" onClick={addConf}>Adicionar</button>
            </div>
            <div className="conf-list">
              {(draft.confrontacoes || []).length === 0 ? <span className="mf-h">Nenhuma cadastrada ainda.</span>
                : draft.confrontacoes.map(c => <span key={c} className="conf-chip">{c}<button onClick={() => rmConf(c)} title="remover">×</button></span>)}
            </div>
          </section>

          {draft.tipo === 'condominio' && (
            <section className="mod-card wide">
              <h3>Dados do empreendimento <span className="vars">preâmbulo e assinatura do condomínio — mudam a cada projeto</span></h3>
              <div className="mf-row">
                <Field label="Nº da matrícula"><input value={draft.dados?.matricula || ''} onChange={e => updDados({ matricula: e.target.value })} /></Field>
                <Field label="Comarca"><input value={draft.dados?.comarca || ''} onChange={e => updDados({ comarca: e.target.value })} placeholder="ex.: Cruz Alta" /></Field>
              </div>
              <div className="mf-row">
                <Field label="Proprietário"><input value={draft.dados?.proprietario || ''} onChange={e => updDados({ proprietario: e.target.value })} /></Field>
                <Field label="CNPJ"><input value={draft.dados?.cnpj || ''} onChange={e => updDados({ cnpj: e.target.value })} /></Field>
              </div>
              <div className="mf-row">
                <Field label="Responsável técnico"><input value={draft.dados?.responsavel || ''} onChange={e => updDados({ responsavel: e.target.value })} placeholder="ex.: Arquiteta Fulana" /></Field>
                <Field label="CAU/CREA"><input value={draft.dados?.cau || ''} onChange={e => updDados({ cau: e.target.value })} /></Field>
              </div>
              <div className="mf-row">
                <Field label="Título profissional"><input value={draft.dados?.titulo || ''} onChange={e => updDados({ titulo: e.target.value })} placeholder="Arquiteta e Urbanista" /></Field>
                <Field label="Data"><input value={draft.dados?.data || ''} onChange={e => updDados({ data: e.target.value })} placeholder="ex.: 10 de agosto de 2026" /></Field>
              </div>
            </section>
          )}

          <section className="mod-card wide">
            <h3>Prévia (lote de exemplo)</h3>
            <div className="mod-preview">{preview}</div>
          </section>
        </div>
      </div>
    </div>
  )
}
