import cloud from '@/assets/cloud-sea.webp'
import { useGlassTheme, type GlassTheme } from '@/hooks/useGlassTheme'
const options: { value: GlassTheme; label: string; detail: string }[] = [
    { value: 'classic', label: '经典', detail: '纯色背景' },
    { value: 'cloud-frost', label: '云海 · 磨砂', detail: '柔和玻璃，清晰阅读' },
    { value: 'cloud-clear', label: '云海 · 通透', detail: '更多背景，轻盈透明' },
]
export function GlassThemePicker() {
    const { theme, setTheme } = useGlassTheme()
    return <div className="px-3 py-4">
        <div className="mb-1 text-sm font-medium">背景与玻璃主题</div>
        <p className="mb-3 text-xs text-[var(--app-hint)]">使用你的云海照片，适配上方的浅色／深色外观；选择保存在当前浏览器。</p>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="背景与玻璃主题">
            {options.map(option => <button key={option.value} type="button" aria-pressed={theme === option.value} onClick={() => setTheme(option.value)}
                className={`overflow-hidden rounded-xl border text-left transition-colors ${theme === option.value ? 'border-[var(--app-link)] ring-1 ring-[var(--app-link)]' : 'border-[var(--app-border)]'}`}>
                <div className="h-16 p-2" style={option.value === 'classic' ? { background: 'var(--app-secondary-bg)' } : { backgroundImage: `url(${cloud})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                    <div className="h-full rounded-md border border-white/40" style={{ background: option.value === 'cloud-clear' ? 'rgba(239,247,255,.3)' : 'rgba(239,247,255,.7)', backdropFilter: option.value === 'classic' ? undefined : 'blur(5px)' }} />
                </div>
                <div className="px-2 py-2 text-xs font-medium">{option.label}</div>
                <div className="px-2 pb-2 text-[10px] text-[var(--app-hint)]">{option.detail}</div>
            </button>)}
        </div>
    </div>
}
