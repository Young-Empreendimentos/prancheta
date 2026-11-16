// Projetos na nuvem (Supabase): metadados + edições na tabela prancheta_projetos,
// o DXF (pesado) no Storage bucket prancheta-dxf, em {user_id}/{projeto_id}.dxf.
import { supabase } from './supabase.js'
const BUCKET = 'prancheta-dxf'
const projetos = () => supabase.schema('prancheta').from('projetos')

export async function listarProjetos() {
  const { data, error } = await projetos()
    .select('id, nome, arquivo, criado_em, atualizado_em, dxf_path')
    .order('atualizado_em', { ascending: false })
  if (error) throw error
  return data || []
}

// cria a linha (p/ obter o id), sobe o DXF e grava o caminho. Retorna o id.
export async function criarProjeto({ nome, dxfRaw, arquivo, dados }) {
  const { data: u } = await supabase.auth.getUser()
  const uid = u?.user?.id
  const { data, error } = await projetos()
    .insert({ nome: nome || arquivo || 'Projeto', arquivo, dados: dados || {} })
    .select('id').single()
  if (error) throw error
  const id = data.id, path = `${uid}/${id}.dxf`
  const up = await supabase.storage.from(BUCKET).upload(path, new Blob([dxfRaw], { type: 'application/dxf' }), { upsert: true })
  if (up.error) throw up.error
  await projetos().update({ dxf_path: path }).eq('id', id)
  return id
}

export async function carregarProjeto(id) {
  const { data, error } = await projetos().select('*').eq('id', id).single()
  if (error) throw error
  let dxfRaw = ''
  if (data.dxf_path) {
    const dl = await supabase.storage.from(BUCKET).download(data.dxf_path)
    if (!dl.error && dl.data) dxfRaw = await dl.data.text()
  }
  return { ...data, dxfRaw }
}

// salva metadados/edições (a cada alteração). NÃO re-sobe o DXF (ele não muda depois de aberto).
export async function salvarProjeto(id, patch) {
  const { error } = await projetos().update(patch).eq('id', id)
  if (error) throw error
}

export async function renomearProjeto(id, nome) { return salvarProjeto(id, { nome }) }

export async function excluirProjeto(id, dxfPath) {
  if (dxfPath) await supabase.storage.from(BUCKET).remove([dxfPath])
  const { error } = await projetos().delete().eq('id', id)
  if (error) throw error
}
