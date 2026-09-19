import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Header } from '../components/admin-dashboard/Header'
import { ProfileModal } from '../components/admin-dashboard/ProfileModal'
import { ArrowLeftIcon, ChevronRightIcon } from '../components/admin-dashboard/icons'
import { listEquipment } from '../lib/inventory'
import type { Equipment, UserProfile } from '../types'
import styles from './GetReplacementLabelPage.module.css'

export default function GetLabelsBrowsePage() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listEquipment()
      .then((items) => {
        // Consumables carry no per-unit serial labels.
        if (!cancelled) setEquipment(items.filter((item) => item.product_type === 'hardware'))
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load inventory:', fetchError)
        if (!cancelled) setError('Could not load inventory. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

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

  return (
    <div className={styles.page}>
      <Header userName={user?.name ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <div className={styles.topRow}>
        <button
          type="button"
          className={styles.topBackButton}
          onClick={() => navigate('/adminHome/get-labels')}
          aria-label="Back"
        >
          <ArrowLeftIcon size={20} />
          <span>Back</span>
        </button>
        <h1 className={styles.heading}>Pick from database</h1>
        <div />
      </div>

      <main className={`${styles.main} ${styles.browseMain}`}>
        {isLoading && <p className={styles.statusText}>Loading inventory…</p>}
        {!isLoading && error && <p className={styles.statusText}>{error}</p>}
        {!isLoading && !error && equipment.length === 0 && (
          <p className={styles.statusText}>No hardware in inventory yet.</p>
        )}

        {!isLoading && !error && equipment.length > 0 && (
          <div className={styles.card}>
            <div className={styles.browseList}>
              {equipment.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.itemRow} ${styles.browseRow}`}
                  onClick={() => navigate(`/adminHome/get-labels/browse/${item.id}`)}
                >
                  {item.image_url && <img src={item.image_url} alt="" className={styles.itemThumb} />}
                  <div className={styles.itemInfo}>
                    <p className={styles.itemName}>{item.name}</p>
                  </div>
                  <ChevronRightIcon size={20} className={styles.browseChevron} />
                </button>
              ))}
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
