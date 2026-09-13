import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { ArrowLeftIcon, PlusIconSmallFilled, SaveIconFilled } from './icons'
import {
  EMAIL_FIELD_LABELS,
  fetchEmailTemplate,
  updateEmailTemplateContent,
  type EmailBodySegment,
  type EmailTemplate,
} from '../../lib/emailTemplates'
import type { UserProfile } from '../../types'
import styles from './EditEmailTemplate.module.css'

const CLOSE_ICON_SVG =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'

function fieldLabel(field: string): string {
  return EMAIL_FIELD_LABELS[field] ?? field.toUpperCase()
}

// Mirrors the recipient logic in supabase/functions/send-email — user
// templates always go to the one member tied to the triggering row, admin
// templates go to every admin (see resolveEvent/fetchAdminEmails there).
function recipientNote(category: EmailTemplate['category']): string {
  return category === 'admin'
    ? 'This email is sent to all admins.'
    : 'This email is sent to the member associated with this request.'
}

function removeChipNode(node: HTMLElement) {
  node.remove()
}

// Chips are built and mutated with plain DOM APIs rather than JSX — mixing
// React-rendered children into a contentEditable region fights the
// browser's own DOM mutations (typing, caret placement) on every render.
// React only touches this subtree once, on mount.
function buildChipNode(field: string): HTMLSpanElement {
  const chipEl = document.createElement('span')
  chipEl.className = styles.chip
  chipEl.contentEditable = 'false'
  chipEl.dataset.field = field

  const labelEl = document.createElement('span')
  labelEl.className = styles.chipLabel
  labelEl.textContent = fieldLabel(field)
  chipEl.appendChild(labelEl)

  const removeButton = document.createElement('button')
  removeButton.type = 'button'
  removeButton.className = styles.chipRemove
  removeButton.setAttribute('aria-label', `Remove ${fieldLabel(field)}`)
  removeButton.innerHTML = CLOSE_ICON_SVG
  removeButton.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    removeChipNode(chipEl)
  })
  chipEl.appendChild(removeButton)

  return chipEl
}

function segmentsToDom(container: HTMLElement, segments: EmailBodySegment[]) {
  container.innerHTML = ''
  for (const segment of segments) {
    if (segment.type === 'text') {
      container.appendChild(document.createTextNode(segment.value))
    } else {
      container.appendChild(buildChipNode(segment.field))
    }
  }
}

function domToSegments(container: HTMLElement): EmailBodySegment[] {
  const segments: EmailBodySegment[] = []
  container.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent ?? ''
      if (value) segments.push({ type: 'text', value })
    } else if (node instanceof HTMLElement && node.dataset.field) {
      segments.push({ type: 'chip', field: node.dataset.field })
    }
  })
  return segments
}

export default function EditEmailTemplate() {
  const { category, templateId } = useParams<{ category: string; templateId: string }>()
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const listPath = `/adminHome/emails/${category}`

  const [template, setTemplate] = useState<EmailTemplate | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const editorRef = useRef<HTMLDivElement>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const [subject, setSubject] = useState('')

  const [isSaving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!templateId) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    fetchEmailTemplate(templateId)
      .then((data) => {
        if (cancelled) return
        setTemplate(data)
        setSubject(data?.subject ?? '')
        if (editorRef.current) segmentsToDom(editorRef.current, data?.body ?? [])
        savedRangeRef.current = null
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load email template:', fetchError)
        if (!cancelled) setLoadError('Could not load this email template. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [templateId])

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

  function captureSelection() {
    const editor = editorRef.current
    const selection = window.getSelection()
    if (!editor || !selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (editor.contains(range.startContainer)) {
      savedRangeRef.current = range.cloneRange()
    }
  }

  function insertChip(field: string) {
    const editor = editorRef.current
    if (!editor) return

    const chipEl = buildChipNode(field)
    const range = savedRangeRef.current

    if (range && editor.contains(range.startContainer)) {
      range.deleteContents()
      range.insertNode(chipEl)
      range.setStartAfter(chipEl)
      range.collapse(true)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      savedRangeRef.current = range.cloneRange()
    } else {
      editor.appendChild(chipEl)
    }

    editor.focus()
  }

  async function handleSave() {
    if (!template || !profile || isSaving) return
    const body = editorRef.current ? domToSegments(editorRef.current) : []

    setSaving(true)
    setSaveError(null)

    try {
      await updateEmailTemplateContent(template.key, { subject, body }, profile.id)
      navigate(listPath)
    } catch (updateError) {
      // eslint-disable-next-line no-console
      console.error('Failed to save email template:', updateError)
      setSaveError('Could not save this template. Please try again.')
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className={styles.page}>
        <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />
        <main className={styles.main}>
          <p className={styles.status}>Loading…</p>
        </main>
      </div>
    )
  }

  if (loadError || !template) {
    return (
      <div className={styles.page}>
        <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />
        <main className={styles.main}>
          <p className={styles.status}>{loadError ?? "This email template couldn't be found."}</p>
        </main>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <div className={styles.topRow}>
          <button type="button" className={styles.backButton} onClick={() => navigate(listPath)} aria-label="Back">
            <ArrowLeftIcon size={20} />
            <span>Back</span>
          </button>
          <h1 className={styles.heading}>{template.label}</h1>
          <button type="button" className={styles.saveButton} onClick={() => void handleSave()} disabled={isSaving}>
            <SaveIconFilled size={18} />
            <span>{isSaving ? 'Saving…' : 'Save'}</span>
          </button>
        </div>

        <div className={styles.formSection}>
          <label className={styles.fieldLabel} htmlFor="email-subject">
            Subject line
          </label>
          <input
            id="email-subject"
            className={styles.subjectInput}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </div>

        <div className={styles.formSection}>
          <label className={styles.fieldLabel}>Email body</label>

          {template.dynamicFields.length > 0 && (
            <div className={styles.chipPicker}>
              {template.dynamicFields.map((field) => (
                <button
                  key={field}
                  type="button"
                  className={styles.pickerChip}
                  onClick={() => insertChip(field)}
                >
                  {fieldLabel(field)}
                  <PlusIconSmallFilled size={12} color="rgba(0, 0, 0, 0.43)" />
                </button>
              ))}
            </div>
          )}

          <div className={styles.editorWrap}>
            <div
              ref={editorRef}
              className={styles.editor}
              contentEditable
              suppressContentEditableWarning
              onBlur={captureSelection}
              onKeyUp={captureSelection}
              onMouseUp={captureSelection}
              onInput={captureSelection}
            />
          </div>

          <p className={styles.recipientNote}>{recipientNote(template.category)}</p>

          {saveError && <p className={styles.inlineError}>{saveError}</p>}
        </div>
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
