// Exportação do memorial descritivo em Word (.docx), no formato do MODELO da cidade/cartório.
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle,
} from 'docx'
import { lotMemorial, computeQuadroAreas, buildGleba, glebaMemorial, areaMemorial } from '../engine/loteamento.js'
import { nb } from '../engine/extenso.js'
import { modeloAlegrete } from '../models/modelo.js'

const CM = 566.929 // twips por cm

function title(text, fmt) {
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 180 }, children: [new TextRun({ text, bold: true, size: fmt.size + 4, font: fmt.font })] })
}
function quadraHead(text, fmt) {
  return new Paragraph({ spacing: { before: 220, after: 90 }, children: [new TextRun({ text, bold: true, size: fmt.size + 2, font: fmt.font })] })
}
// parágrafo do memorial: rótulo inicial ("Lote NN:", nome da área) em negrito, resto normal, justificado
function memorialPar(text, fmt) {
  const m = text.match(/^([^:]+:)/)
  let head = '', rest = text
  if (m) { head = m[0]; rest = text.slice(head.length) }
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED, spacing: { after: 140 },
    children: [new TextRun({ text: head, bold: true, font: fmt.font, size: fmt.size }), new TextRun({ text: rest, font: fmt.font, size: fmt.size })],
  })
}
function cell(text, fmt, { bold = false, align = AlignmentType.LEFT, w } = {}) {
  return new TableCell({
    width: w ? { size: w, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [new Paragraph({ alignment: align, children: [new TextRun({ text, bold, font: fmt.font, size: fmt.size - 2 })] })],
  })
}
function quadroAreasTable(q, fmt) {
  const g = q.gleba || (q.lotes + q.verde + q.inst)
  const vias = g - q.lotes - q.verde - q.inst
  const pct = x => g > 0 ? (x / g * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '—'
  const border = { style: BorderStyle.SINGLE, size: 4, color: '999999' }
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border }
  const row = (a, b, c, bold = false) => new TableRow({ children: [cell(a, fmt, { bold, w: 55 }), cell(b, fmt, { align: AlignmentType.RIGHT, bold, w: 27 }), cell(c, fmt, { align: AlignmentType.RIGHT, bold, w: 18 })] })
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders,
    rows: [
      new TableRow({ tableHeader: true, children: [cell('Discriminação', fmt, { bold: true }), cell('Área (m²)', fmt, { bold: true, align: AlignmentType.RIGHT }), cell('%', fmt, { bold: true, align: AlignmentType.RIGHT })] }),
      row('Área total da gleba', nb(g, 2), '100%', true),
      row(`Lotes (${q.nLotes} lotes · ${q.quadras} quadras)`, nb(q.lotes, 2), pct(q.lotes)),
      row('Sistema viário', nb(vias, 2), pct(vias)),
      row('Área verde / de lazer', nb(q.verde, 2), pct(q.verde)),
      row('Área institucional', nb(q.inst, 2), pct(q.inst)),
      row('Área pública total', nb(vias + q.verde + q.inst, 2), pct(vias + q.verde + q.inst), true),
    ],
  })
}

export function buildMemoriaisDoc(state, opts) {
  const { loteamento = '—', municipio = '—' } = opts
  const modelo = opts.modelo || modeloAlegrete()
  const sec = modelo.secoes || { lotes: true, gleba: true, publicas: true, quadro: true }
  const fmt = { font: modelo.word.fonte, size: modelo.word.tamanhoPt * 2 }
  const mopts = { ...opts, modelo }
  const children = []
  children.push(title(modelo.word.titulo || 'MEMORIAL DESCRITIVO', fmt))
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: `Loteamento ${loteamento} — ${municipio}`, bold: true, font: fmt.font, size: fmt.size })] }))

  if (sec.quadro) {
    children.push(quadraHead('QUADRO DE ÁREAS', fmt))
    children.push(quadroAreasTable(computeQuadroAreas(state), fmt))
  }
  if (sec.gleba) {
    const gleba = buildGleba(state)
    if (gleba) {
      children.push(quadraHead('MEMORIAL DA GLEBA', fmt))
      children.push(memorialPar(glebaMemorial(gleba, opts.glebaConf || {}, mopts), fmt))
    }
  }
  if (sec.publicas && state.areaObjs.length) {
    children.push(quadraHead('ÁREAS PÚBLICAS', fmt))
    for (const ar of state.areaObjs) children.push(memorialPar(areaMemorial(ar, state, mopts).text, fmt))
  }
  if (sec.lotes) {
    children.push(new Paragraph({ spacing: { before: 120 }, children: [] }))
    children.push(quadraHead('MEMORIAIS DOS LOTES', fmt))
    let curQ = null
    for (const lot of state.lots) {
      if (lot.quadra !== curQ) { curQ = lot.quadra; children.push(quadraHead('Quadra ' + String(curQ).padStart(2, '0'), fmt)) }
      children.push(memorialPar(lotMemorial(lot, mopts), fmt))
    }
  }

  const mg = Math.round((modelo.word.margemCm || 2.5) * CM)
  return new Document({
    styles: { default: { document: { run: { font: fmt.font, size: fmt.size } } } },
    sections: [{ properties: { page: { margin: { top: mg, right: mg, bottom: mg, left: mg } } }, children }],
  })
}

export async function exportMemoriaisDocx(state, opts) {
  const { saveAs } = await import('file-saver')
  const doc = buildMemoriaisDoc(state, opts)
  const blob = await Packer.toBlob(doc)
  saveAs(blob, `Memorial - ${opts.loteamento || 'loteamento'}.docx`)
}
