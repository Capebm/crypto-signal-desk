/** Injected at build time from package.json + timestamp (vite.config.ts). */
export const APP_VERSION = import.meta.env.VITE_APP_VERSION
export const BUILD_TIME = import.meta.env.VITE_BUILD_TIME

export function formatBuildTime(iso: string): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('pt-PT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Lisbon',
    }).format(new Date(iso))
  } catch {
    return iso.slice(0, 16)
  }
}
