import type { EquipmentCategory } from '../types'

export const CATEGORY_OPTIONS: { value: EquipmentCategory; label: string }[] = [
  { value: 'recording', label: 'Recording' },
  { value: 'modulation', label: 'Modulation' },
  { value: 'tools', label: 'Tools' },
  { value: 'peripherals', label: 'Peripherals' },
  { value: 'computing', label: 'Computing' },
  { value: 'virtual_reality', label: 'Virtual Reality' },
]

// Consumables aren't a `category` value in the schema (they're their own
// product_type), but they still get a filter chip alongside the real
// categories wherever the catalog is browsed.
export type CategoryFilter = EquipmentCategory | 'consumable'

export const FILTER_OPTIONS: { value: CategoryFilter; label: string }[] = [
  ...CATEGORY_OPTIONS,
  { value: 'consumable', label: 'Consumables' },
]
