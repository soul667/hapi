import { useSyncExternalStore } from 'react'
export type GlassTheme = 'classic' | 'cloud-frost' | 'cloud-clear'
const KEY = 'hapi-glass-theme'
const EVENT = 'hapi-glass-theme-changed'
export function readGlassTheme(): GlassTheme {
    try {
        const value = localStorage.getItem(KEY)
        if (value === 'classic' || value === 'cloud-clear' || value === 'cloud-frost') return value
    } catch { /* Private browsing can disable storage. */ }
    return 'cloud-frost'
}
export function initializeGlassTheme() {
    document.documentElement.dataset.glass = readGlassTheme()
}
function subscribe(callback: () => void) {
    const storage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) { initializeGlassTheme(); callback() } }
    window.addEventListener(EVENT, callback)
    window.addEventListener('storage', storage)
    return () => { window.removeEventListener(EVENT, callback); window.removeEventListener('storage', storage) }
}
export function useGlassTheme() {
    const theme = useSyncExternalStore(subscribe, readGlassTheme, () => 'cloud-frost' as const)
    return { theme, setTheme: (value: GlassTheme) => {
        try { localStorage.setItem(KEY, value) } catch { /* Keep this page usable without storage. */ }
        document.documentElement.dataset.glass = value
        window.dispatchEvent(new Event(EVENT))
    } }
}
