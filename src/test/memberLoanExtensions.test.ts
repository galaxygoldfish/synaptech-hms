import { canExtend, requestExtension, withdrawExtension, type MemberLoanItem } from '../lib/memberLoans'

// Every call the code makes against the mocked client, in order, so a test
// can say "the upload happened before the update".
const calls: { op: string; args: unknown[] }[] = []
let uploadError: unknown = null

vi.mock('../lib/supabase', () => ({
  supabase: {
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, file: unknown, options: unknown) => {
          calls.push({ op: 'upload', args: [bucket, path, file, options] })
          return Promise.resolve({ data: { path }, error: uploadError })
        },
      }),
    },
    from: (table: string) => {
      const chain = {
        update: (payload: unknown) => {
          calls.push({ op: 'update', args: [table, payload] })
          return chain
        },
        eq: (column: string, value: unknown) => {
          calls.push({ op: 'eq', args: [column, value] })
          return chain
        },
        is: (column: string, value: unknown) => {
          calls.push({ op: 'is', args: [column, value] })
          return chain
        },
        // oxlint-disable-next-line unicorn/no-thenable
        then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null }),
      }
      return chain
    },
  },
}))

beforeEach(() => {
  calls.length = 0
  uploadError = null
})

function item(overrides: Partial<MemberLoanItem> = {}): MemberLoanItem {
  return {
    id: 'i1',
    loanRequestId: 'r1',
    equipmentId: 'e1',
    itemName: 'Muse 2',
    itemDescription: null,
    imageUrl: null,
    documentationUrl: null,
    isConsumable: false,
    itemRole: 'primary',
    serialNumber: 'SYN-1',
    requestStatus: 'approved',
    requestedAt: '2026-10-01T17:30:00Z',
    reviewedAt: '2026-10-02T18:00:00Z',
    returnDate: '2026-12-15',
    returnRequestedAt: null,
    returnedAt: null,
    signedAgreementPath: 'u1/r1/e1-approved.pdf',
    cancellationReason: null,
    extensionStatus: null,
    extensionReturnDate: null,
    ...overrides,
  }
}

const DEC_5 = new Date(2026, 11, 5)

describe('canExtend', () => {
  it('allows an approved hardware loan inside the window', () => {
    expect(canExtend(item(), DEC_5)).toBe(true)
  })

  it('refuses before the window opens', () => {
    expect(canExtend(item(), new Date(2026, 10, 25))).toBe(false)
  })

  it('refuses a loan already extended past this quarter', () => {
    expect(canExtend(item({ returnDate: '2027-03-01' }), DEC_5)).toBe(false)
  })

  it('refuses while a return is requested', () => {
    expect(canExtend(item({ returnRequestedAt: '2026-12-04T10:00:00Z' }), DEC_5)).toBe(false)
  })

  it('refuses while an extension is already pending', () => {
    expect(canExtend(item({ extensionStatus: 'pending' }), DEC_5)).toBe(false)
  })

  it('allows asking again after a denial', () => {
    expect(canExtend(item({ extensionStatus: 'denied' }), DEC_5)).toBe(true)
  })

  it('refuses consumables', () => {
    expect(canExtend(item({ isConsumable: true, returnDate: null }), DEC_5)).toBe(false)
  })

  it('refuses returned hardware', () => {
    expect(canExtend(item({ returnedAt: '2026-12-04T10:00:00Z' }), DEC_5)).toBe(false)
  })

  it('refuses a request that was never handed over', () => {
    expect(canExtend(item({ requestStatus: 'pending' }), DEC_5)).toBe(false)
  })

  it('allows an overdue loan', () => {
    expect(canExtend(item({ returnDate: '2026-12-02' }), DEC_5)).toBe(true)
  })
})

describe('requestExtension', () => {
  const file = new File(['%PDF'], 'agreement.pdf', { type: 'application/pdf' })
  const input = {
    item: item(),
    userId: 'u1',
    newReturnDate: '2027-03-10',
    agreementFile: file,
    signatureName: 'Ada Lovelace',
    signatureDate: '2026-12-05',
  }

  it('uploads the new agreement before flagging the item', async () => {
    await requestExtension(input)

    const ops = calls.map((call) => call.op)
    expect(ops.indexOf('upload')).toBeLessThan(ops.indexOf('update'))

    const upload = calls.find((call) => call.op === 'upload')!
    expect(upload.args[0]).toBe('loan-agreements')
    expect(upload.args[1]).toMatch(/^u1\/r1\/e1-extension-\d+\.pdf$/)
    expect(upload.args[3]).toEqual({ contentType: 'application/pdf' })

    const update = calls.find((call) => call.op === 'update')!
    expect(update.args).toEqual([
      'loan_request_items',
      {
        extension_status: 'pending',
        extension_return_date: '2027-03-10',
        extension_agreement_path: upload.args[1],
        extension_signature_name: 'Ada Lovelace',
        extension_signature_date: '2026-12-05',
      },
    ])
    expect(calls).toContainEqual({ op: 'eq', args: ['id', 'i1'] })
    expect(calls).toContainEqual({ op: 'is', args: ['returned_at', null] })
  })

  it('never flags the item when the upload fails', async () => {
    uploadError = new Error('storage down')
    await expect(requestExtension(input)).rejects.toThrow('storage down')
    expect(calls.some((call) => call.op === 'update')).toBe(false)
  })
})

describe('withdrawExtension', () => {
  it('withdraws only a pending extension', async () => {
    await withdrawExtension('i1')
    expect(calls).toContainEqual({ op: 'update', args: ['loan_request_items', { extension_status: 'withdrawn' }] })
    expect(calls).toContainEqual({ op: 'eq', args: ['id', 'i1'] })
    expect(calls).toContainEqual({ op: 'eq', args: ['extension_status', 'pending'] })
  })
})
