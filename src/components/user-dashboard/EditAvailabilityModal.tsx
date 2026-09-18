import { useEffect, useState } from 'react'
import { AvailabilityGrid, AvailabilityGridSkeleton, parseSlotKey, slotKey } from './AvailabilityGrid'
import { CloseIcon } from './icons'
import {
  fetchAvailability,
  saveAvailability,
  type AvailabilityTarget,
} from '../../lib/availability'
import styles from './EditAvailabilityModal.module.css'

/**
 * Changing an answer already given — "Edit checkout availability" while a
 * request is still pending, and "Edit return availability" while a return is
 * waiting to be collected.
 *
 * The same grid the member painted in the first place rather than a different
 * editor, loaded with what they said last time. One component for both kinds
 * because the only difference is which rows are being replaced, and that is
 * the target's business, not the dialog's.
 */

interface EditAvailabilityModalProps {
  target: AvailabilityTarget
  onClose: () => void
  /** Called after a successful save, so the caller can re-read. */
  onSaved?: () => void
}

const HEADING: Record<AvailabilityTarget['kind'], string> = {
  checkout: 'Edit checkout availability',
  return: 'Edit return availability',
}

const SUBTEXT: Record<AvailabilityTarget['kind'], string> = {
  checkout:
    'Click all hours you are free to collect your hardware. Our Hardware Managers use this to schedule a pickup with you.',
  return:
    'Click all hours you are free to hand your hardware back. Our Hardware Managers use this to schedule a pickup with you.',
}

export function EditAvailabilityModal({ target, onClose, onSaved }: EditAvailabilityModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const targetKey =
    target.kind === 'return' ? `return:${target.loanRequestItemId}` : `checkout:${target.loanRequestId}`

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchAvailability(target)
      .then((slots) => {
        if (!cancelled) setSelected(new Set(slots.map((slot) => slotKey(slot.date, slot.hour))))
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load availability:', fetchError)
        if (!cancelled) setError('Could not load your availability. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // The target is a fresh object each render; its identity is the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey])

  async function handleSave() {
    if (isSaving) return
    setSaving(true)
    setSaveError(null)

    try {
      await saveAvailability(target, [...selected].map(parseSlotKey))
      onSaved?.()
      onClose()
    } catch (failure) {
      // eslint-disable-next-line no-console
      console.error('Failed to save availability:', failure)
      setSaveError('Could not save your availability. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={HEADING[target.kind]}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <div>
            <h2 className={styles.heading}>{HEADING[target.kind]}</h2>
            <p className={styles.subtext}>{SUBTEXT[target.kind]}</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className={styles.body}>
          {isLoading && <AvailabilityGridSkeleton days={4} slots={8} />}
          {!isLoading && error && <p className={styles.status}>{error}</p>}
          {!isLoading && !error && (
            <AvailabilityGrid selected={selected} onChange={setSelected} framed={false} />
          )}
        </div>

        {saveError && <p className={styles.inlineError}>{saveError}</p>}

        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.saveButton}
            onClick={() => void handleSave()}
            disabled={isSaving || isLoading || error !== null}
          >
            {isSaving ? 'Saving…' : 'Save availability'}
          </button>
        </div>
      </div>
    </div>
  )
}
