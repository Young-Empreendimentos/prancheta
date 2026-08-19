// Renderização do desenho (canvas 2D) — portado do protótipo. Desenha o loteamento e destaca o lote.
import { aci } from './dxf.js'
import { arcPolyPoints } from './geometry.js'

function insertTf(e, parent, blocks) {
  const c = Math.cos((e.rot || 0) * Math.PI / 180), s = Math.sin((e.rot || 0) * Math.PI / 180)
  const b = blocks[e.name], bx = b ? b.base[0] : 0, by = b ? b.base[1] : 0
  return (x, y) => { const lx = (x - bx) * e.sx, ly = (y - by) * e.sy; return parent(lx * c - ly * s + e.x, lx * s + ly * c + e.y) }
}
export function computeBBox(model) {
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity, has = false
  const ext = (x, y) => { if (!isFinite(x) || !isFinite(y)) return; has = true; if (x < mnx) mnx = x; if (y < mny) mny = y; if (x > mxx) mxx = x; if (y > mxy) mxy = y }
  const walk = (e, tf) => {
    switch (e.type) {
      case 'line': ext(...tf(e.x1, e.y1)); ext(...tf(e.x2, e.y2)); break
      case 'lwpolyline': e.verts.forEach(p => ext(...tf(p[0], p[1]))); break
      case 'circle': case 'arc': ext(...tf(e.cx - e.r, e.cy - e.r)); ext(...tf(e.cx + e.r, e.cy + e.r)); break
      case 'text': case 'point': ext(...tf(e.x, e.y)); break
      case 'insert': { const b = model.blocks[e.name]; if (b) { const t2 = insertTf(e, tf, model.blocks); b.entities.forEach(be => walk(be, t2)) } break }
    }
  }
  const id = (x, y) => [x, y]
  model.entities.forEach(e => walk(e, id))
  return has ? { mnx, mny, mxx, mxy } : null
}
function color(e, model) {
  let ci = e.color
  if (ci == null || ci === 256 || ci === 0) { const l = model.layers[e.layer]; ci = l ? l.color : 7 }
  if (ci === 256 || ci === 0) ci = 7
  return aci(ci)
}
function drawEnt(ctx, e, tf, depth, sx, sy, view, model) {
  const col = color(e, model)
  switch (e.type) {
    case 'line': { const [x1, y1] = tf(e.x1, e.y1), [x2, y2] = tf(e.x2, e.y2); ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(sx(x1), sy(y1)); ctx.lineTo(sx(x2), sy(y2)); ctx.stroke(); break }
    case 'lwpolyline': {
      const V = e.verts; if (!V.length) break; const bg = e.bulges || []; ctx.strokeStyle = col; ctx.beginPath()
      const P = V.map(p => tf(p[0], p[1])); ctx.moveTo(sx(P[0][0]), sy(P[0][1])); const last = e.closed ? V.length : V.length - 1
      for (let i = 0; i < last; i++) { const a = P[i], b = P[(i + 1) % V.length], bl = bg[i] || 0; if (Math.abs(bl) > 1e-9) { for (const q of arcPolyPoints(a, b, bl)) ctx.lineTo(sx(q[0]), sy(q[1])) } else ctx.lineTo(sx(b[0]), sy(b[1])) }
      if (e.closed) ctx.closePath(); ctx.stroke(); break
    }
    case 'circle': { const [cx, cy] = tf(e.cx, e.cy); ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(sx(cx), sy(cy), Math.max(0, e.r * view.scale), 0, 2 * Math.PI); ctx.stroke(); break }
    case 'arc': { const [cx, cy] = tf(e.cx, e.cy); ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(sx(cx), sy(cy), Math.max(0, e.r * view.scale), -e.a1 * Math.PI / 180, -e.a2 * Math.PI / 180, true); ctx.stroke(); break }
    case 'text': { if (!e.text) break; const px = e.h * view.scale; if (px < 5) break; const [x, y] = tf(e.x, e.y); ctx.save(); ctx.translate(sx(x), sy(y)); if (e.rot) ctx.rotate(-e.rot * Math.PI / 180); ctx.fillStyle = col; ctx.font = px + 'px ui-monospace,Consolas,monospace'; ctx.textBaseline = 'alphabetic'; ctx.fillText(e.text, 0, 0); ctx.restore(); break }
    case 'insert': { if (depth > 4) break; const b = model.blocks[e.name]; if (!b) break; const t2 = insertTf(e, tf, model.blocks); for (const be of b.entities) drawEnt(ctx, be, t2, depth + 1, sx, sy, view, model); break }
  }
}
export function drawModel(ctx, w, h, model, view, { sel = null, pts = null, marcos = null } = {}) {
  const sx = x => x * view.scale + view.tx, sy = y => -y * view.scale + view.ty
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#0b0d11'; ctx.fillRect(0, 0, w, h)
  if (!model.entities.length) return
  ctx.lineWidth = 1; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  const id = (x, y) => [x, y]
  for (const e of model.entities) drawEnt(ctx, e, id, 0, sx, sy, view, model)
  if (marcos) {
    const showN = view.scale > 1.2
    ctx.font = '10px ui-monospace,Consolas,monospace'; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left'
    for (const m of marcos) {
      const X = sx(m.x), Y = sy(m.y)
      if (X < -30 || X > w + 30 || Y < -30 || Y > h + 30) continue
      ctx.fillStyle = '#4f9dff'; ctx.beginPath(); ctx.arc(X, Y, 2.4, 0, 2 * Math.PI); ctx.fill()
      if (showN) { ctx.fillStyle = '#dbeafe'; ctx.fillText(String(m.n), X + 3.5, Y - 2.5) }
    }
  }
  if (sel) {
    ctx.beginPath(); sel.forEach((p, i) => { const X = sx(p[0]), Y = sy(p[1]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y) }); ctx.closePath()
    ctx.fillStyle = 'rgba(255,176,32,.18)'; ctx.fill(); ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 2.4; ctx.stroke()
    ctx.font = '11px ui-monospace,Consolas,monospace'; ctx.textBaseline = 'middle'
    sel.forEach((p, i) => { const X = sx(p[0]), Y = sy(p[1]); ctx.fillStyle = '#ffb020'; ctx.fillRect(X - 3, Y - 3, 6, 6); if (pts) { ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(pts[i], X + 6, Y - 7) } })
  }
}
export function fitView(bbox, w, h) {
  const m = Math.min(30, w * 0.1, h * 0.1)
  if (!bbox) return { scale: 1, tx: w / 2, ty: h / 2 }
  const bw = Math.max(1e-6, bbox.mxx - bbox.mnx), bh = Math.max(1e-6, bbox.mxy - bbox.mny)
  const scale = Math.max(1e-9, Math.min((w - 2 * m) / bw, (h - 2 * m) / bh)), cx = (bbox.mnx + bbox.mxx) / 2, cy = (bbox.mny + bbox.mxy) / 2
  return { scale, tx: w / 2 - cx * scale, ty: h / 2 + cy * scale }
}
