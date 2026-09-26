import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type jsPDF from 'jspdf'
import { useAuth } from '../context/AuthContext'
import { Header } from '../components/admin-dashboard/Header'
import { ProfileModal } from '../components/admin-dashboard/ProfileModal'
import { QrDocLabel } from '../components/admin-dashboard/labels/QrDocLabel'
import { SerialBarcodeLabel } from '../components/admin-dashboard/labels/SerialBarcodeLabel'
import {
  ArrowLeftIcon,
  DownloadIconFilled,
  DownloadSeparateIconFilled,
  PrinterIconFilled,
} from '../components/admin-dashboard/icons'
import { fetchEquipment, listEquipmentUnits } from '../lib/inventory'
import {
  buildItemLabelsPdf,
  downloadItemLabelsAsPngs,
  downloadLabelsPdf,
  printLabelsPdf,
} from '../lib/labelPdf'
import type { Equipment, EquipmentUnit, UserProfile } from '../types'
import styles from './GetReplacementLabelPage.module.css'

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item'
}

export default function GetLabelsProductPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [equipment, setEquipment] = useState<Equipment | null>(null)
  const [units, setUnits] = useState<EquipmentUnit[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  const docLabelRefs = useRef(new Map<string, HTMLDivElement>())
  const barcodeLabelRefs = useRef(new Map<string, HTMLDivElement>())

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([fetchEquipment(id), listEquipmentUnits(id)])
      .then(([product, productUnits]) => {
        if (cancelled) return
        setEquipment(product)
        setUnits(productUnits)
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load hardware units:', fetchError)
        if (!cancelled) setError('Could not load this hardware. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  const user = useMemo<UserProfile | null>(() => {
    if (!profile) return null
    return {
      name: `${profile.first_name} ${profile.last_name}`,
      role: profile.role === 'admin' ? 'ADMINISTRATOR' : 'MEMBER',
      email: profile.uw_email,
      handle: profile.discord,
      location: profile.address,
    }
  }, [profile])

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  async function withPdf(serial: string, actionKey: string, run: (pdf: jsPDF) => void) {
    const docEl = docLabelRefs.current.get(serial)
    const barcodeEl = barcodeLabelRefs.current.get(serial)
    if (!docEl || !barcodeEl || pendingAction) return

    setPendingAction(actionKey)
    try {
      const pdf = await buildItemLabelsPdf(docEl, barcodeEl)
      run(pdf)
    } catch (pdfError) {
      // eslint-disable-next-line no-console
      console.error('Failed to generate replacement label PDF:', pdfError)
    } finally {
      setPendingAction(null)
    }
  }

  function handleDownload(serial: string) {
    if (!equipment) return
    void withPdf(serial, `download-${serial}`, (pdf) => {
      downloadLabelsPdf(pdf, `${slugify(equipment.name)}-${serial}-labels.pdf`)
    })
  }

  function handlePrint(serial: string) {
    void withPdf(serial, `print-${serial}`, (pdf) => printLabelsPdf(pdf))
  }

  async function handleDownloadSeparate(serial: string) {
    const docEl = docLabelRefs.current.get(serial)
    const barcodeEl = barcodeLabelRefs.current.get(serial)
    if (!equipment || !docEl || !barcodeEl || pendingAction) return

    const base = `${slugify(equipment.name)}-${serial}`
    setPendingAction(`download-separate-${serial}`)
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
    <div className={styles.page}>
      <Header userName={user?.name ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <div className={styles.topRow}>
        <button
          type="button"
          className={styles.topBackButton}
          onClick={() => navigate('/adminHome/get-labels/browse')}
          aria-label="Back"
        >
          <ArrowLeftIcon size={20} />
          <span>Back</span>
        </button>
        <h1 className={styles.heading}>Get a replacement label</h1>
        <div />
      </div>

      <main className={`${styles.main} ${styles.browseMain}`}>
        {isLoading && <p className={styles.statusText}>Loading hardware…</p>}
        {!isLoading && error && <p className={styles.statusText}>{error}</p>}

        {!isLoading && !error && equipment && (
          <>
            {units.length === 0 ? (
              <p className={styles.statusText}>There are no units of {equipment.name} in inventory.</p>
            ) : (
              <div className={styles.card}>
                <div className={styles.browseList}>
                  {units.map((unit) => (
                    <div className={styles.itemRow} key={unit.id}>
                      {equipment.image_url && <img src={equipment.image_url} alt="" className={styles.itemThumb} />}
                      <div className={styles.itemInfo}>
                        <p className={styles.itemName}>{equipment.name}</p>
                        <p className={styles.itemSerial}>{unit.serial_number}</p>
                      </div>
                      <div className={styles.itemActions}>
                        <button
                          type="button"
                          className={styles.itemActionButton}
                          aria-label={`Print label for ${unit.serial_number}`}
                          onClick={() => handlePrint(unit.serial_number)}
                          disabled={pendingAction !== null}
                        >
                          <PrinterIconFilled size={22} />
                        </button>
                        <button
                          type="button"
                          className={styles.itemActionButton}
                          aria-label={`Download label for ${unit.serial_number}`}
                          onClick={() => handleDownload(unit.serial_number)}
                          disabled={pendingAction !== null}
                        >
                          <DownloadIconFilled size={20} />
                        </button>
                        <button
                          type="button"
                          className={styles.itemActionButton}
                          aria-label={`Download labels for ${unit.serial_number} as separate PNGs`}
                          onClick={() => void handleDownloadSeparate(unit.serial_number)}
                          disabled={pendingAction !== null}
                        >
                          <DownloadSeparateIconFilled size={20} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.footerActions}>
              <button type="button" className={styles.nextButton} onClick={() => navigate('/adminHome')}>
                done
              </button>
            </div>
          </>
        )}
      </main>

      {/* Off-screen — rendered so html2canvas can rasterize real label markup into the PDF. */}
      {equipment && (
        <div style={{ position: 'fixed', top: 0, left: '-99999px', pointerEvents: 'none' }} aria-hidden="true">
          {units.map((unit) => (
            <div key={unit.id}>
              <div
                ref={(el) => {
                  if (el) docLabelRefs.current.set(unit.serial_number, el)
                }}
              >
                <QrDocLabel productName={equipment.name} />
              </div>
              <div
                ref={(el) => {
                  if (el) barcodeLabelRefs.current.set(unit.serial_number, el)
                }}
              >
                <SerialBarcodeLabel serial={unit.serial_number} />
              </div>
            </div>
          ))}
        </div>
      )}

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
