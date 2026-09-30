import { supabase } from './supabase'
import { manageItemKey, manageItemUnitsKey } from './detailKeys'
import { CACHE_KEYS, invalidate, peekValue, readStash, refresh, stash, DISPLAY_REUSE_MS } from './queryCache'
import { generateSerialNumbers } from './serialNumber'
import type { Equipment, EquipmentAddon, EquipmentCategory, EquipmentProductType, EquipmentUnit } from '../types'

const EQUIPMENT_IMAGES_BUCKET = 'equipment-images'

// Uploads a product photo to the public equipment-images bucket and
// returns its public URL.
export async function uploadEquipmentImage(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'png'
  const path = `${crypto.randomUUID()}.${extension}`

  const { error } = await supabase.storage.from(EQUIPMENT_IMAGES_BUCKET).upload(path, file)
  if (error) throw error

  const { data } = supabase.storage.from(EQUIPMENT_IMAGES_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export interface CreateEquipmentInput {
  name: string
  description: string
  imageUrl: string
  productType: EquipmentProductType
  category: EquipmentCategory | null
  replacementValue: number | null
  quantityTotal: number
  documentationUrl: string | null
}

export async function createEquipment(input: CreateEquipmentInput): Promise<Equipment> {
  const { data, error } = await supabase
    .from('equipment')
    .insert({
      name: input.name,
      description: input.description,
      image_url: input.imageUrl,
      product_type: input.productType,
      category: input.category,
      replacement_value: input.replacementValue,
      quantity_total: input.quantityTotal,
      documentation_url: input.documentationUrl,
    })
    .select()
    .single()

  invalidate(CACHE_KEYS.equipmentAll)
  if (error) throw error
  return data as Equipment
}

export type UpdateEquipmentInput = CreateEquipmentInput

export async function updateEquipment(equipmentId: string, input: UpdateEquipmentInput): Promise<Equipment> {
  const { data, error } = await supabase
    .from('equipment')
    .update({
      name: input.name,
      description: input.description,
      image_url: input.imageUrl,
      product_type: input.productType,
      category: input.category,
      replacement_value: input.replacementValue,
      quantity_total: input.quantityTotal,
      documentation_url: input.documentationUrl,
    })
    .eq('id', equipmentId)
    .select()
    .single()

  invalidate(CACHE_KEYS.equipmentAll)
  if (error) throw error
  return data as Equipment
}

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23503'
}

// Any product that has ever appeared on a loan request — even one long
// since returned or denied — can't be hard-deleted:
// loan_request_items.equipment_id has no ON DELETE behavior (see
// 20260817030000_loan_requests.sql), and unlike audit_log/inventory_audit_entries
// it doesn't snapshot the product name, so nulling the FK would leave the
// loan history screens unable to say what was borrowed. Postgres raises
// 23503 in that case, so fall back to archiving: the row survives (loan
// history keeps resolving its name), but archived_at pulls it out of
// listEquipment and every screen built on it.
export async function deleteEquipment(equipmentId: string): Promise<void> {
  try {
    await deleteOrArchiveEquipment(equipmentId)
  } finally {
    invalidate(CACHE_KEYS.equipmentAll)
  }
}

async function deleteOrArchiveEquipment(equipmentId: string): Promise<void> {
  const { error } = await supabase.from('equipment').delete().eq('id', equipmentId)
  if (!error) return
  if (!isForeignKeyViolation(error)) throw error

  const { error: archiveError } = await supabase
    .from('equipment')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', equipmentId)
  if (archiveError) throw archiveError
}

// Updates just the denormalized unit count on a product — used when a
// single equipment_units row is added or removed, where re-sending the
// whole equipment record (as updateEquipment does) would be overkill.
export async function setEquipmentQuantityTotal(equipmentId: string, quantityTotal: number): Promise<void> {
  const { error } = await supabase.from('equipment').update({ quantity_total: quantityTotal }).eq('id', equipmentId)
  invalidate(CACHE_KEYS.equipmentAll)
  if (error) throw error
}

// Every unit of this equipment currently out on an approved loan that
// hasn't come back yet.
export async function fetchEquipmentCheckedOutCount(equipmentId: string): Promise<number> {
  const { data: approvedRequests, error: requestsError } = await supabase
    .from('loan_requests')
    .select('id')
    .eq('status', 'approved')

  if (requestsError) throw requestsError
  const approvedRequestIds = (approvedRequests ?? []).map((request) => request.id)
  if (approvedRequestIds.length === 0) return 0

  const { data: items, error: itemsError } = await supabase
    .from('loan_request_items')
    .select('id')
    .eq('equipment_id', equipmentId)
    .in('loan_request_id', approvedRequestIds)
    .is('returned_at', null)

  if (itemsError) throw itemsError
  return items?.length ?? 0
}

// Creates one equipment_units row per serial number, all linked to the
// same product. Hardware products only — consumables aren't individually
// serialized.
export async function createEquipmentUnits(
  equipmentId: string,
  serialNumbers: string[],
): Promise<EquipmentUnit[]> {
  if (serialNumbers.length === 0) return []

  const { data, error } = await supabase
    .from('equipment_units')
    .insert(serialNumbers.map((serial_number) => ({ equipment_id: equipmentId, serial_number })))
    .select()

  if (error) throw error
  return data as EquipmentUnit[]
}

// Creates a single new equipment_units row with a freshly generated
// serial number, for the "add item" action on the manage-inventory-item
// units table — one physical unit added to an existing hardware product.
export async function addEquipmentUnit(equipmentId: string): Promise<EquipmentUnit> {
  const [serialNumber] = generateSerialNumbers(1)
  const [unit] = await createEquipmentUnits(equipmentId, [serialNumber])
  return unit
}

export async function deleteEquipmentUnit(unitId: string): Promise<void> {
  const { error } = await supabase.from('equipment_units').delete().eq('id', unitId)
  if (error) throw error
}

export type EquipmentUnitStatus = 'available' | 'requested' | 'checked_out'

export interface EquipmentUnitWithStatus {
  unit: EquipmentUnit
  status: EquipmentUnitStatus
}

// Every physical unit of a hardware product, labeled available, requested or
// checked out based on the status of whichever live loan holds it — same
// rule the DB trigger enforces (equipment_unit_is_held in
// 20260926010000_unit_reservation.sql): pending and approved requests both
// hold the unit, pending just hasn't been reviewed yet. Resolved down to the
// individual unit via loan_request_items.equipment_unit_id.
export async function fetchEquipmentUnitsWithStatus(equipmentId: string): Promise<EquipmentUnitWithStatus[]> {
  const { data: units, error: unitsError } = await supabase
    .from('equipment_units')
    .select()
    .eq('equipment_id', equipmentId)
    .order('created_at')

  if (unitsError) throw unitsError
  if (!units || units.length === 0) return []

  const { data: liveRequests, error: requestsError } = await supabase
    .from('loan_requests')
    .select('id, status')
    .in('status', ['pending', 'approved'])

  if (requestsError) throw requestsError
  const requestStatusById = new Map((liveRequests ?? []).map((request) => [request.id, request.status]))

  const heldUnitStatus = new Map<string, 'requested' | 'checked_out'>()
  if (requestStatusById.size > 0) {
    const { data: items, error: itemsError } = await supabase
      .from('loan_request_items')
      .select('equipment_unit_id, loan_request_id')
      .eq('equipment_id', equipmentId)
      .in('loan_request_id', Array.from(requestStatusById.keys()))
      .is('returned_at', null)

    if (itemsError) throw itemsError
    for (const item of items ?? []) {
      if (!item.equipment_unit_id) continue
      const requestStatus = requestStatusById.get(item.loan_request_id)
      heldUnitStatus.set(item.equipment_unit_id, requestStatus === 'approved' ? 'checked_out' : 'requested')
    }
  }

  return (units as EquipmentUnit[]).map((unit) => ({
    unit,
    status: heldUnitStatus.get(unit.id) ?? ('available' as const),
  }))
}

// All existing catalog entries, for the add-on picker to search/link
// against — add-ons never create new equipment, only link to these.
// Excludes archived products (see deleteEquipment) — every catalog and
// management screen is built on this, and an archived product should be
// invisible to all of them while its row (and loan history) lives on.
//
// Always fetched fresh, but remembered so the inventory, add-item, labels and
// member browse screens can paint the last copy on their first render
// (peekEquipmentList). Each caller gets its own copy of the array so an
// in-place sort in one screen can't reorder another's.
export async function listEquipment(): Promise<Equipment[]> {
  const rows = await refresh(CACHE_KEYS.equipmentList, async () => {
    const { data, error } = await supabase.from('equipment').select().is('archived_at', null).order('name')
    if (error) throw error
    return data as Equipment[]
  }, DISPLAY_REUSE_MS)
  return [...rows]
}

/** The catalog as last loaded (archived excluded), synchronously, or null.
    Display only. */
export function peekEquipmentList(): Equipment[] | null {
  const rows = peekValue<Equipment[]>(CACHE_KEYS.equipmentList)
  return rows ? [...rows] : null
}

export async function fetchEquipment(equipmentId: string): Promise<Equipment> {
  const { data, error } = await supabase.from('equipment').select().eq('id', equipmentId).single()
  if (error) throw error
  return data as Equipment
}

export async function fetchEquipmentByIds(equipmentIds: string[]): Promise<Equipment[]> {
  if (equipmentIds.length === 0) return []
  const { data, error } = await supabase.from('equipment').select().in('id', equipmentIds)
  if (error) throw error
  return data as Equipment[]
}

// The first unit (by serial) that nobody is holding, for pre-filling the loan
// agreement and for the loan_request_items row created at submission. A unit
// is held by any pending or approved request until it's returned — members
// can't read each other's requests, so the database answers this
// (available_equipment_units, see 20260926010000_unit_reservation.sql). It
// isn't a reservation: the claim is made, and enforced, when the request is
// inserted. Null means every unit is spoken for.
export async function fetchAvailableEquipmentUnit(equipmentId: string): Promise<EquipmentUnit | null> {
  const { data, error } = await supabase.rpc('available_equipment_units', { p_equipment_id: equipmentId })

  if (error) throw error
  return ((data ?? []) as EquipmentUnit[])[0] ?? null
}

// Free units per hardware product, keyed by equipment id. Consumables have
// no units and are absent — see availableQuantity.
//
// Always fetched fresh — the checkout confirm step decides "out of stock"
// from it — but the result is remembered so the browse screens can paint the
// last-seen counts on their first render (see peekEquipmentCatalog).
//
// `fresh: true` for a screen deciding "out of stock" (starting a checkout, the
// confirm step); otherwise a copy from the last few seconds is reused.
export function fetchEquipmentAvailability({ fresh = false }: { fresh?: boolean } = {}): Promise<Record<string, number>> {
  return refresh(CACHE_KEYS.equipmentAvailability, async () => {
    const { data, error } = await supabase.rpc('equipment_availability')
    if (error) throw error

    const availability: Record<string, number> = {}
    for (const row of (data ?? []) as { equipment_id: string; available: number }[]) {
      availability[row.equipment_id] = row.available
    }
    return availability
  }, fresh ? 0 : DISPLAY_REUSE_MS)
}

/**
 * The product rows for `ids` from the last catalog load, synchronously, or
 * null unless every one of them is there. Lets the checkout steps draw the
 * items the member picked on their first render; each still refetches.
 * Display only — quantity_total here is the stored count, not free units.
 */
export function peekEquipmentRows(ids: string[]): Equipment[] | null {
  const catalog = peekValue<Equipment[]>(CACHE_KEYS.equipmentList)
  if (!catalog) return null
  const byId = new Map(catalog.map((item) => [item.id, item]))
  const rows = ids.map((id) => byId.get(id))
  return rows.every((row): row is Equipment => row !== undefined) ? rows : null
}

/**
 * The catalog as members last saw it — each item's quantity_total already
 * replaced with its free units, as useInventoryCatalog shows it — or null if
 * it hasn't been loaded yet. Synchronous, for a first paint without a
 * skeleton; the screens that use it always refetch straight after. Display
 * only: nothing should decide availability from this.
 */
export function peekEquipmentCatalog(): Equipment[] | null {
  const items = peekValue<Equipment[]>(CACHE_KEYS.equipmentList)
  const availability = peekValue<Record<string, number>>(CACHE_KEYS.equipmentAvailability)
  if (!items || !availability) return null
  return items.map((item) => ({ ...item, quantity_total: availableQuantity(item, availability) }))
}

// What a member is told is available: free units for hardware, the stocked
// quantity for consumables (which aren't tracked per unit).
export function availableQuantity(item: Equipment, availability: Record<string, number>): number {
  return item.product_type === 'hardware' ? (availability[item.id] ?? 0) : item.quantity_total
}

export async function fetchAvailableSerialNumber(equipmentId: string): Promise<string | null> {
  const unit = await fetchAvailableEquipmentUnit(equipmentId)
  return unit?.serial_number ?? null
}

export interface EquipmentInventoryRow {
  equipment: Equipment
  checkedOut: number
}

// Every catalog item plus how many of its units are currently out on an
// approved loan, for the "manage hardware inventory" table. An item is out
// from the moment its request is approved until an admin records its return
// (loan_request_items.returned_at — see the 20260922000000 migration), so
// checkedOut counts approved, not-yet-returned items per equipment_id.
export function fetchEquipmentInventorySummary(): Promise<EquipmentInventoryRow[]> {
  // Always fresh, but remembered so the list can paint it straight away next
  // time (peekEquipmentInventorySummary).
  return refresh(CACHE_KEYS.inventorySummary, loadEquipmentInventorySummary, DISPLAY_REUSE_MS)
}

/** The inventory list as last loaded, synchronously, or null. Display only. */
export function peekEquipmentInventorySummary(): EquipmentInventoryRow[] | null {
  return peekValue<EquipmentInventoryRow[]>(CACHE_KEYS.inventorySummary) ?? null
}

async function loadEquipmentInventorySummary(): Promise<EquipmentInventoryRow[]> {
  const [equipment, { data: approvedRequests, error: requestsError }] = await Promise.all([
    listEquipment(),
    supabase.from('loan_requests').select('id').eq('status', 'approved'),
  ])
  if (equipment.length === 0) return []

  if (requestsError) throw requestsError
  const approvedRequestIds = (approvedRequests ?? []).map((request) => request.id)

  const checkedOutByEquipment = new Map<string, number>()
  if (approvedRequestIds.length > 0) {
    const { data: items, error: itemsError } = await supabase
      .from('loan_request_items')
      .select('equipment_id')
      .in('loan_request_id', approvedRequestIds)
      .is('returned_at', null)

    if (itemsError) throw itemsError
    for (const item of items ?? []) {
      checkedOutByEquipment.set(item.equipment_id, (checkedOutByEquipment.get(item.equipment_id) ?? 0) + 1)
    }
  }

  return equipment.map((item) => ({
    equipment: item,
    checkedOut: checkedOutByEquipment.get(item.id) ?? 0,
  }))
}

// Every physical unit of a product, for reprinting labels one by one.
export async function listEquipmentUnits(equipmentId: string): Promise<EquipmentUnit[]> {
  const { data, error } = await supabase
    .from('equipment_units')
    .select()
    .eq('equipment_id', equipmentId)
    .order('serial_number')

  if (error) throw error
  return data as EquipmentUnit[]
}

export interface EquipmentUnitLookup {
  unit: EquipmentUnit
  equipment: Equipment
}

// Looks up a single hardware unit by its printed serial number (e.g.
// "SYN-ABC123XYZ"), for the "get a replacement label" flow — admins reprint
// a lost label without knowing which product it belongs to ahead of time.
export async function fetchEquipmentUnitBySerial(serialNumber: string): Promise<EquipmentUnitLookup | null> {
  const { data: unit, error } = await supabase
    .from('equipment_units')
    .select()
    .eq('serial_number', serialNumber)
    .maybeSingle()

  if (error) throw error
  if (!unit) return null

  const equipment = await fetchEquipment((unit as EquipmentUnit).equipment_id)
  return { unit: unit as EquipmentUnit, equipment }
}

export interface EquipmentAddonOption {
  addonType: 'optional' | 'required'
  equipment: Equipment
}

// The optional/required add-on products linked to a given equipment item,
// with the linked product's own details (name, image, stock, …) — for the
// checkout confirmation screen's add-on picker.
//
// Two plain queries instead of a single embedded select: `equipment_addons`
// has two foreign keys into `equipment` (equipment_id, addon_equipment_id),
// and PostgREST's embed-with-hint syntax for that (`equipment!addon_equipment_id(...)`)
// depends on its schema cache already knowing about the relationship —
// fragile to rely on here. Fetching the link rows and the linked products
// separately, then zipping them client-side, sidesteps that entirely.
export async function fetchEquipmentAddonOptions(equipmentId: string): Promise<EquipmentAddonOption[]> {
  const { data: links, error: linksError } = await supabase
    .from('equipment_addons')
    .select('addon_type, addon_equipment_id')
    .eq('equipment_id', equipmentId)

  if (linksError) throw linksError
  if (!links || links.length === 0) return []

  const addonIds = links.map((link) => link.addon_equipment_id)
  const { data: addonEquipment, error: equipmentError } = await supabase
    .from('equipment')
    .select()
    .in('id', addonIds)

  if (equipmentError) throw equipmentError

  const equipmentById = new Map((addonEquipment as Equipment[]).map((item) => [item.id, item]))
  return links.flatMap((link) => {
    const equipment = equipmentById.get(link.addon_equipment_id)
    return equipment ? [{ addonType: link.addon_type as 'optional' | 'required', equipment }] : []
  })
}

export interface CreateEquipmentAddonInput {
  addonEquipmentId: string
  addonType: 'optional' | 'required'
}

export async function createEquipmentAddons(
  equipmentId: string,
  addons: CreateEquipmentAddonInput[],
): Promise<EquipmentAddon[]> {
  if (addons.length === 0) return []

  const { data, error } = await supabase
    .from('equipment_addons')
    .insert(
      addons.map(({ addonEquipmentId, addonType }) => ({
        equipment_id: equipmentId,
        addon_equipment_id: addonEquipmentId,
        addon_type: addonType,
      })),
    )
    .select()

  if (error) throw error
  return data as EquipmentAddon[]
}

// Replaces the full set of add-on links for an equipment item — used when
// editing a product, where the form just tracks "what the add-ons should
// be now" rather than a diff against what's already saved.
//
// The diff against what IS saved happens here instead, rather than the
// simpler delete-everything-then-reinsert: links that didn't change are
// left untouched. That's invisible in the UI, but `equipment_addons` is
// audited per row (see 20260921000000_audit_log.sql), and wiping the table
// on every save would fill the audit log with "X is no longer an add-on of
// Y" / "X was linked to Y" pairs for add-ons nobody touched.
export async function replaceEquipmentAddons(
  equipmentId: string,
  addons: CreateEquipmentAddonInput[],
): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('equipment_addons')
    .select('id, addon_equipment_id, addon_type')
    .eq('equipment_id', equipmentId)

  if (fetchError) throw fetchError

  // Keyed on both columns, matching the table's unique constraint: the same
  // product can legitimately be linked as optional AND required.
  const linkKey = (addonEquipmentId: string, addonType: string) => `${addonEquipmentId}:${addonType}`
  const desired = new Map(addons.map((addon) => [linkKey(addon.addonEquipmentId, addon.addonType), addon]))
  const existingKeys = new Set((existing ?? []).map((link) => linkKey(link.addon_equipment_id, link.addon_type)))

  const removedIds = (existing ?? [])
    .filter((link) => !desired.has(linkKey(link.addon_equipment_id, link.addon_type)))
    .map((link) => link.id)

  if (removedIds.length > 0) {
    const { error: deleteError } = await supabase.from('equipment_addons').delete().in('id', removedIds)
    if (deleteError) throw deleteError
  }

  const added = [...desired.entries()]
    .filter(([key]) => !existingKeys.has(key))
    .map(([, addon]) => addon)

  if (added.length > 0) {
    await createEquipmentAddons(equipmentId, added)
  }
}

/** What the admin item page needs to draw its form. */
export interface ManageItemData {
  equipment: Equipment
  checkedOutCount: number
  addonOptions: EquipmentAddonOption[]
}

/**
 * Fetches everything the admin item page and its units table load, and
 * stashes it for them (see stash in queryCache.ts) — called by the inventory
 * list on a row click, so the page opens already drawn, from data a moment
 * old, rather than behind a skeleton. Rejects like the fetches it wraps.
 */
export async function prefetchManageItem(equipmentId: string): Promise<ManageItemData> {
  const [equipment, checkedOutCount, addonOptions, units] = await Promise.all([
    fetchEquipment(equipmentId),
    fetchEquipmentCheckedOutCount(equipmentId),
    fetchEquipmentAddonOptions(equipmentId),
    fetchEquipmentUnitsWithStatus(equipmentId),
  ])
  // The page's own data is stashed by the caller (usePrefetchNavigate, under
  // manageItemKey); the units table's goes in alongside.
  stash(manageItemUnitsKey(equipmentId), units)
  return { equipment, checkedOutCount, addonOptions }
}


/** The item page's data if the list just prefetched it, else undefined. */
export function readManageItemPrefetch(equipmentId: string): ManageItemData | undefined {
  return readStash<ManageItemData>(manageItemKey(equipmentId))
}

/** The units table's rows if the list just prefetched them, else undefined. */
export function readManageItemUnitsPrefetch(equipmentId: string): EquipmentUnitWithStatus[] | undefined {
  return readStash<EquipmentUnitWithStatus[]>(manageItemUnitsKey(equipmentId))
}

/** The "get labels" product screen: a product and every one of its units. */
export interface LabelsProductData {
  equipment: Equipment
  units: EquipmentUnit[]
}

export async function fetchLabelsProduct(equipmentId: string): Promise<LabelsProductData> {
  const [equipment, units] = await Promise.all([fetchEquipment(equipmentId), listEquipmentUnits(equipmentId)])
  return { equipment, units }
}


/**
 * The member's sign-agreement step: the products being checked out and, for
 * each hardware one, the unit they'll get (the agreement names its serial).
 * Fetched when the return-date step's "next" is pressed, so the agreement
 * opens drawn; the unit is still a fresh answer, and submission re-checks it.
 */
export interface SignAgreementData {
  equipmentId: string
  addonIds: string[]
  items: Equipment[]
  units: Record<string, EquipmentUnit | null>
}

export async function fetchSignAgreementData(equipmentId: string, addonIds: string[]): Promise<SignAgreementData> {
  const [mainItem, addonItems] = await Promise.all([fetchEquipment(equipmentId), fetchEquipmentByIds(addonIds)])
  const items = [mainItem, ...addonItems]
  const unitEntries = await Promise.all(
    items
      .filter((item) => item.product_type === 'hardware')
      .map(async (item) => [item.id, await fetchAvailableEquipmentUnit(item.id)] as const),
  )
  return { equipmentId, addonIds, items, units: Object.fromEntries(unitEntries) }
}

/** The prefetched sign-agreement data, if it's for exactly this checkout. */
export function readSignAgreementPrefetch(equipmentId: string, addonIds: string[]): SignAgreementData | undefined {
  const data = readStash<SignAgreementData>(CACHE_KEYS.signAgreement)
  if (!data || data.equipmentId !== equipmentId) return undefined
  const same = data.addonIds.length === addonIds.length && data.addonIds.every((id, i) => id === addonIds[i])
  return same ? data : undefined
}
