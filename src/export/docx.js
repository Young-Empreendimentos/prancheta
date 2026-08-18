// Exportação do memorial descritivo em Word (.docx), no formato do modelo do cartório.
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle,
} from 'docx'
import { lotMemorial, computeQuadroAreas, buildGleba, glebaMemorial, areaMemorial } from '../engine/loteamento.js'
import { nb } from '../engine/extenso.js'

const FONT = 'Times New Roman'
const SIZE = 24 // 12pt (half-points)

function title(text, size = 28) {
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 180 }, children: [new TextRun({ text, bold: true, size, font: FONT })] })
}
function quadraHead(text) {
  return new Paragraph({ spacing: { before: 220, after: 90 }, children: [new TextRun({ text, bold: true, size: 26, font: FONT })] })
}
// parágrafo do memorial: "Lote NN:" em negrito, resto normal, justificado
function memorialPar(text) {
  const m = text.match(/^(Lote\s+\S+:|[^:]+:)/)
  let head = '', rest = text
  if (m) { head = m[0]; rest = text.slice(head.length) }
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED, spacing: { after: 140 },
    children: [new TextRun({ text: head, bold: true, font: FONT, size: SIZE }), new TextRun({ text: rest, font: FONT, size: SIZE })],
  })
}
function cell(text, { bold = false, align = AlignmentType.LEFT, w } = {}) {
  return new TableCell({
    width: w ? { size: w, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [new Paragraph({ alignment: align, children: [new TextRun({ text, bold, font: FONT, size: 22 })] })],
  })
}
function quadroAreasTable(q) {
  const g = q.gleba || (q.lotes + q.verde + q.inst)
  const vias = g - q.lotes - q.verde - q.inst
  const pct = x => g > 0 ? (x / g * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '—'
  const border = { style: BorderStyle.SINGLE, size: 4, color: '999999' }
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border }
  const row = (a, b, c, bold = false) => new TableRow({ children: [cell(a, { bold, w: 55 }), cell(b, { align: AlignmentType.RIGHT, bold, w: 27 }), cell(c, { align: AlignmentType.RIGHT, bold, w: 18 })] })
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders,
    rows: [
      new TableRow({ tableHeader: true, children: [cell('Discriminação', { bold: true }), cell('Área (m²)', { bold: true, align: AlignmentType.RIGHT }), cell('%', { bold: true, align: AlignmentType.RIGHT })] }),
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
  const children = []
  children.push(title('MEMORIAL DESCRITIVO'))
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: `Loteamento ${loteamento} — ${municipio}`, bold: true, font: FONT, size: SIZE })] }))

  children.push(quadraHead('QUADRO DE ÁREAS'))
  children.push(quadroAreasTable(computeQuadroAreas(state)))

  // gleba (perímetro do loteamento)
  const gleba = buildGleba(state)
  if (gleba) {
    children.push(quadraHead('MEMORIAL DA GLEBA'))
    children.push(memorialPar(glebaMemorial(gleba, opts.glebaConf || {}, opts)))
  }
  // áreas públicas (verdes/institucional)
  if (state.areaObjs.length) {
    children.push(quadraHead('ÁREAS PÚBLICAS'))
    for (const ar of state.areaObjs) children.push(memorialPar(areaMemorial(ar, state, opts).text))
  }

  children.push(new Paragraph({ spacing: { before: 120 }, children: [] }))
  children.push(quadraHead('MEMORIAIS DOS LOTES'))
  let curQ = null
  for (const lot of state.lots) {
    if (lot.quadra !== curQ) { curQ = lot.quadra; children.push(quadraHead('Quadra ' + String(curQ).padStart(2, '0'))) }
    children.push(memorialPar(lotMemorial(lot, opts)))
  }

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [{ properties: { page: { margin: { top: 1417, right: 1417, bottom: 1417, left: 1417 } } }, children }],
  })
}

export async function exportMemoriaisDocx(state, opts) {
  const { saveAs } = await import('file-saver')
  const doc = buildMemoriaisDoc(state, opts)
  const blob = await Packer.toBlob(doc)
  saveAs(blob, `Memorial - ${opts.loteamento || 'loteamento'}.docx`)
}
