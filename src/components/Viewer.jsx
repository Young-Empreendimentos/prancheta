import { useRef, useEffect, useCallback } from 'react'
import { drawModel, computeBBox, fitView } from '../engine/draw.js'

function bboxOf(verts) {
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity
  for (const p of verts) { if (p[0] < mnx) mnx = p[0]; if (p[1] < mny) mny = p[1]; if (p[0] > mxx) mxx = p[0]; if (p[1] > mxy) mxy = p[1] }
  const pad = Math.max(mxx - mnx, mxy - mny) * 0.6 || 5
  return { mnx: mnx - pad, mny: mny - pad, mxx: mxx + pad, mxy: mxy + pad }
}

export default function Viewer({ model, lot, marcos = null }) {
  const canvasRef = useRef(null)
  const view = useRef(null)
  const drag = useRef(null)

  const redraw = useCallback(() => {
    const cv = canvasRef.current; if (!cv || !model || !view.current) return
    drawModel(cv.getContext('2d'), cv.width, cv.height, model, view.current, { sel: lot?.verts, pts: lot?.pts, marcos })
  }, [model, lot, marcos])

  // ajusta tamanho e enquadra (no lote, se houver; senão no loteamento)
  useEffect(() => {
    const cv = canvasRef.current; if (!cv || !model) return
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const r = cv.getBoundingClientRect()
    cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr))
    const bbox = lot ? bboxOf(lot.verts) : computeBBox(model)
    view.current = fitView(bbox, cv.width, cv.height)
    redraw()
    const ro = new ResizeObserver(() => {
      const r2 = cv.getBoundingClientRect()
      cv.width = Math.max(1, Math.round(r2.width * dpr)); cv.height = Math.max(1, Math.round(r2.height * dpr))
      redraw()
    })
    ro.observe(cv)
    return () => ro.disconnect()
  }, [model, lot, redraw])

  const onDown = e => { drag.current = { x: e.clientX, y: e.clientY }; }
  const onMove = e => {
    if (!drag.current || !view.current) return
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    view.current.tx += (e.clientX - drag.current.x) * dpr
    view.current.ty += (e.clientY - drag.current.y) * dpr
    drag.current = { x: e.clientX, y: e.clientY }; redraw()
  }
  const onUp = () => { drag.current = null }
  const onWheel = e => {
    e.preventDefault(); if (!view.current) return
    const cv = canvasRef.current, rect = cv.getBoundingClientRect(), dpr = Math.max(1, window.devicePixelRatio || 1)
    const px = (e.clientX - rect.left) * dpr, py = (e.clientY - rect.top) * dpr, f = e.deltaY < 0 ? 1.12 : 0.893
    const wx = (px - view.current.tx) / view.current.scale, wy = (view.current.ty - py) / view.current.scale
    view.current.scale *= f; view.current.tx = px - wx * view.current.scale; view.current.ty = py + wy * view.current.scale; redraw()
  }

  return (
    <div className="viewer">
      <canvas ref={canvasRef} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onWheel={onWheel} />
      <div className="viewer-hint">arraste para mover · scroll para zoom</div>
    </div>
  )
}
