import jsPDF from 'jspdf'
import brainLogo from '../assets/synaptech-brain.png'
import bungeeRegularFont from '../assets/fonts/Bungee-Regular.ttf?url'
import rubikRegularFont from '../assets/fonts/Rubik-Regular.ttf?url'
import rubikMediumFont from '../assets/fonts/Rubik-Medium.ttf?url'

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
}

// Builds the Hardware Loan Agreement, pre-filled with the borrower's info
// (section 1) and this specific loan's details (section 2). Section 9's
// signature table is left blank — the borrower fills that in themselves
// after downloading, then re-uploads the signed copy.
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

  w.title('HARDWARE LOAN AGREEMENT')
  w.paragraph('Synaptech Registered Student Organization (RSO) at University of Washington (UW), Seattle')
  w.paragraph(
    'This agreement is between Synaptech RSO (the "Club"), which owns the hardware described below, ' +
      'and the Borrower, named below. The Club lends the listed hardware to the Borrower under these terms.',
  )

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

  w.heading('3. Loan period')
  w.paragraph(
    'The product loan period is from the loan date until the return date listed in section 2. The product ' +
      'will be handed off to the Borrower on or after the loan date. The Borrower must return the hardware ' +
      'to the Club on or before the return date. If the Borrower should need an extension of the loan period, ' +
      'they must contact the Synaptech RSO Hardware Managers, and sign a new Hardware Loan Agreement. Until a ' +
      'new form is signed and on file with the extended return date, the extension is not considered official. ' +
      'Failure to comply will result in disciplinary action taken by the Club on the Borrower.',
  )

  w.heading('4. Borrower responsibilities')
  w.paragraph('The Borrower must adhere to each of the following responsibilities', 0.1)
  w.numberedList([
    'Keep the hardware product in their possession. Do not loan or sell it to anyone else.',
    'Store the hardware product securely.',
    'Promptly report all damage, loss, theft or malfunction to the Synaptech RSO Hardware Managers.',
  ])

  w.heading('5. Damage to loaned hardware product')
  w.paragraph(
    'A loaned hardware product is considered damaged when it is returned but significantly impaired in ' +
      "function, cosmetic appearance, or components are missing. If the hardware product is damaged by the " +
      "Borrower's misuse, negligence, or failure to comply with the responsibilities outlined in section 4, " +
      'the Borrower must cover the repair or replacement cost if the product cannot be reasonably repaired. ' +
      'Normal wear and tear from intended usage is not charged.',
  )

  w.heading('6. Scaled liability cap')
  w.paragraph(
    "The lesser of the actual cost or the cap for the item's value band below. Applies to accidental or " +
      'negligent damage only, not theft.',
  )
  w.gridTable(
    ['Hardware product value', 'Borrower liability cap'],
    [
      ['Under $500', '100% of replacement value'],
      ['$500 - $2000', '50% of replacement value'],
      ['$2001 - $10,000', '25% of replacement value, maximum of $1500'],
    ],
    [2.6, CONTENT_WIDTH - 2.6],
  )

  w.heading('7. Non-return & Theft')
  w.paragraph('Overdue trigger - hardware is declared overdue when BOTH occur:', 0.1)
  w.numberedList([
    'Synaptech RSO Hardware Managers have made three (3) documented contact attempts',
    'At least thirty (30) days have passed since the return date with no return and no official extension',
  ])
  w.paragraph('Consequences of overdue hardware are escalating:', 0.1)
  w.numberedList([
    "Internal: Immediate ban from future checkouts and item is logged against the Borrower's record",
    'Student conduct: Referral to the University of Washington Office of Community Standards & Student ' +
      'Conduct for failure to return Club property.',
    'Further escalation: The Club may pursue the full loaned hardware product replacement value in a small ' +
      'claims court or file with University of Washington Police. The section 6 scaled liability cap does ' +
      'NOT apply - the Borrower owes the full replacement value.',
  ])

  w.heading('8. General')
  w.paragraph(
    'Governed by Washington State law and applicable University of Washington policy. Photos documenting ' +
      'checkout conditions may be attached. If any provision is unenforceable, the rest remain in effect.',
  )

  w.heading('9. Electronic signature')
  w.paragraph(
    'By typing my name below and submitting this form to the Synaptech RSO Hardware Managers, I adopt this ' +
      'as my legally binding electronic signature and agree to all terms above, including the Section 6 ' +
      'damage cap and the Section 7 theft / non-return consequences.',
  )
  w.gridTable(
    ['Borrower signature', 'Date of signature', 'Borrower printed name'],
    [['', '', '']],
    [CONTENT_WIDTH / 3, CONTENT_WIDTH / 3, CONTENT_WIDTH / 3],
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
