// Exporta um DXF (R12/AC1009 — universal) com os lotes e, de forma INDEPENDENTE e cada um em sua
// camada: MARCOS (pontos numerados), ROTULO (nº do lote + área, no centro alinhado à face maior),
// AZIMUTE e COTA (em cada lado). Todos os rótulos ficam DENTRO do lote, alinhados às faces, sem sair
// das linhas. Azimute = horário a partir do Norte (atan2(ΔE,ΔN)). Reabre sozinho ou sobre a planta.
import { azimuth, toGMS, arcInfo, centroid, areaWithArcs } from '../engine/geometry.js'

const f = n => (Math.round(n * 1e6) / 1e6).toString()
const fmtm = d => (Math.round(d * 100) / 100).toFixed(2).replace('.', ',')
// alturas de texto (unidades do desenho): nº do lote 1,2; área / azimute / cota 0,8
const ALT = { num: 1.2, area: 0.8, az: 0.8, cota: 0.8 }
// ângulo de texto sempre legível (nunca de cabeça para baixo)
function legAng(dx, dy) { let a = Math.atan2(dy, dx) * 180 / Math.PI; if (a > 90 || a <= -90) a -= 180; return a }

// Rótulos de AZIMUTE/COTA de cada lado, deslocados para o INTERIOR do polígono (nunca saem das
// linhas). SEM dedup: cada lote rotula seus próprios lados (lado compartilhado mostra as 2 direções).
function sideLabels(verts, bulges, want, h) {
  const C = centroid(verts), n = verts.length, off = 0.9, out = []
  for (let i = 0; i < n; i++) {
    const a = verts[i], b = verts[(i + 1) % n]
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy)
    if (len < 1e-6) continue
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
    let nx = -dy / len, ny = dx / len
    if ((C[0] - mx) * nx + (C[1] - my) * ny < 0) { nx = -nx; ny = -ny } // normal apontando p/ dentro
    const ang = legAng(dx, dy)
    const bl = (bulges && bulges[i]) || 0
    const ai = Math.abs(bl) > 1e-9 ? arcInfo(a, b, bl) : null
    let lvl = 1
    if (want.azimute) { out.push({ x: mx + nx * off * lvl, y: my + ny * off * lvl, ang, text: toGMS(azimuth(a, b)), kind: 'az' }); lvl++ }
    if (want.cota) out.push({ x: mx + nx * off * lvl, y: my + ny * off * lvl, ang, text: ai ? ('R=' + fmtm(ai.raio) + ' L=' + fmtm(ai.desenv) + ' m') : (fmtm(len) + ' m'), kind: 'cota' })
  }
  return out
}

// Rótulo central (nº + área): "horizontal em relação ao LOTE" — acompanha a direção do lote (gira
// junto, pelo maior lado), nº em cima e área embaixo, centralizado e sempre legível (render-rot2).
function centerLabel(verts, lines) {
  const C = centroid(verts), n = verts.length
  let best = -1, bi = 0
  for (let i = 0; i < n; i++) { const a = verts[i], b = verts[(i + 1) % n]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d > best) { best = d; bi = i } }
  const a = verts[bi], b = verts[(bi + 1) % n]
  const ang = legAng(b[0] - a[0], b[1] - a[1]), rad = ang * Math.PI / 180
  const px = -Math.sin(rad), py = Math.cos(rad), gap = 1.3, start = (lines.length - 1) / 2
  return lines.map((t, k) => ({ x: C[0] + px * (start - k) * gap, y: C[1] + py * (start - k) * gap, ang, text: t, kind: k === 0 ? 'num' : 'area' }))
}

const lyrOf = k => k === 'az' ? 'AZIMUTE' : k === 'cota' ? 'COTA' : (k === 'num' || k === 'area') ? 'ROTULO' : '0'

// monta, para um polígono, todos os rótulos pedidos (centro + lados)
function polyLabels(verts, bulges, lines, { rotulo, azimute, cota }, h) {
  const out = []
  if (rotulo && lines) out.push(...centerLabel(verts, lines))
  if (azimute || cota) out.push(...sideLabels(verts, bulges, { azimute, cota }, h))
  return out
}
function lotLines(lot) { return ['LOTE ' + lot.num, 'A=' + fmtm(lot.area || 0) + 'm²'] }
function areaLines(ar) { return [ar.name, 'A=' + fmtm(areaWithArcs(ar.verts, ar.bulges || [])) + 'm²'] }

function altext(state) {
  // altura do texto ~ proporcional ao desenho (legível sem poluir)
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity
  for (const l of state.lots) for (const v of l.verts) { if (v[0] < mnx) mnx = v[0]; if (v[1] < mny) mny = v[1]; if (v[0] > mxx) mxx = v[0]; if (v[1] > mxy) mxy = v[1] }
  const diag = Math.hypot(mxx - mnx, mxy - mny) || 100
  return Math.max(0.4, Math.min(2, diag / 1200))
}

export function buildMarcosDxf(state, { marcos = true, rotulo = true, azimute = false, cota = false } = {}) {
  const L = []
  const p = (...a) => { for (const x of a) L.push(String(x)) }
  p(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 0, 'ENDSEC')
  p(0, 'SECTION', 2, 'TABLES')
  p(0, 'TABLE', 2, 'LTYPE', 70, 1, 0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, '0.0', 0, 'ENDTAB')
  p(0, 'TABLE', 2, 'LAYER', 70, 7)
  const layer = (name, color) => p(0, 'LAYER', 2, name, 70, 0, 62, color, 6, 'CONTINUOUS')
  layer('0', 7); layer('LOTE', 3); layer('AREA', 5); layer('MARCOS', 1); layer('ROTULO', 7); layer('AZIMUTE', 2); layer('COTA', 4)
  p(0, 'ENDTAB')
  p(0, 'TABLE', 2, 'STYLE', 70, 1, 0, 'STYLE', 2, 'STANDARD', 70, 0, 40, '0.0', 41, '1.0', 50, '0.0', 71, 0, 42, '2.5', 3, 'txt', 4, '', 0, 'ENDTAB')
  p(0, 'ENDSEC')
  p(0, 'SECTION', 2, 'ENTITIES')
  const poly = (verts, bulges, lyr) => {
    p(0, 'POLYLINE', 8, lyr, 66, 1, 70, 1, 10, '0', 20, '0', 30, '0')
    verts.forEach((v, i) => { p(0, 'VERTEX', 8, lyr, 10, f(v[0]), 20, f(v[1]), 30, '0'); const b = bulges && bulges[i]; if (b) p(42, f(b)) })
    p(0, 'SEQEND', 8, lyr)
  }
  for (const lot of state.lots) poly(lot.verts, lot.bulges, 'LOTE')
  for (const ar of state.areaObjs || []) poly(ar.verts, ar.bulges, 'AREA')
  const h = altext(state)
  if (marcos) for (const m of (state.marcos || [])) {
    p(0, 'POINT', 8, 'MARCOS', 10, f(m.x), 20, f(m.y), 30, '0')
    p(0, 'TEXT', 8, 'MARCOS', 10, f(m.x + h * 0.3), 20, f(m.y + h * 0.3), 30, '0', 40, f(h), 1, String(m.n), 7, 'STANDARD')
  }
  const txt = lb => p(0, 'TEXT', 8, lyrOf(lb.kind), 10, f(lb.x), 20, f(lb.y), 30, '0', 40, f(ALT[lb.kind] || 0.8), 1, lb.text, 50, f(lb.ang), 72, 1, 11, f(lb.x), 21, f(lb.y), 31, '0', 7, 'STANDARD')
  if (rotulo || azimute || cota) {
    for (const lot of state.lots) polyLabels(lot.verts, lot.bulges, lotLines(lot), { rotulo, azimute, cota }, h).forEach(txt)
    for (const ar of state.areaObjs || []) polyLabels(ar.verts, ar.bulges, areaLines(ar), { rotulo, azimute, cota }, h).forEach(txt)
  }
  p(0, 'ENDSEC', 0, 'EOF')
  return L.join('\r\n') + '\r\n'
}

export function exportMarcosDxf(state, nome = 'loteamento', opts = {}) {
  baixar(buildMarcosDxf(state, opts), nome)
}

// INJETA os rótulos no DXF ORIGINAL, preservando toda a planta (blocos, hachuras, cotas…).
// Formato AC1015: cada entidade recebe um handle único (a partir do $HANDSEED) e dono 1F (model space).
export function buildPlantaMarcosDxf(original, state, { marcos = true, rotulo = true, azimute = false, cota = false } = {}) {
  const nl = original.includes('\r\n') ? '\r\n' : '\n'
  const lines = original.split(/\r?\n/)
  const eIdx = lines.findIndex(l => l.trim() === 'ENTITIES')
  if (eIdx < 0) return buildMarcosDxf(state, { marcos, rotulo, azimute, cota }) // sem ENTITIES → reconstruído
  let endIdx = -1
  for (let i = eIdx + 1; i < lines.length; i++) if (lines[i].trim() === 'ENDSEC') { endIdx = i; break }
  if (endIdx < 0) return buildMarcosDxf(state, { marcos, rotulo, azimute, cota })

  const hsIdx = lines.findIndex(l => l.trim() === '$HANDSEED')
  let h = 0x90000
  if (hsIdx >= 0) { const v = parseInt((lines[hsIdx + 2] || '').trim(), 16); if (!isNaN(v)) h = v }
  const hx = () => (h++).toString(16).toUpperCase()

  const H = altext(state)
  const ent = []
  const push = (...a) => { for (const x of a) ent.push(String(x)) }
  if (marcos) for (const m of (state.marcos || [])) {
    push(0, 'POINT', 5, hx(), 330, '1F', 100, 'AcDbEntity', 8, 'MARCOS', 100, 'AcDbPoint', 10, f(m.x), 20, f(m.y), 30, '0.0')
    push(0, 'TEXT', 5, hx(), 330, '1F', 100, 'AcDbEntity', 8, 'MARCOS', 100, 'AcDbText', 10, f(m.x + H * 0.3), 20, f(m.y + H * 0.3), 30, '0.0', 40, f(H), 1, String(m.n), 50, '0.0', 100, 'AcDbText')
  }
  const txt = lb => push(0, 'TEXT', 5, hx(), 330, '1F', 100, 'AcDbEntity', 8, lyrOf(lb.kind), 100, 'AcDbText', 10, f(lb.x), 20, f(lb.y), 30, '0.0', 40, f(ALT[lb.kind] || 0.8), 1, lb.text, 50, f(lb.ang), 72, 1, 11, f(lb.x), 21, f(lb.y), 31, '0.0', 100, 'AcDbText', 73, 0)
  if (rotulo || azimute || cota) {
    for (const lot of state.lots) polyLabels(lot.verts, lot.bulges, lotLines(lot), { rotulo, azimute, cota }, H).forEach(txt)
    for (const ar of state.areaObjs || []) polyLabels(ar.verts, ar.bulges, areaLines(ar), { rotulo, azimute, cota }, H).forEach(txt)
  }
  if (hsIdx >= 0) lines[hsIdx + 2] = h.toString(16).toUpperCase()
  // insere antes do "0/ENDSEC" que fecha a seção ENTITIES. Usa concat (NÃO splice(...ent)):
  // espalhar dezenas de milhares de itens como argumentos estoura o limite do JS (RangeError).
  const out = lines.slice(0, endIdx - 1).concat(ent, lines.slice(endIdx - 1))
  return out.join(nl) + nl
}

export function exportPlantaMarcosDxf(original, state, nome = 'loteamento', opts = {}) {
  baixar(buildPlantaMarcosDxf(original, state, opts), nome)
}

function baixar(dxf, nome) {
  const blob = new Blob([dxf], { type: 'application/dxf' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
  a.download = `Prancheta - ${nome}.dxf`; a.click(); URL.revokeObjectURL(a.href)
}
