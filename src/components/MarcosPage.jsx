import { useState } from 'react'
import { nb } from '../engine/extenso.js'
import { exportMarcosDxf, exportPlantaMarcosDxf } from '../export/dxf.js'
import Viewer from './Viewer.jsx'

export default function MarcosPage({ state, numeracao, setNumeracao, loteamento = 'loteamento', dxfRaw = '', onClose }) {
  const gerado = numeracao === 'gerar' && state?.marcos
  const marcos = state?.marcos || []
  // o que incluir no DXF (independentes). Marcos (pontos) exigem a numeração gerada.
  const [inc, setInc] = useState({ marcos: true, rotulo: true, azimute: false, cota: false })
  const nadaSelecionado = !inc.marcos && !inc.rotulo && !inc.azimute && !inc.cota

  function toggle(key) {
    const next = { ...inc, [key]: !inc[key] }
    setInc(next)
    // ao pedir marcos, garante a numeração gerada (os pontos só existem nesse modo)
    if (key === 'marcos' && next.marcos && numeracao !== 'gerar') setNumeracao('gerar')
  }

  function exportarDXF() {
    const opts = { marcos: inc.marcos, rotulo: inc.rotulo, azimute: inc.azimute, cota: inc.cota }
    if (dxfRaw) exportPlantaMarcosDxf(dxfRaw, state, loteamento, opts)
    else exportMarcosDxf(state, loteamento, opts)
  }
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
        <div className="sec-title">Marcos &amp; exportação do DXF</div>
        {!state ? (
          <p className="mp-hint">Abra um DXF primeiro (no memorial) para numerar os marcos e exportar.</p>
        ) : (
          <>
            {/* 1. Numeração dos marcos (vale também para o memorial) */}
            <div className="mp-block">
              <div className="mp-flabel">Numeração dos marcos</div>
              <div className="mp-modes">
                <button className={'btn sm' + (numeracao === 'gerar' ? ' primary' : '')} onClick={() => setNumeracao('gerar')}>Gerar 1…N</button>
                <button className={'btn sm' + (numeracao === 'dxf' ? ' primary' : '')} onClick={() => setNumeracao('dxf')}>Usar os do desenho</button>
              </div>
              <p className="mp-hint">“Gerar 1…N” numera os pontos de forma contínua, lote a lote no sentido horário a partir da frente; cantos compartilhados recebem o <b>mesmo número</b>.</p>
              {gerado && (
                <div className="mp-kpis">
                  <div className="kpi"><div className="v">{marcos.length}</div><div className="l">Marcos</div></div>
                  <div className="kpi"><div className="v">{marcos.filter(m => m.uso >= 2).length}</div><div className="l">Compartilhados</div></div>
                </div>
              )}
            </div>

            {/* 2. Exportar DXF — o que incluir (independentes, cada um em sua camada) */}
            <div className="mp-block">
              <div className="mp-flabel">Exportar DXF — o que incluir</div>
              <label className={'mp-chk' + (inc.marcos ? ' on' : '')}>
                <input type="checkbox" checked={inc.marcos} onChange={() => toggle('marcos')} />
                <span>Marcos <small>pontos numerados (camada MARCOS)</small></span>
              </label>
              <label className={'mp-chk' + (inc.rotulo ? ' on' : '')}>
                <input type="checkbox" checked={inc.rotulo} onChange={() => toggle('rotulo')} />
                <span>Nº + área do lote <small>no centro, alinhado à face maior (camada ROTULO)</small></span>
              </label>
              <label className={'mp-chk' + (inc.azimute ? ' on' : '')}>
                <input type="checkbox" checked={inc.azimute} onChange={() => toggle('azimute')} />
                <span>Azimute <small>de cada lado (camada AZIMUTE)</small></span>
              </label>
              <label className={'mp-chk' + (inc.cota ? ' on' : '')}>
                <input type="checkbox" checked={inc.cota} onChange={() => toggle('cota')} />
                <span>Cota <small>distâncias; em arco, raio + desenvolvimento (camada COTA)</small></span>
              </label>
              <button className="btn sm primary mp-exp" disabled={nadaSelecionado} onClick={exportarDXF}>⬇ Exportar DXF</button>
              <button className="btn sm" onClick={exportarCSV} disabled={!gerado}>⬇ Coordenadas dos marcos (CSV)</button>
              <p className="mp-hint2">{dxfRaw ? 'Injetado na sua planta original (preserva blocos, hachuras e cotas).' : 'DXF novo com os lotes.'} Cada item vai em sua própria camada — liga/desliga no AutoCAD.</p>
            </div>
          </>
        )}
        <button className="btn ghost sm back" onClick={onClose}>← Voltar ao memorial</button>
      </aside>

      <div className="mp-main">
        {!state ? <div className="detail-empty">Nenhum desenho aberto.</div>
          : !gerado ? <div className="detail-empty">Clique em <b>“Gerar 1…N”</b> para numerar e visualizar os marcos do desenho.<br />Azimute e cota podem ser exportados mesmo sem gerar os pontos.</div>
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
