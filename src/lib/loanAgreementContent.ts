// Single source of truth for the Hardware Loan Agreement's static legal
// text (sections 3-8, plus the title intro and the section 9 disclaimer).
// Both the PDF generator (loanAgreementPdf.ts) and the in-app HTML
// preview (AgreementPreview.tsx) render from this so the two can't drift.

export interface AgreementParagraphBlock {
  type: 'paragraph'
  text: string
  gapAfter?: number
}

export interface AgreementListBlock {
  type: 'list'
  items: string[]
}

export interface AgreementTableBlock {
  type: 'table'
  header: string[]
  rows: string[][]
  // Relative column widths (need not sum to 1) — omit for an even split.
  columnRatios?: number[]
}

export type AgreementBlock = AgreementParagraphBlock | AgreementListBlock | AgreementTableBlock

export interface AgreementSection {
  heading: string
  blocks: AgreementBlock[]
}

export const AGREEMENT_TITLE = 'HARDWARE LOAN AGREEMENT'

export const AGREEMENT_INTRO_PARAGRAPHS: string[] = [
  'Synaptech Registered Student Organization (RSO) at University of Washington (UW), Seattle',
  'This agreement is between Synaptech RSO (the "Club"), which owns the hardware described below, ' +
    'and the Borrower, named below. The Club lends the listed hardware to the Borrower under these terms.',
]

export const AGREEMENT_SIGNATURE_DISCLAIMER =
  'By typing my name below and submitting this form to the Synaptech RSO Hardware Managers, I adopt this ' +
  'as my legally binding electronic signature and agree to all terms above, including the Section 6 ' +
  'damage cap and the Section 7 theft / non-return consequences.'

export const AGREEMENT_STATIC_SECTIONS: AgreementSection[] = [
  {
    heading: '3. Loan period',
    blocks: [
      {
        type: 'paragraph',
        text:
          'The product loan period is from the loan date until the return date listed in section 2. The product ' +
          'will be handed off to the Borrower on or after the loan date. The Borrower must return the hardware ' +
          'to the Club on or before the return date. If the Borrower should need an extension of the loan period, ' +
          'they must contact the Synaptech RSO Hardware Managers, and sign a new Hardware Loan Agreement. Until a ' +
          'new form is signed and on file with the extended return date, the extension is not considered official. ' +
          'Failure to comply will result in disciplinary action taken by the Club on the Borrower.',
      },
    ],
  },
  {
    heading: '4. Borrower responsibilities',
    blocks: [
      { type: 'paragraph', text: 'The Borrower must adhere to each of the following responsibilities', gapAfter: 0.1 },
      {
        type: 'list',
        items: [
          'Keep the hardware product in their possession. Do not loan or sell it to anyone else.',
          'Store the hardware product securely.',
          'Promptly report all damage, loss, theft or malfunction to the Synaptech RSO Hardware Managers.',
        ],
      },
    ],
  },
  {
    heading: '5. Damage to loaned hardware product',
    blocks: [
      {
        type: 'paragraph',
        text:
          'A loaned hardware product is considered damaged when it is returned but significantly impaired in ' +
          "function, cosmetic appearance, or components are missing. If the hardware product is damaged by the " +
          "Borrower's misuse, negligence, or failure to comply with the responsibilities outlined in section 4, " +
          'the Borrower must cover the repair or replacement cost if the product cannot be reasonably repaired. ' +
          'Normal wear and tear from intended usage is not charged.',
      },
    ],
  },
  {
    heading: '6. Scaled liability cap',
    blocks: [
      {
        type: 'paragraph',
        text:
          "The lesser of the actual cost or the cap for the item's value band below. Applies to accidental or " +
          'negligent damage only, not theft.',
      },
      {
        type: 'table',
        header: ['Hardware product value', 'Borrower liability cap'],
        rows: [
          ['Under $500', '100% of replacement value'],
          ['$500 - $2000', '50% of replacement value'],
          ['$2001 - $10,000', '25% of replacement value, maximum of $1500'],
        ],
        columnRatios: [2.6, 4.4],
      },
    ],
  },
  {
    heading: '7. Non-return & Theft',
    blocks: [
      { type: 'paragraph', text: 'Overdue trigger - hardware is declared overdue when BOTH occur:', gapAfter: 0.1 },
      {
        type: 'list',
        items: [
          'Synaptech RSO Hardware Managers have made three (3) documented contact attempts',
          'At least thirty (30) days have passed since the return date with no return and no official extension',
        ],
      },
      { type: 'paragraph', text: 'Consequences of overdue hardware are escalating:', gapAfter: 0.1 },
      {
        type: 'list',
        items: [
          "Internal: Immediate ban from future checkouts and item is logged against the Borrower's record",
          'Student conduct: Referral to the University of Washington Office of Community Standards & Student ' +
            'Conduct for failure to return Club property.',
          'Further escalation: The Club may pursue the full loaned hardware product replacement value in a small ' +
            'claims court or file with University of Washington Police. The section 6 scaled liability cap does ' +
            'NOT apply - the Borrower owes the full replacement value.',
        ],
      },
    ],
  },
  {
    heading: '8. General',
    blocks: [
      {
        type: 'paragraph',
        text:
          'Governed by Washington State law and applicable University of Washington policy. Photos documenting ' +
          'checkout conditions may be attached. If any provision is unenforceable, the rest remain in effect.',
      },
    ],
  },
]
