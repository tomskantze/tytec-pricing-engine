import type { AppState, RunDocumentMeta } from './appState'

export type StoredDocumentKind = RunDocumentMeta['kind']

export type StoredDocumentMeta = {
  id: string
  kind: StoredDocumentKind
  fileName: string
  mimeType: string
  size: number
  uploadedAt: string
}

type StoredDocument = StoredDocumentMeta & {
  content: Blob
}

export type StoredDocumentView = StoredDocumentMeta & {
  content: Blob
}

const dbName = 'tytec-pricing-engine-db'
const version = 1
const stateKey = 'app-state'

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

function toDocumentMeta(document: StoredDocument): StoredDocumentMeta {
  return {
    id: document.id,
    kind: document.kind,
    fileName: document.fileName,
    mimeType: document.mimeType,
    size: document.size,
    uploadedAt: document.uploadedAt,
  }
}

export function openLocalDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, version)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state')
      if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents', { keyPath: 'id' })
    }
  })
}

export async function loadDbState() {
  const db = await openLocalDb()
  const transaction = db.transaction('state', 'readonly')
  return requestResult<AppState | undefined>(transaction.objectStore('state').get(stateKey))
}

export async function saveDbState(state: AppState) {
  const db = await openLocalDb()
  const transaction = db.transaction('state', 'readwrite')
  transaction.objectStore('state').put(state, stateKey)
  await transactionDone(transaction)
}

export async function saveUploadedDocument(documentMeta: RunDocumentMeta, file: Blob) {
  const db = await openLocalDb()
  const document: StoredDocument = {
    id: documentMeta.id,
    kind: documentMeta.kind,
    fileName: documentMeta.fileName,
    mimeType: documentMeta.mimeType || 'application/octet-stream',
    size: documentMeta.size,
    uploadedAt: documentMeta.uploadedAt,
    content: file,
  }
  const transaction = db.transaction('documents', 'readwrite')
  transaction.objectStore('documents').put(document)
  await transactionDone(transaction)
  return toDocumentMeta(document)
}

export async function getUploadedDocument(id: string): Promise<StoredDocumentView | null> {
  const db = await openLocalDb()
  const transaction = db.transaction('documents', 'readonly')
  const document = await requestResult<StoredDocument | undefined>(transaction.objectStore('documents').get(id))
  if (!document) return null
  return {
    id: document.id,
    kind: document.kind,
    fileName: document.fileName,
    mimeType: document.mimeType,
    size: document.size,
    uploadedAt: document.uploadedAt,
    content: document.content,
  }
}

export async function getUploadedDocumentByKind(kind: StoredDocumentKind): Promise<StoredDocumentView | null> {
  return getUploadedDocument(kind)
}

export async function listUploadedDocuments() {
  const db = await openLocalDb()
  const transaction = db.transaction('documents', 'readonly')
  const documents = await requestResult<StoredDocument[]>(transaction.objectStore('documents').getAll())
  return documents.map(toDocumentMeta)
}

export async function clearUploadedDocuments() {
  const db = await openLocalDb()
  const transaction = db.transaction('documents', 'readwrite')
  transaction.objectStore('documents').clear()
  await transactionDone(transaction)
}
