/**
 * One app at a time. The current app scopes Now, Plans, Ideas, the Graph and where the agent works; it is picked
 * in the nav and remembered in localStorage (a per-viewer convenience; the engine never sees it as state).
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { engine, type App } from './engine'

const KEY = 'if.app'
interface Ctx { apps: App[]; app: App | null; setAppId: (id: string) => void; reload: () => Promise<void> }
const CurrentApp = createContext<Ctx>({ apps: [], app: null, setAppId: () => {}, reload: async () => {} })

export function CurrentAppProvider({ children }: { children: React.ReactNode }) {
  const [apps, setApps] = useState<App[]>([])
  const [appId, setId] = useState<string | null>(() => { try { return localStorage.getItem(KEY) } catch { return null } })
  const reload = async () => { try { setApps(await engine.apps()) } catch { /* the engine is down; pages say so */ } }
  useEffect(() => { void reload() }, [])
  useEffect(() => { // nothing chosen, or the chosen app is gone: take the newest
    if (apps.length && !apps.some((a) => a.id === appId)) setId(apps[apps.length - 1].id)
  }, [apps, appId])
  const setAppId = (id: string) => { setId(id); try { localStorage.setItem(KEY, id) } catch { /* fine */ } }
  const value = useMemo(() => ({ apps, app: apps.find((a) => a.id === appId) ?? null, setAppId, reload }), [apps, appId])
  return <CurrentApp.Provider value={value}>{children}</CurrentApp.Provider>
}

export const useCurrentApp = () => useContext(CurrentApp)
