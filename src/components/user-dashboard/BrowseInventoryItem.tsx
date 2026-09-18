import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { ArrowLeftIcon, ArrowUpLeftFilled, ChevronRightFilled, DocumentationIcon, HelpIconFilled } from './icons'
import { fetchEquipment } from '../../lib/inventory'
import type { Equipment, UserProfile } from '../../types'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import styles from './BrowseInventoryItem.module.css'

// Help & support always points at the club's Discord — same link used on
// the checkout confirm screen (CheckoutConfirmHardware.tsx).
const HELP_AND_SUPPORT_URL = 'https://discord.gg/zNKCN5233Y'

function isOutOfStock(item: Equipment): boolean {
  return item.quantity_total <= 0
}

export default function BrowseInventoryItem() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const equipmentId = (location.state as { equipmentId?: string } | null)?.equipmentId ?? null

  const [equipment, setEquipment] = useState<Equipment | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!equipmentId) return
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchEquipment(equipmentId)
      .then((item) => {
        if (!cancelled) setEquipment(item)
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load item:', fetchError)
        if (!cancelled) setError('Could not load this item. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [equipmentId])

  useEffect(() => {
    if (!equipmentId) navigate('/home/browse', { replace: true })
  }, [equipmentId, navigate])

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

  if (!equipmentId) return null

  return (
    <div className={styles.page}>
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <button type="button" className={styles.backButton} onClick={() => navigate('/home/browse')} aria-label="Back">
          <ArrowLeftIcon size={22} />
          <span className={styles.backButtonLabel}>Back</span>
        </button>

        {isLoading && (
          <SkeletonScreen label="Loading item…" className={styles.layoutCentered}>
            <div className={styles.itemInfo}>
              <Skeleton width="min(20rem, 100%)" height="15rem" radius="0.75rem" />
              <Skeleton width="14rem" height="1.875rem" shape="pill" />
              <Skeleton width="22rem" height="1.125rem" shape="pill" />
              <Skeleton width="8rem" height="1.125rem" shape="pill" />
            </div>
          </SkeletonScreen>
        )}
        {!isLoading && error && <p className={styles.status}>{error}</p>}

        {!isLoading && !error && equipment && (
          <div className={styles.layoutCentered}>
            <div className={styles.itemInfo}>
              {equipment.image_url && <img src={equipment.image_url} alt="" className={styles.itemImage} />}
              <h1 className={styles.itemName}>{equipment.name}</h1>
              {equipment.description && <p className={styles.itemDescription}>{equipment.description}</p>}
              <p className={styles.itemAvailable}>
                {isOutOfStock(equipment) ? 'Out of stock' : `${equipment.quantity_total} available`}
              </p>
            </div>

            <div className={styles.linkRows}>
              <button
                type="button"
                className={`${styles.linkRow} ${styles.linkRowTop}`}
                onClick={() =>
                  equipment.documentation_url &&
                  window.open(equipment.documentation_url, '_blank', 'noopener,noreferrer')
                }
                disabled={!equipment.documentation_url}
              >
                <span className={styles.linkRowLeft}>
                  <span className={styles.linkRowIcon}>
                    <DocumentationIcon size={22} />
                  </span>
                  View item-specific documentation
                </span>
                <ChevronRightFilled size={9} color="#474747" />
              </button>
              <a
                className={styles.linkRow}
                href={HELP_AND_SUPPORT_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className={styles.linkRowLeft}>
                  <span className={styles.linkRowIcon}>
                    <HelpIconFilled size={22} />
                  </span>
                  Get help &amp; support
                </span>
                <ChevronRightFilled size={9} color="#474747" />
              </a>
              <button
                type="button"
                className={`${styles.linkRow} ${styles.linkRowBottom}`}
                onClick={() => navigate('/home/checkout/confirm', { state: { equipmentId: equipment.id } })}
              >
                <span className={styles.linkRowLeft}>
                  <span className={styles.linkRowIcon}>
                    <ArrowUpLeftFilled size={15} />
                  </span>
                  Checkout this item
                </span>
                <ChevronRightFilled size={9} color="#474747" />
              </button>
            </div>
          </div>
        )}
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
