// Exporta um DXF (R12/AC1009 — universal) com os lotes e os MARCOS numerados,
// nas mesmas coordenadas do desenho original. A arquiteta reabre no AutoCAD (sozinho ou sobreposto).

const f = n => (Math.round(n * 1e6) / 1e6).toString()

function altext(state) {
  // altura do texto dos números ~ proporcional ao desenho (legível sem poluir)
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity
  for (const l of state.lots) for (const v of l.verts) { if (v[0] < mnx) mnx = v[0]; if (v[1] < mny) mny = v[1]; if (v[0] > mxx) mxx = v[0]; if (v[1] > mxy) mxy = v[1] }
  const diag = Math.hypot(mxx - mnx, mxy - mny) || 100
  return Math.max(0.4, Math.min(2, diag / 1200))
}

export function buildMarcosDxf(state) {
  const L = []
  const p = (...a) => { for (const x of a) L.push(String(x)) }
  // HEADER
  p(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 0, 'ENDSEC')
  // TABLES — linetype, camadas e estilo de texto (R12 completo p/ o AutoCAD abrir limpo)
  p(0, 'SECTION', 2, 'TABLES')
  p(0, 'TABLE', 2, 'LTYPE', 70, 1, 0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, '0.0', 0, 'ENDTAB')
  p(0, 'TABLE', 2, 'LAYER', 70, 4)
  const layer = (name, color) => p(0, 'LAYER', 2, name, 70, 0, 62, color, 6, 'CONTINUOUS')
  layer('0', 7); layer('LOTE', 3); layer('AREA', 5); layer('MARCOS', 1)
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
  for (const m of (state.marcos || [])) {
    p(0, 'POINT', 8, 'MARCOS', 10, f(m.x), 20, f(m.y), 30, '0')
    p(0, 'TEXT', 8, 'MARCOS', 10, f(m.x + h * 0.3), 20, f(m.y + h * 0.3), 30, '0', 40, f(h), 1, String(m.n), 7, 'STANDARD')
  }
  p(0, 'ENDSEC', 0, 'EOF')
  return L.join('\r\n') + '\r\n'
}

export function exportMarcosDxf(state, nome = 'loteamento') {
  const dxf = buildMarcosDxf(state)
  const blob = new Blob([dxf], { type: 'application/dxf' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
  a.download = `Marcos - ${nome}.dxf`; a.click(); URL.revokeObjectURL(a.href)
}
