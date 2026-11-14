// Projetos guardados no próprio aparelho (IndexedDB): arquivos originais, pedidos, versões e legendas.
// Nada vai para servidor. Apagar o projeto apaga tudo.
const DB = 'corte', VER = 1;
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' }); if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(store, mode, fn) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(store, mode); const s = t.objectStore(store); const out = fn(s); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('abortado')); }); }

export async function saveProject(p) { try { await tx('projects', 'readwrite', s => s.put({ ...p, updatedAt: Date.now() })); return true; } catch (e) { console.warn('salvar projeto', e); return false; } }
export async function listProjects() { try { const all = await tx('projects', 'readonly', s => s.getAll()); return (all || []).sort((a, b) => b.updatedAt - a.updatedAt); } catch (e) { return []; } }
export async function getProject(id) { return tx('projects', 'readonly', s => s.get(id)); }
export async function deleteProject(id) {
  const p = await getProject(id);
  if (p) for (const f of p.files || []) await tx('files', 'readwrite', s => s.delete(f.id)).catch(() => {});
  await tx('projects', 'readwrite', s => s.delete(id));
}
export async function saveFile(id, file) { try { await tx('files', 'readwrite', s => s.put({ id, name: file.name, type: file.type, blob: file })); return true; } catch (e) { console.warn('salvar arquivo', e); return false; } }
export async function getFile(id) { const r = await tx('files', 'readonly', s => s.get(id)); return r ? new File([r.blob], r.name, { type: r.type }) : null; }
export async function storageInfo() { try { const e = await navigator.storage.estimate(); return { used: e.usage, quota: e.quota }; } catch (e) { return null; } }
export async function askPersist() { try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch (e) { return false; } }

// Estilos salvos ("meu estilo") e preferências: localStorage
const LS = k => 'corte.' + k;
export function loadPrefs() { try { return JSON.parse(localStorage.getItem(LS('prefs')) || '{}'); } catch (e) { return {}; } }
export function savePrefs(p) { try { localStorage.setItem(LS('prefs'), JSON.stringify(p)); } catch (e) {} }
export function loadStyles() { try { return JSON.parse(localStorage.getItem(LS('styles')) || '[]'); } catch (e) { return []; } }
export function saveStyles(a) { try { localStorage.setItem(LS('styles'), JSON.stringify(a)); } catch (e) {} }
