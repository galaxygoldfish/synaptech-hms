import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type jsPDF from 'jspdf'
import { useAuth } from '../context/AuthContext'
import { Header } from '../components/admin-dashboard/Header'
import { ProfileModal } from '../components/admin-dashboard/ProfileModal'
import { QrDocLabel } from '../components/admin-dashboard/labels/QrDocLabel'
import { SerialBarcodeLabel } from '../components/admin-dashboard/labels/SerialBarcodeLabel'
import { DownloadIconFilled } from '../components/admin-dashboard/icons'
import { buildItemLabelsPdf, downloadLabelsPdf } from '../lib/labelPdf'
import type { UserProfile } from '../types'
import styles from './AddInventoryItemLabelsPage.module.css'

interface LabelsRouteState {
  productName: string
  imagePreviewUrl: string | null
  quantity: number
  serials: string[]
}

function isLabelsRouteState(value: unknown): value is LabelsRouteState {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<LabelsRouteState>
  return (
    typeof state.productName === 'string' &&
    typeof state.quantity === 'number' &&
    Array.isArray(state.serials)
  )
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item'
}

export default function AddInventoryItemLabelsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  const docLabelRefs = useRef(new Map<string, HTMLDivElement>())
  const barcodeLabelRefs = useRef(new Map<string, HTMLDivElement>())

  const routeState = isLabelsRouteState(location.state) ? location.state : null

  useEffect(() => {
    if (!routeState) {
      navigate('/adminHome/add-item', { replace: true })
    }
  }, [routeState, navigate])

  const items = useMemo(() => {
    if (!routeState) return []
    return routeState.serials.map((serial) => ({
      serial,
      name: routeState.productName,
      imageUrl: routeState.imagePreviewUrl,
    }))
  }, [routeState])

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

  function handleNext() {
    navigate('/adminHome/add-item/done')
  }

  async function withPdf(serial: string, actionKey: string, run: (pdf: jsPDF) => void) {
    const docEl = docLabelRefs.current.get(serial)
    const barcodeEl = barcodeLabelRefs.current.get(serial)
    if (!docEl || !barcodeEl || pendingAction) return

    setPendingAction(actionKey)
    try {
      const pdf = await buildItemLabelsPdf(docEl, barcodeEl)
      run(pdf)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to generate item labels PDF:', error)
    } finally {
      setPendingAction(null)
    }
  }

  function handleDownload(item: { name: string; serial: string }) {
    void withPdf(item.serial, `download-${item.serial}`, (pdf) => {
      downloadLabelsPdf(pdf, `${slugify(item.name)}-${item.serial}-labels.pdf`)
    })
  }

  if (!routeState) return null

  return (
    <div className={styles.page}>
      <Header userName={user?.name ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <h1 className={styles.heading}>Download, print &amp; attach product labels</h1>
        <p className={styles.subtext}>
          You must affix all provided labels to each hardware item.
        </p>
        <p className={styles.subtext}>
          Each label has a unique item serial number used in the HMS inventory system. Consumable items do not need labels
        </p>

        <div className={styles.card}>
          {items.map((item) => (
            <div className={styles.itemRow} key={item.serial}>
              {item.imageUrl && <img src={item.imageUrl} alt="" className={styles.itemThumb} />}
              <div className={styles.itemInfo}>
                <p className={styles.itemName}>{item.name}</p>
                <p className={styles.itemSerial}>{item.serial}</p>
              </div>
              <div className={styles.itemActions}>
                <button
                  type="button"
                  className={styles.itemActionButton}
                  aria-label="Download label"
                  onClick={() => handleDownload(item)}
                  disabled={pendingAction !== null}
                >
                  <DownloadIconFilled size={20} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.backButton} onClick={() => navigate('/adminHome/add-item')}>
            back
          </button>
          <button type="button" className={styles.nextButton} onClick={handleNext}>
            next
          </button>
        </div>
      </main>

      {/* Off-screen — rendered so html2canvas can rasterize real label markup into the PDF. */}
      <div style={{ position: 'fixed', top: 0, left: '-99999px', pointerEvents: 'none' }} aria-hidden="true">
        {items.map((item) => (
          <div key={item.serial}>
            <div
              ref={(el) => {
                if (el) docLabelRefs.current.set(item.serial, el)
              }}
            >
              <QrDocLabel productName={item.name} />
            </div>
            <div
              ref={(el) => {
                if (el) barcodeLabelRefs.current.set(item.serial, el)
              }}
            >
              <SerialBarcodeLabel serial={item.serial} />
            </div>
          </div>
        ))}
      </div>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
