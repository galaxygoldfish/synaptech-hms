import { useEffect, useMemo, useState } from 'react'
import { listEquipment } from './inventory'
import { CATEGORY_OPTIONS, type CategoryFilter } from './equipmentCategories'
import type { Equipment } from '../types'

export interface InventoryGroup {
  key: string
  label: string
  items: Equipment[]
}

// Shared data/filter logic behind every "browse the equipment catalog"
// screen (member browse page, checkout hardware picker, …): fetches the
// catalog, and groups+filters it by category/search term.
export function useInventoryCatalog() {
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [selectedFilters, setSelectedFilters] = useState<Set<CategoryFilter>>(new Set())

  useEffect(() => {
    let cancelled = false
    listEquipment()
      .then((items) => {
        if (!cancelled) setEquipment(items)
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load inventory:', fetchError)
        if (!cancelled) setError('Could not load inventory. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function toggleFilter(value: CategoryFilter) {
    setSelectedFilters((current) => {
      const next = new Set(current)
      if (next.has(value)) {
        next.delete(value)
      } else {
        next.add(value)
      }
      return next
    })
  }

  const groups = useMemo<InventoryGroup[]>(() => {
    const term = query.trim().toLowerCase()
    const matches = (item: Equipment) =>
      !term || item.name.toLowerCase().includes(term) || (item.description ?? '').toLowerCase().includes(term)
    const isActive = (value: CategoryFilter) => selectedFilters.size === 0 || selectedFilters.has(value)

    const hardwareGroups = CATEGORY_OPTIONS.filter((option) => isActive(option.value)).map((option) => ({
      key: option.value as string,
      label: option.label,
      items: equipment.filter((item) => item.category === option.value && matches(item)),
    }))

    const consumablesGroup: InventoryGroup | null = isActive('consumable')
      ? {
          key: 'consumable',
          label: 'Consumables',
          items: equipment.filter((item) => item.product_type === 'consumable' && matches(item)),
        }
      : null

    return [...hardwareGroups, ...(consumablesGroup ? [consumablesGroup] : [])].filter(
      (group) => group.items.length > 0,
    )
  }, [equipment, query, selectedFilters])

  return { isLoading, error, query, setQuery, selectedFilters, toggleFilter, groups }
}
