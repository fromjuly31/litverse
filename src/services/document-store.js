function openDocuments() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("litverse-documents-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("pdfs");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("PDF 저장소를 열지 못했어요."));
  });
}
export async function putDocument(id, source, file) {
  const db = await openDocuments();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("pdfs", "readwrite");
      transaction.objectStore("pdfs").put(file, `${id}/${source}`);
      transaction.oncomplete = resolve;
      transaction.onerror = () =>
        reject(
          new Error("PDF를 저장하지 못했어요. 기기 저장 공간을 확인해 주세요."),
        );
    });
  } finally {
    db.close();
  }
}
export async function getDocument(id, source) {
  const db = await openDocuments();
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction("pdfs")
        .objectStore("pdfs")
        .get(`${id}/${source}`);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(new Error("첨부된 PDF를 불러오지 못했어요."));
    });
  } finally {
    db.close();
  }
}
export async function removeDocuments(id) {
  const db = await openDocuments();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("pdfs", "readwrite");
      const store = transaction.objectStore("pdfs");
      const request = store.openKeyCursor(
        IDBKeyRange.bound(`${id}/`, `${id}/\uffff`),
      );
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          store.delete(cursor.key);
          cursor.continue();
        }
      };
      transaction.oncomplete = resolve;
      transaction.onerror = reject;
    });
  } finally {
    db.close();
  }
}
