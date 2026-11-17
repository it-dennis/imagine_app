import { describe, it, expect, beforeEach, vi } from 'vitest'

type Bag = Record<string, unknown>

function stubEnvironment(mainPrefs: Bag, detected: Bag = {}) {
  const ls = new Map<string, string>()
  const state = { ...mainPrefs }
  const set = vi.fn(async (patch: Bag) => Object.assign(state, patch))
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => ls.get(k) ?? null,
    setItem: (k: string, v: string) => void ls.set(k, v),
  })
  vi.stubGlobal('window', { imagineAPI: { prefs: { get: async () => ({ ...state }), set }, emulator: { detect: async () => detected } } })
  return { ls, state, set }
}

async function freshStore() {
  vi.resetModules()
  return (await import('../../src/renderer/state/prefs.store')).usePrefsStore
}

beforeEach(() => vi.unstubAllGlobals())

describe('prefs store', () => {
  it('writes setter changes through to the main process and the local cache', async () => {
    const env = stubEnvironment({})
    const store = await freshStore()
    store.getState().setTheme('light')
    expect(env.set).toHaveBeenCalledWith({ theme: 'light' })
    expect(env.ls.get('im.theme')).toBe('"light"')
  })

  it('hydrate applies prefs.json over the local cache', async () => {
    const env = stubEnvironment({ theme: 'light', vicePath: 'C:/vice/x64sc.exe' })
    env.ls.set('im.theme', '"dark"')
    const store = await freshStore()
    await store.getState().hydrate()
    expect(store.getState().theme).toBe('light')
    expect(store.getState().vicePath).toBe('C:/vice/x64sc.exe')
    expect(env.ls.get('im.theme')).toBe('"light"')
  })

  it('migrates existing localStorage values into prefs.json when it is empty', async () => {
    const env = stubEnvironment({})
    env.ls.set('im.accent', '"amber"')
    const store = await freshStore()
    await store.getState().hydrate()
    expect(env.state.accent).toBe('amber')
    expect(store.getState().accent).toBe('amber')
  })

  it('keeps working when the IPC bridge is unavailable', async () => {
    stubEnvironment({})
    vi.stubGlobal('window', {})
    const store = await freshStore()
    await expect(store.getState().hydrate()).resolves.toBeUndefined()
    expect(() => store.getState().setFont('mono')).not.toThrow()
  })

  it('autodetect fills empty emulator paths but keeps manual ones unless overwriting', async () => {
    const env = stubEnvironment({}, { vicePath: 'C:/vice/x64sc.exe', hatariPath: 'C:/hatari/hatari.exe' })
    env.ls.set('im.vicePath', '"D:/mine/x64sc.exe"')
    const store = await freshStore()
    await store.getState().autodetect()
    expect(store.getState().vicePath).toBe('D:/mine/x64sc.exe')
    expect(store.getState().hatariPath).toBe('C:/hatari/hatari.exe')
    expect(env.state.hatariPath).toBe('C:/hatari/hatari.exe')
    await store.getState().autodetect(true)
    expect(store.getState().vicePath).toBe('C:/vice/x64sc.exe')
  })

  it('autodetect survives a failing bridge', async () => {
    stubEnvironment({})
    vi.stubGlobal('window', {})
    const store = await freshStore()
    await expect(store.getState().autodetect()).resolves.toEqual({})
  })
})
