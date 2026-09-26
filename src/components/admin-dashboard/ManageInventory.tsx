import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { SearchBar } from './SearchBar'
import { ArrowLeftIcon, ChevronRightFilled, ImagePlaceholderIconFilled, PlusIconSmallFilled } from './icons'
import { fetchEquipmentInventorySummary, type EquipmentInventoryRow } from '../../lib/inventory'
import type { UserProfile } from '../../types'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import styles from './ManageInventory.module.css'

function matchesQuery(row: EquipmentInventoryRow, query: string): boolean {
  return row.equipment.name.toLowerCase().includes(query)
}

/**
 * One of the three counts on a row. The label sits under the number rather
 * than in a header row above the list: these are pill rows, not a table, and
 * a column heading a phone has scrolled past explains nothing.
 */
function Count({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <span className={`${styles.count} ${tone}`}>
      <span className={styles.countValue}>{value}</span>
      <span className={styles.countLabel}>{label}</span>
    </span>
  )
}

export default function ManageInventory() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [rows, setRows] = useState<EquipmentInventoryRow[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false

    fetchEquipmentInventorySummary()
      .then((items) => {
        if (!cancelled) setRows(items)
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

  const visibleRows = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return rows
    return rows.filter((row) => matchesQuery(row, trimmed))
  }, [rows, query])

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  return (
    <div className={styles.page}>
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <div className={styles.topRow}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate('/adminHome')}
            aria-label="Back"
          >
            <ArrowLeftIcon size={20} />
            <span>Back</span>
          </button>
          <h1 className={styles.heading}>Manage hardware inventory</h1>
          <button
            type="button"
            className={styles.addButton}
            onClick={() => navigate('/adminHome/add-item')}
            aria-label="Add item"
          >
            <PlusIconSmallFilled size={15} />
            <span>Add</span>
          </button>
        </div>

        <div className={styles.card}>
          <div className={styles.toolbar}>
            <div className={styles.searchWrap}>
              <SearchBar value={query} onChange={setQuery} placeholder="Search hardware inventory" />
            </div>
          </div>

          {isLoading && (
            <SkeletonScreen label="Loading inventory…">
              <ul className={styles.itemList}>
                {Array.from({ length: 5 }, (_, index) => (
                  <li key={index}>
                    <div className={styles.skeletonRow}>
                      <Skeleton width="4.5rem" height="3.25rem" radius="0.625rem" style={{ gridArea: 'thumb' }} />
                      <Skeleton width="45%" height="1.5rem" shape="pill" style={{ gridArea: 'info' }} />
                      <Skeleton width="4.5rem" height="3rem" radius="0.5rem" style={{ gridArea: 'total' }} />
                      <Skeleton width="4.5rem" height="3rem" radius="0.5rem" style={{ gridArea: 'out' }} />
                      <Skeleton width="4.5rem" height="3rem" radius="0.5rem" style={{ gridArea: 'in' }} />
                    </div>
                  </li>
                ))}
              </ul>
            </SkeletonScreen>
          )}

          {!isLoading && error && <p className={styles.status}>{error}</p>}

          {!isLoading && !error && rows.length === 0 && (
            <p className={styles.status}>
              There is no hardware in the catalogue yet. Add an item and it will appear here with its
              stock counts.
            </p>
          )}

          {!isLoading && !error && rows.length > 0 && visibleRows.length === 0 && (
            <p className={styles.status}>No inventory items match your search.</p>
          )}

          {!isLoading && !error && visibleRows.length > 0 && (
            <ul className={styles.itemList}>
              {visibleRows.map(({ equipment, checkedOut }) => (
                <li key={equipment.id}>
                  <button
                    type="button"
                    className={styles.itemRow}
                    onClick={() => navigate(`/adminHome/inventory/${equipment.id}`)}
                  >
                    {equipment.image_url ? (
                      <img src={equipment.image_url} alt="" className={styles.itemThumb} />
                    ) : (
                      <span className={styles.itemThumbEmpty}>
                        <ImagePlaceholderIconFilled size={24} />
                      </span>
                    )}

                    <span className={styles.itemInfo}>
                      <span className={styles.itemName}>{equipment.name}</span>
                    </span>

                    <Count value={equipment.quantity_total} label="total" tone={styles.countTotal} />
                    <Count value={checkedOut} label="checked out" tone={styles.countOut} />
                    <Count
                      value={equipment.quantity_total - checkedOut}
                      label="in stock"
                      tone={styles.countIn}
                    />

                    <span className={styles.chevron}>
                      <ChevronRightFilled size={9} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
