import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { CheckmarkIcon, ChevronRightFilled, DocumentationIcon, HelpIconFilled, PlusIconSmallFilled } from './icons'
import { fetchEquipment, fetchEquipmentAddonOptions, type EquipmentAddonOption } from '../../lib/inventory'
import type { Equipment, UserProfile } from '../../types'
import styles from './CheckoutConfirmHardware.module.css'

// Help & support always points at the club's Discord — same link used
// elsewhere in the member dashboard (src/data/memberActions.ts).
const HELP_AND_SUPPORT_URL = 'https://discord.gg/zNKCN5233Y'

function isOutOfStock(item: Equipment): boolean {
  return item.quantity_total <= 0
}

interface AddonPanelProps {
  title: string
  options: EquipmentAddonOption[]
  isSelected: (id: string) => boolean
  onSelect: (id: string) => void
}

function AddonPanel({ title, options, isSelected, onSelect }: AddonPanelProps) {
  return (
    <div className={styles.addonPanel}>
      <p className={styles.addonPanelTitle}>{title}</p>
      <ul className={styles.addonList}>
        {options.map(({ equipment: addon }) => {
          const outOfStock = isOutOfStock(addon)
          const selected = isSelected(addon.id)
          const cardClass = [
            styles.addonCard,
            selected ? styles.addonCardSelected : '',
            outOfStock ? styles.addonCardOutOfStock : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <li key={addon.id}>
              <button
                type="button"
                className={cardClass}
                onClick={() => onSelect(addon.id)}
                disabled={outOfStock}
                aria-pressed={selected}
              >
                {addon.image_url && <img src={addon.image_url} alt="" className={styles.addonThumb} />}
                <span className={styles.addonInfo}>
                  <span className={styles.addonName}>{addon.name}</span>
                  {addon.description && <span className={styles.addonDescription}>{addon.description}</span>}
                  <span className={styles.addonAvailable}>
                    {outOfStock ? 'Out of stock' : `${addon.quantity_total} available`}
                  </span>
                </span>
                {selected ? (
                  <CheckmarkIcon size={18} className={styles.addonIcon} />
                ) : (
                  <PlusIconSmallFilled size={16} color="#474747" className={styles.addonIcon} />
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function CheckoutConfirmHardware() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const equipmentId = (location.state as { equipmentId?: string } | null)?.equipmentId ?? null

  const [equipment, setEquipment] = useState<Equipment | null>(null)
  const [addonOptions, setAddonOptions] = useState<EquipmentAddonOption[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedOptionalIds, setSelectedOptionalIds] = useState<Set<string>>(new Set())
  const [selectedRequiredId, setSelectedRequiredId] = useState<string | null>(null)

  useEffect(() => {
    if (!equipmentId) return
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([fetchEquipment(equipmentId), fetchEquipmentAddonOptions(equipmentId)])
      .then(([item, addons]) => {
        if (cancelled) return
        setEquipment(item)
        setAddonOptions(addons)
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
    if (!equipmentId) navigate('/home/checkout', { replace: true })
  }, [equipmentId, navigate])

  const optionalAddons = useMemo(
    () => addonOptions.filter((option) => option.addonType === 'optional'),
    [addonOptions],
  )
  const requiredAddons = useMemo(
    () => addonOptions.filter((option) => option.addonType === 'required'),
    [addonOptions],
  )
  const hasAddons = optionalAddons.length > 0 || requiredAddons.length > 0

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

  function toggleOptionalAddon(id: string) {
    setSelectedOptionalIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function selectRequiredAddon(id: string) {
    setSelectedRequiredId(id)
  }

  const canProceed = !isLoading && !error && equipment !== null && (requiredAddons.length === 0 || selectedRequiredId !== null)

  function handleNext() {
    if (!canProceed || !equipment) return
    navigate('/home/checkout/return-date', {
      state: {
        equipmentId: equipment.id,
        optionalAddonIds: Array.from(selectedOptionalIds),
        requiredAddonId: selectedRequiredId,
      },
    })
  }

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  if (!equipmentId) return null

  return (
    <div className={styles.page}>
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        {isLoading && <p className={styles.status}>Loading item…</p>}
        {!isLoading && error && <p className={styles.status}>{error}</p>}

        {!isLoading && !error && equipment && (
          <div className={hasAddons ? styles.layoutWithAddons : styles.layoutCentered}>
            <div className={styles.itemColumn}>
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
                    <DocumentationIcon size={22} />
                    View item-specific documentation
                  </span>
                  <ChevronRightFilled size={9} color="#474747" />
                </button>
                <a
                  className={`${styles.linkRow} ${styles.linkRowBottom}`}
                  href={HELP_AND_SUPPORT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className={styles.linkRowLeft}>
                    <HelpIconFilled size={22} />
                    Get help &amp; support
                  </span>
                  <ChevronRightFilled size={9} color="#474747" />
                </a>
              </div>
            </div>

            {hasAddons && (
              <div className={styles.addonPanels}>
                {requiredAddons.length > 0 && (
                  <AddonPanel
                    title="Choose one (REQUIRED)"
                    options={requiredAddons}
                    isSelected={(id) => selectedRequiredId === id}
                    onSelect={selectRequiredAddon}
                  />
                )}
                {optionalAddons.length > 0 && (
                  <AddonPanel
                    title="Add ons (optional)"
                    options={optionalAddons}
                    isSelected={(id) => selectedOptionalIds.has(id)}
                    onSelect={toggleOptionalAddon}
                  />
                )}
              </div>
            )}
          </div>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.backButton} onClick={() => navigate('/home/checkout')}>
            back
          </button>
          <button type="button" className={styles.nextButton} onClick={handleNext} disabled={!canProceed}>
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
