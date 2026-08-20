// Motor do loteamento: detecção de lotes, confrontações automáticas (lote/área/rua), memoriais,
// quadro de áreas, gleba e áreas públicas. Portado e validado no protótipo (determinístico, sem IA).
import {
  signedArea, dist, azimuth, toGMS, quad, toRumo, pip, reversePoly, arcInfo, areaWithArcs,
  keyPt, sideKey, marcoKey, centroid,
} from './geometry.js'
import { areaExtenso, nb } from './extenso.js'
import { modeloAlegrete, render } from '../models/modelo.js'

// cláusula de medida (azimute / rumo / ambos / arco) conforme o modelo. perim=true usa o arco de perímetro
// (quarteirão/rua/área): no condomínio, esse arco NÃO leva "e raio de ..." (como no memorial dos quarteirões).
function medida(modelo, sd, perim) {
  const d = modelo.desc
  if (sd.arc && sd.arc.arc) return render((perim && d.medidaArcoPerim) || d.medidaArco, { dir: sd.arc.dir, raio: nb(sd.arc.raio, 2), desenv: nb(sd.arc.desenv, 2), az: toGMS(sd.az), corda: nb(sd.dist, 2) })
  const vars = { az: toGMS(sd.az), quad: quad(sd.az), rumo: toRumo(sd.az), dist: nb(sd.dist, 2) }
  if (modelo.angulo === 'rumo') return render(d.medidaRumo, vars)
  if (modelo.angulo === 'ambos') return render(d.medidaAmbos, vars)
  return render(d.medidaAz, vars)
}
// cláusula de confrontação conforme o tipo de lado e o modelo
function confClause(modelo, sd) {
  const c = modelo.desc.conf, cond = modelo.tipo === 'condominio', termo = modelo.termoUnidade || 'Lote'
  const lc = s => cond ? String(s).replace(/^Lote\b/, termo) : s   // "Lote 04" -> termo em condomínio
  const art = /unidade|quadra/i.test(termo) ? 'a' : 'o'           // artigo conforme o gênero do termo
  if (sd.kind === 'rua') return render(c.rua, { c: sd.conf })
  if (sd.kind === 'lote') return render(c.lote, { art, c: lc(sd.conf) })
  if (sd.kind === 'area') return render(c.area, { c: sd.conf })
  if (sd.kind === 'perimetro') return render(c.perimetro, { c: sd.val || (cond ? '[limite do condomínio — definir vizinho]' : '[limite do loteamento — definir vizinho]') })
  if (sd.kind === 'wd') return c.wd
  if (sd.kind === 'livre') {                                       // texto do operador/modelo: artigo só se for "Lote/Unidade N"
    const v = lc(sd.conf)
    return /^(lote|unidade)\b/i.test(v) ? render(c.lote, { art, c: v }) : render(c.perimetro, { c: v })
  }
  return render(c.lote, { art, c: lc(sd.conf) })
}

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
// rótulo do marco: usa a numeração gerada (state.marcosMap) se houver; senão o número do desenho; senão M-n
function marcoLabel(state, v, i) {
  if (state.marcosMap) { const n = state.marcosMap.get(marcoKey(v)); if (n != null) return String(n) }
  return ptNum(v, state.numTexts) || ('M' + (i + 1))
}
// rua de um lado externo: normal para FORA do lote, pega o texto "RUA X" logo à frente
function guessStreet(a, b, C, ruaObjs) {
  const M = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], L = dist(a, b); if (L < 1e-6) return null
  const tx = (b[0] - a[0]) / L, ty = (b[1] - a[1]) / L; let nx = -ty, ny = tx
  if ((M[0] + nx - C[0]) ** 2 + (M[1] + ny - C[1]) ** 2 < (M[0] - C[0]) ** 2 + (M[1] - C[1]) ** 2) { nx = -nx; ny = -ny }
  // Regra geral (qualquer loteamento): a via do PRÓPRIO loteamento — rótulo DENTRO da gleba — tem
  // prioridade sobre a via externa que ela continua (ex.: "Rua D-3" interna vence "R. Pedro Honório").
  // Isso é seguro porque, para um lote de borda que dá p/ via externa, os rótulos internos ficam ATRÁS
  // (out<0) e nem entram — só competem quando a via interna está realmente à frente.
  let bIn = null, sIn = 1e18, bOut = null, sOut = 1e18
  for (const r of ruaObjs) {
    const vx = r.x - M[0], vy = r.y - M[1], out = vx * nx + vy * ny, lat = vx * tx + vy * ty
    if (out <= 0 || out > 120) continue
    const sc = out + Math.abs(lat) * 0.25
    if (r.inside) { if (sc < sIn) { sIn = sc; bIn = r } } else if (sc < sOut) { sOut = sc; bOut = r }
  }
  return bIn ? bIn.name : (bOut ? bOut.name : null)
}
// texto mais próximo À FRENTE do lado (normal para fora), dentro de `cap` m — genérico (vizinho/confrontante externo)
function frenteTexto(a, b, C, objs, cap) {
  const M = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], L = dist(a, b); if (L < 1e-6) return null
  const tx = (b[0] - a[0]) / L, ty = (b[1] - a[1]) / L; let nx = -ty, ny = tx
  if ((M[0] + nx - C[0]) ** 2 + (M[1] + ny - C[1]) ** 2 < (M[0] - C[0]) ** 2 + (M[1] - C[1]) ** 2) { nx = -nx; ny = -ny }
  let best = null, bs = 1e18
  for (const o of objs) { const vx = o.x - M[0], vy = o.y - M[1], out = vx * nx + vy * ny, lat = vx * tx + vy * ty; if (out <= 0 || out > cap) continue; const sc = out + Math.abs(lat) * 0.25; if (sc < bs) { bs = sc; best = o } }
  return best ? best.name : null
}

// CONTORNO DO QUARTEIRÃO pela UNIÃO dos lotes: as arestas internas (compartilhadas por 2 lotes da mesma quadra)
// se cancelam; sobram as de borda, que são encadeadas no maior anel. Carrega bulges (arcos) das arestas originais.
// Validado contra o memorial real (Cruz Alta): a área bate com a "área privativa" de cada quarteirão (~0,2%).
function quadraOutline(lotsQ) {
  const TOL = 0.03, key = p => Math.round(p[0] / TOL) + ',' + Math.round(p[1] / TOL)
  const edges = new Map()
  for (const l of lotsQ) {
    const vs = l.verts, bg = l.bulges || [], n = vs.length
    for (let i = 0; i < n; i++) {
      const a = vs[i], b = vs[(i + 1) % n], ka = key(a), kb = key(b); if (ka === kb) continue
      const uk = ka < kb ? ka + '|' + kb : kb + '|' + ka, e = edges.get(uk)
      if (e) e.count++; else edges.set(uk, { a, b, bulge: bg[i] || 0, ka, kb, count: 1 })
    }
  }
  const boundary = [...edges.values()].filter(e => e.count === 1); if (boundary.length < 3) return null
  const adj = new Map(), add = (k, e) => { (adj.get(k) || adj.set(k, []).get(k)).push(e) }
  for (const e of boundary) { add(e.ka, e); add(e.kb, e) }
  const used = new Set(), rings = []
  for (const e0 of boundary) {
    if (used.has(e0)) continue
    const verts = [], bulges = []; let curK = e0.ka, e = e0
    while (e && !used.has(e)) {
      used.add(e); const fromA = e.ka === curK
      verts.push(fromA ? e.a : e.b); bulges.push(fromA ? e.bulge : -e.bulge)
      const nextK = fromA ? e.kb : e.ka; curK = nextK; e = (adj.get(nextK) || []).find(x => !used.has(x))
    }
    if (verts.length >= 3) rings.push({ verts, bulges })
  }
  if (!rings.length) return null
  rings.sort((a, b) => Math.abs(areaWithArcs(b.verts, b.bulges)) - Math.abs(areaWithArcs(a.verts, a.bulges)))
  return mergeColineares(rings[0])   // maior anel = contorno externo; funde só retas colineares (preserva a área)
}
// funde vértices redundantes de retas EXATAMENTE colineares (não mexe em arcos → área intacta)
function mergeColineares(ring) {
  let v = ring.verts.slice(), b = ring.bulges.slice(), changed = true, guard = 0
  while (changed && guard++ < 9999) {
    changed = false
    if (v.length <= 3) break
    for (let i = 0; i < v.length; i++) {
      const j = (i + 1) % v.length, k = (i + 2) % v.length
      if (Math.abs(b[i] || 0) > 1e-7 || Math.abs(b[j] || 0) > 1e-7) continue   // só retas
      const A = v[i], V = v[j], B = v[k]
      const d1x = V[0] - A[0], d1y = V[1] - A[1], d2x = B[0] - V[0], d2y = B[1] - V[1]
      const l1 = Math.hypot(d1x, d1y), l2 = Math.hypot(d2x, d2y); if (l1 < 1e-9 || l2 < 1e-9) continue
      const cross = (d1x * d2y - d1y * d2x) / (l1 * l2), dot = (d1x * d2x + d1y * d2y) / (l1 * l2)
      if (Math.abs(cross) < Math.sin(0.5 * Math.PI / 180) && dot > 0) { v.splice(j, 1); b.splice(j, 1); changed = true; break }
    }
  }
  return { verts: v, bulges: b }
}
// --- simplificação do perímetro do quarteirão: cada FACE (trecho entre cantos, mesmo confrontante) vira UMA
// curva/reta, como no memorial da arquiteta ("apenas os pontos principais"). Só funde quando um único arco fica
// dentro de TOL de todos os pontos originais; senão mantém o detalhe (nunca inventa um arco errado). A ÁREA do
// quarteirão continua vindo da união exata dos lotes — aqui é só o traço do texto ("comprimento aproximado").
const angDiff = (a, b) => { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d }
function circleFit(pts) {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0; const N = pts.length
  for (const [x, y] of pts) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z }
  const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, N]], r = [sxz, syz, sz]
  const det = M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0])
  if (Math.abs(det) < 1e-6) return null
  const cof = [
    [(M[1][1] * M[2][2] - M[1][2] * M[2][1]), -(M[1][0] * M[2][2] - M[1][2] * M[2][0]), (M[1][0] * M[2][1] - M[1][1] * M[2][0])],
    [-(M[0][1] * M[2][2] - M[0][2] * M[2][1]), (M[0][0] * M[2][2] - M[0][2] * M[2][0]), -(M[0][0] * M[2][1] - M[0][1] * M[2][0])],
    [(M[0][1] * M[1][2] - M[0][2] * M[1][1]), -(M[0][0] * M[1][2] - M[0][2] * M[1][0]), (M[0][0] * M[1][1] - M[0][1] * M[1][0])],
  ]
  const s = [0, 1, 2].map(i => (cof[i][0] * r[0] + cof[i][1] * r[1] + cof[i][2] * r[2]) / det)
  const cx = s[0] / 2, cy = s[1] / 2, R = Math.sqrt(Math.max(0, s[2] + cx * cx + cy * cy))
  return { cx, cy, R }
}
function arcCenterOf(p1, p2, bulge) {
  const c = dist(p1, p2); if (c < 1e-9 || Math.abs(bulge) < 1e-9) return null
  const th = 4 * Math.atan(bulge), R = c / (2 * Math.sin(th / 2))
  const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2, dx = p2[0] - p1[0], dy = p2[1] - p1[1], apo = R * Math.cos(th / 2)
  return { cx: mx + (dy / c) * apo, cy: my + (-dx / c) * apo, R: Math.abs(R) }
}
function distSeg(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; if (L < 1e-12) return dist(p, a); let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L; t = Math.max(0, Math.min(1, t)); return dist(p, [a[0] + t * dx, a[1] + t * dy]) }
// tenta representar a face (lista de pontos) por UMA reta ou UM arco dentro de TOL; devolve {ok, bulge}
function faceArco(run, TOL) {
  if (run.length <= 2) return { ok: false }
  const A = run[0], B = run[run.length - 1], chord = dist(A, B); if (chord < 1e-6) return { ok: false }
  let dl = 0; for (const p of run) dl = Math.max(dl, distSeg(p, A, B)); if (dl <= TOL) return { ok: true, bulge: 0 }   // reta
  const fit = circleFit(run); if (!fit || fit.R > 1e5) return { ok: false }
  const th = 2 * Math.asin(Math.min(1, chord / (2 * fit.R)))
  const vm = run[Math.floor(run.length / 2)], cross = (B[0] - A[0]) * (vm[1] - A[1]) - (B[1] - A[1]) * (vm[0] - A[0])
  const bulge = (cross > 0 ? 1 : -1) * Math.tan(th / 4), c = arcCenterOf(A, B, bulge); if (!c) return { ok: false }
  let da = 0; for (const p of run) da = Math.max(da, Math.abs(Math.hypot(p[0] - c.cx, p[1] - c.cy) - c.R)); if (da <= TOL) return { ok: true, bulge }
  return { ok: false }
}
// divide o anel em faces (canto > TH° ou troca de confrontante) e simplifica cada face -> segmentos {from,to,bulge,conf}
function simplificaPerimetro(vs, bg, TH = 22, TOL = 0.35) {
  const n = vs.length; if (n < 3) return vs.map((_, i) => ({ from: i, to: (i + 1) % n, bulge: bg[i] || 0 }))
  const az = vs.map((v, i) => azimuth(v, vs[(i + 1) % n]))
  const isBreak = i => angDiff(az[(i + 1) % n], az[i]) > TH   // quebra a face só em CANTO real (não por confrontante)
  let start = 0; for (let i = 0; i < n; i++) { if (isBreak(i)) { start = (i + 1) % n; break } }
  const order = Array.from({ length: n }, (_, k) => (start + k) % n)   // índices de aresta a partir de um canto
  const faces = []; let cur = [order[0]]
  for (let k = 1; k < n; k++) { if (isBreak(order[k - 1])) { faces.push(cur); cur = [] } cur.push(order[k]) }
  faces.push(cur)
  const segs = []
  for (const face of faces) {
    const f0 = face[0], f1 = face[face.length - 1]
    const run = face.map(ei => vs[ei]); run.push(vs[(f1 + 1) % n])
    const a = face.length > 1 ? faceArco(run, TOL) : { ok: false }
    if (a.ok) segs.push({ from: f0, to: (f1 + 1) % n, bulge: a.bulge })
    else for (const ei of face) segs.push({ from: ei, to: (ei + 1) % n, bulge: bg[ei] || 0 })
  }
  return segs
}
const titleArea = s => String(s).toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())

// logradouros (vias) do desenho: RUA, AVENIDA/AV., R.<nome>, TRAVESSA/TV., ESTRADA/ESTR., RODOVIA/ROD., ALAMEDA/AL., CORREDOR, PRAÇA.
// abreviações exigem ponto (AV., R.) p/ não confundir com outros textos; nomes TODOS em maiúsculo viram Title Case.
const VIA_RE = /^(?:(RUA|AVENIDA|TRAVESSA|ESTRADA|RODOVIA|ALAMEDA|CORREDOR|PRA[CÇ]A)\b|(AV|R|TV|ESTR|ROD|AL)\.)\s*(.+)$/i
const VIA_PFX = { RUA: 'Rua', R: 'Rua', AVENIDA: 'Avenida', AV: 'Avenida', TRAVESSA: 'Travessa', TV: 'Travessa', ESTRADA: 'Estrada', ESTR: 'Estrada', RODOVIA: 'Rodovia', ROD: 'Rodovia', ALAMEDA: 'Alameda', AL: 'Alameda', CORREDOR: 'Corredor', PRACA: 'Praça', 'PRAÇA': 'Praça' }
const tcaseVia = s => s.toLowerCase().replace(/(^|[\s\-.])([a-zà-ÿ])/g, (m, a, c) => a + c.toUpperCase())
function normVia(raw) {
  const m = String(raw).replace(/\s+/g, ' ').trim().match(VIA_RE); if (!m) return null
  const pfx = VIA_PFX[(m[1] || m[2]).toUpperCase()] || (m[1] || m[2])
  let nome = m[3].trim(); if (nome === nome.toUpperCase()) nome = tcaseVia(nome)
  return pfx + ' ' + nome
}

// detecta QUADRAS por POLÍGONO: quando há polígonos numa camada "QUADRA" com texto "QUADRA X" dentro
// (ex.: Cruz Alta, quarteirões A..I-2), atribui cada lote à quadra que o contém. Retorna as quadras (p/ o memorial).
function detectQuadrasPoly(lots, sources, texts) {
  const qpolys = sources.polys.filter(p => /quadra/i.test(p.layer))
  if (!qpolys.length) return null
  const qtxt = texts.filter(t => /^QUADRA\b/i.test(t.text) || /^QUARTEIR/i.test(t.text))
  const cents = lots.map(l => centroid(l.verts))
  const quadras = qpolys.map(p => {
    const lbl = qtxt.find(t => pip([t.x, t.y], p.verts))
    return { verts: p.verts, bulges: p.bulges || [], nome: lbl ? lbl.text.replace(/^(QUADRA|QUARTEIR[ÃA]O)\s*/i, '').trim() : null }
  }).filter(q => q.nome)
  if (!quadras.length) return null
  const assign = cents.map(c => { const q = quadras.find(q => pip(c, q.verts)); return q ? q.nome : null })
  if (assign.filter(Boolean).length <= lots.length * 0.5) return null   // cobre menos da metade → não usa (não muta)
  lots.forEach((l, i) => { if (assign[i]) l.quadra = assign[i] })
  return quadras
}

// detecta QUADRAS quando o bloco não traz o nome: agrupa lotes por vizinhança (quem divide divisa =
// mesma quadra; a rua separa) e rotula cada grupo com o texto "QUADRA nn" que cai nele. Sistema-arquiteta.
function detectQuadras(lots, texts) {
  const n = lots.length; if (!n) return
  const bb = lots.map(l => { let ax = 1e18, ay = 1e18, bx = -1e18, by = -1e18; for (const v of l.verts) { if (v[0] < ax) ax = v[0]; if (v[1] < ay) ay = v[1]; if (v[0] > bx) bx = v[0]; if (v[1] > by) by = v[1] } return [ax, ay, bx, by] })
  const par = lots.map((_, i) => i); const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x] } return x }
  const touch = (i, j) => bb[i][0] <= bb[j][2] + 0.5 && bb[i][2] >= bb[j][0] - 0.5 && bb[i][1] <= bb[j][3] + 0.5 && bb[i][3] >= bb[j][1] - 0.5
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (find(i) === find(j) || !touch(i, j)) continue
    const vi = lots[i].verts, vj = lots[j].verts; let adj = false
    for (let a = 0; a < vi.length && !adj; a++) { const p1 = vi[a], p2 = vi[(a + 1) % vi.length]; for (let b = 0; b < vj.length; b++) { if (segOverlap(p1, p2, vj[b], vj[(b + 1) % vj.length]) > 0.8) { adj = true; break } } }
    if (adj) par[find(i)] = find(j)
  }
  const cents = lots.map(l => centroid(l.verts))
  const qtxt = texts.filter(t => /QUADRA|^Q\s*\d/i.test(t.text))
  const votes = {} // raiz do cluster -> { num: contagem }
  qtxt.forEach(t => {
    let bi = 0, bd = 1e18; for (let i = 0; i < n; i++) { const d = (cents[i][0] - t.x) ** 2 + (cents[i][1] - t.y) ** 2; if (d < bd) { bd = d; bi = i } }
    let label = t.text.replace(/^(QUADRA|QUARTEIR[ÃA]O)\s*/i, '').replace(/^Q\.?\s*/i, '').trim()  // "QUADRA A"->"A", "QUADRA I2"->"I2"
    if (/^\d+$/.test(label)) label = String(parseInt(label))
    if (label) { const r = find(bi); (votes[r] = votes[r] || {})[label] = (votes[r][label] || 0) + 1 }
  })
  // ordena clusters por posição (cima→baixo, esq→dir) p/ numerar os sem texto
  const roots = [...new Set(lots.map((_, i) => find(i)))]
  const cxy = r => { const idx = lots.map((_, i) => i).filter(i => find(i) === r); return [idx.reduce((s, i) => s + cents[i][0], 0) / idx.length, idx.reduce((s, i) => s + cents[i][1], 0) / idx.length] }
  roots.sort((A, B) => { const a = cxy(A), b = cxy(B); return b[1] - a[1] || a[0] - b[0] })
  const usados = new Set(Object.values(votes).map(v => Object.keys(v).sort((a, b) => v[b] - v[a])[0]))
  let auto = 0; const nextAuto = () => { do { auto++ } while (usados.has(String(auto))); return String(auto) }
  const numByRoot = {}
  roots.forEach(r => { const v = votes[r]; numByRoot[r] = v ? Object.keys(v).sort((a, b) => v[b] - v[a])[0] : nextAuto() })
  lots.forEach((l, i) => { l.quadra = numByRoot[find(i)] })
}

export function buildLoteamento(model, sources, { lotLayer = 'LOTE', resolutions = {}, numeracao = 'dxf' } = {}) {
  const texts = sources.texts
  const numTexts = texts.filter(t => /^\d{1,4}$/.test(t.text))
  const ruaObjs = texts.map(t => { const n = normVia(t.text); return n ? { name: n, x: t.x, y: t.y } : null }).filter(Boolean)
  const labels = texts.filter(t => /^LOTE\s*\d+/i.test(t.text))
  const streets = [...new Set(ruaObjs.map(r => r.name))].sort()
  // textos livres da planta = candidatos a confrontação de limite (nomes de vizinhos, notas de divisa…);
  // exclui marcos, LOTE/QUADRA, cotas/áreas/azimutes e as vias (já ofertadas à parte)
  const textosLivres = [...new Set(texts.map(t => t.text.replace(/\s+/g, ' ').trim())
    .filter(s => s && s.length >= 3 && !/^\d/.test(s) && !/^LOTE\s*\d/i.test(s) && !/QUADRA|^Q\s*\d/i.test(s) && !/^(ÁREA|AREA)\b/i.test(s) && !/m²|°|^A=/i.test(s) && !normVia(s)))].sort()

  const polys = sources.polys.filter(p => lotLayer === '__all__' || p.layer === lotLayer)
  // parear rótulo "LOTE nn" a cada polígono: 1º o que está DENTRO (reuso permitido — contêiner é removido depois);
  // 2º p/ polígono sem rótulo dentro, o rótulo SOLTO (fora de todo polígono) mais próximo, dentro do tamanho do lote.
  const pares = polys.map(p => ({ p, lbl: labels.find(t => pip([t.x, t.y], p.verts)) || null }))
  const soltos = labels.filter(t => !polys.some(p => pip([t.x, t.y], p.verts)))
  const usedSolto = new Set()
  for (const par of pares) {
    if (par.lbl) continue
    const C = centroid(par.p.verts); let ext = 0
    for (const v of par.p.verts) ext = Math.max(ext, Math.hypot(v[0] - C[0], v[1] - C[1]))
    let best = null, bd = ext * 1.2
    for (const t of soltos) { if (usedSolto.has(t)) continue; const d = Math.hypot(t.x - C[0], t.y - C[1]); if (d < bd) { bd = d; best = t } }
    if (best) { usedSolto.add(best); par.lbl = best }
  }
  const cand = []
  for (const { p, lbl } of pares) {
    if (!lbl) continue
    const num = (lbl.text.match(/\d+/) || ['?'])[0]
    const qm = (p.src && p.src.match(/(?:q(?:ua|au)dra|\.Q)\s*0?(\d+)/i) || [])[1] || '?'
    let vs = p.verts, bg = p.bulges || []
    if (signedArea(vs) > 0) { const r = reversePoly(vs, bg); vs = r.v; bg = r.b }
    cand.push({ num, quadra: qm, layer: p.layer, verts: vs, bulges: bg, src: p.src })
  }
  // descarta o que NÃO é lote de verdade, senão rouba a frente / infla a área dos lotes reais:
  //  • CONTÊINER: polígono que engloba o centro de um lote BEM MENOR (razão de área > 1,8) =
  //    contorno de quadra ou gleba com um "LOTE nn" solto dentro;
  //  • DUPLICATA: mesma revisão desenhada 2× (mesmo centro e mesma área) — conta uma vez só.
  const cCent = cand.map(l => centroid(l.verts))
  const cArea = cand.map(l => areaWithArcs(l.verts, l.bulges || []))
  const lots = []
  const kept = []
  cand.forEach((l, i) => {
    if (cand.some((o, j) => j !== i && pip(cCent[j], l.verts) && cArea[i] > cArea[j] * 1.8)) return
    if (kept.some(k => Math.hypot(k.c[0] - cCent[i][0], k.c[1] - cCent[i][1]) < 1 && Math.abs(k.a - cArea[i]) < Math.max(1, cArea[i] * 0.2))) return
    kept.push({ c: cCent[i], a: cArea[i] }); lots.push(l)
  })
  lots.sort((a, b) => { const qa = parseInt(a.quadra) || 999, qb = parseInt(b.quadra) || 999; if (qa !== qb) return qa - qb; return (parseInt(a.num) || 0) - (parseInt(b.num) || 0) })

  // áreas públicas (polígonos "ÁREA ..." que NÃO englobam lotes — exclui gleba/quadra)
  const centLots = lots.map(l => centroid(l.verts))
  const areaObjs = sources.polys.map(p => {
    const lbl = texts.find(t => pip([t.x, t.y], p.verts) && /(ÁREA|AREA)\s/i.test(t.text)); if (!lbl) return null
    if (centLots.some(c => pip(c, p.verts))) return null
    return { name: lbl.text.replace(/\s+/g, ' ').trim(), verts: p.verts, bulges: p.bulges || [] }
  }).filter(Boolean)

  // polígonos NOMEADOS p/ o memorial de condomínio: quarteirões (camada QUADRA) e ruas (camada RUAS).
  // deduplica por nome (contorno + hachura da mesma via/quadra) mantendo o de maior área.
  const dedupNome = arr => { const mp = new Map(); for (const o of arr) { const a = areaWithArcs(o.verts, o.bulges || []); const e = mp.get(o.nome); if (!e || a > e.a) mp.set(o.nome, { o, a }) } return [...mp.values()].map(x => x.o) }
  let quadraPolis = []   // quarteirões nomeados — construídos ADIANTE, após a detecção de quadras (precisa de lot.quadra)
  const ruaPolis = dedupNome(sources.polys.filter(p => /rua|vi[áa]rio/i.test(p.layer)).map(p => {
    const C = centroid(p.verts)
    let t = texts.find(x => normVia(x.text) && pip([x.x, x.y], p.verts))
    if (!t) { let bd = 1e18; for (const x of texts) { if (!normVia(x.text)) continue; const dd = Math.hypot(x.x - C[0], x.y - C[1]); if (dd < bd) { bd = dd; t = x } } }
    return t ? { nome: normVia(t.text), verts: p.verts, bulges: p.bulges || [] } : null
  }).filter(Boolean))

  const allSides = []
  lots.forEach(lot => { const vs = lot.verts; for (let i = 0; i < vs.length; i++) allSides.push({ lot, area: null, a: vs[i], b: vs[(i + 1) % vs.length] }) })
  areaObjs.forEach(ar => { for (let i = 0; i < ar.verts.length; i++) allSides.push({ lot: null, area: ar, a: ar.verts[i], b: ar.verts[(i + 1) % ar.verts.length] }) })

  // perímetro da gleba: lados de lote que coincidem com a borda do loteamento confrontam vizinho externo
  const centG = lots.map(l => centroid(l.verts))
  let glebaP = null
  sources.polys.forEach(p => { let d = 0; for (const c of centG) if (pip(c, p.verts)) d++; if (d > centG.length * 0.5) { const a = areaWithArcs(p.verts, p.bulges || []); if (!glebaP || a < glebaP.area) glebaP = { verts: p.verts, area: a } } })
  const glebaEdges = glebaP ? glebaP.verts.map((v, i) => [v, glebaP.verts[(i + 1) % glebaP.verts.length]]) : []
  // marca cada via como interna (rótulo dentro da gleba = via do loteamento) ou externa (pré-existente)
  if (glebaP) ruaObjs.forEach(r => { r.inside = pip([r.x, r.y], glebaP.verts) })

  // vizinhos com matrícula: textos da planta que descrevem um confrontante já matriculado (ex.: "Loteamento X - Mat. 52.037")
  // no LIMITE do loteamento, quando há um desses à frente do lado, copiamos o texto como confrontação (nunca a rua).
  const vizObjs = texts
    .filter(t => /matr[íi]cul|\bmat\.?\s*n?[ºo.]?\s*\d|\bmatr?[íi]?c?\.?\s*\d{2}/i.test(t.text))
    .map(t => ({ name: t.text.replace(/\s+/g, ' ').trim(), x: t.x, y: t.y }))

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
        const onEdge = glebaEdges.some(e => segOverlap(vs[i], vs[j], e[0], e[1]) > 0.8)
        const viz = vizObjs.length ? frenteTexto(vs[i], vs[j], C, vizObjs, 160) : null
        const r = guessStreet(vs[i], vs[j], C, ruaObjs)
        // 1) limite com vizinho já matriculado: copia o texto da planta (nunca vira "rua") — regra do loteamento.
        // 2) senão, rua à frente. 3) senão, LIMITE do loteamento (operador define o vizinho externo).
        // vale tanto p/ borda confirmada (coincide com a gleba) quanto p/ borda sem gleba desenhada (ex.: Guaíba).
        if (viz && (onEdge || !r)) { kind = 'perimetro'; conf = viz; val = viz; auto = true }
        else if (r) { kind = 'rua'; val = r; conf = r; auto = true }
        else { kind = 'perimetro'; conf = '(limite do loteamento)'; auto = onEdge }
      }
      lot.sides.push({ idx: i, sk, from: lot.pts[i], to: lot.pts[j], az: azimuth(vs[i], vs[j]), dist: dist(vs[i], vs[j]), bulge: bl, arc: ai, conf, kind, val, auto })
    }
    // o memorial começa pela FRENTE (lado voltado à rua/via); em esquina, a MENOR frente.
    // frente = menor lado que NÃO confronta outro lote/área (é o lado aberto p/ via);
    // rua interna confirmada tem prioridade sobre limite do loteamento / "a definir".
    const lenOf = s => (s.arc && s.arc.arc) ? s.arc.desenv : s.dist
    const ruaSides = lot.sides.filter(s => s.kind === 'rua')
    const extSides = lot.sides.filter(s => s.kind === 'perimetro' || s.kind === 'wd')
    const frentes = ruaSides.length ? ruaSides : extSides
    let front = null
    for (const s of frentes) if (!front || lenOf(s) < lenOf(front)) front = s
    if (front) { const fi = lot.sides.indexOf(front); if (fi > 0) lot.sides = lot.sides.slice(fi).concat(lot.sides.slice(0, fi)) }
    lot.frente = front ? front.conf : null
    lot.area = areaWithArcs(vs, bg)
    lot.perim = lot.sides.reduce((a, s) => a + (s.arc.arc ? s.arc.desenv : s.dist), 0)
    lot.pend = lot.sides.filter(s => s.kind === 'wd' || s.kind === 'perimetro').length
    const iss = []
    if (lot.num === '?') iss.push('sem número de lote')
    if (lot.pts.some(p => /^P\d/.test(p))) iss.push('vértice sem marco numerado')
    if (lot.sides.some(s => s.dist < 0.30)) iss.push('lado muito curto (< 0,30 m)')
    if (lot.sides.some(s => s.arc.arc)) iss.push('tem lado curvo (arco)')
    for (let i = 0; i < n; i++) if (dist(vs[i], vs[(i + 1) % n]) < 0.02) { iss.push('vértice duplicado'); break }
    if (lot.area < 1) iss.push('área quase zero')
    lot.issues = iss; lot.warn = lot.pend > 0 || iss.length > 0
  })
  // quadra quando o bloco não trouxe o nome (maioria '?'): 1º por POLÍGONO+texto "QUADRA X" (Cruz Alta),
  // 2º por VIZINHANÇA (Guaíba). Reordena por quadra (natural: A<B<I1<I2 ou 1<2<10) e depois número.
  let quadraObjs = null
  if (lots.filter(l => l.quadra === '?').length > lots.length * 0.5) {
    quadraObjs = detectQuadrasPoly(lots, sources, texts)
    if (!quadraObjs) detectQuadras(lots, texts)
    lots.sort((a, b) => String(a.quadra).localeCompare(String(b.quadra), 'pt', { numeric: true }) || (parseInt(a.num) || 0) - (parseInt(b.num) || 0))
  }

  const byQ = {}; lots.forEach(l => { (byQ[l.quadra] = byQ[l.quadra] || []).push(l) })

  // quarteirões p/ o memorial de condomínio: o contorno de cada quadra é a UNIÃO dos seus lotes (não o
  // polígono "QUADRA" desenhado, que é impreciso). Assim TODAS as quadras entram, com a área privativa correta.
  quadraPolis = Object.keys(byQ).filter(q => q && q !== '?').sort((a, b) => String(a).localeCompare(String(b), 'pt', { numeric: true }))
    .map(q => { const o = quadraOutline(byQ[q]); return o ? { nome: 'Quadra ' + q, verts: o.verts, bulges: o.bulges } : null })
    .filter(Boolean)

  Object.values(byQ).forEach(arr => { const a = arr.map(l => l.area).sort((x, y) => x - y); const med = a[Math.floor(a.length / 2)] || 0; arr.forEach(l => { if (med > 0 && (l.area < med * 0.4 || l.area > med * 2.5)) { l.issues.push('área destoa da quadra'); l.warn = true } }) })

  // fração ideal (condomínio): proporção da área da unidade sobre o total das unidades (= área total/gleba).
  // área comum do lote = fração × (gleba − Σ privativas); área total = privativa + comum. (deduzido do Cruz Alta)
  const somaPriv = lots.reduce((a, l) => a + l.area, 0) || 1
  const comumTotal = glebaP ? Math.max(0, glebaP.area - somaPriv) : 0
  lots.forEach(l => { l.fracaoIdeal = l.area / somaPriv; l.areaComum = comumTotal * l.fracaoIdeal; l.areaTotal = l.area + l.areaComum })

  // NUMERAÇÃO DE MARCOS: 'gerar' = contínua 1..N, percorrendo lote a lote no sentido horário a partir da
  // frente (ordem de lot.sides), reaproveitando cantos compartilhados; depois sobras de gleba/áreas.
  let marcosMap = null, marcos = null
  if (numeracao === 'gerar') {
    marcosMap = new Map(); marcos = []; let nn = 0
    const assign = v => { const k = marcoKey(v); if (!marcosMap.has(k)) { marcosMap.set(k, ++nn); marcos.push({ n: nn, x: v[0], y: v[1], uso: 0 }) } return marcosMap.get(k) }
    // SÓ cantos de LOTE (não cria ponto onde não há lote). Cantos compartilhados já entram uma vez.
    for (const lot of lots) for (const s of lot.sides) assign(lot.verts[s.idx])
    // aplica aos lotes (pts e from/to de cada lado) e conta uso
    for (const lot of lots) {
      lot.pts = lot.verts.map(v => String(marcosMap.get(marcoKey(v))))
      lot.sides.forEach(s => { s.from = lot.pts[s.idx]; s.to = lot.pts[(s.idx + 1) % lot.verts.length] })
      new Set(lot.verts.map(v => marcosMap.get(marcoKey(v)))).forEach(n => { const m = marcos[n - 1]; if (m) m.uso++ })
    }
  }

  return { model, sources, lots, areaObjs, ruaObjs, vizObjs, streets, textosLivres, quadraObjs, quadraPolis, ruaPolis, glebaEdges, allSides, numTexts, lotLayer, numeracao, marcosMap, marcos }
}

export function lotMemorial(lot, { loteamento = '—', municipio = '—', modelo = modeloAlegrete() } = {}) {
  const d = modelo.desc, comMarco = modelo.marcos.exige !== false, cond = modelo.tipo === 'condominio'
  const unidade = modelo.termoUnidade || 'Lote'
  const fracao = lot.fracaoIdeal != null ? (cond ? nb(lot.fracaoIdeal, 4) : nb(lot.fracaoIdeal * 100, 4) + '%') : '—'
  const areaComum = lot.areaComum || 0, areaTotal = lot.areaTotal || lot.area
  let s = render(d.cabecalho, {
    unidade, num: lot.num, loteamento, municipio, quadra: String(lot.quadra).padStart(2, '0'), sentido: d.sentido,
    priv: nb(lot.area, 2), privExt: areaExtenso(lot.area), comum: nb(areaComum, 2), comumExt: areaExtenso(areaComum),
    total: nb(areaTotal, 2), totalExt: areaExtenso(areaTotal), fracao,
  })
  s += comMarco ? render(d.partida, { p0: lot.sides[0].from }) : d.partidaSemMarco
  const n = lot.sides.length
  lot.sides.forEach((sd, k) => {
    const ate = comMarco ? render(d.ate, { to: sd.to }) : d.ateSemMarco
    s += d.conector + confClause(modelo, sd) + medida(modelo, sd) + ate
    s += (k === n - 1) ? d.encerra : d.sep
  })
  s += d.fechamento ? (d.sep + render(d.fechamento, { area: nb(lot.area, 2), extenso: areaExtenso(lot.area), fracao })) : '.'
  if (cond && d.esquina) { const ruas = lot.sides.filter(x => x.kind === 'rua').map(x => x.conf); if (ruas.length >= 2) s += render(d.esquina, { r1: ruas[0], r2: ruas[1] }) }
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
  const pts = vs.map((v, i) => marcoLabel(state, v, i))
  const sides = []
  for (let i = 0; i < vs.length; i++) { const j = (i + 1) % vs.length; sides.push({ i, from: pts[i], to: pts[j], az: azimuth(vs[i], vs[j]), dist: dist(vs[i], vs[j]), arc: arcInfo(vs[i], vs[j], bg[i] || 0) }) }
  return { verts: vs, pts, sides, area: areaWithArcs(vs, bg) }
}
export function glebaMemorial(gleba, conf, { loteamento = '—', municipio = '—', modelo = modeloAlegrete() } = {}) {
  const d = modelo.desc
  let s = render(d.glebaCabecalho, { area: nb(gleba.area, 2), extenso: areaExtenso(gleba.area), municipio, loteamento, sentido: d.sentido, p0: gleba.sides[0].from })
  gleba.sides.forEach((sd, k) => {
    const c = render(d.glebaConf, { c: conf[sd.i] || '[confrontante a definir]' })
    s += d.conector + c + medida(modelo, sd) + render(d.glebaAte, { to: sd.to })
    s += (k === gleba.sides.length - 1) ? d.glebaEncerra : d.sep
  })
  return s
}
// memorial de uma área pública (verde/institucional) — confrontações automáticas (lotes/áreas/ruas ao redor)
export function areaMemorial(ar, state, { loteamento = '—', municipio = '—', modelo = modeloAlegrete() } = {}) {
  const d = modelo.desc
  let vs = ar.verts.slice(), bg = (ar.bulges || []).slice()
  if (signedArea(vs) > 0) { const r = reversePoly(vs, bg); vs = r.v; bg = r.b }
  const pts = vs.map((v, i) => marcoLabel(state, v, i))
  const C = centroid(vs), area = areaWithArcs(vs, bg), nome = titleArea(ar.name)
  let s = render(d.areaCabecalho, { nome, area: nb(area, 2), extenso: areaExtenso(area), loteamento, municipio, sentido: d.sentido, p0: pts[0] })
  for (let i = 0; i < vs.length; i++) {
    const j = (i + 1) % vs.length, o = confront(vs[i], vs[j], ar, state.allSides), bl = bg[i] || 0, ai = arcInfo(vs[i], vs[j], bl)
    let cf
    if (o && o.lot) cf = render(d.conf.lote, { c: 'Lote ' + o.lot.num + (o.lot.quadra !== '?' ? (' (Quadra ' + String(o.lot.quadra).padStart(2, '0') + ')') : '') })
    else if (o && o.area) cf = render(d.conf.area, { c: titleArea(o.area.name) })
    else { const r = guessStreet(vs[i], vs[j], C, state.ruaObjs); cf = r ? render(d.conf.rua, { c: r }) : render(d.conf.perimetro, { c: '[a definir]' }) }
    const sd = { az: azimuth(vs[i], vs[j]), dist: dist(vs[i], vs[j]), arc: ai }
    s += d.conector + cf + medida(modelo, sd) + render(d.glebaAte, { to: pts[j] })
    s += (j === 0) ? d.areaEncerra : d.sep
  }
  return { nome, area, text: s }
}

// descreve o perímetro de um polígono (quarteirão/rua/área comum) confrontando com os polígonos NOMEADOS
// ao redor (quadras, ruas, áreas) por aresta compartilhada; senão rua por geometria; senão limite externo.
function perimetroMemorial(vs0, bg0, state, modelo, intro, area, selfNome) {
  const d = modelo.desc
  let vs = vs0.slice(), bg = (bg0 || []).slice()
  if (signedArea(vs) > 0) { const r = reversePoly(vs, bg); vs = r.v; bg = r.b }
  const C = centroid(vs)
  const conj = [...(state.quadraPolis || []), ...(state.ruaPolis || []), ...(state.areaObjs || []).map(a => ({ nome: titleArea(a.name), verts: a.verts }))]
    .filter(o => o.verts !== vs0 && o.nome !== selfNome)
  const nomeDe = (a, b) => { for (const o of conj) { const V = o.verts; for (let i = 0; i < V.length; i++) if (segOverlap(a, b, V[i], V[(i + 1) % V.length]) > 0.8) return o.nome } return null }
  const viz = state.vizObjs || [], gE = state.glebaEdges || []
  // 1) simplifica a geometria: cada face (trecho entre CANTOS) vira UMA curva/reta ("pontos principais", como no
  //    memorial dela). 2) UM confrontante por segmento: aresta na BORDA DA GLEBA = limite externo (vizinho
  //    matriculado, nunca rua interna); interna = quadra/rua vizinha nomeada, senão rua por geometria.
  const segs = simplificaPerimetro(vs, bg)
  const confDe = (a, b) => {
    const externa = gE.some(e => segOverlap(a, b, e[0], e[1]) > 0.8)
    if (externa) return (viz.length ? frenteTexto(a, b, C, viz, 220) : null) || nomeDe(a, b) || '[a definir]'
    return nomeDe(a, b) || guessStreet(a, b, C, state.ruaObjs) || (viz.length ? frenteTexto(a, b, C, viz, 160) : null) || '[a definir]'
  }
  segs.forEach(g => { g.conf = confDe(vs[g.from], vs[g.to]) })
  const distintos = [...new Set(segs.map(g => g.conf).filter(c => c !== '[a definir]'))]
  let s = intro + (distintos.length ? ', circunscrito por ' + distintos.join(', ') : '') + ', com as seguintes dimensões e confrontações em sentido ' + d.sentido + ': ' + render(d.partida, { p0: marcoLabel(state, vs[segs[0].from], segs[0].from) })
  for (let k = 0; k < segs.length; k++) {
    const g = segs[k], a = vs[g.from], b = vs[g.to], ai = arcInfo(a, b, g.bulge)
    const sd = { az: azimuth(a, b), dist: dist(a, b), arc: ai }
    // via → "no alinhamento com a {rua}"; demais (quadra/área/vizinho externo) → "confrontando com {x}"
    const cl = normVia(g.conf) ? render(d.conf.rua, { c: g.conf }) : render(d.conf.perimetro, { c: g.conf })
    s += d.conector + cl + medida(modelo, sd, true) + render(d.ate, { to: marcoLabel(state, b, g.to) })
    s += (k === segs.length - 1) ? d.encerra + '.' : d.sep
  }
  return { area, text: s }
}

// seções extras do condomínio: quarteirões, ruas e áreas de uso comum (cada uma um memorial de perímetro)
export function condominioSecoes(state, { modelo = modeloAlegrete() } = {}) {
  const A = (v, b) => areaWithArcs(v, b || [])
  const quarteiroes = (state.quadraPolis || []).map(q => ({ nome: q.nome, ...perimetroMemorial(q.verts, q.bulges, state, modelo, q.nome + ': quarteirão com área privativa de ' + nb(A(q.verts, q.bulges), 2) + ' m² (' + areaExtenso(A(q.verts, q.bulges)) + ')', A(q.verts, q.bulges), q.nome) }))
  const ruas = (state.ruaPolis || []).map(r => ({ nome: r.nome, ...perimetroMemorial(r.verts, r.bulges, state, modelo, r.nome + ': área destinada ao sistema viário, com área total de ' + nb(A(r.verts, r.bulges), 2) + ' m² (' + areaExtenso(A(r.verts, r.bulges)) + ')', A(r.verts, r.bulges), r.nome) }))
  const areas = (state.areaObjs || []).map(a => ({ nome: titleArea(a.name), ...perimetroMemorial(a.verts, a.bulges, state, modelo, titleArea(a.name) + ': área de uso comum com área total de ' + nb(A(a.verts, a.bulges), 2) + ' m² (' + areaExtenso(A(a.verts, a.bulges)) + ')', A(a.verts, a.bulges), titleArea(a.name)) }))
  return { quarteiroes, ruas, areas }
}
