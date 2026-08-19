import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { CloudUploadIcon, DocumentIcon, DownloadIcon, TrashIcon } from './icons'
import { fetchAvailableSerialNumber, fetchEquipment, fetchEquipmentByIds } from '../../lib/inventory'
import { buildLoanAgreementPdf, downloadLoanAgreementPdf } from '../../lib/loanAgreementPdf'
import type { Equipment, UserProfile } from '../../types'
import styles from './CheckoutSignAgreement.module.css'

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item'
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatCurrency(value: number | null): string {
  return value == null ? 'N/A' : `$${value.toFixed(2)}`
}

interface CheckoutState {
  equipmentId: string
  optionalAddonIds: string[]
  requiredAddonId: string | null
  returnDates: Record<string, string>
}

function readCheckoutState(state: unknown): CheckoutState | null {
  if (!state || typeof state !== 'object') return null
  const value = state as Partial<CheckoutState>
  if (typeof value.equipmentId !== 'string' || !value.returnDates) return null
  return {
    equipmentId: value.equipmentId,
    optionalAddonIds: Array.isArray(value.optionalAddonIds) ? value.optionalAddonIds : [],
    requiredAddonId: typeof value.requiredAddonId === 'string' ? value.requiredAddonId : null,
    returnDates: value.returnDates,
  }
}

interface SignedAgreementDropzoneProps {
  onFileSelected: (file: File) => void
}

// Only ever rendered before a file has been chosen — once one is uploaded,
// the parent swaps this out for the filename + delete view entirely.
function SignedAgreementDropzone({ onFileSelected }: SignedAgreementDropzoneProps) {
  const [isDragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFiles(files: FileList | null) {
    const selected = files?.[0]
    if (selected) onFileSelected(selected)
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={(event) => handleFiles(event.target.files)}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        className={isDragging ? `${styles.dropzone} ${styles.dropzoneActive}` : styles.dropzone}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event: DragEvent<HTMLButtonElement>) => {
          event.preventDefault()
          setDragging(false)
          handleFiles(event.dataTransfer.files)
        }}
      >
        <CloudUploadIcon size={26} className={styles.dropzoneIcon} />
        <span className={styles.dropzoneLabel}>
          <span className={styles.dropzoneLabelDesktop}>Drag signed agreement here to upload</span>
          <span className={styles.dropzoneLabelMobile}>Click here to upload your signed agreement form</span>
        </span>
      </button>
    </>
  )
}

export default function CheckoutSignAgreement() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const checkoutState = readCheckoutState(location.state)

  const [items, setItems] = useState<Equipment[]>([])
  const [serials, setSerials] = useState<Record<string, string | null>>({})
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, File>>({})
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  useEffect(() => {
    if (!checkoutState) return
    let cancelled = false
    setLoading(true)
    setError(null)

    const addonIds = [
      ...checkoutState.optionalAddonIds,
      ...(checkoutState.requiredAddonId ? [checkoutState.requiredAddonId] : []),
    ]

    Promise.all([fetchEquipment(checkoutState.equipmentId), fetchEquipmentByIds(addonIds)])
      .then(async ([mainItem, addonItems]) => {
        if (cancelled) return
        const allItems = [mainItem, ...addonItems]
        setItems(allItems)

        const hardwareItems = allItems.filter((item) => item.product_type === 'hardware')
        const serialEntries = await Promise.all(
          hardwareItems.map(async (item) => [item.id, await fetchAvailableSerialNumber(item.id)] as const),
        )
        if (!cancelled) setSerials(Object.fromEntries(serialEntries))
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load checkout items:', fetchError)
        if (!cancelled) setError('Could not load your checkout items. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutState?.equipmentId])

  useEffect(() => {
    if (!checkoutState) navigate('/home/checkout', { replace: true })
  }, [checkoutState, navigate])

  const hardwareItems = useMemo(() => items.filter((item) => item.product_type === 'hardware'), [items])
  const canSubmit =
    !isLoading && !error && hardwareItems.length > 0 && hardwareItems.every((item) => Boolean(uploadedFiles[item.id]))

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

  function handleRemoveFile(itemId: string) {
    setUploadedFiles((current) => {
      const next = { ...current }
      delete next[itemId]
      return next
    })
  }

  async function handleDownload(item: Equipment) {
    if (!profile || !checkoutState) return
    setDownloadingId(item.id)
    try {
      const returnDateIso = checkoutState.returnDates[item.id]
      const pdf = await buildLoanAgreementPdf({
        fullName: `${profile.first_name} ${profile.last_name}`,
        studentId: profile.student_id,
        studentEmail: profile.uw_email,
        phone: profile.phone,
        address: profile.address,
        productName: item.name,
        serialNumber: serials[item.id] ?? 'TBD',
        loanDate: formatDate(new Date().toISOString().slice(0, 10)),
        returnDate: returnDateIso ? formatDate(returnDateIso) : 'TBD',
        replacementValue: formatCurrency(item.replacement_value),
      })
      downloadLoanAgreementPdf(pdf, `${slugify(item.name)}-loan-agreement.pdf`)
    } catch (downloadError) {
      // eslint-disable-next-line no-console
      console.error('Failed to generate loan agreement PDF:', downloadError)
    } finally {
      setDownloadingId(null)
    }
  }

  function handleNext() {
    if (!canSubmit || !checkoutState) return
    navigate('/home/checkout/availability', {
      state: { ...checkoutState, signedAgreements: uploadedFiles },
    })
  }

  if (!checkoutState) return null

  return (
    <div className={styles.page}>
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <h1 className={styles.heading}>Sign the Hardware Loan Agreement</h1>
        <p className={styles.subtext}>You must sign a Hardware Loan Agreement for each hardware product that you check out</p>
        <p className={styles.subtext}>Download the document, add your signature, then upload it to the corresponding item</p>
        <p className={`${styles.subtext} ${styles.subtextMobileOnly}`}>This might be easier to do on a computer</p>

        {isLoading && <p className={styles.status}>Loading…</p>}
        {!isLoading && error && <p className={styles.status}>{error}</p>}

        {!isLoading && !error && items.length > 0 && (
          <div className={styles.card}>
            <p className={styles.cardTitle}>Items to be checked out</p>
            <ul className={styles.itemList}>
              {items.map((item) => {
                const needsSignature = item.product_type === 'hardware'
                return (
                  <li key={item.id} className={styles.itemRow}>
                    {item.image_url && <img src={item.image_url} alt="" className={styles.itemThumb} />}

                    <div className={styles.itemMain}>
                      <p className={styles.itemName}>{item.name}</p>

                      {needsSignature ? (
                        uploadedFiles[item.id] ? (
                          <div className={styles.uploadedArea}>
                            <span className={styles.uploadedFile}>
                              <DocumentIcon size={20} className={styles.uploadedFileIcon} />
                              <span className={styles.uploadedFileName}>{uploadedFiles[item.id].name}</span>
                            </span>
                            <button
                              type="button"
                              className={styles.deleteButton}
                              onClick={() => handleRemoveFile(item.id)}
                            >
                              <TrashIcon size={18} />
                              Delete
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className={styles.downloadButton}
                            onClick={() => handleDownload(item)}
                            disabled={downloadingId === item.id}
                          >
                            <DownloadIcon size={20} />
                            {downloadingId === item.id
                              ? 'Preparing…'
                              : `Download Hardware Loan Agreement for ${item.name}`}
                          </button>
                        )
                      ) : (
                        <p className={styles.consumableNote}>
                          You don&rsquo;t need to sign the Hardware Loan Agreement as this item is consumable
                        </p>
                      )}
                    </div>

                    {needsSignature && !uploadedFiles[item.id] && (
                      <SignedAgreementDropzone
                        onFileSelected={(file) =>
                          setUploadedFiles((current) => ({ ...current, [item.id]: file }))
                        }
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.backButton} onClick={() => navigate(-1)}>
            back
          </button>
          <button type="button" className={styles.submitButton} onClick={handleNext} disabled={!canSubmit}>
            next
          </button>
        </div>
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
