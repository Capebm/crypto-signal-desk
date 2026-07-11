export const PRESET_SEARCHES = [
  { label: 'Lotes de roupa', query: 'lote roupa' },
  { label: 'Packs sapatilhas', query: 'pack sapatilhas' },
  { label: 'Lotes livros', query: 'lote livros' },
  { label: 'Conjuntos bebé', query: 'conjunto bebé' },
  { label: 'Lotes videojogos', query: 'lote videojogos' },
  { label: 'Packs perfumes', query: 'pack perfumes' },
]

export function formatEuro(value: number): string {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value)
}

export function formatPct(value: number): string {
  return `${value.toFixed(0)}%`
}
