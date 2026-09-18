import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { supabase } from './supabase'

const LOAN_AGREEMENTS_BUCKET = 'loan-agreements'

export interface StampApprovedAgreementInput {
  /** A signed URL for the member's agreement, fetched by the caller. */
  agreementUrl: string
  /** Its object path, which the approved copy is named after. */
  agreementPath: string
  itemName: string
  serialNumber: string
  /** The admin attesting that the agreement was signed correctly. */
  adminName: string
  approvedAt: Date
}

/**
 * Appends a Certificate of Approval page to a member's signed agreement and
 * uploads the result alongside the original, returning the new object path.
 *
 * This is the admin half of the signature trail: the member signs the
 * agreement at checkout, and an admin attests at hand-off that they signed
 * it correctly (see the checkout process — "Admins also attest that the user
 * has signed the contract correctly"). Keeping both in one PDF means the
 * club's record of a loan is a single file, not a file plus a database row
 * someone has to know to go looking for.
 *
 * The original object is never overwritten: the approved copy gets its own
 * `-approved.pdf` path, so what the member actually signed stays retrievable
 * even after an admin has stamped it.
 */
export async function stampApprovedAgreement(input: StampApprovedAgreementInput): Promise<string> {
  const response = await fetch(input.agreementUrl)
  if (!response.ok) throw new Error('Agreement download failed')

  const pdf = await PDFDocument.load(await response.arrayBuffer())
  const page = pdf.addPage([595.28, 841.89])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold)
  const approvedDate = input.approvedAt.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  page.drawText('Certificate of Approval', {
    x: 72,
    y: 720,
    size: 24,
    font: boldFont,
    color: rgb(0.11, 0.3, 0.54),
  })
  page.drawText('This signed hardware loan agreement was reviewed and approved.', {
    x: 72,
    y: 665,
    size: 12,
    font,
  })
  page.drawText(`Hardware: ${input.itemName}`, { x: 72, y: 610, size: 12, font })
  page.drawText(`Serial number: ${input.serialNumber}`, { x: 72, y: 580, size: 12, font })
  page.drawText(`Approved by: ${input.adminName}`, { x: 72, y: 520, size: 12, font })
  page.drawText(`Approved on: ${approvedDate}`, { x: 72, y: 490, size: 12, font })

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
      // replaces the certificate rather than erroring on the existing object.
      upsert: true,
    })
  if (error) throw error

  return approvedPath
}
