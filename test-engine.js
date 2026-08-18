import fs from 'fs'
import { decodeDXF, parseDXF } from './src/engine/dxf.js'
import { collectSources, buildLoteamento, lotMemorial, computeQuadroAreas, detectGleba } from './src/engine/loteamento.js'

const buf = fs.readFileSync('C:/Users/Rafael/Downloads/Para Teste.dxf')
const text = decodeDXF(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
const model = parseDXF(text)
const sources = collectSources(model)
const state = buildLoteamento(model, sources)

let nLote = 0, nArea = 0, nRua = 0, nPer = 0, nWd = 0
state.lots.forEach(l => l.sides.forEach(s => { if (s.kind === 'lote') nLote++; else if (s.kind === 'area') nArea++; else if (s.kind === 'rua') nRua++; else if (s.kind === 'perimetro') nPer++; else nWd++ }))
const lot = state.lots.find(l => l.num === '01' && l.quadra === '6')
const q = computeQuadroAreas(state)
const g = detectGleba(state)

console.log('lotes:', state.lots.length)
console.log('confrontações — lote:', nLote, '| área:', nArea, '| rua:', nRua, '| perímetro:', nPer, '| a definir:', nWd)
console.log('quadro de áreas:', { gleba: Math.round(q.gleba), lotes: Math.round(q.lotes), verde: Math.round(q.verde), inst: Math.round(q.inst), quadras: q.quadras })
console.log('gleba detectada:', g ? Math.round(g.area) + ' m²' : 'não')
console.log('\nMemorial Lote 01/Q06:\n', lotMemorial(lot, { loteamento: 'Novo Alegrete', municipio: 'Alegrete/RS' }).slice(0, 360))
