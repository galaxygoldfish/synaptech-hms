import { useEffect, useRef, useState } from 'react'
import type jsPDF from 'jspdf'
import ConfirmActionModal from '../ConfirmActionModal'
import { PlusIconSmallFilled, PrinterIconFilled, TrashCanIconFilled } from './icons'
import { QrDocLabel } from './labels/QrDocLabel'
import { SerialBarcodeLabel } from './labels/SerialBarcodeLabel'
import {
  addEquipmentUnit,
  deleteEquipmentUnit,
  fetchEquipmentUnitsWithStatus,
  setEquipmentQuantityTotal,
  type EquipmentUnitWithStatus,
} from '../../lib/inventory'
import { buildItemLabelsPdf, printLabelsPdf } from '../../lib/labelPdf'
import type { EquipmentUnit } from '../../types'
import { Skeleton, SkeletonLabel } from '../skeleton/Skeleton'
import styles from './EquipmentUnitsTable.module.css'

interface EquipmentUnitsTableProps {
  equipmentId: string
  productName: string
  onCountChange?: (count: number) => void
}

export function EquipmentUnitsTable({ equipmentId, productName, onCountChange }: EquipmentUnitsTableProps) {
  const [rows, setRows] = useState<EquipmentUnitWithStatus[]>([])
  const [isLoading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [isAdding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<EquipmentUnit | null>(null)
  const [isDeleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [pendingAction, setPendingAction] = useState<string | null>(null)

  const docLabelRefs = useRef(new Map<string, HTMLDivElement>())
  const barcodeLabelRefs = useRef(new Map<string, HTMLDivElement>())

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    fetchEquipmentUnitsWithStatus(equipmentId)
      .then((units) => {
        if (!cancelled) setRows(units)
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load equipment units:', error)
        if (!cancelled) setLoadError('Could not load individual units. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [equipmentId])

  async function handleAddItem() {
    if (isAdding) return
    setAdding(true)
    setAddError(null)

    try {
      const unit = await addEquipmentUnit(equipmentId)
      const newCount = rows.length + 1
      await setEquipmentQuantityTotal(equipmentId, newCount)
      setRows((current) => [...current, { unit, status: 'available' }])
      onCountChange?.(newCount)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to add a new unit:', error)
      setAddError('Could not add a new item. Please try again.')
    } finally {
      setAdding(false)
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || isDeleting) return
    setDeleting(true)
    setDeleteError(null)

    try {
      await deleteEquipmentUnit(deleteTarget.id)
      const newCount = rows.length - 1
      await setEquipmentQuantityTotal(equipmentId, newCount)
      setRows((current) => current.filter((row) => row.unit.id !== deleteTarget.id))
      onCountChange?.(newCount)
      setDeleteTarget(null)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete unit:', error)
      setDeleteError('Could not delete this item. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  async function withPdf(unitId: string, actionKey: string, run: (pdf: jsPDF) => void) {
    const docEl = docLabelRefs.current.get(unitId)
    const barcodeEl = barcodeLabelRefs.current.get(unitId)
    if (!docEl || !barcodeEl || pendingAction) return

    setPendingAction(actionKey)
    try {
      const pdf = await buildItemLabelsPdf(docEl, barcodeEl)
      run(pdf)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to generate unit label PDF:', error)
    } finally {
      setPendingAction(null)
    }
  }

  function handlePrint(unit: EquipmentUnit) {
    void withPdf(unit.id, `print-${unit.id}`, (pdf) => printLabelsPdf(pdf))
  }

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Individual units in inventory</span>

      <div className={styles.card}>
        {isLoading && (
          <>
            <SkeletonLabel label="Loading units…" />
            <table className={styles.table} aria-busy="true">
              <thead>
                <tr>
                  <th className={styles.thSerial}>Serial number</th>
                  <th className={styles.thStatus}>Status</th>
                  <th className={styles.thAction} aria-hidden="true" />
                  <th className={styles.thAction} aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 4 }, (_, index) => (
                  <tr key={index} className={styles.row} aria-hidden="true">
                    <td className={styles.tdSerial}>
                      <Skeleton width="10rem" height="1.125rem" shape="pill" />
                    </td>
                    <td className={styles.tdStatus}>
                      <Skeleton width="6rem" height="1.75rem" shape="pill" />
                    </td>
                    <td className={styles.tdAction}>
                      <Skeleton width="2rem" height="2rem" radius="0.5rem" />
                    </td>
                    <td className={styles.tdAction}>
                      <Skeleton width="2rem" height="2rem" radius="0.5rem" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {!isLoading && loadError && <p className={styles.status}>{loadError}</p>}

        {!isLoading && !loadError && (
          <>
            {rows.length === 0 ? (
              <p className={styles.status}>No units yet. Add one below.</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.thSerial}>Serial number</th>
                    <th className={styles.thStatus}>Status</th>
                    <th className={styles.thAction} aria-hidden="true" />
                    <th className={styles.thAction} aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ unit, status }) => (
                    <tr key={unit.id} className={styles.row}>
                      <td className={styles.tdSerial}>{unit.serial_number}</td>
                      <td className={styles.tdStatus}>
                        <span
                          className={
                            status === 'available'
                              ? `${styles.chip} ${styles.chipAvailable}`
                              : `${styles.chip} ${styles.chipCheckedOut}`
                          }
                        >
                          {status === 'available' ? 'available' : 'checked out'}
                        </span>
                      </td>
                      <td className={styles.tdAction}>
                        <button
                          type="button"
                          className={styles.actionButton}
                          aria-label={`Print label for ${unit.serial_number}`}
                          onClick={() => handlePrint(unit)}
                          disabled={pendingAction !== null}
                        >
                          <PrinterIconFilled size={19} />
                        </button>
                      </td>
                      <td className={styles.tdAction}>
                        <button
                          type="button"
                          className={styles.actionButton}
                          aria-label={`Delete ${unit.serial_number}`}
                          onClick={() => setDeleteTarget(unit)}
                          disabled={status === 'checked_out'}
                        >
                          <TrashCanIconFilled size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {addError && <p className={styles.inlineError}>{addError}</p>}

            <div className={styles.footer}>
              <button type="button" className={styles.addButton} onClick={() => void handleAddItem()} disabled={isAdding}>
                <PlusIconSmallFilled size={15} color="#4a647f" />
                {isAdding ? '…' : 'Add unit'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Off-screen — rendered so html2canvas can rasterize real label markup into the PDF. */}
      <div style={{ position: 'fixed', top: 0, left: '-99999px', pointerEvents: 'none' }} aria-hidden="true">
        {rows.map(({ unit }) => (
          <div key={unit.id}>
            <div
              ref={(el) => {
                if (el) docLabelRefs.current.set(unit.id, el)
              }}
            >
              <QrDocLabel productName={productName} />
            </div>
            <div
              ref={(el) => {
                if (el) barcodeLabelRefs.current.set(unit.id, el)
              }}
            >
              <SerialBarcodeLabel serial={unit.serial_number} />
            </div>
          </div>
        ))}
      </div>

      <ConfirmActionModal
        isOpen={deleteTarget !== null}
        heading="Delete this item?"
        body={[
          `${deleteTarget?.serial_number ?? 'This unit'} will be permanently removed from the inventory. This cannot be undone.`,
          ...(deleteError ? [deleteError] : []),
        ]}
        confirmLabel={isDeleting ? 'Deleting…' : 'Delete'}
        confirmDisabled={isDeleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => {
          setDeleteTarget(null)
          setDeleteError(null)
        }}
      />
    </div>
  )
}
