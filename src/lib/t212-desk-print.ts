import { fmtPrint, type T212LivePrintInput } from './t212-live-confirm'

const HEADER = 92
const LABEL = 34
const GAP = 8
const FOOTER = 36

export function deskPrintSheetSize(panelWidth: number, panelHeight: number) {
  const width = Math.max(panelWidth, 640)
  const height = HEADER + LABEL + panelHeight + GAP + LABEL + panelHeight + FOOTER
  return { width, height, header: HEADER, label: LABEL, gap: GAP, footer: FOOTER }
}

const fit = (source: HTMLCanvasElement, width: number, height: number) => {
  const scale = Math.min(width / source.width, height / source.height)
  const w = source.width * scale
  const h = source.height * scale
  return { w, h, x: (width - w) / 2, y: (height - h) / 2 }
}

/** Junta os dois screenshots do desk numa só imagem legendada para o Claude. */
export function composeDeskLivePrint(
  fiveMin: HTMLCanvasElement,
  oneMin: HTMLCanvasElement,
  input: T212LivePrintInput & { takenAt: string },
): HTMLCanvasElement {
  const panelW = Math.max(fiveMin.width, oneMin.width, 640)
  const panelH = Math.max(fiveMin.height, oneMin.height, 240)
  const sheet = deskPrintSheetSize(panelW, panelH)
  const canvas = document.createElement('canvas')
  canvas.width = sheet.width
  canvas.height = sheet.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponível')

  ctx.fillStyle = '#05070c'
  ctx.fillRect(0, 0, sheet.width, sheet.height)

  ctx.fillStyle = '#d7e2ef'
  ctx.font = '700 22px ui-sans-serif, system-ui, sans-serif'
  ctx.fillText(`DESK (não T212) · ${input.ticker} · ${input.sideLabel === 'Sell' ? 'SHORT' : 'LONG'}`, 16, 32)
  ctx.fillStyle = '#8aa0b8'
  ctx.font = '600 16px ui-sans-serif, system-ui, sans-serif'
  ctx.fillText(
    `Entrada ${fmtPrint(input.entry)} · Stop ${fmtPrint(input.stop)} · TP ${fmtPrint(input.target)} · ${input.takenAt}`,
    16,
    58,
  )
  ctx.fillStyle = '#c9a227'
  ctx.font = '700 13px ui-sans-serif, system-ui, sans-serif'
  ctx.fillText('Pack gerado pela app — cola isto + T212 5m depois T212 1m. Sem desenhos na T212.', 16, 80)

  const paintPanel = (title: string, source: HTMLCanvasElement, top: number) => {
    ctx.fillStyle = '#c9a227'
    ctx.fillRect(0, top, sheet.width, LABEL)
    ctx.fillStyle = '#05070c'
    ctx.font = '800 18px ui-sans-serif, system-ui, sans-serif'
    ctx.fillText(title, 16, top + 24)
    const y = top + LABEL
    ctx.fillStyle = '#0b1220'
    ctx.fillRect(0, y, sheet.width, panelH)
    const box = fit(source, sheet.width, panelH)
    ctx.drawImage(source, box.x, y + box.y, box.w, box.h)
  }

  paintPanel('DESK 5m', fiveMin, HEADER)
  paintPanel('DESK 1m', oneMin, HEADER + LABEL + panelH + GAP)

  ctx.fillStyle = '#8aa0b8'
  ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif'
  ctx.fillText('A seguir: foto T212 5m, depois foto T212 1m. 1D/1W na T212 é alcance, não vela.', 16, sheet.height - 12)

  return canvas
}

const canvasPng = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) resolve(blob)
    else reject(new Error('Falha a gerar PNG'))
  }, 'image/png')
})

export type DeskPrintDelivery = 'shared' | 'clipboard' | 'download'

/** Copia o texto e entrega a imagem (partilha no telemóvel, clipboard ou download). */
export async function deliverDeskPrintPack(
  canvas: HTMLCanvasElement,
  text: string,
  filename: string,
): Promise<DeskPrintDelivery> {
  const blob = await canvasPng(canvas)
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    /* o texto ainda vai no share, se existir */
  }

  const file = new File([blob], filename, { type: 'image/png' })
  const shareData: ShareData = { files: [file], text, title: filename }
  let sharedOk = false
  try {
    sharedOk = typeof navigator.canShare === 'function' && navigator.canShare(shareData)
  } catch {
    sharedOk = false
  }
  if (sharedOk) {
    try {
      await navigator.share(shareData)
      return 'shared'
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'shared'
    }
  }

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': blob,
        'text/plain': new Blob([text], { type: 'text/plain' }),
      }),
    ])
    return 'clipboard'
  } catch {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 4_000)
    return 'download'
  }
}
