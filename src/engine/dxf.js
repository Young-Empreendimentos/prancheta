// Parser DXF (ASCII) + cores ACI + decodificação de encoding (ANSI/UTF-8) — validado no protótipo.

const ACI = { 1: '#ff2b2b', 2: '#ffff2b', 3: '#2bff2b', 4: '#2bffff', 5: '#2b6bff', 6: '#ff2bff', 7: '#e9edf3', 8: '#8a929e', 9: '#c3c9d2' }
function hsl(h, s, l) {
  s /= 100; l /= 100
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l)
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const g = x => Math.round(255 * x).toString(16).padStart(2, '0')
  return '#' + g(f(0)) + g(f(8)) + g(f(4))
}
export function aci(i) {
  if (i == null) i = 7; i = Math.abs(i)
  if (ACI[i]) return ACI[i]
  if (i >= 250 && i <= 255) { const g = Math.round(51 + (i - 250) * 40.8); return '#' + [g, g, g].map(x => x.toString(16).padStart(2, '0')).join('') }
  if (i >= 10 && i <= 249) return hsl(((i - 10) / 240) * 360, 72, 62)
  return '#e9edf3'
}

function tokenize(t) {
  const raw = t.split(/\r\n|\r|\n/), p = []; let i = 0
  while (i < raw.length - 1) {
    const cs = raw[i].trim()
    if (cs === '') { i++; continue }
    const c = parseInt(cs, 10)
    if (Number.isNaN(c)) { i++; continue }
    p.push([c, raw[i + 1]]); i += 2
  }
  return p
}
const gs = (g, c) => { for (const p of g) if (p[0] === c) return p[1] }
const gn = (g, c) => { for (const p of g) if (p[0] === c) { const v = parseFloat(p[1]); return Number.isNaN(v) ? undefined : v } }
function polyData(g) {
  const v = [], b = []; let cur = -1
  for (const [c, val] of g) {
    if (c === 10) { v.push([parseFloat(val), 0]); b.push(0); cur = v.length - 1 }
    else if (c === 20 && cur >= 0) v[cur][1] = parseFloat(val)
    else if (c === 42 && cur >= 0) b[cur] = parseFloat(val)
  }
  return { v, b }
}
// limpa texto de TEXT/MTEXT do DXF: decodifica acentos (\U+XXXX) ANTES de mexer nos códigos MTEXT,
// e só remove código de formatação que termina em ';' (senão comeria o texto após o \U+).
function cleanM(s) {
  return (s || '')
    .replace(/\\U\+([0-9A-Fa-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\P/g, ' ').replace(/\\~/g, ' ')
    .replace(/\\[A-Za-z][^;\\]*;/g, '')
    .replace(/\\[LlOoKkNnXx]/g, '')
    .replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%[cC]/g, 'Ø').replace(/%%[uUoO]/g, '')
    .replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
}
function interpret(type, g) {
  const layer = gs(g, 8) || '0', color = gn(g, 62)
  switch (type) {
    case 'LINE': return { type: 'line', layer, color, x1: gn(g, 10) || 0, y1: gn(g, 20) || 0, x2: gn(g, 11) || 0, y2: gn(g, 21) || 0 }
    case 'LWPOLYLINE': { const d = polyData(g); return { type: 'lwpolyline', layer, color, closed: ((gn(g, 70) || 0) & 1) === 1, verts: d.v, bulges: d.b } }
    case 'CIRCLE': return { type: 'circle', layer, color, cx: gn(g, 10) || 0, cy: gn(g, 20) || 0, r: gn(g, 40) || 0 }
    case 'ARC': return { type: 'arc', layer, color, cx: gn(g, 10) || 0, cy: gn(g, 20) || 0, r: gn(g, 40) || 0, a1: gn(g, 50) || 0, a2: gn(g, 51) || 0 }
    case 'POINT': return { type: 'point', layer, color, x: gn(g, 10) || 0, y: gn(g, 20) || 0 }
    case 'TEXT': return { type: 'text', layer, color, x: gn(g, 10) || 0, y: gn(g, 20) || 0, h: gn(g, 40) || 1, rot: gn(g, 50) || 0, text: cleanM(gs(g, 1) || '') }
    case 'MTEXT': { let t = ''; for (const p of g) { if (p[0] === 3 || p[0] === 1) t += p[1] } return { type: 'text', layer, color, x: gn(g, 10) || 0, y: gn(g, 20) || 0, h: gn(g, 40) || 1, rot: (gn(g, 50) || 0) * 180 / Math.PI, text: cleanM(t) } }
    case 'INSERT': return { type: 'insert', layer, color, name: gs(g, 2), x: gn(g, 10) || 0, y: gn(g, 20) || 0, sx: gn(g, 41) || 1, sy: gn(g, 42) || 1, rot: gn(g, 50) || 0 }
    default: return null
  }
}
function readOldPoly(pairs, start, hg) {
  const verts = [], bulges = [], layer = gs(hg, 8) || '0', color = gn(hg, 62), closed = ((gn(hg, 70) || 0) & 1) === 1
  let j = start
  while (j < pairs.length) {
    const [code, value] = pairs[j]
    if (code !== 0) { j++; continue }
    const v = (value || '').trim()
    if (v === 'VERTEX') { let k = j + 1; const g = []; while (k < pairs.length && pairs[k][0] !== 0) { g.push(pairs[k]); k++ } verts.push([gn(g, 10) || 0, gn(g, 20) || 0]); bulges.push(gn(g, 42) || 0); j = k }
    else if (v === 'SEQEND') { let k = j + 1; while (k < pairs.length && pairs[k][0] !== 0) k++; j = k; break }
    else break
  }
  return { entity: { type: 'lwpolyline', layer, color, closed, verts, bulges }, next: j }
}
export function parseDXF(text) {
  const pairs = tokenize(text), layers = {}, blocks = {}, entities = []
  let i = 0, section = null, cur = null
  while (i < pairs.length) {
    const [code, value] = pairs[i]
    if (code !== 0) { i++; continue }
    const v = (value || '').trim()
    if (v === 'SECTION') { section = (pairs[i + 1] && pairs[i + 1][0] === 2) ? pairs[i + 1][1].trim() : null; i += 2; continue }
    if (v === 'ENDSEC') { section = null; cur = null; i++; continue }
    if (v === 'EOF') break
    let j = i + 1; const g = []
    while (j < pairs.length && pairs[j][0] !== 0) { g.push(pairs[j]); j++ }
    if (section === 'TABLES') { if (v === 'LAYER') { const nm = gs(g, 2); if (nm != null) layers[nm] = { name: nm, color: Math.abs(gn(g, 62) ?? 7) } } }
    else if (section === 'BLOCKS') {
      if (v === 'BLOCK') { const nm = gs(g, 2) || ('*' + i); cur = { name: nm, base: [gn(g, 10) || 0, gn(g, 20) || 0], entities: [] }; blocks[nm] = cur }
      else if (v === 'ENDBLK') { cur = null }
      else if (v === 'POLYLINE' && cur) { const r = readOldPoly(pairs, j, g); cur.entities.push(r.entity); i = r.next; continue }
      else if (cur) { const e = interpret(v, g); if (e) cur.entities.push(e) }
    }
    else if (section === 'ENTITIES') {
      if (v === 'POLYLINE') { const r = readOldPoly(pairs, j, g); entities.push(r.entity); i = r.next; continue }
      const e = interpret(v, g); if (e) entities.push(e)
    }
    i = j
  }
  return { layers, blocks, entities }
}
// lê ArrayBuffer detectando encoding: DXF R2007+ é UTF-8, anteriores ANSI (windows-1252).
// escolhe comparando os dois: um byte invalido nao derruba o UTF-8 inteiro.
export function decodeDXF(buf) {
  const bytes = new Uint8Array(buf)
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF)
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(3))
  let utf = '', win = ''
  try { utf = new TextDecoder('utf-8', { fatal: false }).decode(bytes) } catch (e) { utf = '' }
  try { win = new TextDecoder('windows-1252').decode(bytes) } catch (e) { win = '' }
  if (!utf) return win || ''
  if (!win) return utf
  let badUtf = 0; for (let i = 0; i < utf.length; i++) if (utf.charCodeAt(i) === 0xFFFD) badUtf++
  let moji = 0; for (let i = 0; i < win.length; i++) { const c = win.charCodeAt(i); if (c === 0xC3 || c === 0xC2) moji++ }
  return moji > badUtf ? utf : win
}
