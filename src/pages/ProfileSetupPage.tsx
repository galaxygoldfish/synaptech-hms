import { useState, type FormEvent, type ChangeEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Profile } from '../types/index'
import { BrandWordmark } from '../components/BrandWordmark'
import styles from './ProfileSetupPage.module.css'

// The Synaptech HMS Privacy Policy and the Hardware Checkout & Usage Policy
// live as Google Docs, so the officers can update them without a deploy.
const PRIVACY_POLICY_URL =
  'https://docs.google.com/document/d/1CcBlw_iRk67ylRKu2XkWYUxA8kZHiqVxedKEcEnbcBw/edit?usp=sharing'
const USAGE_POLICY_URL = 'https://docs.google.com/document/d/11RSFuvvg1F4aM9V0znWw7wFn_MZMx95T7EdlblAyPfc/edit?tab=t.0'

const PRIVACY_CONSENT_ERROR = 'You must agree to the Privacy Policy to continue.'

interface FormState {
  first_name: string
  last_name: string
  phone: string
  student_id: string
  uw_email: string
  address: string
  discord: string
}

type FieldErrors = Partial<Record<keyof FormState, string>>

// Accepts standard phone formats with optional extension.
// Main number: digits, spaces, hyphens, parens, dots, leading +
// Extension:   ext / ext. / x / # followed by digits
// Digit count: 7–15 (ITU-T E.164 max is 15)
function isValidPhone(raw: string): boolean {
  const withoutExt = raw.replace(/\s*(ext\.?|x|#)\s*\d+$/i, '').trim()
  if (!/^[+\d\s\-().]+$/.test(withoutExt)) return false
  const digits = withoutExt.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15
}

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {}

  if (!form.first_name.trim()) errors.first_name = 'First name is required.'
  if (!form.last_name.trim()) errors.last_name = 'Last name is required.'

  if (!form.phone.trim()) {
    errors.phone = 'Phone number is required.'
  } else if (!isValidPhone(form.phone.trim())) {
    errors.phone = 'Enter a valid phone number, e.g. (206) 555-0000 or +1 206 555 0000'
  }

  if (!form.student_id.trim()) {
    errors.student_id = 'UW student ID is required.'
  } else if (!/^\d+$/.test(form.student_id.trim())) {
    errors.student_id = 'UW student ID must contain only numbers.'
  }

  if (!form.address.trim()) errors.address = 'Home address is required.'
  if (!form.discord.trim()) errors.discord = 'Discord username is required.'

  return errors
}

interface FieldProps {
  label: string
  value: string
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  error?: string
  placeholder?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  locked?: boolean
}

function Field({ label, value, onChange, error, placeholder, inputMode, locked }: FieldProps) {
  const id = label.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>{label}</label>
      <input
        id={id}
        className={[
          styles.input,
          error ? styles.inputError : '',
          locked ? styles.inputLocked : '',
        ].join(' ')}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        inputMode={inputMode}
        readOnly={locked}
        tabIndex={locked ? -1 : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && <span id={`${id}-error`} className={styles.fieldError}>{error}</span>}
    </div>
  )
}

export default function ProfileSetupPage() {
  const { session, updateProfile } = useAuth()

  const [form, setForm] = useState<FormState>({
    first_name: '',
    last_name: '',
    phone: '',
    student_id: '',
    uw_email: session?.user.email ?? '',
    address: '',
    discord: '',
  })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false)
  const [privacyError, setPrivacyError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function handleChange(field: keyof FormState) {
    return (e: ChangeEvent<HTMLInputElement>) => {
      setForm(prev => ({ ...prev, [field]: e.target.value }))
      if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)

    const fieldErrors = validate(form)
    const consentMissing = !agreedToPrivacy
    if (Object.keys(fieldErrors).length > 0 || consentMissing) {
      setErrors(fieldErrors)
      setPrivacyError(consentMissing ? PRIVACY_CONSENT_ERROR : null)
      // Errors appear beside each field, so send a keyboard or screen-reader
      // user to the first one; it announces its own message through
      // aria-describedby. The form renders fields in validate()'s order.
      const formElement = e.currentTarget as HTMLFormElement
      requestAnimationFrame(() => formElement.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus())
      return
    }

    setSubmitting(true)

    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: session!.user.id,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim(),
        student_id: form.student_id.trim(),
        uw_email: form.uw_email,
        address: form.address.trim(),
        discord: form.discord.trim(),
      })
      .select()
      .single()

    setSubmitting(false)

    if (error) {
      setSubmitError('Something went wrong saving your profile. Please try again.')
      return
    }

    // Push new profile into AuthContext — SetupRoute guard will see profile !== null
    // and redirect to /home without any explicit navigation here.
    updateProfile(data as Profile)
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <BrandWordmark />
      </header>

      <main className={styles.main}>
        <div className={styles.formHeader}>
          <h1 className={styles.heading}>Let&rsquo;s set up your profile</h1>
          <p className={styles.subtext}>
            Please verify that the existing information is correct and ensure
            that you fill out all missing fields.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className={styles.form}>
          <div className={styles.row}>
            <Field
              label="First name"
              value={form.first_name}
              onChange={handleChange('first_name')}
              error={errors.first_name}
              placeholder="Jane"
            />
            <Field
              label="Last name"
              value={form.last_name}
              onChange={handleChange('last_name')}
              error={errors.last_name}
              placeholder="Smith"
            />
          </div>

          <div className={styles.row}>
            <Field
              label="Phone number"
              value={form.phone}
              onChange={handleChange('phone')}
              error={errors.phone}
              placeholder="(206) 555-0000"
              inputMode="tel"
            />
          </div>

          <div className={styles.row}>
            <Field
              label="UW student ID #"
              value={form.student_id}
              onChange={handleChange('student_id')}
              error={errors.student_id}
              placeholder="1234567"
              inputMode="numeric"
            />
            <Field
              label="UW email address"
              value={form.uw_email}
              onChange={() => {}}
              locked
            />
          </div>

          <div className={styles.row}>
            <Field
              label="Home address"
              value={form.address}
              onChange={handleChange('address')}
              error={errors.address}
              placeholder="123 Main St, Seattle, WA 98101"
            />
          </div>

          <div className={styles.row}>
            <Field
              label="Discord username"
              value={form.discord}
              onChange={handleChange('discord')}
              error={errors.discord}
              placeholder="username"
            />
          </div>

          <div className={styles.consent}>
            <label className={styles.consentLabel}>
              <span className={styles.checkboxBox}>
                <input
                  type="checkbox"
                  className={privacyError ? `${styles.checkbox} ${styles.checkboxError}` : styles.checkbox}
                  checked={agreedToPrivacy}
                  onChange={(e) => {
                    setAgreedToPrivacy(e.target.checked)
                    if (e.target.checked) setPrivacyError(null)
                  }}
                  aria-invalid={privacyError ? true : undefined}
                  aria-describedby={privacyError ? 'privacy-consent-error' : undefined}
                />
                <svg className={styles.checkmark} viewBox="0 0 22.5 15.3881" aria-hidden="true">
                  <path
                    d="M8.4375 15.3881L0 6.95062L1.32563 5.625L8.4375 12.7359L21.1744 0L22.5 1.32562L8.4375 15.3881Z"
                    fill="currentColor"
                  />
                </svg>
              </span>
              <span className={styles.consentText}>
                I have read and agree to the{' '}
                <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer" className={styles.consentLink}>
                  Synaptech HMS Privacy Policy
                </a>
              </span>
            </label>
            {privacyError && (
              <span id="privacy-consent-error" className={styles.fieldError}>
                {privacyError}
              </span>
            )}
          </div>

          {submitError && <p className={styles.submitError} role="alert">{submitError}</p>}

          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.submitButton}
              disabled={submitting}
            >
              {submitting ? 'Saving…' : 'Continue'}
            </button>
          </div>
        </form>

        <p className={styles.footer}>
          We require this information for record-keeping purposes for users of
          Synaptech hardware in accordance with our{' '}
          <a href={USAGE_POLICY_URL} target="_blank" rel="noopener noreferrer" className={styles.footerLink}>
            Hardware Checkout &amp; Usage Policy
          </a>
          .
        </p>
      </main>
    </div>
  )
}
