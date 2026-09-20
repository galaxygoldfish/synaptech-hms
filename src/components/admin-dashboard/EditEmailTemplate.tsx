import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { ArrowLeftIcon, InfoIcon, PlusIconSmallFilled, SaveIconFilled } from './icons'
import {
  EMAIL_ARCHIVE_CC_ADDRESS,
  EMAIL_FIELD_LABELS,
  EMAIL_TEMPLATE_DESCRIPTIONS,
  fetchEmailTemplate,
  fetchTemplateRecipients,
  setEmailTemplateArchiveCc,
  setTemplateRecipientCc,
  updateEmailTemplateContent,
  type EmailBodySegment,
  type EmailTemplate,
  type TemplateRecipient,
} from '../../lib/emailTemplates'
import type { UserProfile } from '../../types'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import styles from './EditEmailTemplate.module.css'

const CLOSE_ICON_SVG =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'

function fieldLabel(field: string): string {
  return EMAIL_FIELD_LABELS[field] ?? field.toUpperCase()
}

// Shares pendingRecipientKey/recipientsError with the per-admin recipient
// toggles under one sentinel key rather than its own separate pending
// state — it's the same Recipients section and the same "one toggle at a
// time" rule, just for a row that isn't a profile.
const ARCHIVE_CC_KEY = 'archive-cc'

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

// Pressing Enter in a plain contentEditable doesn't insert a newline
// character — browsers wrap each subsequent line in its own block element
// (a bare <div> in Chrome/Safari; a blank line becomes <div><br></div>).
// Shift+Enter, by contrast, inserts a plain inline <br> with no wrapping
// element. The previous version of this function only looked at direct
// children, so anything past the first line — wrapped in one of those
// <div>s — was neither a text node nor a chip and was silently dropped:
// multi-line bodies survived exactly one line through a save/reload.
//
// This walks the full tree instead, converting the various ways a
// line break can be represented into a single '\n' each: a bare <br>
// contributes one, and stepping into a new block-level wrapper (anything
// that isn't a chip or the container's first block) contributes one too —
// except when that wrapper's only child is itself a <br>, where the two
// would otherwise double-count a single blank line.
function domToSegments(container: HTMLElement): EmailBodySegment[] {
  const segments: EmailBodySegment[] = []
  let currentText = ''
  // Whether any real content — text, a chip, or a line break — has been
  // seen yet. Used only to avoid an accidental leading blank line if the
  // very first block happens to be a wrapper (an edge case, not the
  // common "start typing immediately" path).
  let started = false

  function flushText() {
    if (currentText) {
      segments.push({ type: 'text', value: currentText })
      currentText = ''
    }
  }

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent ?? ''
      if (value) started = true
      currentText += value
      return
    }
    if (!(node instanceof HTMLElement)) return

    if (node.dataset.field) {
      flushText()
      segments.push({ type: 'chip', field: node.dataset.field })
      started = true
      return
    }

    if (node.tagName === 'BR') {
      currentText += '\n'
      started = true
      return
    }

    // Any other element is a block wrapper the browser inserted for a new
    // line — entering one marks a line break, unless it's the first block
    // in an otherwise-empty editor (nothing to break away from yet).
    if (started) currentText += '\n'

    const onlyChild = node.childNodes.length === 1 ? node.childNodes[0] : null
    const isBlankLinePlaceholder =
      onlyChild?.nodeType === Node.ELEMENT_NODE && (onlyChild as HTMLElement).tagName === 'BR'
    if (isBlankLinePlaceholder) {
      // <div><br></div>: an empty line. The block-transition newline just
      // above already represents it — descending into the <br> too would
      // add a second, redundant one.
      started = true
      return
    }

    node.childNodes.forEach(walk)
  }

  container.childNodes.forEach(walk)
  flushText()
  return segments
}

/**
 * Explains what the template being edited is actually for. Falls back to
 * rendering nothing rather than guessing, so a template added to the
 * database without a matching entry simply shows no panel.
 */
function AboutThisEmail({ templateKey }: { templateKey: string }) {
  const description = EMAIL_TEMPLATE_DESCRIPTIONS[templateKey]
  if (!description) return null

  return (
    <aside className={styles.aboutPanel}>
      <InfoIcon size={20} className={styles.aboutIcon} />
      <div className={styles.aboutBody}>
        <p className={styles.aboutBlurb}>{description.blurb}</p>
        <div className={styles.aboutFacts}>
          <span className={styles.aboutFact}>
            <span className={styles.aboutFactLabel}>
              {description.dormant ? 'Status' : 'Sent'}
            </span>
            <span>{description.timing}</span>
          </span>
        </div>
      </div>
    </aside>
  )
}

interface RecipientToggleProps {
  label: string
  enabled: boolean
  pending: boolean
  ariaLabel: string
  onClick: () => void
}

// Shared by every switch in the Recipients section below — a real admin's
// "to"/"cc" columns and the fixed "Synaptech" archive-CC row alike.
function RecipientToggle({ label, enabled, pending, ariaLabel, onClick }: RecipientToggleProps) {
  return (
    <div className={styles.recipientToggleGroup}>
      <span className={styles.recipientToggleLabel}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={ariaLabel}
        className={enabled ? `${styles.recipientToggle} ${styles.recipientToggleOn}` : styles.recipientToggle}
        onClick={onClick}
        disabled={pending}
      >
        <span className={styles.recipientToggleKnob} />
      </button>
    </div>
  )
}

interface RecipientsSectionProps {
  templateKey: string
  recipients: TemplateRecipient[]
  isLoading: boolean
  error: string | null
  pendingKey: string | null
  onToggle: (recipient: TemplateRecipient) => void
  archiveCcEnabled: boolean
  isArchiveCcPending: boolean
  onToggleArchiveCc: () => void
}

/**
 * Two subsections sharing one card: a fixed, non-editable description of
 * who this template's direct recipient is (a specific member, or "every
 * administrator" — see EMAIL_TEMPLATE_DESCRIPTIONS, which is what actually
 * dispatches the email), and a CC list an admin can toggle — every current
 * administrator plus a fixed "Synaptech" row for the archive CC every send
 * otherwise gets unconditionally. The CC list is always built from the live
 * admin roster (see fetchTemplateRecipients) rather than a stored list, so
 * it reflects who's an admin right now — someone promoted since this
 * template was last edited shows up with CC off by default the next time
 * this screen loads, and someone demoted simply stops appearing.
 */
function RecipientsSection({
  templateKey,
  recipients,
  isLoading,
  error,
  pendingKey,
  onToggle,
  archiveCcEnabled,
  isArchiveCcPending,
  onToggleArchiveCc,
}: RecipientsSectionProps) {
  const recipientDescription = EMAIL_TEMPLATE_DESCRIPTIONS[templateKey]?.recipient
  // The object form means resolveEvent always sends this template straight
  // to Synaptech's own address — so it's already in the "to" line and has
  // no business also appearing as a toggleable CC below.
  const recipientIsSynaptech = typeof recipientDescription === 'object'

  return (
    <div className={styles.formSection}>
      <div className={styles.recipientsCard}>
        {recipientDescription && (
          <div className={styles.recipientSubsection}>
            <span className={styles.recipientSubsectionLabel}>Recipient</span>
            <div className={styles.recipientRow}>
              {typeof recipientDescription === 'string' ? (
                <p className={styles.recipientStaticText}>{recipientDescription}</p>
              ) : (
                <div className={styles.recipientIdentity}>
                  <span className={styles.recipientName}>{recipientDescription.name}</span>
                  <span className={styles.recipientEmail}>{recipientDescription.email}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className={styles.recipientSubsection}>
          <span className={styles.recipientSubsectionLabel}>CC</span>

          {isLoading ? (
            <ul className={styles.recipientList} aria-hidden="true">
              {Array.from({ length: 3 }, (_, index) => (
                <li key={index} className={styles.recipientRow}>
                  <div className={styles.recipientIdentity}>
                    <Skeleton width="50%" height="1rem" shape="pill" />
                    <Skeleton width="70%" height="0.8125rem" shape="pill" />
                  </div>
                  <Skeleton width="3.25rem" height="1.875rem" shape="pill" />
                </li>
              ))}
            </ul>
          ) : (
            <ul className={styles.recipientList}>
              {recipients.map((recipient) => (
                <li key={recipient.id} className={styles.recipientRow}>
                  <div className={styles.recipientIdentity}>
                    <span className={styles.recipientName}>{recipient.name}</span>
                    <span className={styles.recipientEmail}>{recipient.email}</span>
                  </div>

                  <RecipientToggle
                    label="CC"
                    enabled={recipient.ccEnabled}
                    pending={pendingKey === recipient.id}
                    ariaLabel={`${recipient.ccEnabled ? 'Remove' : 'Add'} ${recipient.name} as a CC`}
                    onClick={() => onToggle(recipient)}
                  />
                </li>
              ))}

              {/* Every send CCs this address unconditionally unless turned
                  off here — see EMAIL_ARCHIVE_CC_ADDRESS/archiveCcFor in
                  supabase/functions/_shared/sendTemplatedEmail.ts. Listed
                  like any other CC rather than back in the "About this
                  email" panel, so there's one place that shows who actually
                  gets a template — except when Synaptech is already this
                  template's direct recipient (above), where offering it
                  again as a CC would just be redundant. */}
              {!recipientIsSynaptech && (
                <li className={styles.recipientRow}>
                  <div className={styles.recipientIdentity}>
                    <span className={styles.recipientName}>Synaptech</span>
                    <span className={styles.recipientEmail}>{EMAIL_ARCHIVE_CC_ADDRESS}</span>
                  </div>

                  <RecipientToggle
                    label="CC"
                    enabled={archiveCcEnabled}
                    pending={isArchiveCcPending}
                    ariaLabel={`${archiveCcEnabled ? 'Remove' : 'Add'} Synaptech's archive address as a CC`}
                    onClick={onToggleArchiveCc}
                  />
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      {error && <p className={styles.inlineError}>{error}</p>}
    </div>
  )
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

  const [recipients, setRecipients] = useState<TemplateRecipient[]>([])
  const [isRecipientsLoading, setRecipientsLoading] = useState(true)
  const [recipientsError, setRecipientsError] = useState<string | null>(null)
  const [pendingRecipientKey, setPendingRecipientKey] = useState<string | null>(null)

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

  // Loaded separately from the template itself — the Recipients section can
  // shimmer in a beat after the subject/body are already on screen, rather
  // than holding up the whole page. Re-fetches whenever the template
  // (including a route transition to a different one) changes, since CC
  // overrides are per template-key.
  useEffect(() => {
    if (!template) return
    let cancelled = false
    setRecipientsLoading(true)
    setRecipientsError(null)

    fetchTemplateRecipients(template.key)
      .then((data) => {
        if (!cancelled) setRecipients(data)
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load email recipients:', fetchError)
        if (!cancelled) setRecipientsError('Could not load recipients. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setRecipientsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [template])

  // Populates the contentEditable body once the real editor is on screen.
  // This can't happen inside the fetch above: while isLoading is true, the
  // component renders the loading skeleton in place of the editor, so
  // editorRef.current is still null when the fetch resolves — writing to it
  // there was silently a no-op. The saved body was never lost, it just
  // never made it onto the screen, which is why editing, saving, and
  // coming back always showed a blank editor regardless of what was saved.
  useEffect(() => {
    if (isLoading || !template || !editorRef.current) return
    segmentsToDom(editorRef.current, template.body)
  }, [isLoading, template])

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

  async function handleRecipientToggle(recipient: TemplateRecipient) {
    if (!template || !profile || pendingRecipientKey) return
    const nextValue = !recipient.ccEnabled

    setPendingRecipientKey(recipient.id)
    setRecipientsError(null)

    try {
      await setTemplateRecipientCc(template.key, recipient.id, nextValue, profile.id)
      setRecipients((current) =>
        current.map((item) => (item.id === recipient.id ? { ...item, ccEnabled: nextValue } : item)),
      )
    } catch (toggleError) {
      // eslint-disable-next-line no-console
      console.error('Failed to update email recipient:', toggleError)
      setRecipientsError('Could not update this recipient. Please try again.')
    } finally {
      setPendingRecipientKey(null)
    }
  }

  async function handleArchiveCcToggle() {
    if (!template || !profile || pendingRecipientKey) return
    const nextValue = !template.archiveCcEnabled

    setPendingRecipientKey(ARCHIVE_CC_KEY)
    setRecipientsError(null)

    try {
      const updated = await setEmailTemplateArchiveCc(template.key, nextValue, profile.id)
      setTemplate(updated)
    } catch (toggleError) {
      // eslint-disable-next-line no-console
      console.error('Failed to update the archive CC setting:', toggleError)
      setRecipientsError('Could not update this recipient. Please try again.')
    } finally {
      setPendingRecipientKey(null)
    }
  }

  // The chrome (header, back button, field labels) is static, so it renders
  // for real and only the template's own subject/body shimmer.
  if (isLoading) {
    return (
      <div className={styles.page}>
        <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />
        <main className={styles.main}>
          <div className={styles.topRow}>
            <button type="button" className={styles.backButton} onClick={() => navigate(listPath)} aria-label="Back">
              <ArrowLeftIcon size={20} />
              <span>Back</span>
            </button>
            <SkeletonScreen label="Loading email template…">
              <Skeleton width="16rem" height="1.75rem" shape="pill" />
            </SkeletonScreen>
            <div />
          </div>

          <div className={styles.aboutPanel} aria-hidden="true">
            <InfoIcon size={20} className={styles.aboutIcon} />
            <div className={styles.aboutBody}>
              <Skeleton width="80%" height="1rem" shape="pill" />
              <Skeleton width="60%" height="0.9375rem" shape="pill" />
            </div>
          </div>

          <div className={styles.formSection}>
            <span className={styles.fieldLabel}>Subject line</span>
            <div className={styles.subjectInput} aria-hidden="true">
              <Skeleton width="65%" height="1rem" shape="pill" />
            </div>
          </div>

          <div className={styles.formSection}>
            <span className={styles.fieldLabel}>Email body</span>
            <div className={styles.editorWrap} aria-hidden="true">
              <Skeleton width="85%" height="1rem" shape="pill" style={{ marginBottom: '1.1rem' }} />
              <Skeleton width="95%" height="1rem" shape="pill" style={{ marginBottom: '1.1rem' }} />
              <Skeleton width="70%" height="1rem" shape="pill" style={{ marginBottom: '1.1rem' }} />
              <Skeleton width="90%" height="1rem" shape="pill" style={{ marginBottom: '1.1rem' }} />
              <Skeleton width="45%" height="1rem" shape="pill" />
            </div>
          </div>
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

        <AboutThisEmail templateKey={template.key} />

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

          {saveError && <p className={styles.inlineError}>{saveError}</p>}
        </div>

        <RecipientsSection
          templateKey={template.key}
          recipients={recipients}
          isLoading={isRecipientsLoading}
          error={recipientsError}
          pendingKey={pendingRecipientKey}
          onToggle={(recipient) => void handleRecipientToggle(recipient)}
          archiveCcEnabled={template.archiveCcEnabled}
          isArchiveCcPending={pendingRecipientKey === ARCHIVE_CC_KEY}
          onToggleArchiveCc={() => void handleArchiveCcToggle()}
        />
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
