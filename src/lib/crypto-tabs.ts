export type CryptoTab = 'agent' | 't212' | 'positions' | 'signals' | 'journal'

export const CRYPTO_TABS: CryptoTab[] = ['agent', 't212', 'positions', 'signals', 'journal']

export function isCryptoTab(value: unknown): value is CryptoTab {
  return typeof value === 'string' && (CRYPTO_TABS as string[]).includes(value)
}

export const CRYPTO_TAB_EVENT = 'crypto-desk-tab'

export function goToCryptoTab(tab: CryptoTab) {
  window.dispatchEvent(new CustomEvent(CRYPTO_TAB_EVENT, { detail: tab }))
}
