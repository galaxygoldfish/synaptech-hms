import { supabase } from './supabase'
import { locateSerialNumberCell, SECTION_10_FIELD_LAYOUT } from './loanAgreementPdf'

const LOAN_AGREEMENTS_BUCKET = 'loan-agreements'

// Same body text color as the rest of the agreement — see BODY in
// loanAgreementPdf.ts. Not imported directly since that file works in
// jsPDF's 0-255 color scale and pdf-lib's rgb() wants 0-1.
const BODY_RGB = [26 / 255, 26 / 255, 26 / 255] as const

const IN_TO_PT = 72

// pdf-lib is loaded on first use rather than imported statically: it's only
// needed at hand-off, and keeping it out of the main bundle keeps every other
// page light. The hand-off screen calls preloadApprovalPdfLib() when it
// opens, so it's ready before the admin confirms.
let pdfLib: Promise<typeof import('pdf-lib')> | null = null

function loadPdfLib() {
  pdfLib ??= import('pdf-lib').catch((error) => {
    pdfLib = null
    throw error
  })
  return pdfLib
}

export function preloadApprovalPdfLib(): void {
  loadPdfLib().catch(() => {
    // Retried on use; the failure is reported there.
  })
}

const APPROVED_SUFFIX = '-approved.pdf'

/** Whether an agreement path is a stamped copy (see stampApprovedAgreement) —
    i.e. whether that item has already been handed off. */
export function isApprovedAgreementPath(path: string): boolean {
  return path.toLowerCase().endsWith(APPROVED_SUFFIX)
}

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
  const { pdf, paintValueCell } = await openAgreement(input.agreementUrl)

  // Section 10 is always the last page — see AgreementWriter.newPage() in
  // loanAgreementPdf.ts, called immediately before that section and never
  // followed by anything else.
  const pages = pdf.getPages()
  const page = pages[pages.length - 1]
  const { rows } = SECTION_10_FIELD_LAYOUT
  const drawValue = (rowTopIn: number, text: string) =>
    paintValueCell(page, { ...SECTION_10_FIELD_LAYOUT, rowTopIn }, text)

  drawValue(rows.receivedDate.rowTopIn, formatReceivedDate(input.receivedAt))
  drawValue(rows.receivedTime.rowTopIn, formatReceivedTime(input.receivedAt))
  drawValue(rows.managerName.rowTopIn, input.managerName)

  const approvedPath = input.agreementPath.replace(/\.pdf$/i, '') + APPROVED_SUFFIX
  // Re-stamping (an admin repeating a hand-off after a failure part-way)
  // replaces the stamped copy rather than erroring on the existing object.
  await uploadAgreement(approvedPath, await pdf.save())
  return approvedPath
}

export interface RestampAgreementSerialInput {
  /** A signed URL for the agreement as it stands, fetched by the caller. */
  agreementUrl: string
  /** Its object path, which the new copy is named after. */
  agreementPath: string
  /** Printed into section 2's "Hardware product serial number" cell. */
  serialNumber: string
}

// What restampAgreementSerial adds to a path. Matched (and replaced) on a
// second switch, so switching twice names the copy after the latest unit
// rather than stacking one suffix per switch.
const UNIT_SUFFIX = /(-unit-[A-Za-z0-9-]+)?\.pdf$/i

/**
 * Writes a different serial number into section 2 of a member's signed
 * agreement, for an admin switching which unit a request is for before it's
 * handed over (switchLoanItemUnit in loanRequests.ts). Everything else on
 * the page — what the member filled in and signed — is left exactly as it
 * was; only the one cell is painted over, the same way section 10 is
 * filled in at hand-off.
 *
 * Like the stamped copy, this never overwrites what it read: the new copy
 * gets its own path, so the agreement as the member signed it, for the unit
 * they were first given, stays in the bucket. Returns the new path.
 */
export async function restampAgreementSerial(input: RestampAgreementSerialInput): Promise<string> {
  const [{ pdf, paintValueCell }, cell] = await Promise.all([
    openAgreement(input.agreementUrl),
    locateSerialNumberCell(),
  ])

  paintValueCell(pdf.getPage(cell.pageIndex), cell, input.serialNumber)

  const slug = input.serialNumber.replace(/[^A-Za-z0-9-]+/g, '-')
  const path = input.agreementPath.replace(UNIT_SUFFIX, '') + `-unit-${slug}.pdf`
  // Upserted: switching away and back to the same unit lands on a path that
  // already exists.
  await uploadAgreement(path, await pdf.save())
  return path
}

interface ValueCell {
  pageHeightIn: number
  valueXIn: number
  valueWidthIn: number
  rowHeightIn: number
  rowTopIn: number
  fontSize: number
}

async function openAgreement(agreementUrl: string) {
  const response = await fetch(agreementUrl)
  if (!response.ok) throw new Error('Agreement download failed')

  const { PDFDocument, StandardFonts, rgb } = await loadPdfLib()
  const BODY_COLOR = rgb(...BODY_RGB)

  const pdf = await PDFDocument.load(await response.arrayBuffer())
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const cellInsetPt = 1.5 // stays clear of the cell's own border

  // Covers a keyValueTable value cell's existing text and writes new text
  // in the same spot. Coordinates come in as jsPDF inches from the top of
  // the page (see loanAgreementPdf.ts) and are converted here.
  function paintValueCell(page: ReturnType<typeof pdf.getPage>, cell: ValueCell, text: string) {
    const pageHeightPt = cell.pageHeightIn * IN_TO_PT
    const valueXPt = cell.valueXIn * IN_TO_PT
    const valueWidthPt = cell.valueWidthIn * IN_TO_PT
    const rowHeightPt = cell.rowHeightIn * IN_TO_PT
    const rowTopPt = cell.rowTopIn * IN_TO_PT

    // pdf-lib's y is measured from the bottom of the page; jsPDF's rowTopIn
    // is measured from the top, so flip it. keyValueTable's value cell has
    // no fill (see loanAgreementPdf.ts), so a plain white rect — inset
    // slightly so it doesn't paint over the cell's border — cleanly covers
    // whatever was there before the new value is drawn on top of it.
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
    const baselinePt = rowCenterPt - cell.fontSize * 0.32
    page.drawText(text, { x: valueXPt, y: baselinePt, size: cell.fontSize, font, color: BODY_COLOR })
  }

  return { pdf, paintValueCell }
}

async function uploadAgreement(path: string, bytes: Uint8Array): Promise<void> {
  // pdf-lib hands back a Uint8Array that may be a view onto a larger buffer;
  // Blob needs its own exactly-sized one.
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)

  const { error } = await supabase.storage
    .from(LOAN_AGREEMENTS_BUCKET)
    .upload(path, new Blob([buffer], { type: 'application/pdf' }), { contentType: 'application/pdf', upsert: true })
  if (error) throw error
}
