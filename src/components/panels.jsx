import { useMemo, useState } from 'react'
import { computeQuadroAreas, buildGleba, glebaMemorial, areaMemorial } from '../engine/loteamento.js'
import { areaWithArcs, toGMS } from '../engine/geometry.js'
import { nb } from '../engine/extenso.js'

const pct = (x, g) => g > 0 ? (x / g * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '—'

export function QuadroAreasPanel({ state }) {
  const q = useMemo(() => computeQuadroAreas(state), [state])
  const [gleba, setGleba] = useState((q.gleba || (q.lotes + q.verde + q.inst)).toFixed(2))
  const g = parseFloat(gleba) || 0
  const vias = g - q.lotes - q.verde - q.inst
  const pub = vias + q.verde + q.inst
  const Row = ({ n, a, tot }) => <tr className={tot ? 'tot' : ''}><td>{n}</td><td className="num">{nb(a, 2)}</td><td className="num">{pct(a, g)}</td></tr>
  return (
    <div>
      <div className="gleba-field">Área total da gleba <input type="number" step="0.01" value={gleba} onChange={e => setGleba(e.target.value)} /> m² <span className="hint2">detectada no desenho — confirme ou ajuste</span></div>
      <div className="tblwrap">
        <table><thead><tr><th>Discriminação</th><th className="num">Área (m²)</th><th className="num">%</th></tr></thead>
          <tbody>
            <tr className="tot"><td>Área total da gleba</td><td className="num">{nb(g, 2)}</td><td className="num">100%</td></tr>
            <Row n={`Lotes (${q.nLotes} lotes · ${q.quadras} quadras)`} a={q.lotes} />
            <Row n="Sistema viário (ruas)" a={vias} />
            <Row n="Área verde / de lazer" a={q.verde} />
            <Row n="Área institucional" a={q.inst} />
            <tr className="tot"><td>Área pública total (viário + verde + institucional)</td><td className="num">{nb(pub, 2)}</td><td className="num">{pct(pub, g)}</td></tr>
          </tbody>
        </table>
      </div>
      {vias < -0.5 && <p className="note warn">A área de vias ficou negativa — a gleba informada é menor que lotes + áreas. Confira o valor.</p>}
      <p className="note">A <b>área pública</b> ({pct(pub, g)}) é o que a prefeitura confere contra o mínimo da Lei 6.766. O <b>sistema viário</b> é calculado por diferença (as ruas não são polígonos fechados no desenho).</p>
    </div>
  )
}

export function GlebaPanel({ state, opts, conf, setConf }) {
  const gleba = useMemo(() => buildGleba(state), [state])
  if (!gleba) return <p className="note">Não identifiquei o polígono da gleba (perímetro do loteamento).</p>
  const memo = glebaMemorial(gleba, conf, opts)
  return (
    <div>
      <p className="note">Perímetro do loteamento: <b>{gleba.sides.length} lados</b> · área <b>{nb(gleba.area, 2)} m²</b>. Preencha a <b>confrontação</b> de cada lado (com quem o loteamento faz divisa por fora). Azimute e distância vêm do desenho.</p>
      <div className="tblwrap">
        <table><thead><tr><th>Marco</th><th>Azimute</th><th className="num">Dist.</th><th>Confronta com (por fora)</th></tr></thead>
          <tbody>
            {gleba.sides.map(s => (
              <tr key={s.i}>
                <td className="v">{s.from}→{s.to}</td><td>{toGMS(s.az)}</td>
                <td className="num">{s.arc.arc ? '⌒ ' + nb(s.arc.desenv, 2) : nb(s.dist, 2)}</td>
                <td><input className="conf-input" value={conf[s.i] || ''} placeholder="ex.: terras de Fulano / Rodovia BR-XXX" onChange={e => setConf({ ...conf, [s.i]: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="memo"><div className="mh"><span>Texto do memorial da gleba</span></div><div className="mt">{memo}</div></div>
    </div>
  )
}

export function ViasAreasPanel({ state, opts }) {
  const q = useMemo(() => computeQuadroAreas(state), [state])
  const vias = q.gleba - q.lotes - q.verde - q.inst
  const mems = useMemo(() => state.areaObjs.map(ar => areaMemorial(ar, state, opts)), [state, opts])
  return (
    <div>
      <h4>Sistema viário</h4>
      <p className="note">Área destinada ao sistema viário: <b>{nb(vias, 2)} m²</b> ({pct(vias, q.gleba)} da gleba). As ruas não são polígonos fechados no desenho — o viário entra pela área (ver Quadro de áreas). O memorial de perímetro de cada rua exigiria um polígono fechado por via no CAD.</p>
      <h4>Áreas verdes e institucional ({mems.length})</h4>
      {!mems.length && <p className="note">Nenhum polígono "ÁREA ..." encontrado.</p>}
      {mems.map((m, i) => (
        <div className="memo" key={i}><div className="mh"><span>{m.nome} · {nb(m.area, 2)} m²</span></div><div className="mt">{m.text}</div></div>
      ))}
    </div>
  )
}

export function ConferenciaPanel({ state, onGoLot }) {
  const q = useMemo(() => computeQuadroAreas(state), [state])
  const nIssue = state.lots.filter(l => l.issues.length > 0).length
  const nArc = state.lots.reduce((a, l) => a + l.sides.filter(s => s.arc.arc).length, 0)
  const byQ = {}; state.lots.forEach(l => { const k = String(l.quadra).padStart(2, '0'); (byQ[k] = byQ[k] || { n: 0, a: 0 }); byQ[k].n++; byQ[k].a += l.area })
  const groups = {}; state.lots.forEach((l, i) => l.issues.forEach(iss => { (groups[iss] = groups[iss] || []).push(i) }))
  return (
    <div>
      <div className="mini-kpis">
        <div className="mk"><div className="v">{state.lots.length}</div><div className="l">lotes</div></div>
        <div className="mk"><div className="v">{nb(q.lotes, 0)} m²</div><div className="l">área somada</div></div>
        <div className="mk"><div className="v">{q.quadras}</div><div className="l">quadras</div></div>
        <div className={'mk ' + (nIssue ? 'bad' : 'good')}><div className="v">{nIssue}</div><div className="l">com inconsistência</div></div>
      </div>
      <h4>Áreas por quadra</h4>
      <div className="tblwrap"><table><thead><tr><th>Quadra</th><th className="num">Lotes</th><th className="num">Área somada</th></tr></thead>
        <tbody>{Object.keys(byQ).sort().map(k => <tr key={k}><td>Quadra {k}</td><td className="num">{byQ[k].n}</td><td className="num">{nb(byQ[k].a, 2)} m²</td></tr>)}
          <tr className="tot"><td>Total</td><td className="num">{state.lots.length}</td><td className="num">{nb(q.lotes, 2)} m²</td></tr></tbody></table></div>
      {nArc > 0 && <p className="note">Detectados <b>{nArc}</b> lado(s) curvo(s) — descritos como arco (raio + desenvolvimento) no memorial.</p>}
      <h4>Auditoria — pontos a conferir</h4>
      {!Object.keys(groups).length && <p className="note good">✓ Nenhuma inconsistência encontrada. O desenho está limpo para gerar os memoriais.</p>}
      {Object.entries(groups).sort((a, b) => b[1].length - a[1].length).map(([iss, arr]) => (
        <div className="issue" key={iss}>
          <div className="issue-h"><span>{iss}</span><span className="issue-n">{arr.length}</span></div>
          <div className="issue-lots">{arr.slice(0, 60).map(i => <button key={i} className="lotchip" onClick={() => onGoLot(i)}>Q{String(state.lots[i].quadra).padStart(2, '0')}·L{String(state.lots[i].num).padStart(2, '0')}</button>)}</div>
        </div>
      ))}
    </div>
  )
}
