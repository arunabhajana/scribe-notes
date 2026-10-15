import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  // No cross-process handles, network, or native dialogs during unit tests.
  vi.stubGlobal('BroadcastChannel', undefined)
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Unexpected network request in a test. Mock it explicitly.'))))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
