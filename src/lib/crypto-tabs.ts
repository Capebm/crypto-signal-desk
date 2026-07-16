export type CryptoTab = 'agent' | 'journal'

export const CRYPTO_TAB_EVENT = 'crypto-desk-tab'

export function goToCryptoTab(tab: CryptoTab) {
  window.dispatchEvent(new CustomEvent(CRYPTO_TAB_EVENT, { detail: tab }))
}
