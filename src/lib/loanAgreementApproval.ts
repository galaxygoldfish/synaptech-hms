import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { supabase } from './supabase'
import { SECTION_10_FIELD_LAYOUT } from './loanAgreementPdf'

const LOAN_AGREEMENTS_BUCKET = 'loan-agreements'

// Same body text color as the rest of the agreement — see BODY in
// loanAgreementPdf.ts. Not imported directly since that file works in
// jsPDF's 0-255 color scale and pdf-lib's rgb() wants 0-1.
const BODY_COLOR = rgb(26 / 255, 26 / 255, 26 / 255)

const IN_TO_PT = 72

export interface StampApprovedAgreementInput {
  /** A signed URL for the member's agreement, fetched by the caller. */
  agreementUrl: string
  /** Its object path, which the approved copy is named after. */
  agreementPath: string
  /** Printed into section 10's "Receiving Hardware Manager name" cell. */
  managerName: string
  /** Printed into section 10's "Received date" / "Received time" cells. */
  receivedAt: Date
}

function formatReceivedDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatReceivedTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/**
 * Fills in section 10 ("For internal use") of a member's signed agreement —
 * received date, received time, and the receiving Hardware Manager's name —
 * and re-uploads the result alongside the original, returning the new
 * object path.
 *
 * This is the admin half of the signature trail: the member signs the
 * agreement at checkout (section 9), and an admin fills in section 10 at
 * hand-off to attest the hardware was actually received. The two live on
 * one PDF, in the one place the printed form already asks for this — a
 * separate "Certificate of Approval" page used to get appended instead,
 * which duplicated section 10 with a second, differently-formatted record
 * of the same attestation rather than completing the form the member
 * already signed.
 *
 * Section 10's table isn't drawn fresh here — it's already on the page,
 * with "—" placeholders in its three value cells (see keyValueTable in
 * loanAgreementPdf.ts). AgreementWriter.newPage() forces that section onto
 * its own page with nothing variable-length above it, so
 * SECTION_10_FIELD_LAYOUT can say exactly where those cells are without
 * this file re-running any layout code — it just paints over each
 * placeholder and writes the real value in the same spot.
 *
 * The original object is never overwritten: the stamped copy gets its own
 * `-approved.pdf` path, so what the member actually signed stays
 * retrievable even after an admin has filled in section 10.
 */
export async function stampApprovedAgreement(input: StampApprovedAgreementInput): Promise<string> {
  const response = await fetch(input.agreementUrl)
  if (!response.ok) throw new Error('Agreement download failed')

  const pdf = await PDFDocument.load(await response.arrayBuffer())
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  // Section 10 is always the last page — see AgreementWriter.newPage() in
  // loanAgreementPdf.ts, called immediately before that section and never
  // followed by anything else.
  const pages = pdf.getPages()
  const page = pages[pages.length - 1]
  const { valueXIn, valueWidthIn, rowHeightIn, fontSize, rows } = SECTION_10_FIELD_LAYOUT
  const pageHeightPt = SECTION_10_FIELD_LAYOUT.pageHeightIn * IN_TO_PT
  const valueXPt = valueXIn * IN_TO_PT
  const valueWidthPt = valueWidthIn * IN_TO_PT
  const rowHeightPt = rowHeightIn * IN_TO_PT
  const cellInsetPt = 1.5 // stays clear of the cell's own border

  function drawValue(rowTopIn: number, text: string) {
    const rowTopPt = rowTopIn * IN_TO_PT
    // pdf-lib's y is measured from the bottom of the page; jsPDF's rowTopIn
    // is measured from the top, so flip it. keyValueTable's value cell has
    // no fill (see loanAgreementPdf.ts), so a plain white rect — inset
    // slightly so it doesn't paint over the cell's border — cleanly covers
    // the "—" placeholder before the real value is drawn on top of it.
    const cellTopPt = pageHeightPt - rowTopPt
    page.drawRectangle({
      x: valueXPt - 0.1 * IN_TO_PT + cellInsetPt,
      y: cellTopPt - rowHeightPt + cellInsetPt,
      width: valueWidthPt - 0.1 * IN_TO_PT - cellInsetPt * 2,
      height: rowHeightPt - cellInsetPt * 2,
      color: rgb(1, 1, 1),
    })

    // jsPDF drew the label at this same x with `baseline: 'middle'`, which
    // centers on font metrics rather than a fixed offset; pdf-lib has no
    // equivalent, so this approximates it by nudging the baseline down from
    // the row's vertical center by a fraction of the font size — close
    // enough at this row height (0.34in) that the exact fraction doesn't
    // read as misaligned.
    const rowCenterPt = cellTopPt - rowHeightPt / 2
    const baselinePt = rowCenterPt - fontSize * 0.32
    page.drawText(text, { x: valueXPt, y: baselinePt, size: fontSize, font, color: BODY_COLOR })
  }

  drawValue(rows.receivedDate.rowTopIn, formatReceivedDate(input.receivedAt))
  drawValue(rows.receivedTime.rowTopIn, formatReceivedTime(input.receivedAt))
  drawValue(rows.managerName.rowTopIn, input.managerName)

  // pdf-lib hands back a Uint8Array that may be a view onto a larger buffer;
  // Blob needs its own exactly-sized one.
  const approvedBytes = await pdf.save()
  const approvedBuffer = new ArrayBuffer(approvedBytes.byteLength)
  new Uint8Array(approvedBuffer).set(approvedBytes)

  const approvedPath = input.agreementPath.replace(/\.pdf$/i, '') + '-approved.pdf'
  const { error } = await supabase.storage
    .from(LOAN_AGREEMENTS_BUCKET)
    .upload(approvedPath, new Blob([approvedBuffer], { type: 'application/pdf' }), {
      contentType: 'application/pdf',
      // Re-stamping (an admin repeating a hand-off after a failure part-way)
      // replaces the stamped copy rather than erroring on the existing object.
      upsert: true,
    })
  if (error) throw error

  return approvedPath
}
