// Armazenamento local (IndexedDB) — guarda a sessão de trabalho (DXF + edições) mesmo com o DXF grande.
// Tudo com try/catch: se o navegador bloquear/falhar, o app segue funcionando (só não persiste).
const DB = 'prancheta', STORE = 'kv'

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE) }
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
export async function idbSet(key, val) {
  try {
    const db = await open()
    return await new Promise((res, rej) => {
      const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(val, key)
      t.oncomplete = () => res(true); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error)
    })
  } catch { return false }
}
export async function idbGet(key) {
  try {
    const db = await open()
    return await new Promise((res) => {
      const t = db.transaction(STORE, 'readonly'), rq = t.objectStore(STORE).get(key)
      rq.onsuccess = () => res(rq.result); rq.onerror = () => res(undefined)
    })
  } catch { return undefined }
}
export async function idbDel(key) {
  try {
    const db = await open()
    return await new Promise((res) => {
      const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(key)
      t.oncomplete = () => res(true); t.onerror = () => res(false)
    })
  } catch { return false }
}
