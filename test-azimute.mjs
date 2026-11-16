// Teste: rótulos independentes (marcos / rótulo nº+área / azimute / cota) no DXF, todos DENTRO do lote.
import { buildMarcosDxf } from './src/export/dxf.js'
import { parseDXF } from './src/engine/dxf.js'

// lote retângulo 24 x 12 (face maior = horizontal, 24m), sentido horário
const verts = [[0, 0], [0, 12], [24, 12], [24, 0]]
const state = { lots: [{ num: '01', area: 288, verts, bulges: [0, 0, 0, 0] }], areaObjs: [], marcos: [{ n: 1, x: 0, y: 0 }] }
function pip(pt, vs) { let c = false; for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) { const xi = vs[i][0], yi = vs[i][1], xj = vs[j][0], yj = vs[j][1]; if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) c = !c } return c }

let pass = true
const chk = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) pass = false }

const dxf = buildMarcosDxf(state, { marcos: true, rotulo: true, azimute: true, cota: true })
const m = parseDXF(dxf), texts = m.entities.filter(e => e.type === 'text')

console.log('— rótulo central (nº + área) —')
chk(texts.some(t => t.text === 'LOTE 01' && t.layer === 'ROTULO'), 'LOTE 01 na camada ROTULO')
chk(texts.some(t => /^A=288,00m/.test(t.text) && t.layer === 'ROTULO'), 'A=288,00m² na camada ROTULO')
const lote = texts.find(t => t.text === 'LOTE 01')
chk(lote && Math.abs(lote.rot) < 1, 'rótulo alinhado à face maior (horizontal, rot≈0): rot=' + lote?.rot?.toFixed(1))

console.log('— azimute + cota nas camadas certas —')
chk(texts.filter(t => t.layer === 'AZIMUTE').length === 4, 'AZIMUTE = 4 lados: ' + texts.filter(t => t.layer === 'AZIMUTE').length)
chk(texts.filter(t => t.layer === 'COTA').length === 4, 'COTA = 4 lados: ' + texts.filter(t => t.layer === 'COTA').length)
chk(texts.some(t => t.text === '24,00 m') && texts.some(t => t.text === '12,00 m'), 'cotas 24,00 e 12,00 m')

console.log('— TODOS os rótulos DENTRO do lote (não saem das linhas) —')
const rot = texts.filter(t => ['ROTULO', 'AZIMUTE', 'COTA'].includes(t.layer))
const fora = rot.filter(t => !pip([t.x, t.y], verts))
chk(fora.length === 0, `${rot.length} rótulos, ${fora.length} fora do lote` + (fora.length ? ' → ' + fora.map(t => t.text).join(', ') : ''))

console.log('— combos —')
chk(!buildMarcosDxf(state, { marcos: true, rotulo: false, azimute: false, cota: false }).includes('LOTE 01'), 'só marcos: sem rótulo/az/cota')
chk(buildMarcosDxf(state, { marcos: false, rotulo: true, azimute: false, cota: false }).includes('LOTE 01'), 'só rótulo: tem LOTE 01')

console.log('\n=== ' + (pass ? 'PASSOU ✅' : 'FALHOU ❌') + ' ===')
