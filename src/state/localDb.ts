import type { AppState } from './appState'

export type StoredDocumentKind = 'customer-report' | 'jira-report'

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

export async function saveUploadedDocument(kind: StoredDocumentKind, file: File) {
  const db = await openLocalDb()
  const uploadedAt = new Date().toISOString()
  const document: StoredDocument = {
    id: kind,
    kind,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    uploadedAt,
    content: file,
  }
  const transaction = db.transaction('documents', 'readwrite')
  transaction.objectStore('documents').put(document)
  await transactionDone(transaction)
  return toDocumentMeta(document)
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
