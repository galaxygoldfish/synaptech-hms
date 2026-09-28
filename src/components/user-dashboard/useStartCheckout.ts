import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  availableQuantity,
  fetchEquipmentAddonOptions,
  fetchEquipmentAvailability,
  type EquipmentAddonOption,
} from '../../lib/inventory'
import type { Equipment } from '../../types'

/** What the confirm step needs, fetched before navigating to it. */
export interface PrefetchedCheckout {
  addonOptions: EquipmentAddonOption[]
  availability: Record<string, number>
}

/**
 * Starts a checkout from a catalog item — the "select hardware" list and the
 * item page's "Checkout this item" both use it.
 *
 * The confirm step exists only to pick add-ons, and skips itself when there
 * are none; but it had to load the item to find that out, so every checkout
 * flashed a loading skeleton on the way through. Deciding here instead, while
 * the page the member clicked on stays on screen, means an item with no
 * add-ons goes straight to the return date, and one with add-ons opens the
 * confirm step with its data already in hand. Stock is read fresh, as the
 * confirm step's own check was.
 */
export function useStartCheckout() {
  const navigate = useNavigate()
  const [pendingId, setPendingId] = useState<string | null>(null)
  // A ref, not the state above, guards re-entry: two taps inside one render
  // would both read the state as still null.
  const isStarting = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  async function startCheckout(item: Equipment) {
    if (isStarting.current) return
    isStarting.current = true
    setPendingId(item.id)
    try {
      const [addonOptions, availability] = await Promise.all([
        fetchEquipmentAddonOptions(item.id),
        fetchEquipmentAvailability(),
      ])
      if (!mounted.current) return

      if (addonOptions.length === 0 && availableQuantity(item, availability) > 0) {
        navigate('/home/checkout/return-date', {
          state: { equipmentId: item.id, optionalAddonIds: [], requiredAddonId: null },
        })
        return
      }
      const prefetched: PrefetchedCheckout = { addonOptions, availability }
      navigate('/home/checkout/confirm', { state: { equipmentId: item.id, prefetched } })
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to start checkout:', error)
      // Let the confirm step load it the ordinary way and report any failure.
      if (mounted.current) navigate('/home/checkout/confirm', { state: { equipmentId: item.id } })
    } finally {
      isStarting.current = false
      if (mounted.current) setPendingId(null)
    }
  }

  return { startCheckout, pendingId }
}
