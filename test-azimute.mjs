// Teste dos rótulos independentes (marcos / azimute / cota) no DXF. Quadrado 20x10.
import { buildMarcosDxf, buildPlantaMarcosDxf } from './src/export/dxf.js'
import { parseDXF } from './src/engine/dxf.js'

const state = {
  lots: [{ verts: [[0, 0], [20, 0], [20, 10], [0, 10]], bulges: [0, 0, 0, 0] }],
  areaObjs: [],
  marcos: [{ n: 1, x: 0, y: 0 }, { n: 2, x: 20, y: 0 }],
}

let pass = true
const chk = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) pass = false }

// combo azimute + cota
const dxf = buildMarcosDxf(state, { marcos: true, azimute: true, cota: true })
console.log('— azimute + cota + marcos —')
for (const t of ["90°00'00\"", "0°00'00\"", "270°00'00\"", "180°00'00\""]) chk(dxf.includes(t), 'azimute ' + t)
for (const t of ['20,00 m', '10,00 m']) chk(dxf.includes(t), 'cota ' + t)
chk(dxf.includes('AZIMUTE') && dxf.includes('COTA'), 'camadas AZIMUTE e COTA')
let m = parseDXF(dxf); chk(!!m, 're-parse OK')
const txt = (m.entities || []).filter(e => e.type === 'text')
chk(txt.filter(e => e.layer === 'AZIMUTE').length === 4, 'TEXT na camada AZIMUTE = 4 (um por lado): ' + txt.filter(e => e.layer === 'AZIMUTE').length)
chk(txt.filter(e => e.layer === 'COTA').length === 4, 'TEXT na camada COTA = 4: ' + txt.filter(e => e.layer === 'COTA').length)
chk(txt.filter(e => e.layer === 'MARCOS').length === 2, 'TEXT na camada MARCOS = 2: ' + txt.filter(e => e.layer === 'MARCOS').length)

// só marco (padrão antigo)
console.log('— só marcos —')
const soMarco = buildMarcosDxf(state, { marcos: true, azimute: false, cota: false })
chk(!soMarco.includes("90°00'00\""), 'sem azimute')
chk(!/\b20,00 m\b/.test(soMarco), 'sem cota')
chk((parseDXF(soMarco).entities || []).filter(e => e.type === 'text' && e.layer === 'MARCOS').length === 2, 'marcos presentes')

// só azimute
console.log('— só azimute —')
const soAz = buildMarcosDxf(state, { marcos: false, azimute: true, cota: false })
chk(soAz.includes("90°00'00\""), 'azimute presente')
chk(!soAz.includes('20,00 m'), 'sem cota')
chk((parseDXF(soAz).entities || []).filter(e => e.layer === 'MARCOS').length === 0, 'sem marcos')

// injeção na planta original
console.log('— injeção na planta —')
const orig = ['0', 'SECTION', '2', 'HEADER', '9', '$HANDSEED', '5', '1000', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', '0', 'ENDSEC', '0', 'EOF'].join('\r\n') + '\r\n'
const inj = buildPlantaMarcosDxf(orig, state, { marcos: true, azimute: true, cota: true })
chk(inj.includes('AZIMUTE') && inj.includes('COTA') && inj.includes("90°00'00\"") && inj.includes('$HANDSEED'), 'rótulos + planta preservada')

console.log('\n=== ' + (pass ? 'PASSOU ✅' : 'FALHOU ❌') + ' ===')
