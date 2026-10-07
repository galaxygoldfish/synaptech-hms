import { useEffect, useRef, useState } from 'react'
import type jsPDF from 'jspdf'
import ConfirmActionModal from '../ConfirmActionModal'
import { Tooltip } from '../Tooltip'
import {
  DownloadIconFilled,
  PauseIconFilled,
  PlayIconFilled,
  PlusIconSmallFilled,
  PrinterIconFilled,
  StepperSubtractIconFilled,
} from './icons'
import { QrDocLabel } from './labels/QrDocLabel'
import { SerialBarcodeLabel } from './labels/SerialBarcodeLabel'
import {
  addEquipmentUnit,
  deleteEquipmentUnit,
  fetchEquipmentUnitsWithStatus,
  setEquipmentQuantityTotal,
  setEquipmentUnitOnHold,
  UnitInUseError,
  type EquipmentUnitStatus,
  type EquipmentUnitWithStatus,
} from '../../lib/inventory'
import { buildItemLabelsPdf, downloadItemLabelsAsPngs, preloadLabelPdfLibs, printLabelsPdf } from '../../lib/labelPdf'
import type { EquipmentUnit } from '../../types'
import { Skeleton, SkeletonLabel } from '../skeleton/Skeleton'
import styles from './EquipmentUnitsTable.module.css'

const STATUS_CHIP_CLASS: Record<EquipmentUnitStatus, string> = {
  available: styles.chipAvailable,
  on_hold: styles.chipOnHold,
  requested: styles.chipRequested,
  checked_out: styles.chipCheckedOut,
}

const STATUS_LABEL: Record<EquipmentUnitStatus, string> = {
  available: 'available',
  on_hold: 'on hold',
  requested: 'requested',
  checked_out: 'checked out',
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item'
}

interface EquipmentUnitsTableProps {
  equipmentId: string
  productName: string
  onCountChange?: (count: number) => void
}

export function EquipmentUnitsTable({ equipmentId, productName, onCountChange }: EquipmentUnitsTableProps) {
  // Fetch the PDF library now, not when the button is pressed.
  useEffect(preloadLabelPdfLibs, [])

  const [rows, setRows] = useState<EquipmentUnitWithStatus[]>([])
  const [isLoading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [isAdding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<EquipmentUnit | null>(null)
  const [isDeleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [pendingAction, setPendingAction] = useState<string | null>(null)

  const [holdingUnitId, setHoldingUnitId] = useState<string | null>(null)
  const [holdError, setHoldError] = useState<string | null>(null)

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

  // No confirmation step: a hold is undone with the same button, and nothing
  // about the unit is lost either way.
  async function handleToggleHold(unit: EquipmentUnit, onHold: boolean) {
    if (holdingUnitId) return
    setHoldingUnitId(unit.id)
    setHoldError(null)

    try {
      const updated = await setEquipmentUnitOnHold(unit.id, onHold)
      setRows((current) =>
        current.map((row) =>
          row.unit.id === unit.id ? { unit: updated, status: onHold ? 'on_hold' : 'available' } : row,
        ),
      )
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to change unit hold:', error)
      if (error instanceof UnitInUseError) {
        // The table is out of date, not just this one action — show what
        // the unit is actually doing now.
        setHoldError(`${error.message} (${unit.serial_number})`)
        fetchEquipmentUnitsWithStatus(equipmentId).then(setRows).catch(() => {})
      } else {
        setHoldError(
          onHold ? 'Could not put this unit on hold. Please try again.' : 'Could not take this unit off hold. Please try again.',
        )
      }
    } finally {
      setHoldingUnitId(null)
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

  async function handleDownload(unit: EquipmentUnit) {
    const docEl = docLabelRefs.current.get(unit.id)
    const barcodeEl = barcodeLabelRefs.current.get(unit.id)
    if (!docEl || !barcodeEl || pendingAction) return

    const base = `${slugify(productName)}-${unit.serial_number}`
    setPendingAction(`download-${unit.id}`)
    try {
      await downloadItemLabelsAsPngs(docEl, barcodeEl, {
        doc: `${base}-qr-label.png`,
        barcode: `${base}-barcode-label.png`,
      })
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to download separate label PNGs:', error)
    } finally {
      setPendingAction(null)
    }
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
                  <th className={styles.thLabels}>Labels</th>
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
                      <div className={styles.statusCell}>
                        <Skeleton width="1.75rem" height="1.75rem" radius="0.5rem" />
                        <Skeleton width="6rem" height="1.75rem" shape="pill" />
                      </div>
                    </td>
                    <td className={styles.tdLabels}>
                      <Skeleton width="2rem" height="2rem" radius="0.5rem" />
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
                    <th className={styles.thLabels}>Labels</th>
                    <th className={styles.thAction} aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ unit, status }) => (
                    <tr key={unit.id} className={styles.row}>
                      <td className={styles.tdSerial}>{unit.serial_number}</td>
                      <td className={styles.tdStatus}>
                        <div className={styles.statusCell}>
                          {/* Only a free unit can be held, and only a held one
                              released. A unit on a request belongs to that
                              request — cancel it from the loan instead. Kept as
                              a disabled button rather than hidden so every
                              row's chip starts at the same place. */}
                          <Tooltip
                            text={
                              status === 'on_hold'
                                ? 'Take off hold'
                                : status === 'available'
                                  ? 'Put on hold'
                                  : 'Only available units can be put on hold'
                            }
                          >
                            <button
                              type="button"
                              className={styles.actionButton}
                              aria-label={
                                status === 'on_hold'
                                  ? `Take ${unit.serial_number} off hold`
                                  : `Put ${unit.serial_number} on hold`
                              }
                              onClick={() => void handleToggleHold(unit, status !== 'on_hold')}
                              disabled={(status !== 'available' && status !== 'on_hold') || holdingUnitId !== null}
                            >
                              {status === 'on_hold' ? <PlayIconFilled size={16} /> : <PauseIconFilled size={16} />}
                            </button>
                          </Tooltip>
                          <span className={`${styles.chip} ${STATUS_CHIP_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
                        </div>
                      </td>
                      <td className={styles.tdLabels}>
                        <Tooltip text="Print labels on PDF">
                          <button
                            type="button"
                            className={styles.actionButton}
                            aria-label={`Print label for ${unit.serial_number}`}
                            onClick={() => handlePrint(unit)}
                            disabled={pendingAction !== null}
                          >
                            <PrinterIconFilled size={19} />
                          </button>
                        </Tooltip>
                        <Tooltip text="Download label PNGs">
                          <button
                            type="button"
                            className={styles.actionButton}
                            aria-label={`Download label for ${unit.serial_number}`}
                            onClick={() => void handleDownload(unit)}
                            disabled={pendingAction !== null}
                          >
                            <DownloadIconFilled size={17} />
                          </button>
                        </Tooltip>
                      </td>
                      <td className={styles.tdAction}>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          aria-label={`Delete ${unit.serial_number}`}
                          onClick={() => setDeleteTarget(unit)}
                          disabled={status === 'checked_out' || status === 'requested'}
                        >
                          <StepperSubtractIconFilled size={11} color="#9c3f3f" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {holdError && (
              <p className={styles.inlineError} role="alert">
                {holdError}
              </p>
            )}
            {addError && <p className={styles.inlineError} role="alert">{addError}</p>}

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
