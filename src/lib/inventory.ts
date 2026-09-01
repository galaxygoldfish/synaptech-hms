import { supabase } from './supabase'
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

  if (error) throw error
  return data as Equipment
}

export async function deleteEquipment(equipmentId: string): Promise<void> {
  const { error } = await supabase.from('equipment').delete().eq('id', equipmentId)
  if (error) throw error
}

// Every unit of this equipment currently out on an approved (not yet
// returned) loan — see fetchEquipmentInventorySummary for why "approved"
// alone is the right check.
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

// All existing catalog entries, for the add-on picker to search/link
// against — add-ons never create new equipment, only link to these.
export async function listEquipment(): Promise<Equipment[]> {
  const { data, error } = await supabase.from('equipment').select().order('name')
  if (error) throw error
  return data as Equipment[]
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

// An available unit for pre-filling the loan agreement and for the
// loan_request_items row created at submission. Picks the first unit by
// serial — there's no notion of "already on an active loan" yet (nothing
// reads loan_request_items to exclude already-requested units), so this is
// a placeholder for real availability tracking, not a reservation.
export async function fetchAvailableEquipmentUnit(equipmentId: string): Promise<EquipmentUnit | null> {
  const { data, error } = await supabase
    .from('equipment_units')
    .select()
    .eq('equipment_id', equipmentId)
    .order('serial_number')
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data as EquipmentUnit | null
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
// approved loan, for the "manage hardware inventory" table. There's no
// "returned" status yet (see bucketForLoanItem in loanRequests.ts) — every
// approved loan_request_item is still out — so checkedOut is just a count
// of approved items per equipment_id.
export async function fetchEquipmentInventorySummary(): Promise<EquipmentInventoryRow[]> {
  const equipment = await listEquipment()
  if (equipment.length === 0) return []

  const { data: approvedRequests, error: requestsError } = await supabase
    .from('loan_requests')
    .select('id')
    .eq('status', 'approved')

  if (requestsError) throw requestsError
  const approvedRequestIds = (approvedRequests ?? []).map((request) => request.id)

  const checkedOutByEquipment = new Map<string, number>()
  if (approvedRequestIds.length > 0) {
    const { data: items, error: itemsError } = await supabase
      .from('loan_request_items')
      .select('equipment_id')
      .in('loan_request_id', approvedRequestIds)

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
export async function replaceEquipmentAddons(
  equipmentId: string,
  addons: CreateEquipmentAddonInput[],
): Promise<void> {
  const { error: deleteError } = await supabase.from('equipment_addons').delete().eq('equipment_id', equipmentId)
  if (deleteError) throw deleteError

  if (addons.length > 0) {
    await createEquipmentAddons(equipmentId, addons)
  }
}
