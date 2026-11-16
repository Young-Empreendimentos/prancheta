import { useState, useEffect } from 'react'
import { listarProjetos, excluirProjeto } from '../cloud.js'

function quando(iso) {
  if (!iso) return ''
  const d = new Date(iso), h = Math.floor((Date.now() - d) / 3600000)
  if (h < 1) return 'agora há pouco'
  if (h < 24) return `há ${h}h`
  return d.toLocaleDateString('pt-BR')
}

export default function ProjetosPage({ onAbrir, onNovo, onErro }) {
  const [projetos, setProjetos] = useState(null)

  async function recarregar() {
    try { setProjetos(await listarProjetos()) }
    catch (e) { onErro?.('Falha ao carregar projetos: ' + e.message); setProjetos([]) }
  }
  useEffect(() => { recarregar() }, [])

  async function excluir(p, e) {
    e.stopPropagation()
    if (!confirm(`Excluir o projeto "${p.nome}"? Essa ação não pode ser desfeita.`)) return
    try { await excluirProjeto(p.id, p.dxf_path); recarregar() }
    catch (err) { onErro?.('Falha ao excluir: ' + err.message) }
  }

  return (
    <main className="projetos">
      <div className="proj-head">
        <div>
          <h2>Meus projetos</h2>
          <p className="proj-sub">Salvos na nuvem — abra de qualquer computador e continue de onde parou.</p>
        </div>
        <label className="btn primary">+ Novo projeto<input type="file" accept=".dxf,.txt" hidden onChange={onNovo} /></label>
      </div>

      {projetos === null ? <div className="detail-empty">Carregando…</div>
        : projetos.length === 0 ? (
          <div className="proj-empty">
            <div className="es-icon">📂</div>
            <p>Nenhum projeto ainda. Clique em <b>+ Novo projeto</b> e abra um DXF de loteamento.</p>
          </div>
        ) : (
          <div className="proj-grid">
            {projetos.map(p => (
              <button key={p.id} className="proj-card" onClick={() => onAbrir(p)}>
                <div className="proj-card-top"><span className="proj-ico">📐</span><button className="proj-del" title="Excluir" onClick={e => excluir(p, e)}>✕</button></div>
                <div className="proj-nome">{p.nome}</div>
                <div className="proj-meta">{p.arquivo || '—'}</div>
                <div className="proj-when">atualizado {quando(p.atualizado_em)}</div>
              </button>
            ))}
          </div>
        )}
    </main>
  )
}
