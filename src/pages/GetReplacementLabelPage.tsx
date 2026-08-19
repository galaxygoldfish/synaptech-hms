import { useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type jsPDF from 'jspdf'
import { useAuth } from '../context/AuthContext'
import { Header } from '../components/admin-dashboard/Header'
import { ProfileModal } from '../components/admin-dashboard/ProfileModal'
import { QrDocLabel } from '../components/admin-dashboard/labels/QrDocLabel'
import { SerialBarcodeLabel } from '../components/admin-dashboard/labels/SerialBarcodeLabel'
import { ArrowLeftIcon, DownloadIconFilled, PrinterIconFilled } from '../components/admin-dashboard/icons'
import { fetchEquipmentUnitBySerial } from '../lib/inventory'
import { buildItemLabelsPdf, downloadLabelsPdf, printLabelsPdf } from '../lib/labelPdf'
import type { Equipment, UserProfile } from '../types'
import styles from './GetReplacementLabelPage.module.css'

type Step = 'search' | 'result'

interface LookupResult {
  equipment: Equipment
  serial: string
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item'
}

export default function GetReplacementLabelPage() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [step, setStep] = useState<Step>('search')
  const [serialSuffix, setSerialSuffix] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [isSearching, setSearching] = useState(false)
  const [result, setResult] = useState<LookupResult | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  const docLabelRef = useRef<HTMLDivElement | null>(null)
  const barcodeLabelRef = useRef<HTMLDivElement | null>(null)

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

  function handleSuffixChange(event: ChangeEvent<HTMLInputElement>) {
    setSerialSuffix(event.target.value)
    if (notFound) setNotFound(false)
  }

  function handleSuffixKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') void handleNext()
  }

  async function handleNext() {
    const suffix = serialSuffix.trim().toUpperCase()
    if (!suffix || isSearching) return

    setSearching(true)
    try {
      const lookup = await fetchEquipmentUnitBySerial(`SYN-${suffix}`)
      if (!lookup) {
        setNotFound(true)
        return
      }
      setNotFound(false)
      setResult({ equipment: lookup.equipment, serial: lookup.unit.serial_number })
      setStep('result')
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to look up item by serial number:', error)
      setNotFound(true)
    } finally {
      setSearching(false)
    }
  }

  async function withPdf(actionKey: string, run: (pdf: jsPDF) => void) {
    const docEl = docLabelRef.current
    const barcodeEl = barcodeLabelRef.current
    if (!docEl || !barcodeEl || pendingAction) return

    setPendingAction(actionKey)
    try {
      const pdf = await buildItemLabelsPdf(docEl, barcodeEl)
      run(pdf)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to generate replacement label PDF:', error)
    } finally {
      setPendingAction(null)
    }
  }

  function handleDownload() {
    if (!result) return
    void withPdf('download', (pdf) => {
      downloadLabelsPdf(pdf, `${slugify(result.equipment.name)}-${result.serial}-labels.pdf`)
    })
  }

  function handlePrint() {
    if (!result) return
    void withPdf('print', (pdf) => printLabelsPdf(pdf))
  }

  return (
    <div className={styles.page}>
      <Header userName={user?.name ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <div className={styles.topRow}>
        <button
          type="button"
          className={styles.topBackButton}
          onClick={() => navigate('/adminHome')}
          aria-label="Back"
        >
          <ArrowLeftIcon size={20} />
          <span>Back</span>
        </button>
        <h1 className={styles.heading}>Get a replacement label</h1>
        <div />
      </div>

      <main className={styles.main}>
        {step === 'search' && (
          <>
            <p className={styles.subtext}>
              Please enter the serial number of the item you need a new label for
            </p>

            <div className={styles.searchBox}>
              <div className={notFound ? `${styles.serialField} ${styles.serialFieldError}` : styles.serialField}>
                <span className={styles.serialPrefix}>SYN -</span>
                <input
                  className={styles.serialInput}
                  value={serialSuffix}
                  onChange={handleSuffixChange}
                  onKeyDown={handleSuffixKeyDown}
                  aria-label="Serial number"
                  autoFocus
                />
              </div>
              {notFound && <p className={styles.errorText}>Item not found in inventory!</p>}
            </div>

            <div className={styles.footerActions}>
              <button
                type="button"
                className={styles.nextButton}
                onClick={() => void handleNext()}
                disabled={!serialSuffix.trim() || isSearching}
              >
                {isSearching ? 'searching…' : 'next'}
              </button>
            </div>
          </>
        )}

        {step === 'result' && result && (
          <>
            <p className={styles.subtext}>
              Download, print and attach the replacement labels for your product below
            </p>

            <div className={styles.card}>
              <div className={styles.itemRow}>
                {result.equipment.image_url && (
                  <img src={result.equipment.image_url} alt="" className={styles.itemThumb} />
                )}
                <div className={styles.itemInfo}>
                  <p className={styles.itemName}>{result.equipment.name}</p>
                  <p className={styles.itemSerial}>{result.serial}</p>
                </div>
                <div className={styles.itemActions}>
                  <button
                    type="button"
                    className={styles.itemActionButton}
                    aria-label="Print label"
                    onClick={handlePrint}
                    disabled={pendingAction !== null}
                  >
                    <PrinterIconFilled size={22} />
                  </button>
                  <button
                    type="button"
                    className={styles.itemActionButton}
                    aria-label="Download label"
                    onClick={handleDownload}
                    disabled={pendingAction !== null}
                  >
                    <DownloadIconFilled size={20} />
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.footerActions}>
              <button type="button" className={styles.nextButton} onClick={() => navigate('/adminHome')}>
                done
              </button>
            </div>
          </>
        )}
      </main>

      {/* Off-screen — rendered so html2canvas can rasterize real label markup into the PDF. */}
      {result && (
        <div style={{ position: 'fixed', top: 0, left: '-99999px', pointerEvents: 'none' }} aria-hidden="true">
          <div ref={docLabelRef}>
            <QrDocLabel productName={result.equipment.name} />
          </div>
          <div ref={barcodeLabelRef}>
            <SerialBarcodeLabel serial={result.serial} />
          </div>
        </div>
      )}

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
