// Motor do loteamento: detecção de lotes, confrontações automáticas (lote/área/rua), memoriais,
// quadro de áreas, gleba e áreas públicas. Portado e validado no protótipo (determinístico, sem IA).
import {
  signedArea, dist, azimuth, toGMS, quad, pip, reversePoly, arcInfo, areaWithArcs,
  keyPt, sideKey, centroid,
} from './geometry.js'
import { areaExtenso, nb } from './extenso.js'

function insertTf(e, parent, blocks) {
  const c = Math.cos((e.rot || 0) * Math.PI / 180), s = Math.sin((e.rot || 0) * Math.PI / 180)
  const b = blocks[e.name], bx = b ? b.base[0] : 0, by = b ? b.base[1] : 0
  return (x, y) => { const lx = (x - bx) * e.sx, ly = (y - by) * e.sy; return parent(lx * c - ly * s + e.x, lx * s + ly * c + e.y) }
}
// expande inserts (1 nível) → polígonos fechados (com bulges) + textos, em coordenadas de espaço
export function collectSources(model) {
  const polys = [], texts = [], id = (x, y) => [x, y]
  const push = (e, tf, src) => {
    if (e.type === 'lwpolyline' && e.closed && e.verts.length >= 3) {
      let vs = e.verts.map(p => tf(p[0], p[1])); let bg = (e.bulges || []).slice()
      if (vs.length > 1 && keyPt(vs[0]) === keyPt(vs[vs.length - 1])) { vs = vs.slice(0, -1); bg = bg.slice(0, -1) }
      while (bg.length < vs.length) bg.push(0)
      polys.push({ layer: e.layer, verts: vs, bulges: bg, src })
    } else if (e.type === 'text' && e.text) { const p = tf(e.x, e.y); texts.push({ x: p[0], y: p[1], text: e.text, layer: e.layer }) }
  }
  for (const e of model.entities) {
    if (e.type === 'insert') { const b = model.blocks[e.name]; if (b) { const tf = insertTf(e, id, model.blocks); for (const be of b.entities) push(be, tf, e.name) } else push(e, id, 'top') }
    else push(e, id, 'top')
  }
  return { polys, texts }
}

function segOverlap(a1, a2, b1, b2) {
  const dax = a2[0] - a1[0], day = a2[1] - a1[1], La = Math.hypot(dax, day); if (La < 1e-6) return 0
  const ux = dax / La, uy = day / La
  const perp = p => Math.abs((p[0] - a1[0]) * (-uy) + (p[1] - a1[1]) * ux); if (perp(b1) > 0.5 || perp(b2) > 0.5) return 0
  const proj = p => ((p[0] - a1[0]) * ux + (p[1] - a1[1]) * uy); const pb0 = proj(b1), pb1 = proj(b2)
  return Math.max(0, Math.min(La, Math.max(pb0, pb1)) - Math.max(0, Math.min(pb0, pb1)))
}
function confront(a, b, self, allSides) {
  let best = null, bo = 0.8
  for (const s of allSides) { if ((s.lot && s.lot === self) || (s.area && s.area === self)) continue; const ov = segOverlap(a, b, s.a, s.b); if (ov > bo) { bo = ov; best = s } }
  return best
}
function ptNum(v, numTexts) { let best = null, bd = 2.5; for (const t of numTexts) { const d = Math.hypot(t.x - v[0], t.y - v[1]); if (d < bd) { bd = d; best = t } } return best ? best.text : null }
// rua de um lado externo: normal para FORA do lote, pega o texto "RUA X" logo à frente
function guessStreet(a, b, C, ruaObjs) {
  const M = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], L = dist(a, b); if (L < 1e-6) return null
  const tx = (b[0] - a[0]) / L, ty = (b[1] - a[1]) / L; let nx = -ty, ny = tx
  if ((M[0] + nx - C[0]) ** 2 + (M[1] + ny - C[1]) ** 2 < (M[0] - C[0]) ** 2 + (M[1] - C[1]) ** 2) { nx = -nx; ny = -ny }
  let best = null, bs = 1e18
  for (const r of ruaObjs) { const vx = r.x - M[0], vy = r.y - M[1], out = vx * nx + vy * ny, lat = vx * tx + vy * ty; if (out <= 0 || out > 120) continue; const sc = out + Math.abs(lat) * 0.25; if (sc < bs) { bs = sc; best = r } }
  return best ? best.name : null
}
const titleArea = s => String(s).toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())

export function buildLoteamento(model, sources, { lotLayer = 'LOTE', resolutions = {} } = {}) {
  const texts = sources.texts
  const numTexts = texts.filter(t => /^\d{1,4}$/.test(t.text))
  const ruaTexts = texts.filter(t => /^RUA\b/i.test(t.text))
  const ruaObjs = ruaTexts.map(t => ({ name: t.text.replace(/\s+/g, ' ').trim().replace(/^RUA/i, 'Rua'), x: t.x, y: t.y }))
  const labels = texts.filter(t => /^LOTE\s*\d+/i.test(t.text))
  const streets = [...new Set(ruaObjs.map(r => r.name))].sort()

  const polys = sources.polys.filter(p => lotLayer === '__all__' || p.layer === lotLayer)
  const lots = []
  for (const p of polys) {
    const lbl = labels.find(t => pip([t.x, t.y], p.verts)); if (!lbl) continue
    const num = (lbl.text.match(/\d+/) || ['?'])[0]
    const qm = (p.src && p.src.match(/(?:q(?:ua|au)dra|\.Q)\s*0?(\d+)/i) || [])[1] || '?'
    let vs = p.verts, bg = p.bulges || []
    if (signedArea(vs) > 0) { const r = reversePoly(vs, bg); vs = r.v; bg = r.b }
    lots.push({ num, quadra: qm, layer: p.layer, verts: vs, bulges: bg, src: p.src })
  }
  lots.sort((a, b) => { const qa = parseInt(a.quadra) || 999, qb = parseInt(b.quadra) || 999; if (qa !== qb) return qa - qb; return (parseInt(a.num) || 0) - (parseInt(b.num) || 0) })

  // áreas públicas (polígonos "ÁREA ..." que NÃO englobam lotes — exclui gleba/quadra)
  const centLots = lots.map(l => centroid(l.verts))
  const areaObjs = sources.polys.map(p => {
    const lbl = texts.find(t => pip([t.x, t.y], p.verts) && /(ÁREA|AREA)\s/i.test(t.text)); if (!lbl) return null
    if (centLots.some(c => pip(c, p.verts))) return null
    return { name: lbl.text.replace(/\s+/g, ' ').trim(), verts: p.verts, bulges: p.bulges || [] }
  }).filter(Boolean)

  const allSides = []
  lots.forEach(lot => { const vs = lot.verts; for (let i = 0; i < vs.length; i++) allSides.push({ lot, area: null, a: vs[i], b: vs[(i + 1) % vs.length] }) })
  areaObjs.forEach(ar => { for (let i = 0; i < ar.verts.length; i++) allSides.push({ lot: null, area: ar, a: ar.verts[i], b: ar.verts[(i + 1) % ar.verts.length] }) })

  // perímetro da gleba: lados de lote que coincidem com a borda do loteamento confrontam vizinho externo
  const centG = lots.map(l => centroid(l.verts))
  let glebaP = null
  sources.polys.forEach(p => { let d = 0; for (const c of centG) if (pip(c, p.verts)) d++; if (d > centG.length * 0.5) { const a = areaWithArcs(p.verts, p.bulges || []); if (!glebaP || a < glebaP.area) glebaP = { verts: p.verts, area: a } } })
  const glebaEdges = glebaP ? glebaP.verts.map((v, i) => [v, glebaP.verts[(i + 1) % glebaP.verts.length]]) : []

  lots.forEach(lot => {
    const vs = lot.verts, n = vs.length, bg = lot.bulges
    lot.pts = vs.map(v => ptNum(v, numTexts) || null).map((p, i) => p || ('P' + (i + 1)))
    const C = centroid(vs)
    lot.sides = []
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, sk = sideKey(vs[i], vs[j]), o = confront(vs[i], vs[j], lot, allSides)
      const bl = bg[i] || 0, ai = arcInfo(vs[i], vs[j], bl)
      let conf, kind, val = null, auto = false
      if (o && o.lot) { conf = 'Lote ' + o.lot.num + (o.lot.quadra !== lot.quadra ? (' (Q' + o.lot.quadra + ')') : ''); kind = 'lote' }
      else if (o && o.area) { conf = titleArea(o.area.name); kind = 'area' }
      else if (resolutions[sk]) { kind = resolutions[sk].kind; val = resolutions[sk].val; conf = val }
      else {
        const r = guessStreet(vs[i], vs[j], C, ruaObjs)
        if (r) { kind = 'rua'; val = r; conf = r; auto = true }
        else if (glebaEdges.some(e => segOverlap(vs[i], vs[j], e[0], e[1]) > 0.8)) { kind = 'perimetro'; conf = '(limite do loteamento)' }
        else { conf = '(a definir)'; kind = 'wd' }
      }
      lot.sides.push({ idx: i, sk, from: lot.pts[i], to: lot.pts[j], az: azimuth(vs[i], vs[j]), dist: dist(vs[i], vs[j]), bulge: bl, arc: ai, conf, kind, val, auto })
    }
    // o memorial começa pela FRENTE: o lado que dá para rua; em esquina (2+ ruas), a MENOR delas
    const ladosRua = lot.sides.filter(s => s.kind === 'rua')
    let front = ladosRua.length === 1 ? ladosRua[0] : null
    if (ladosRua.length >= 2) { front = ladosRua[0]; for (const s of ladosRua) if (s.dist < front.dist) front = s }
    if (front) { const fi = lot.sides.indexOf(front); if (fi > 0) lot.sides = lot.sides.slice(fi).concat(lot.sides.slice(0, fi)) }
    lot.frente = front ? front.conf : null
    lot.area = areaWithArcs(vs, bg)
    lot.perim = lot.sides.reduce((a, s) => a + (s.arc.arc ? s.arc.desenv : s.dist), 0)
    lot.pend = lot.sides.filter(s => s.kind === 'wd').length
    const iss = []
    if (lot.num === '?') iss.push('sem número de lote')
    if (lot.pts.some(p => /^P\d/.test(p))) iss.push('vértice sem marco numerado')
    if (lot.sides.some(s => s.dist < 0.30)) iss.push('lado muito curto (< 0,30 m)')
    if (lot.sides.some(s => s.arc.arc)) iss.push('tem lado curvo (arco)')
    for (let i = 0; i < n; i++) if (dist(vs[i], vs[(i + 1) % n]) < 0.02) { iss.push('vértice duplicado'); break }
    if (lot.area < 1) iss.push('área quase zero')
    lot.issues = iss; lot.warn = lot.pend > 0 || iss.length > 0
  })
  const byQ = {}; lots.forEach(l => { (byQ[l.quadra] = byQ[l.quadra] || []).push(l) })
  Object.values(byQ).forEach(arr => { const a = arr.map(l => l.area).sort((x, y) => x - y); const med = a[Math.floor(a.length / 2)] || 0; arr.forEach(l => { if (med > 0 && (l.area < med * 0.4 || l.area > med * 2.5)) { l.issues.push('área destoa da quadra'); l.warn = true } }) })

  return { model, sources, lots, areaObjs, ruaObjs, streets, allSides, numTexts, lotLayer }
}

export function lotMemorial(lot, { loteamento = '—', municipio = '—' } = {}) {
  let s = 'Lote ' + lot.num + ': Um terreno urbano localizado no Loteamento "' + loteamento + '", no município de ' + municipio + ', situado na Quadra ' + String(lot.quadra).padStart(2, '0') + ', com as seguintes medidas e confrontações em sentido horário: '
  s += 'Partindo do ponto ' + lot.sides[0].from + '; '
  lot.sides.forEach((sd, k) => {
    let c
    if (sd.kind === 'lote') c = 'confrontando com o ' + sd.conf
    else if (sd.kind === 'area') c = 'confrontando com a ' + sd.conf
    else if (sd.kind === 'rua') c = 'no alinhamento com a ' + sd.conf
    else if (sd.kind === 'perimetro') c = 'confrontando com ' + (sd.val || '[limite do loteamento — definir vizinho]')
    else if (sd.kind === 'wd') c = 'confrontando com [A DEFINIR]'
    else c = 'confrontando com ' + sd.conf
    if (sd.arc.arc) s += 'deste ponto segue ' + c + ', por uma curva à ' + sd.arc.dir + ' com raio de ' + nb(sd.arc.raio, 2) + ' m e desenvolvimento de ' + nb(sd.arc.desenv, 2) + ' m, até o ponto ' + sd.to
    else s += 'deste ponto segue ' + c + ', com azimute de ' + toGMS(sd.az) + ', sentido ' + quad(sd.az) + ' e distância de ' + nb(sd.dist, 2) + ' m, até o ponto ' + sd.to
    s += (k === lot.sides.length - 1) ? ', ponto inicial da descrição deste perímetro; ' : '; '
  })
  s += 'perfazendo uma área total de ' + nb(lot.area, 2) + ' m² (' + areaExtenso(lot.area) + ').'
  return s
}

export function computeQuadroAreas(state) {
  const { lots, areaObjs, sources } = state
  const somaLotes = lots.reduce((a, l) => a + l.area, 0)
  let verde = 0, inst = 0
  areaObjs.forEach(ar => { const a = areaWithArcs(ar.verts, ar.bulges || []); if (/VERDE/i.test(ar.name)) verde += a; else if (/INSTITU/i.test(ar.name)) inst += a })
  const cent = lots.map(l => centroid(l.verts))
  let gleba = 0
  sources.polys.forEach(p => { let d = 0; for (const c of cent) if (pip(c, p.verts)) d++; if (d > cent.length * 0.5) { const a = areaWithArcs(p.verts, p.bulges || []); if (!gleba || a < gleba) gleba = a } })
  return { gleba, lotes: somaLotes, nLotes: lots.length, verde, inst, quadras: new Set(lots.map(l => l.quadra)).size }
}

export function detectGleba(state) {
  const { lots, sources } = state
  const cent = lots.map(l => centroid(l.verts))
  let best = null
  sources.polys.forEach(p => { let d = 0; for (const c of cent) if (pip(c, p.verts)) d++; if (d > cent.length * 0.5) { const a = areaWithArcs(p.verts, p.bulges || []); if (!best || a < best.area) best = { p, area: a } } })
  return best
}
// monta os lados da gleba (perímetro externo) — confrontações são externas (preenchidas pelo operador)
export function buildGleba(state) {
  const g = detectGleba(state); if (!g) return null
  let vs = g.p.verts.slice(), bg = (g.p.bulges || []).slice()
  if (signedArea(vs) > 0) { const r = reversePoly(vs, bg); vs = r.v; bg = r.b }
  const pts = vs.map((v, i) => ptNum(v, state.numTexts) || ('M' + (i + 1)))
  const sides = []
  for (let i = 0; i < vs.length; i++) { const j = (i + 1) % vs.length; sides.push({ i, from: pts[i], to: pts[j], az: azimuth(vs[i], vs[j]), dist: dist(vs[i], vs[j]), arc: arcInfo(vs[i], vs[j], bg[i] || 0) }) }
  return { verts: vs, pts, sides, area: areaWithArcs(vs, bg) }
}
export function glebaMemorial(gleba, conf, { loteamento = '—', municipio = '—' } = {}) {
  let s = 'Gleba de terras com área de ' + nb(gleba.area, 2) + ' m² (' + areaExtenso(gleba.area) + '), situada no município de ' + municipio + ', destinada ao Loteamento "' + loteamento + '", com o seguinte perímetro, no sentido horário: Inicia-se a descrição no marco ' + gleba.sides[0].from + '; '
  gleba.sides.forEach((sd, k) => {
    const cf = conf[sd.i] || '[confrontante a definir]'
    if (sd.arc.arc) s += 'deste ponto segue confrontando com ' + cf + ', por uma curva à ' + sd.arc.dir + ' com raio de ' + nb(sd.arc.raio, 2) + ' m e desenvolvimento de ' + nb(sd.arc.desenv, 2) + ' m, até o marco ' + sd.to
    else s += 'deste ponto segue confrontando com ' + cf + ', com azimute de ' + toGMS(sd.az) + ', sentido ' + quad(sd.az) + ' e distância de ' + nb(sd.dist, 2) + ' m, até o marco ' + sd.to
    s += (k === gleba.sides.length - 1) ? ', marco inicial desta descrição, fechando o perímetro.' : '; '
  })
  return s
}
// memorial de uma área pública (verde/institucional) — confrontações automáticas (lotes/áreas/ruas ao redor)
export function areaMemorial(ar, state, { loteamento = '—', municipio = '—' } = {}) {
  let vs = ar.verts.slice(), bg = (ar.bulges || []).slice()
  if (signedArea(vs) > 0) { const r = reversePoly(vs, bg); vs = r.v; bg = r.b }
  const pts = vs.map((v, i) => ptNum(v, state.numTexts) || ('M' + (i + 1)))
  const C = centroid(vs), area = areaWithArcs(vs, bg), nome = titleArea(ar.name)
  let s = nome + ': área pública com ' + nb(area, 2) + ' m² (' + areaExtenso(area) + '), integrante do Loteamento "' + loteamento + '", município de ' + municipio + ', com o seguinte perímetro, no sentido horário: Inicia-se no marco ' + pts[0] + '; '
  for (let i = 0; i < vs.length; i++) {
    const j = (i + 1) % vs.length, o = confront(vs[i], vs[j], ar, state.allSides), bl = bg[i] || 0, ai = arcInfo(vs[i], vs[j], bl)
    let cf
    if (o && o.lot) cf = 'confrontando com o Lote ' + o.lot.num + (o.lot.quadra !== '?' ? (' (Quadra ' + String(o.lot.quadra).padStart(2, '0') + ')') : '')
    else if (o && o.area) cf = 'confrontando com a ' + titleArea(o.area.name)
    else { const r = guessStreet(vs[i], vs[j], C, state.ruaObjs); cf = r ? ('no alinhamento com a ' + r) : 'confrontando com [a definir]' }
    if (ai.arc) s += 'deste ponto segue ' + cf + ', por uma curva à ' + ai.dir + ' com raio de ' + nb(ai.raio, 2) + ' m e desenvolvimento de ' + nb(ai.desenv, 2) + ' m, até o marco ' + pts[j]
    else s += 'deste ponto segue ' + cf + ', com azimute de ' + toGMS(azimuth(vs[i], vs[j])) + ', sentido ' + quad(azimuth(vs[i], vs[j])) + ' e distância de ' + nb(dist(vs[i], vs[j]), 2) + ' m, até o marco ' + pts[j]
    s += (j === 0) ? ', marco inicial, fechando o perímetro.' : '; '
  }
  return { nome, area, text: s }
}
