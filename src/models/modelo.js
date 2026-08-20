// Modelo de memorial por cidade/cartório. DETERMINÍSTICO: define COMO a descrição sai.
// O modelo de Alegrete reproduz exatamente o memorial validado contra o cartório.
// A arquiteta cria um modelo por cidade (as "definições da descrição"); a geração e o Word leem daqui.

// tipo: 'loteamento' (Lei 6.766 — lotes, vias/áreas PÚBLICAS) ou 'condominio' (Lei 13.465 / CC art.1.358-A —
// unidades autônomas + fração ideal, vias/áreas COMUNS privadas). O tipo troca termo, redação e quadro.
export function novoModeloBase(cidade = '', uf = '', tipo = 'loteamento') {
  const cond = tipo === 'condominio'
  return {
    id: 'm' + Math.abs(hash(cidade + uf + tipo + Math.round(performance.now()))),
    cidade, uf,
    tipo,                                                      // 'loteamento' | 'condominio'
    termoUnidade: cond ? 'Unidade Autônoma' : 'Lote',          // como cada parcela é chamada no memorial
    nome: (cidade && uf) ? `${cidade}/${uf}` : (cidade || 'Novo modelo'),
    loteamento: '',                                            // nome do loteamento/condomínio (puxado no memorial)
    municipio: (cidade && uf) ? `${cidade}/${uf}` : '',        // município (puxado no memorial)
    marcos: { exige: true },                                   // exige pontos numerados?
    angulo: 'azimute',                                         // 'azimute' | 'rumo' | 'ambos'
    coordenadas: { incluir: false, sistema: 'local' },         // incluir N/E de cada vértice? local | utm
    secoes: { lotes: true, gleba: true, publicas: true, quadro: true },
    word: { fonte: 'Times New Roman', tamanhoPt: 12, margemCm: 2.5, titulo: 'MEMORIAL DESCRITIVO' },
    confrontacoes: [],  // confrontações de limite reutilizáveis (ex.: "Terras de Fulano", "Estrada Municipal")
    // dados do empreendimento (usados no preâmbulo e assinatura do condomínio) — a arquiteta preenche por projeto
    dados: { matricula: '', comarca: '', proprietario: '', cnpj: '', responsavel: '', titulo: 'Arquiteta e Urbanista', cau: '', data: '' },
    desc: descPadrao(tipo),
  }
}

function descPadrao(tipo = 'loteamento') {
  const cond = tipo === 'condominio'
  return {
    sentido: 'horário',
    conector: 'deste ponto segue ',
    cabecalho: cond
      ? '{unidade} {num}: Uma unidade autônoma, situada na quadra {quadra}, no Condomínio "{loteamento}", cidade de {municipio}, com área privativa de {priv} m² ({privExt}), área real de uso comum de {comum} m² ({comumExt}), área real total de {total} m² ({totalExt}), correspondendo-lhe uma fração ideal equivalente a {fracao}, com as seguintes dimensões e confrontações em sentido {sentido}: '
      : '{unidade} {num}: Um terreno urbano localizado no Loteamento "{loteamento}", no município de {municipio}, situado na Quadra {quadra}, com as seguintes medidas e confrontações em sentido {sentido}: ',
    partida: 'Partindo do ponto {p0}; ',
    partidaSemMarco: cond ? 'Inicia-se a descrição pela frente da unidade, ' : 'Inicia-se a descrição pela frente do lote, ',
    conf: {
      rua: 'no alinhamento com a {c}',                                     // via (rua/avenida): alinhamento
      lote: 'confrontando com {art} {c}',                                  // {art} = o/a conforme o termo (Lote/Unidade)
      area: 'confrontando com a {c}',
      perimetro: 'confrontando com {c}',
      wd: 'confrontando com [A DEFINIR]',
    },
    medidaAz: cond ? ', com azimute de {az} e distância de {dist} m' : ', com azimute de {az}, sentido {quad} e distância de {dist} m',
    medidaRumo: ', com rumo de {rumo} e distância de {dist} m',
    medidaAmbos: ', com azimute de {az} (rumo {rumo}) e distância de {dist} m',
    // arco no LOTE (com raio, como no memorial da unidade)
    medidaArco: cond
      ? ', por uma curva de comprimento aproximado de {desenv} m e raio de {raio} m, com azimute de {az} e distância em linha reta de {corda} m'
      : ', por uma curva à {dir} com raio de {raio} m e desenvolvimento de {desenv} m',
    // arco no PERÍMETRO de quarteirão/rua/área (condomínio: SEM raio, como no memorial dos quarteirões)
    medidaArcoPerim: cond
      ? ', por uma curva de comprimento aproximado de {desenv} m, com azimute de {az} e distância em linha reta de {corda} m'
      : ', por uma curva à {dir} com raio de {raio} m e desenvolvimento de {desenv} m',
    coord: ' (N {N} m, E {E} m)',                              // anexado ao ponto de chegada, se coordenadas.incluir
    ate: ', até o ponto {to}',
    ateSemMarco: '',
    encerra: ', ponto inicial da descrição deste perímetro',
    sep: '; ',
    // condomínio: áreas e fração já vão no cabeçalho → fecho vazio (só encerra + nota de esquina)
    fechamento: cond ? '' : 'perfazendo uma área total de {area} m² ({extenso}).',
    esquina: ' Que fica na esquina entre a {r1} e a {r2}.',   // condomínio: nota p/ lote de esquina (2+ ruas)
    // gleba (perímetro / matrícula-mãe)
    glebaCabecalho: cond
      ? 'Gleba de terras (matrícula-mãe) com área de {area} m² ({extenso}), situada no município de {municipio}, destinada ao Condomínio "{loteamento}", com o seguinte perímetro, no sentido {sentido}: Inicia-se a descrição no marco {p0}; '
      : 'Gleba de terras com área de {area} m² ({extenso}), situada no município de {municipio}, destinada ao Loteamento "{loteamento}", com o seguinte perímetro, no sentido {sentido}: Inicia-se a descrição no marco {p0}; ',
    glebaConf: 'confrontando com {c}',
    glebaAte: ', até o marco {to}',
    glebaEncerra: ', marco inicial desta descrição, fechando o perímetro.',
    // área pública (loteamento) / área comum (condomínio)
    areaCabecalho: cond
      ? '{nome}: área comum do Condomínio "{loteamento}" com {area} m² ({extenso}), município de {municipio}, com o seguinte perímetro, no sentido {sentido}: Inicia-se no marco {p0}; '
      : '{nome}: área pública com {area} m² ({extenso}), integrante do Loteamento "{loteamento}", município de {municipio}, com o seguinte perímetro, no sentido {sentido}: Inicia-se no marco {p0}; ',
    areaEncerra: ', marco inicial, fechando o perímetro.',
    // condomínio: preâmbulo (finalidade + gleba + matrícula + proprietário)
    preambulo: 'O presente memorial tem por finalidade descrever o parcelamento de solo de acordo com o projeto denominado "{loteamento}", em uma gleba de terras situada na cidade de {municipio}, com área superficial de {gleba} m² ({glebaExt}), objeto da matrícula sob nº {matricula} do Cartório de Registro de Imóveis da Comarca de {comarca}, de propriedade de {proprietario}, inscrita no CNPJ {cnpj}. Segue abaixo a descrição do empreendimento.',
  }
}

// troca o tipo do modelo (loteamento <-> condomínio), regenerando termo e redação padrão daquele tipo
export function aplicarTipo(modelo, tipo) {
  return { ...modelo, tipo, termoUnidade: tipo === 'condominio' ? 'Unidade Autônoma' : 'Lote', desc: descPadrao(tipo) }
}

// Modelo semente: Alegrete/RS (o que já foi validado). É o modelo padrão até a arquiteta criar outros.
export function modeloAlegrete() {
  const m = novoModeloBase('Alegrete', 'RS')
  m.id = 'alegrete-rs'
  m.loteamento = 'Novo Alegrete'
  m.municipio = 'Alegrete/RS'
  return m
}

// substitui {token} por vars[token] (string vazia se ausente)
export function render(tpl, vars) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''))
}

function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0 } return h }

// ---- persistência (localStorage; pode migrar p/ Supabase depois, sem mudar o resto) ----
const KEY = 'prancheta-modelos'
export function listModelos() {
  let arr = []
  try { arr = JSON.parse(localStorage.getItem(KEY) || '[]') } catch { arr = [] }
  if (!arr.some(m => m.id === 'alegrete-rs')) arr = [modeloAlegrete(), ...arr]
  return arr
}
export function saveModelo(m) {
  const arr = listModelos().filter(x => x.id !== m.id)
  arr.push(m)
  localStorage.setItem(KEY, JSON.stringify(arr))
  return arr
}
export function deleteModelo(id) {
  const arr = listModelos().filter(x => x.id !== id)
  localStorage.setItem(KEY, JSON.stringify(arr))
  return arr
}
export function getModelo(id) { return listModelos().find(m => m.id === id) || modeloAlegrete() }
