// Keep received artwork on this device across reloads. No recovery codes or account secrets are stored here.
const DB = "dragon-pixel-artwork";
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("history");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readStudioHistory<T>(): Promise<T[]> {
  const db = await database();
  try { return await new Promise((resolve, reject) => { const request = db.transaction("history").objectStore("history").get("recent"); request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []); request.onerror = () => reject(request.error); }); }
  finally { db.close(); }
}
export async function writeStudioHistory<T>(items: T[]) {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction("history", "readwrite"); tx.objectStore("history").put(items, "recent"); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
  finally { db.close(); }
}

// Up to 12 editable drafts, independent of flattened recent-image previews.
export async function readEditorDraft<T>(id: string): Promise<T | undefined> {
  const db = await database();
  try { return await new Promise((resolve,reject) => { const request = db.transaction("history").objectStore("history").get("editor:" + id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
  finally { db.close(); }
}
export async function writeEditorDraft<T>(id: string, value: T) {
  const db = await database();
  try { await new Promise<void>((resolve,reject) => {
    const tx = db.transaction("history", "readwrite"), store = tx.objectStore("history"), request = store.get("editor-index");
    request.onsuccess = () => { const old: string[] = Array.isArray(request.result) ? request.result : []; const order = [id, ...old.filter(key => key !== id)]; order.slice(12).forEach(key => store.delete("editor:" + key)); store.put(order.slice(0,12),"editor-index"); store.put(value,"editor:" + id); };
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
