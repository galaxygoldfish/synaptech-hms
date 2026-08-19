import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { SearchBar } from './SearchBar'
import { ArrowLeftIcon, ChevronRightFilled, ImageIcon } from './icons'
import { fetchEquipmentInventorySummary, type EquipmentInventoryRow } from '../../lib/inventory'
import type { UserProfile } from '../../types'
import styles from './ManageInventory.module.css'

function matchesQuery(row: EquipmentInventoryRow, query: string): boolean {
  return row.equipment.name.toLowerCase().includes(query)
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
        <div className={styles.toolbar}>
          <button type="button" className={styles.backButton} onClick={() => navigate('/adminHome')} aria-label="Back">
            <ArrowLeftIcon size={20} />
            <span>Back</span>
          </button>
          <div className={styles.searchWrap}>
            <SearchBar value={query} onChange={setQuery} placeholder="Search hardware inventory" />
          </div>
        </div>

        <div className={styles.card}>
          {isLoading && <p className={styles.status}>Loading…</p>}
          {!isLoading && error && <p className={styles.status}>{error}</p>}
          {!isLoading && !error && visibleRows.length === 0 && (
            <p className={styles.status}>No inventory items match your search.</p>
          )}

          {!isLoading && !error && visibleRows.length > 0 && (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thImage} aria-hidden="true" />
                  <th className={styles.thName}>Name</th>
                  <th className={styles.thSpacer} aria-hidden="true" />
                  <th className={styles.thQty}>Total qty</th>
                  <th className={styles.thQty}>Checked out</th>
                  <th className={styles.thQty}>In stock</th>
                  <th className={styles.thSpacer} aria-hidden="true" />
                  <th className={styles.thChevron} aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(({ equipment, checkedOut }) => (
                  <tr
                    key={equipment.id}
                    className={styles.row}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/adminHome/inventory/${equipment.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        navigate(`/adminHome/inventory/${equipment.id}`)
                      }
                    }}
                  >
                    <td className={styles.tdImage}>
                      {equipment.image_url ? (
                        <img src={equipment.image_url} alt="" className={styles.itemThumb} />
                      ) : (
                        <ImageIcon size={20} />
                      )}
                    </td>
                    <td className={styles.tdName}>{equipment.name}</td>
                    <td className={styles.tdSpacer} aria-hidden="true" />
                    <td className={`${styles.tdQty} ${styles.colTotal}`}>{equipment.quantity_total}</td>
                    <td className={`${styles.tdQty} ${styles.colCheckedOut}`}>{checkedOut}</td>
                    <td className={`${styles.tdQty} ${styles.colInStock}`}>
                      {equipment.quantity_total - checkedOut}
                    </td>
                    <td className={styles.tdSpacer} aria-hidden="true" />
                    <td className={styles.tdChevron}>
                      <ChevronRightFilled size={8} className={styles.chevronIcon} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
