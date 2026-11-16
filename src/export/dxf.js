// Exporta um DXF (R12/AC1009 — universal) com os lotes e, OPCIONALMENTE e de forma independente,
// os MARCOS numerados, o AZIMUTE de cada lado e a COTA (distância), cada um em sua própria camada
// (MARCOS, AZIMUTE, COTA) — some/aparecem por camada no AutoCAD. Reabre sozinho ou sobre a planta.
import { azimuth, toGMS, arcInfo, sideKey } from '../engine/geometry.js'

const f = n => (Math.round(n * 1e6) / 1e6).toString()
const fmtm = d => (Math.round(d * 100) / 100).toFixed(2).replace('.', ',')

// Rótulos de cada lado dos polígonos (lotes + áreas): AZIMUTE (acima do lado) e COTA/distância
// (abaixo), girados no sentido do lado; em arco, azimute = da corda e cota = raio + desenvolvimento.
// Lados compartilhados entre vizinhos são rotulados UMA vez (dedup por sideKey). `want` escolhe
// quais rótulos emitir; cada item sai com `kind` ('az' | 'cota') p/ ir na camada certa.
function* segLabels(polys, h, want) {
  const off = h * 0.9, seen = new Set()
  for (const poly of polys) {
    const verts = poly.verts, bulges = poly.bulges, n = verts.length
    for (let i = 0; i < n; i++) {
      const a = verts[i], b = verts[(i + 1) % n]
      const k = sideKey(a, b)
      if (seen.has(k)) continue
      seen.add(k)
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy)
      if (len < 1e-6) continue
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, nx = -dy / len, ny = dx / len
      let ang = Math.atan2(dy, dx) * 180 / Math.PI
      if (ang > 90 || ang <= -90) ang -= 180 // mantém o texto sempre legível (nunca de cabeça p/ baixo)
      const bl = (bulges && bulges[i]) || 0
      const ai = Math.abs(bl) > 1e-9 ? arcInfo(a, b, bl) : null
      if (want.azimute) yield { x: mx + nx * off, y: my + ny * off, ang, text: toGMS(azimuth(a, b)), kind: 'az' }
      if (want.cota) yield { x: mx - nx * off, y: my - ny * off, ang, text: ai ? ('R=' + fmtm(ai.raio) + ' L=' + fmtm(ai.desenv) + ' m') : (fmtm(len) + ' m'), kind: 'cota' }
    }
  }
}

function altext(state) {
  // altura do texto dos números ~ proporcional ao desenho (legível sem poluir)
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity
  for (const l of state.lots) for (const v of l.verts) { if (v[0] < mnx) mnx = v[0]; if (v[1] < mny) mny = v[1]; if (v[0] > mxx) mxx = v[0]; if (v[1] > mxy) mxy = v[1] }
  const diag = Math.hypot(mxx - mnx, mxy - mny) || 100
  return Math.max(0.4, Math.min(2, diag / 1200))
}

export function buildMarcosDxf(state, { marcos = true, azimute = false, cota = false } = {}) {
  const L = []
  const p = (...a) => { for (const x of a) L.push(String(x)) }
  // HEADER
  p(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 0, 'ENDSEC')
  // TABLES — linetype, camadas e estilo de texto (R12 completo p/ o AutoCAD abrir limpo)
  p(0, 'SECTION', 2, 'TABLES')
  p(0, 'TABLE', 2, 'LTYPE', 70, 1, 0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, '0.0', 0, 'ENDTAB')
  p(0, 'TABLE', 2, 'LAYER', 70, 6)
  const layer = (name, color) => p(0, 'LAYER', 2, name, 70, 0, 62, color, 6, 'CONTINUOUS')
  layer('0', 7); layer('LOTE', 3); layer('AREA', 5); layer('MARCOS', 1); layer('AZIMUTE', 2); layer('COTA', 4)
  p(0, 'ENDTAB')
  p(0, 'TABLE', 2, 'STYLE', 70, 1, 0, 'STYLE', 2, 'STANDARD', 70, 0, 40, '0.0', 41, '1.0', 50, '0.0', 71, 0, 42, '2.5', 3, 'txt', 4, '', 0, 'ENDTAB')
  p(0, 'ENDSEC')
  // ENTITIES
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
  // azimute (camada AZIMUTE) e/ou cota (camada COTA) de cada lado, centralizado e girado no lado
  if (azimute || cota) for (const lb of segLabels([...state.lots, ...(state.areaObjs || [])], h, { azimute, cota }))
    p(0, 'TEXT', 8, lb.kind === 'az' ? 'AZIMUTE' : 'COTA', 10, f(lb.x), 20, f(lb.y), 30, '0', 40, f(h * 0.8), 1, lb.text, 50, f(lb.ang), 72, 1, 11, f(lb.x), 21, f(lb.y), 31, '0', 7, 'STANDARD')
  p(0, 'ENDSEC', 0, 'EOF')
  return L.join('\r\n') + '\r\n'
}

export function exportMarcosDxf(state, nome = 'loteamento', opts = {}) {
  baixar(buildMarcosDxf(state, opts), nome)
}

// INJETA os marcos (POINT+TEXT) no DXF ORIGINAL, preservando toda a planta (blocos, hachuras, cotas…).
// Formato AC1015: cada entidade recebe um handle único (a partir do $HANDSEED) e dono 1F (model space).
export function buildPlantaMarcosDxf(original, state, { marcos = true, azimute = false, cota = false } = {}) {
  const nl = original.includes('\r\n') ? '\r\n' : '\n'
  const lines = original.split(/\r?\n/)
  const eIdx = lines.findIndex(l => l.trim() === 'ENTITIES')
  if (eIdx < 0) return buildMarcosDxf(state, { marcos, azimute, cota }) // sem seção ENTITIES reconhecível → cai no reconstruído
  let endIdx = -1
  for (let i = eIdx + 1; i < lines.length; i++) if (lines[i].trim() === 'ENDSEC') { endIdx = i; break }
  if (endIdx < 0) return buildMarcosDxf(state, { marcos, azimute, cota })

  // handle inicial = $HANDSEED (hex); se não achar, começa alto p/ não colidir
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
  // azimute (camada AZIMUTE) e/ou cota (camada COTA) de cada lado, centralizado e girado
  if (azimute || cota) for (const lb of segLabels([...state.lots, ...(state.areaObjs || [])], H, { azimute, cota }))
    push(0, 'TEXT', 5, hx(), 330, '1F', 100, 'AcDbEntity', 8, lb.kind === 'az' ? 'AZIMUTE' : 'COTA', 100, 'AcDbText', 10, f(lb.x), 20, f(lb.y), 30, '0.0', 40, f(H * 0.8), 1, lb.text, 50, f(lb.ang), 72, 1, 11, f(lb.x), 21, f(lb.y), 31, '0.0', 100, 'AcDbText', 73, 0)
  if (hsIdx >= 0) lines[hsIdx + 2] = h.toString(16).toUpperCase() // atualiza o $HANDSEED
  lines.splice(endIdx - 1, 0, ...ent) // insere antes do "0/ENDSEC" que fecha a seção ENTITIES
  return lines.join(nl) + nl
}

export function exportPlantaMarcosDxf(original, state, nome = 'loteamento', opts = {}) {
  baixar(buildPlantaMarcosDxf(original, state, opts), nome)
}

function baixar(dxf, nome) {
  const blob = new Blob([dxf], { type: 'application/dxf' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
  a.download = `Marcos - ${nome}.dxf`; a.click(); URL.revokeObjectURL(a.href)
}
