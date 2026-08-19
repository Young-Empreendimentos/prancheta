import { nb } from '../engine/extenso.js'
import { exportMarcosDxf } from '../export/dxf.js'
import Viewer from './Viewer.jsx'

export default function MarcosPage({ state, numeracao, setNumeracao, loteamento = 'loteamento', onClose }) {
  const gerado = numeracao === 'gerar' && state?.marcos
  const marcos = state?.marcos || []

  function exportarCSV() {
    const linhas = [['Marco', 'Norte (Y)', 'Este (X)'], ...marcos.map(m => [m.n, nb(m.y, 3), nb(m.x, 3)])]
    const csv = '﻿' + linhas.map(l => l.join(';')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = 'marcos.csv'; a.click(); URL.revokeObjectURL(a.href)
  }

  return (
    <div className="marcos-page">
      <aside className="mp-side">
        <div className="sec-title">Numeração de marcos</div>
        {!state ? (
          <p className="mp-hint">Abra um DXF primeiro (no memorial) para numerar os marcos.</p>
        ) : (
          <>
            <p className="mp-hint">Gera a numeração dos pontos <b>contínua, de 1 a N</b>, percorrendo lote a lote no sentido horário a partir da frente. Cantos compartilhados entre lotes recebem o <b>mesmo número</b>.</p>
            <div className="mp-modes">
              <button className={'btn sm' + (numeracao === 'gerar' ? ' primary' : '')} onClick={() => setNumeracao('gerar')}>Gerar 1…N</button>
              <button className={'btn sm' + (numeracao === 'dxf' ? ' primary' : '')} onClick={() => setNumeracao('dxf')}>Usar os do desenho</button>
            </div>
            {gerado && <>
              <div className="mp-kpis">
                <div className="kpi"><div className="v">{marcos.length}</div><div className="l">Marcos</div></div>
                <div className="kpi"><div className="v">{marcos.filter(m => m.uso >= 2).length}</div><div className="l">Compartilhados</div></div>
              </div>
              <button className="btn sm primary" onClick={() => exportMarcosDxf(state, loteamento)}>⬇ DXF com os pontos</button>
              <button className="btn sm" onClick={exportarCSV}>⬇ Coordenadas (CSV)</button>
            </>}
          </>
        )}
        <button className="btn ghost sm back" onClick={onClose}>← Voltar ao memorial</button>
      </aside>

      <div className="mp-main">
        {!state ? <div className="detail-empty">Nenhum desenho aberto.</div>
          : !gerado ? <div className="detail-empty">Clique em <b>“Gerar 1…N”</b> para numerar os marcos do desenho.<br />Dê zoom (scroll) para ver os números sobre os pontos.</div>
            : <>
              <Viewer model={state.model} marcos={marcos} />
              <div className="mp-tblwrap">
                <table>
                  <thead><tr><th>Marco</th><th className="num">Norte (Y)</th><th className="num">Este (X)</th><th className="num">Lotes</th></tr></thead>
                  <tbody>
                    {marcos.map(m => (
                      <tr key={m.n}><td className="v">{m.n}</td><td className="num">{nb(m.y, 3)}</td><td className="num">{nb(m.x, 3)}</td><td className="num">{m.uso}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>}
      </div>
    </div>
  )
}
