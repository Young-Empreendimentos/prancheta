// Geometria de agrimensura — validada no protótipo (área com arcos, azimute, reversão de orientação).

export function signedArea(p) {
  let a = 0
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1] }
  return a / 2
}
export function dist(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]) }

export function azimuth(a, b) {
  const dE = b[0] - a[0], dN = b[1] - a[1]
  let az = Math.atan2(dE, dN) * 180 / Math.PI
  return (az % 360 + 360) % 360
}
export function toGMS(d) {
  let g = Math.floor(d), mf = (d - g) * 60, m = Math.floor(mf), s = Math.round((mf - m) * 60)
  if (s >= 60) { s = 0; m++ } if (m >= 60) { m = 0; g++ }
  return g + '°' + String(m).padStart(2, '0') + "'" + String(s).padStart(2, '0') + '"'
}
export function quad(az) { if (az < 90) return 'nordeste'; if (az < 180) return 'sudeste'; if (az < 270) return 'sudoeste'; return 'noroeste' }
// rumo: quadrante (NE/SE/SW/NW) + ângulo agudo medido a partir do N ou do S
export function toRumo(az) {
  let q, a
  if (az <= 90) { q = 'NE'; a = az } else if (az <= 180) { q = 'SE'; a = 180 - az } else if (az <= 270) { q = 'SW'; a = az - 180 } else { q = 'NW'; a = 360 - az }
  return q + ' ' + toGMS(a)
}
export function quadAbbr(az) { if (az < 90) return 'NE'; if (az < 180) return 'SE'; if (az < 270) return 'SO'; return 'NO' }

export function pip(pt, vs) {
  let c = false
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0], yi = vs[i][1], xj = vs[j][0], yj = vs[j][1]
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) c = !c
  }
  return c
}
export function centroid(vs) { let x = 0, y = 0; for (const v of vs) { x += v[0]; y += v[1] } return [x / vs.length, y / vs.length] }

export const keyPt = p => Math.round(p[0] * 1000) + '_' + Math.round(p[1] * 1000)
export const sideKey = (a, b) => { const ka = keyPt(a), kb = keyPt(b); return ka < kb ? ka + '|' + kb : kb + '|' + ka }
export function angClose(a, b) { let d = Math.abs(a - b) % 360; if (d > 180) d = 360 - d; return d < 1.5 }

// arcos (bulge)
export function reversePoly(v, b) {
  const n = v.length, nv = [], nb = []
  for (let j = 0; j < n; j++) { nv.push(v[n - 1 - j]); nb.push(-(b[(n - 2 - j + n) % n] || 0)) }
  return { v: nv, b: nb }
}
export function arcInfo(p1, p2, bulge) {
  const c = dist(p1, p2)
  if (Math.abs(bulge) < 1e-9) return { arc: false, corda: c }
  const th = 4 * Math.atan(bulge), R = Math.abs(c / (2 * Math.sin(th / 2)))
  return { arc: true, corda: c, raio: R, desenv: R * Math.abs(th), ang: Math.abs(th) * 180 / Math.PI, dir: bulge > 0 ? 'esquerda' : 'direita' }
}
export function areaWithArcs(verts, bulges) {
  let v = verts, b = bulges || []
  if (!b.some(x => Math.abs(x) > 1e-12)) return Math.abs(signedArea(v))
  if (signedArea(v) < 0) { const r = reversePoly(v, b); v = r.v; b = r.b }
  let a = signedArea(v)
  for (let i = 0; i < v.length; i++) {
    const bl = b[i] || 0; if (Math.abs(bl) < 1e-12) continue
    const c = dist(v[i], v[(i + 1) % v.length]), th = 4 * Math.atan(bl), R = c / (2 * Math.sin(th / 2))
    a += -(R * R * (th - Math.sin(th))) / 2
  }
  return Math.abs(a)
}
export function arcPolyPoints(p1, p2, bulge) {
  const th = 4 * Math.atan(bulge), c = dist(p1, p2)
  if (c < 1e-9 || Math.abs(bulge) < 1e-9) return [p2]
  const R = Math.abs(c / (2 * Math.sin(th / 2))), mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2, dx = p2[0] - p1[0], dy = p2[1] - p1[1]
  const apo = R * Math.cos(th / 2), cx = mx + (dy / c) * apo, cy = my + (-dx / c) * apo, a1 = Math.atan2(p1[1] - cy, p1[0] - cx)
  const N = Math.max(10, Math.ceil(Math.abs(th) / (Math.PI / 24))), pts = []
  for (let k = 1; k <= N; k++) { const a = a1 - th * (k / N); pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]) }
  return pts
}
