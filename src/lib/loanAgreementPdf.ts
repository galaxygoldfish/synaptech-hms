import jsPDF from 'jspdf'
import brainLogo from '../assets/synaptech-brain.png'
import bungeeRegularFont from '../assets/fonts/Bungee-Regular.ttf?url'
import rubikRegularFont from '../assets/fonts/Rubik-Regular.ttf?url'
import rubikMediumFont from '../assets/fonts/Rubik-Medium.ttf?url'
import {
  AGREEMENT_INTRO_PARAGRAPHS,
  AGREEMENT_SIGNATURE_DISCLAIMER,
  AGREEMENT_STATIC_SECTIONS,
  AGREEMENT_TITLE,
  type AgreementSection,
} from './loanAgreementContent'

const PAGE_WIDTH = 8.5
const PAGE_HEIGHT = 11
const MARGIN_X = 0.75
const MARGIN_TOP = 0.75
const MARGIN_BOTTOM = 0.75
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2
const LINE_HEIGHT = 0.185

// jsPDF's default line width (~0.2) is meant for a small-unit doc — with
// this doc's `unit: 'in'`, an unset line width renders as a 0.2in-thick
// (nearly quarter-inch) stroke, which is why every table border looked
// like a solid black fill. Set explicitly, in inches, to a normal hairline.
const LINE_WIDTH = 0.0075

// Registered under jsPDF's conventional 'bold'/'normal' style keys so the
// rest of this file's setFont() calls read normally — 'bold' here just
// means "the Medium weight file", since that's the heaviest weight the
// app itself loads (see index.html's Google Fonts link).
const FONT_BODY = 'Rubik'
const FONT_DISPLAY = 'Bungee'

type Rgb = [number, number, number]

const NAVY: Rgb = [11, 42, 84]
const BRAND_BLUE: Rgb = [16, 86, 146]
const BODY: Rgb = [26, 26, 26]
const TABLE_HEADER_FILL: Rgb = [214, 229, 248]
const BORDER: Rgb = [0, 0, 0]

async function fetchAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url)
  const blob = await response.blob()
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function fetchAsBase64(url: string): Promise<string> {
  const dataUrl = await fetchAsDataUrl(url)
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}

async function registerFonts(doc: jsPDF): Promise<void> {
  const [bungee, rubikRegular, rubikMedium] = await Promise.all([
    fetchAsBase64(bungeeRegularFont),
    fetchAsBase64(rubikRegularFont),
    fetchAsBase64(rubikMediumFont),
  ])

  doc.addFileToVFS('Bungee-Regular.ttf', bungee)
  doc.addFont('Bungee-Regular.ttf', FONT_DISPLAY, 'normal')

  doc.addFileToVFS('Rubik-Regular.ttf', rubikRegular)
  doc.addFont('Rubik-Regular.ttf', FONT_BODY, 'normal')

  doc.addFileToVFS('Rubik-Medium.ttf', rubikMedium)
  doc.addFont('Rubik-Medium.ttf', FONT_BODY, 'bold')
}

// Walks a jsPDF document top-to-bottom, wrapping to a new page (and
// redrawing the header) whenever the next block would overflow.
class AgreementWriter {
  doc: jsPDF
  y = MARGIN_TOP
  private logo: string | null

  constructor(doc: jsPDF, logo: string | null) {
    this.doc = doc
    this.logo = logo
    this.doc.setLineWidth(LINE_WIDTH)
    this.drawHeader()
  }

  private drawHeader() {
    if (this.logo) {
      this.doc.addImage(this.logo, 'PNG', MARGIN_X, this.y, 0.32, 0.26)
    }
    this.doc.setFont(FONT_DISPLAY, 'normal')
    this.doc.setFontSize(13)
    this.doc.setTextColor(...BRAND_BLUE)
    this.doc.text('SYNAPTECH', MARGIN_X + (this.logo ? 0.42 : 0), this.y + 0.2)
    this.y += 0.85
  }

  private ensureSpace(height: number) {
    if (this.y + height > PAGE_HEIGHT - MARGIN_BOTTOM) {
      this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      this.y = MARGIN_TOP
      this.drawHeader()
    }
  }

  // ensureSpace() can redraw the header mid-block (Bungee, brand blue,
  // size 13) when it triggers a page break — callers that set the body
  // font before calling it must re-apply this right before drawing text,
  // not just once at the top of the method, or a page-broken paragraph or
  // list item silently inherits the header's font/color for its remainder.
  private setBodyFont(bold = false, size = 10.5) {
    this.doc.setFont(FONT_BODY, bold ? 'bold' : 'normal')
    this.doc.setFontSize(size)
    this.doc.setTextColor(...BODY)
  }

  title(text: string) {
    this.ensureSpace(0.5)
    this.doc.setFont(FONT_DISPLAY, 'normal')
    this.doc.setFontSize(20)
    this.doc.setTextColor(...NAVY)
    this.doc.text(text, MARGIN_X, this.y)
    this.y += 0.55
  }

  heading(text: string) {
    this.ensureSpace(0.4)
    this.doc.setFont(FONT_BODY, 'bold')
    this.doc.setFontSize(12.5)
    this.doc.setTextColor(...BODY)
    this.doc.text(text, MARGIN_X, this.y)
    this.y += 0.38
  }

  paragraph(text: string, gapAfter = 0.32) {
    this.setBodyFont()
    const lines = this.doc.splitTextToSize(text, CONTENT_WIDTH) as string[]
    this.ensureSpace(lines.length * LINE_HEIGHT)
    this.setBodyFont()
    this.doc.text(lines, MARGIN_X, this.y)
    this.y += lines.length * LINE_HEIGHT + gapAfter
  }

  numberedList(items: string[], gapAfter = 0.32) {
    const indent = 0.24
    for (const [index, item] of items.entries()) {
      this.setBodyFont()
      const lines = this.doc.splitTextToSize(item, CONTENT_WIDTH - indent) as string[]
      this.ensureSpace(lines.length * LINE_HEIGHT)
      this.setBodyFont()
      this.doc.text(`${index + 1}.`, MARGIN_X, this.y)
      this.doc.text(lines, MARGIN_X + indent, this.y)
      this.y += lines.length * LINE_HEIGHT
    }
    this.y += gapAfter
  }

  keyValueTable(rows: [string, string][], labelWidth = 2.1) {
    const rowHeight = 0.34
    const valueWidth = CONTENT_WIDTH - labelWidth
    this.ensureSpace(rows.length * rowHeight)
    for (const [label, value] of rows) {
      this.doc.setFillColor(...TABLE_HEADER_FILL)
      this.doc.setDrawColor(...BORDER)
      this.doc.rect(MARGIN_X, this.y, labelWidth, rowHeight, 'FD')
      this.doc.rect(MARGIN_X + labelWidth, this.y, valueWidth, rowHeight, 'D')
      this.doc.setFont(FONT_BODY, 'bold')
      this.doc.setFontSize(10)
      this.doc.setTextColor(...BODY)
      this.doc.text(label, MARGIN_X + 0.1, this.y + rowHeight / 2, { baseline: 'middle' })
      this.doc.setFont(FONT_BODY, 'normal')
      this.doc.text(value || '—', MARGIN_X + labelWidth + 0.1, this.y + rowHeight / 2, { baseline: 'middle' })
      this.y += rowHeight
    }
    this.y += 0.4
  }

  gridTable(header: string[], rows: string[][], colWidths: number[], rowHeight = 0.34) {
    this.ensureSpace((rows.length + 1) * rowHeight)

    let x = MARGIN_X
    this.doc.setFont(FONT_BODY, 'bold')
    this.doc.setFontSize(10)
    header.forEach((cell, i) => {
      this.doc.setFillColor(...TABLE_HEADER_FILL)
      this.doc.setDrawColor(...BORDER)
      this.doc.rect(x, this.y, colWidths[i], rowHeight, 'FD')
      const lines = this.doc.splitTextToSize(cell, colWidths[i] - 0.16) as string[]
      this.doc.text(lines, x + colWidths[i] / 2, this.y + rowHeight / 2, { align: 'center', baseline: 'middle' })
      x += colWidths[i]
    })
    this.y += rowHeight

    this.doc.setFont(FONT_BODY, 'normal')
    for (const row of rows) {
      x = MARGIN_X
      row.forEach((cell, i) => {
        this.doc.rect(x, this.y, colWidths[i], rowHeight, 'D')
        if (cell) {
          const lines = this.doc.splitTextToSize(cell, colWidths[i] - 0.16) as string[]
          this.doc.text(lines, x + colWidths[i] / 2, this.y + rowHeight / 2, { align: 'center', baseline: 'middle' })
        }
        x += colWidths[i]
      })
      this.y += rowHeight
    }
    this.y += 0.4
  }

  // Renders a static legal section (heading + paragraphs/lists/tables)
  // from the shared content model in loanAgreementContent.ts.
  section(section: AgreementSection) {
    this.heading(section.heading)
    for (const block of section.blocks) {
      if (block.type === 'paragraph') {
        this.paragraph(block.text, block.gapAfter)
      } else if (block.type === 'list') {
        this.numberedList(block.items)
      } else {
        const ratios = block.columnRatios ?? block.header.map(() => 1)
        const ratioTotal = ratios.reduce((sum, ratio) => sum + ratio, 0)
        const colWidths = ratios.map((ratio) => (ratio / ratioTotal) * CONTENT_WIDTH)
        this.gridTable(block.header, block.rows, colWidths)
      }
    }
  }
}

export interface LoanAgreementFields {
  fullName: string
  studentId: string
  studentEmail: string
  phone: string
  address: string
  productName: string
  serialNumber: string
  loanDate: string
  returnDate: string
  replacementValue: string
  signatureName: string
  signatureDate: string
}

// Builds the Hardware Loan Agreement, pre-filled with the borrower's info
// (section 1), this specific loan's details (section 2), and the
// borrower's typed signature/date (section 9, from the in-app signing
// step) — section 10 is left blank for Hardware Managers to fill in.
export async function buildLoanAgreementPdf(fields: LoanAgreementFields): Promise<jsPDF> {
  let logo: string | null = null
  try {
    logo = await fetchAsDataUrl(brainLogo)
  } catch {
    logo = null
  }

  const doc = new jsPDF({ unit: 'in', format: [PAGE_WIDTH, PAGE_HEIGHT] })
  await registerFonts(doc)
  const w = new AgreementWriter(doc, logo)

  w.title(AGREEMENT_TITLE)
  for (const paragraph of AGREEMENT_INTRO_PARAGRAPHS) w.paragraph(paragraph)

  w.heading('1. Borrower information')
  w.keyValueTable([
    ['Full Name', fields.fullName],
    ['UW Student ID Number', fields.studentId],
    ['UW Student Email', fields.studentEmail],
    ['Phone Number', fields.phone],
    ['Address', fields.address],
  ])

  w.heading('2. Hardware checked out')
  w.keyValueTable(
    [
      ['Hardware product', fields.productName],
      ['Hardware product serial number', fields.serialNumber],
      ['Loan date', fields.loanDate],
      ['Return date', fields.returnDate],
      ['Hardware product replacement value', fields.replacementValue],
    ],
    3.1,
  )

  for (const staticSection of AGREEMENT_STATIC_SECTIONS) w.section(staticSection)

  w.heading('9. Electronic signature')
  w.paragraph(AGREEMENT_SIGNATURE_DISCLAIMER)
  w.gridTable(
    ['Borrower electronic signature', 'Date of signature'],
    [[fields.signatureName, fields.signatureDate]],
    [CONTENT_WIDTH / 2, CONTENT_WIDTH / 2],
    0.55,
  )

  w.heading('10. For internal use')
  w.paragraph('For Synaptech RSO Hardware Managers', 0.1)
  w.keyValueTable(
    [
      ['Received date', ''],
      ['Received time', ''],
      ['Receiving Hardware Manager name', ''],
    ],
    3.1,
  )

  return doc
}

export function downloadLoanAgreementPdf(pdf: jsPDF, filename: string): void {
  pdf.save(filename)
}
