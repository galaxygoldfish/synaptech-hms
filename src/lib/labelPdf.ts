import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

// US Letter, the standard size for a home/office printer.
const PAGE_SIZE_IN = { width: 8.5, height: 11 }

// Both labels share the same source width, so printing them at this width
// keeps them aligned and scales each down to an actual sticker size.
const PRINT_WIDTH_IN = 2.5
const LABEL_GAP_IN = 0.3
const PAGE_MARGIN_IN = 0.4

interface RenderedLabel {
  dataUrl: string
  width: number
  height: number
}

function scaledHeight(label: RenderedLabel): number {
  const aspectRatio = label.height / label.width
  return PRINT_WIDTH_IN * aspectRatio
}

async function waitForImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'))
  await Promise.all(
    images.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          }),
    ),
  )
}

// Rasterizes the element as-rendered, including its actual (possibly
// multi-line-grown) layout size — labels aren't a fixed height, since a
// long product name can wrap and push the rest of the label taller.
//
// backgroundColor is null, not white: the label itself paints its own white,
// rounded-corner card, so a white canvas backdrop would just fill in
// square corners behind it. Leaving the canvas transparent there lets the
// card's own rounded shape be the PNG's actual edge.
async function renderLabelImage(element: HTMLElement): Promise<RenderedLabel> {
  await waitForImages(element)
  const { width, height } = element.getBoundingClientRect()
  const canvas = await html2canvas(element, { scale: 2, backgroundColor: null })
  return { dataUrl: canvas.toDataURL('image/png'), width, height }
}

// Builds a single-page label PDF (QR/name label next to the barcode/serial
// label, in a row anchored to the page's top-left corner) for one hardware
// item, both scaled down to actual sticker size and rasterized from the
// live DOM elements passed in.
export async function buildItemLabelsPdf(
  docLabelEl: HTMLElement,
  barcodeLabelEl: HTMLElement,
): Promise<jsPDF> {
  const [docLabel, barcodeLabel] = await Promise.all([
    renderLabelImage(docLabelEl),
    renderLabelImage(barcodeLabelEl),
  ])

  const docHeightIn = scaledHeight(docLabel)
  const barcodeHeightIn = scaledHeight(barcodeLabel)

  const docX = PAGE_MARGIN_IN
  const barcodeX = PAGE_MARGIN_IN + PRINT_WIDTH_IN + LABEL_GAP_IN
  const y = PAGE_MARGIN_IN

  const pdf = new jsPDF({
    unit: 'in',
    format: [PAGE_SIZE_IN.width, PAGE_SIZE_IN.height],
  })
  pdf.addImage(docLabel.dataUrl, 'PNG', docX, y, PRINT_WIDTH_IN, docHeightIn)
  pdf.addImage(barcodeLabel.dataUrl, 'PNG', barcodeX, y, PRINT_WIDTH_IN, barcodeHeightIn)

  return pdf
}

export function downloadLabelsPdf(pdf: jsPDF, filename: string): void {
  pdf.save(filename)
}

export function printLabelsPdf(pdf: jsPDF): void {
  pdf.autoPrint()
  window.open(pdf.output('bloburl'), '_blank')
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  // Firefox and Safari only fire the click reliably once the anchor is in
  // the document, unlike Chrome.
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Rasterizes each label to its own PNG (same rounded card, white background
// as on screen) and downloads them as two separate files, rather than the
// single combined PDF buildItemLabelsPdf produces. The gap between the two
// downloads is load-bearing: Chrome treats several `a.click()` downloads
// fired back-to-back in the same tick as one "automatic multi-download" and
// silently blocks all but the first, so the second must start after a beat.
export async function downloadItemLabelsAsPngs(
  docLabelEl: HTMLElement,
  barcodeLabelEl: HTMLElement,
  filenames: { doc: string; barcode: string },
): Promise<void> {
  const [docLabel, barcodeLabel] = await Promise.all([
    renderLabelImage(docLabelEl),
    renderLabelImage(barcodeLabelEl),
  ])

  downloadDataUrl(docLabel.dataUrl, filenames.doc)
  await delay(300)
  downloadDataUrl(barcodeLabel.dataUrl, filenames.barcode)
}
