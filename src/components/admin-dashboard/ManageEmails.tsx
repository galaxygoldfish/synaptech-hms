import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { ArrowLeftIcon, PencilIcon } from './icons'
import {
  fetchEmailTemplates,
  setEmailTemplateEnabled,
  type EmailTemplate,
  type EmailTemplateCategory,
} from '../../lib/emailTemplates'
import type { UserProfile } from '../../types'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import styles from './ManageEmails.module.css'

interface ManageEmailsProps {
  heading: string
  listPath: string
  category: EmailTemplateCategory
}

export function ManageEmails({ heading, listPath, category }: ManageEmailsProps) {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [pendingToggleKey, setPendingToggleKey] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchEmailTemplates(category)
      .then((data) => {
        if (!cancelled) setTemplates(data)
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load email templates:', fetchError)
        if (!cancelled) setError('Could not load email templates. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [category])

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

  function handleEdit(templateKey: string) {
    navigate(`${listPath}/${templateKey}`)
  }

  async function handleToggle(template: EmailTemplate) {
    if (!profile || pendingToggleKey) return
    setPendingToggleKey(template.key)
    setToggleError(null)

    try {
      const updated = await setEmailTemplateEnabled(template.key, !template.enabled, profile.id)
      setTemplates((current) => current.map((item) => (item.key === updated.key ? updated : item)))
    } catch (updateError) {
      // eslint-disable-next-line no-console
      console.error('Failed to update email template:', updateError)
      setToggleError('Could not update this template. Please try again.')
    } finally {
      setPendingToggleKey(null)
    }
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
          <h1 className={styles.heading}>{heading}</h1>
          <div />
        </div>

        {isLoading && (
          <SkeletonScreen label="Loading email templates…">
            <div className={styles.card}>
              <ul className={styles.templateList}>
                {Array.from({ length: 5 }, (_, index) => (
                  <li key={index} className={styles.templateRow}>
                    <Skeleton width="4.75rem" height="2.4rem" radius="0.5625rem" />
                    <Skeleton width="45%" height="1.25rem" shape="pill" style={{ flex: 1 }} />
                    <Skeleton width="3.25rem" height="1.75rem" shape="pill" />
                  </li>
                ))}
              </ul>
            </div>
          </SkeletonScreen>
        )}
        {!isLoading && error && <p className={styles.status}>{error}</p>}

        {!isLoading && !error && (
          <div className={styles.card}>
            <ul className={styles.templateList}>
              {templates.map((template) => (
                <li key={template.key} className={styles.templateRow}>
                  <button type="button" className={styles.editButton} onClick={() => handleEdit(template.key)}>
                    <PencilIcon size={14} />
                    Edit
                  </button>

                  <span className={styles.templateLabel}>{template.label}</span>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={template.enabled}
                    aria-label={`${template.enabled ? 'Disable' : 'Enable'} ${template.label}`}
                    className={template.enabled ? `${styles.toggle} ${styles.toggleOn}` : styles.toggle}
                    onClick={() => void handleToggle(template)}
                    disabled={pendingToggleKey === template.key}
                  >
                    <span className={styles.toggleKnob} />
                  </button>
                </li>
              ))}
            </ul>
            {toggleError && <p className={styles.inlineError}>{toggleError}</p>}
          </div>
        )}
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
