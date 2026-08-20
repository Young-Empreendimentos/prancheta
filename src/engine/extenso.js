// Número por extenso (pt-BR) e área por extenso (metros/decímetros quadrados) — validado no protótipo.

export function extenso(n) {
  n = Math.floor(n)
  if (n === 0) return 'zero'
  const u = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove']
  const e = { 10: 'dez', 11: 'onze', 12: 'doze', 13: 'treze', 14: 'quatorze', 15: 'quinze', 16: 'dezesseis', 17: 'dezessete', 18: 'dezoito', 19: 'dezenove' }
  const dz = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
  const ce = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']
  function a999(x) {
    if (x === 0) return ''
    if (x === 100) return 'cem'
    const r = [], c = Math.floor(x / 100), r2 = x % 100
    if (c) r.push(ce[c])
    if (r2) { if (r2 < 10) r.push(u[r2]); else if (r2 < 20) r.push(e[r2]); else { const d = Math.floor(r2 / 10), un = r2 % 10; r.push(dz[d] + (un ? ' e ' + u[un] : '')) } }
    return r.join(' e ')
  }
  const r = [], mil = Math.floor(n / 1000), rst = n % 1000
  if (mil) r.push(mil === 1 ? 'mil' : a999(mil) + ' mil')
  if (rst) r.push((mil && rst < 100 ? 'e ' : '') + a999(rst))
  return r.join(' ')
}
export function areaExtenso(a) {
  const cents = Math.round(a * 100)                    // total em dm² (arredonda igual ao nb, evita "...cem dm²")
  const m2 = Math.floor(cents / 100), dm2 = cents % 100
  let s = extenso(m2) + (m2 === 1 ? ' metro quadrado' : ' metros quadrados')
  if (dm2 > 0) s += ' e ' + extenso(dm2) + (dm2 === 1 ? ' decímetro quadrado' : ' decímetros quadrados')
  return s
}
export const nb = (v, d) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
