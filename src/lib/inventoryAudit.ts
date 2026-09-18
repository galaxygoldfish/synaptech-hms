import { supabase } from './supabase'

/**
 * What an audit concluded about one unit.
 *
 * `confirmed` / `missing` are the two outcomes for a unit the records placed
 * on the shelf — it turned up, or it didn't. `checked_out` is a unit whose
 * absence is already accounted for: it's out with a member. The remaining
 * two are discrepancies: `found_checked_out` is a unit scanned on the shelf
 * that the records say is out on loan (a return that was never recorded, or
 * the wrong unit handed over), and `unrecognized` is a barcode belonging to
 * nothing in inventory at all.
 *
 * Kept in step with the check constraint in
 * 20260924000000_inventory_audits.sql — a value that isn't in both places
 * fails the insert.
 */
export type InventoryAuditStatus =
  | 'confirmed'
  | 'missing'
  | 'checked_out'
  | 'found_checked_out'
  | 'unrecognized'

/** The status of a unit *before* the audit started, from the records alone. */
export type InventoryUnitExpectation = 'in_stock' | 'checked_out'

/**
 * A hardware unit the audit has to account for, as the records describe it
 * at the moment the audit began.
 */
export interface AuditableUnit {
  unitId: string
  serialNumber: string
  equipmentId: string
  equipmentName: string
  imageUrl: string | null
  expectation: InventoryUnitExpectation
  /** Who the records say has it. Null unless `expectation` is 'checked_out'. */
  memberName: string | null
}

export interface InventoryAuditSummary {
  id: string
  performedAt: string
  /** Snapshot taken when the audit was recorded, so it survives the admin
      being renamed or deleted. Null only for a row written with no signed-in
      actor, which record_inventory_audit doesn't allow. */
  performedByName: string | null
  performedByEmail: string | null
  note: string | null
  /** Units the records placed on the shelf: confirmed + missing. */
  expectedCount: number
  confirmedCount: number
  missingCount: number
  checkedOutCount: number
  foundCheckedOutCount: number
  unrecognizedCount: number
}

export interface InventoryAuditEntry {
  id: string
  status: InventoryAuditStatus
  serialNumber: string
  /** Null for an unrecognised barcode, and for a unit deleted since. */
  equipmentUnitId: string | null
  equipmentId: string | null
  equipmentName: string | null
  memberName: string | null
  scannedAt: string | null
  /**
   * The product's photo as it stands *now*, looked up live rather than
   * snapshotted — unlike every other field here. A photo is an illustration
   * of what a row is about, not part of what the audit found, so showing the
   * current one is right; it's null for an unrecognised barcode and for a
   * product deleted since, and the row falls back to a placeholder.
   */
  imageUrl: string | null
}

export interface InventoryAuditDetail extends InventoryAuditSummary {
  entries: InventoryAuditEntry[]
}

interface InventoryAuditRow {
  id: string
  performed_at: string
  performed_by_name: string | null
  performed_by_email: string | null
  note: string | null
  expected_count: number
  confirmed_count: number
  missing_count: number
  checked_out_count: number
  found_checked_out_count: number
  unrecognized_count: number
}

interface InventoryAuditEntryRow {
  id: string
  status: InventoryAuditStatus
  serial_number: string
  equipment_unit_id: string | null
  equipment_id: string | null
  equipment_name: string | null
  member_name: string | null
  scanned_at: string | null
}

const AUDIT_COLUMNS =
  'id, performed_at, performed_by_name, performed_by_email, note, expected_count, confirmed_count, missing_count, checked_out_count, found_checked_out_count, unrecognized_count'

const ENTRY_COLUMNS =
  'id, status, serial_number, equipment_unit_id, equipment_id, equipment_name, member_name, scanned_at'

function mapAudit(row: InventoryAuditRow): InventoryAuditSummary {
  return {
    id: row.id,
    performedAt: row.performed_at,
    performedByName: row.performed_by_name,
    performedByEmail: row.performed_by_email,
    note: row.note,
    expectedCount: row.expected_count,
    confirmedCount: row.confirmed_count,
    missingCount: row.missing_count,
    checkedOutCount: row.checked_out_count,
    foundCheckedOutCount: row.found_checked_out_count,
    unrecognizedCount: row.unrecognized_count,
  }
}

function mapEntry(row: InventoryAuditEntryRow, imageUrl: string | null = null): InventoryAuditEntry {
  return {
    id: row.id,
    status: row.status,
    serialNumber: row.serial_number,
    equipmentUnitId: row.equipment_unit_id,
    equipmentId: row.equipment_id,
    equipmentName: row.equipment_name,
    memberName: row.member_name,
    scannedAt: row.scanned_at,
    imageUrl,
  }
}

/**
 * Every hardware unit in inventory, each labelled with whether the records
 * expect it to be on the shelf right now — the list the scan screen counts
 * down as barcodes come in.
 *
 * "Checked out" is the same rule the rest of the app uses (see
 * fetchEquipmentUnitsWithStatus in inventory.ts): reserved on an approved
 * loan request that hasn't been returned. Consumables never appear, because
 * they have no equipment_units rows to scan — `quantity_total` is their
 * whole stock record, and counting a bag of electrodes isn't what a barcode
 * audit does.
 *
 * Four plain queries zipped client-side rather than PostgREST embeds, the
 * same choice fetchAllLoanRequestItems makes and for the same reason.
 */
export async function fetchAuditableInventory(): Promise<AuditableUnit[]> {
  const { data: units, error: unitsError } = await supabase
    .from('equipment_units')
    .select('id, equipment_id, serial_number')
    .order('serial_number')

  if (unitsError) throw unitsError
  if (!units || units.length === 0) return []

  const equipmentIds = [...new Set(units.map((unit) => unit.equipment_id))]
  const { data: equipmentRows, error: equipmentError } = await supabase
    .from('equipment')
    .select('id, name, image_url')
    .in('id', equipmentIds)

  if (equipmentError) throw equipmentError

  const { data: approvedRequests, error: requestsError } = await supabase
    .from('loan_requests')
    .select('id, user_id')
    .eq('status', 'approved')

  if (requestsError) throw requestsError

  // Unit id -> the member holding it. Built only from approved, unreturned
  // items; anything not in here is expected on the shelf.
  const holderByUnitId = new Map<string, string | null>()
  const approvedRequestIds = (approvedRequests ?? []).map((request) => request.id)

  if (approvedRequestIds.length > 0) {
    const { data: outstandingItems, error: itemsError } = await supabase
      .from('loan_request_items')
      .select('loan_request_id, equipment_unit_id')
      .in('loan_request_id', approvedRequestIds)
      .is('returned_at', null)
      .not('equipment_unit_id', 'is', null)

    if (itemsError) throw itemsError

    const borrowerIdByRequestId = new Map(
      (approvedRequests ?? []).map((request) => [request.id, request.user_id]),
    )
    const borrowerIds = [
      ...new Set(
        (outstandingItems ?? []).flatMap((item) => {
          const borrowerId = borrowerIdByRequestId.get(item.loan_request_id)
          return borrowerId ? [borrowerId] : []
        }),
      ),
    ]

    const nameById = new Map<string, string>()
    if (borrowerIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', borrowerIds)

      if (profileError) throw profileError
      for (const profile of profileRows ?? []) {
        nameById.set(profile.id, `${profile.first_name} ${profile.last_name}`.trim())
      }
    }

    for (const item of outstandingItems ?? []) {
      if (!item.equipment_unit_id) continue
      const borrowerId = borrowerIdByRequestId.get(item.loan_request_id)
      holderByUnitId.set(item.equipment_unit_id, (borrowerId && nameById.get(borrowerId)) || null)
    }
  }

  const equipmentById = new Map((equipmentRows ?? []).map((equipment) => [equipment.id, equipment]))

  return units.flatMap((unit) => {
    const equipment = equipmentById.get(unit.equipment_id)
    // A unit whose product row has gone is a broken FK rather than something
    // to put in front of an auditor; equipment_units cascades on delete, so
    // this can only be a read mid-delete.
    if (!equipment) return []
    const isCheckedOut = holderByUnitId.has(unit.id)
    return [
      {
        unitId: unit.id,
        serialNumber: unit.serial_number,
        equipmentId: unit.equipment_id,
        equipmentName: equipment.name,
        imageUrl: equipment.image_url,
        expectation: isCheckedOut ? ('checked_out' as const) : ('in_stock' as const),
        memberName: holderByUnitId.get(unit.id) ?? null,
      },
    ]
  })
}

export const INVENTORY_AUDIT_LIMIT = 200

export interface InventoryAuditPage {
  audits: InventoryAuditSummary[]
  /** True when there are more audits than `limit`, so the screen can say
      it's showing the most recent rather than implying it has all of them. */
  hasMore: boolean
}

/** Past audits, newest first. Capped like fetchAuditLog, for the same reason. */
export async function fetchInventoryAudits(limit = INVENTORY_AUDIT_LIMIT): Promise<InventoryAuditPage> {
  const { data, error } = await supabase
    .from('inventory_audits')
    .select(AUDIT_COLUMNS)
    .order('performed_at', { ascending: false })
    .limit(limit + 1)

  if (error) throw error

  const rows = (data ?? []) as InventoryAuditRow[]
  return {
    audits: rows.slice(0, limit).map(mapAudit),
    hasMore: rows.length > limit,
  }
}

/** One past audit with every unit it accounted for. */
export async function fetchInventoryAudit(auditId: string): Promise<InventoryAuditDetail> {
  const { data: audit, error: auditError } = await supabase
    .from('inventory_audits')
    .select(AUDIT_COLUMNS)
    .eq('id', auditId)
    .single()

  if (auditError) throw auditError

  const { data: entries, error: entriesError } = await supabase
    .from('inventory_audit_entries')
    .select(ENTRY_COLUMNS)
    .eq('audit_id', auditId)
    .order('serial_number')

  if (entriesError) throw entriesError

  const entryRows = (entries ?? []) as InventoryAuditEntryRow[]

  // Product photos aren't in the audit tables — see `imageUrl` on
  // InventoryAuditEntry for why they're fetched live instead. One query for
  // the whole report rather than one per row.
  const equipmentIds = [...new Set(entryRows.flatMap((row) => (row.equipment_id ? [row.equipment_id] : [])))]
  const imageByEquipmentId = new Map<string, string | null>()
  if (equipmentIds.length > 0) {
    const { data: equipmentRows, error: equipmentError } = await supabase
      .from('equipment')
      .select('id, image_url')
      .in('id', equipmentIds)

    if (equipmentError) throw equipmentError
    for (const equipment of equipmentRows ?? []) {
      imageByEquipmentId.set(equipment.id, equipment.image_url)
    }
  }

  return {
    ...mapAudit(audit as InventoryAuditRow),
    entries: entryRows.map((row) =>
      mapEntry(row, (row.equipment_id && imageByEquipmentId.get(row.equipment_id)) || null),
    ),
  }
}

export interface RecordInventoryAuditEntry {
  status: InventoryAuditStatus
  serialNumber: string
  equipmentUnitId?: string | null
  equipmentId?: string | null
  equipmentName?: string | null
  memberName?: string | null
  /** ISO timestamp of the barcode read. Omitted for the unscanned statuses. */
  scannedAt?: string | null
}

/**
 * Writes a finished audit and returns its id.
 *
 * Goes through the `record_inventory_audit` RPC rather than inserting
 * directly: the audit row and its entries have to land together, the counts
 * are derived from the entries server-side so they can't disagree with them,
 * and the tables carry no insert grant at all — see the migration's comment.
 */
export async function recordInventoryAudit(
  entries: RecordInventoryAuditEntry[],
  note: string | null = null,
): Promise<string> {
  const { data, error } = await supabase.rpc('record_inventory_audit', {
    p_entries: entries,
    p_note: note,
  })

  if (error) throw error
  return data as string
}
