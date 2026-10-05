import { useEffect, useState } from 'react'
import { fetchEquipmentUnitsWithStatus, type EquipmentUnitStatus, type EquipmentUnitWithStatus } from '../../lib/inventory'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import modalStyles from '../Modal.module.css'
// The inventory screen's status chips, so a unit reads "requested" or "on
// hold" here in exactly the colour it does there.
import unitStyles from './EquipmentUnitsTable.module.css'
import styles from './SwitchUnitModal.module.css'

const STATUS_CHIP_CLASS: Record<EquipmentUnitStatus, string> = {
  available: unitStyles.chipAvailable,
  on_hold: unitStyles.chipOnHold,
  requested: unitStyles.chipRequested,
  checked_out: unitStyles.chipCheckedOut,
}

const STATUS_LABEL: Record<EquipmentUnitStatus, string> = {
  available: 'available',
  on_hold: 'on hold',
  requested: 'requested',
  checked_out: 'checked out',
}

interface SwitchUnitModalProps {
  equipmentId: string
  itemName: string
  memberName: string
  currentUnitId: string | null
  error: string | null
  isSubmitting: boolean
  onConfirm: (unitId: string) => void
  onCancel: () => void
}

/**
 * Picking a different unit for a checkout request before it's handed over.
 *
 * Every unit of the product is listed, not just the free ones: an admin
 * looking for the serial on the label in front of them should see it here
 * and why it can't be picked, rather than wonder whether the list is
 * complete. Only an available unit can be chosen — anything else belongs to
 * another loan or is being kept back — and the database refuses the rest
 * anyway (guard_loan_item_unit).
 */
export function SwitchUnitModal({
  equipmentId,
  itemName,
  memberName,
  currentUnitId,
  error,
  isSubmitting,
  onConfirm,
  onCancel,
}: SwitchUnitModalProps) {
  const [units, setUnits] = useState<EquipmentUnitWithStatus[]>([])
  const [isLoading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchEquipmentUnitsWithStatus(equipmentId)
      .then((rows) => {
        if (cancelled) return
        // In serial order, which is how they're labelled on the shelf.
        setUnits([...rows].sort((a, b) => a.unit.serial_number.localeCompare(b.unit.serial_number)))
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load units:', fetchError)
        if (!cancelled) setLoadError('Could not load the units of this item. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [equipmentId])

  const hasChoice = units.some(({ unit, status }) => status === 'available' && unit.id !== currentUnitId)

  return (
    <div className={`${modalStyles.overlay} ${modalStyles.overlayWelcome}`} onClick={isSubmitting ? undefined : onCancel}>
      <div
        className={`${modalStyles.modal} ${modalStyles.modalWide}`}
        role="dialog"
        aria-modal="true"
        aria-label="Switch unit"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={modalStyles.headerRow}>
          <h2 className={modalStyles.heading}>Switch unit</h2>
        </div>

        <div className={modalStyles.bodyGroup}>
          <p className={modalStyles.body}>
            Choose which {itemName} {memberName} will receive. The serial number on their signed agreement is updated
            to match.
          </p>
        </div>

        <div className={styles.list} role="radiogroup" aria-label={`Units of ${itemName}`}>
          {isLoading && (
            <SkeletonScreen label="Loading units…" className={styles.skeletonStack}>
              {Array.from({ length: 3 }, (_, index) => (
                <span key={index} className={styles.unit}>
                  <Skeleton width="9rem" height="1.1875rem" shape="pill" />
                  <Skeleton width="5.5rem" height="1.75rem" shape="pill" />
                </span>
              ))}
            </SkeletonScreen>
          )}
          {!isLoading && loadError && <p className={styles.status}>{loadError}</p>}
          {!isLoading && !loadError && units.length === 0 && (
            <p className={styles.status}>This item has no units in the inventory.</p>
          )}
          {!isLoading &&
            !loadError &&
            units.map(({ unit, status }) => {
              const isCurrent = unit.id === currentUnitId
              const isSelectable = status === 'available' && !isCurrent
              const isSelected = selectedId === unit.id
              return (
                <button
                  key={unit.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={`${styles.unit} ${isSelected ? styles.unitSelected : ''}`}
                  onClick={() => setSelectedId(unit.id)}
                  disabled={!isSelectable || isSubmitting}
                >
                  <span className={styles.serial}>{unit.serial_number}</span>
                  {/* The current unit reads "requested" in the inventory —
                      by this very request — which here would only confuse. */}
                  {isCurrent ? (
                    <span className={`${unitStyles.chip} ${styles.chipCurrent}`}>current</span>
                  ) : (
                    <span className={`${unitStyles.chip} ${STATUS_CHIP_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
                  )}
                </button>
              )
            })}
        </div>

        {!isLoading && !loadError && units.length > 0 && !hasChoice && (
          <p className={styles.hint}>No other unit is available right now.</p>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={modalStyles.buttonRow}>
          <button type="button" className={modalStyles.buttonSecondary} onClick={onCancel} disabled={isSubmitting}>
            Keep unit
          </button>
          <button
            type="button"
            className={modalStyles.button}
            onClick={() => selectedId && onConfirm(selectedId)}
            disabled={!selectedId || isSubmitting}
          >
            {isSubmitting ? 'Switching…' : 'Switch unit'}
          </button>
        </div>
      </div>
    </div>
  )
}
