import {
  availableQuantity,
  fetchEquipmentAddonOptions,
  fetchEquipmentAvailability,
  type EquipmentAddonOption,
} from '../../lib/inventory'
import { CACHE_KEYS } from '../../lib/queryCache'
import { usePrefetchNavigate } from '../../lib/usePrefetchNavigate'
import type { Equipment } from '../../types'

/** Stash key for a checkout's add-ons and stock, read by the confirm step. */
export function checkoutStartKey(equipmentId: string): string {
  return `${CACHE_KEYS.checkoutStart}${equipmentId}`
}

/** What the confirm step needs, fetched before navigating to it. */
export interface CheckoutStartData {
  addonOptions: EquipmentAddonOption[]
  availability: Record<string, number>
}

/**
 * Starts a checkout from a catalog item — the "select hardware" list and the
 * item page's "Checkout this item" both use it.
 *
 * The confirm step exists only to pick add-ons, and used to skip itself when
 * there were none — after loading behind a skeleton to find that out. This
 * decides first, with the page the member clicked on still up: an item with
 * no add-ons goes straight to the return date, and one with add-ons (or out
 * of stock) opens the confirm step, which draws from the stashed data. Stock
 * is read fresh, as the confirm step's own check was.
 */
export function useStartCheckout() {
  const { open, pendingKey } = usePrefetchNavigate()

  function startCheckout(item: Equipment) {
    void open(
      checkoutStartKey(item.id),
      async (): Promise<CheckoutStartData> => {
        const [addonOptions, availability] = await Promise.all([
          fetchEquipmentAddonOptions(item.id),
          fetchEquipmentAvailability({ fresh: true }),
        ])
        return { addonOptions, availability }
      },
      (data) =>
        data && data.addonOptions.length === 0 && availableQuantity(item, data.availability) > 0
          ? {
              to: '/home/checkout/return-date',
              options: { state: { equipmentId: item.id, optionalAddonIds: [], requiredAddonId: null } },
            }
          : // A failed fetch lands here too: the confirm step loads and reports it.
            { to: '/home/checkout/confirm', options: { state: { equipmentId: item.id } } },
    )
  }

  const prefix = checkoutStartKey('')
  const pendingId = pendingKey?.startsWith(prefix) ? pendingKey.slice(prefix.length) : null
  return { startCheckout, pendingId }
}
