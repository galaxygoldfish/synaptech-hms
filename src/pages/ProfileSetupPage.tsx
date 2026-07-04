import { useState, type FormEvent, type ChangeEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Profile } from '../types'
import styles from './ProfileSetupPage.module.css'

function NeuronIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <circle cx="13" cy="13" r="3.5" fill="var(--blue)" />
      <circle cx="5"  cy="7"  r="2.25" fill="var(--blue-100)" stroke="var(--blue)" strokeWidth="1" />
      <circle cx="21" cy="7"  r="2.25" fill="var(--blue-100)" stroke="var(--blue)" strokeWidth="1" />
      <circle cx="4"  cy="18" r="2.25" fill="var(--blue-100)" stroke="var(--blue)" strokeWidth="1" />
      <circle cx="22" cy="18" r="2.25" fill="var(--blue-100)" stroke="var(--blue)" strokeWidth="1" />
      <line x1="13" y1="9.5"  x2="5"  y2="7"  stroke="var(--blue)" strokeWidth="1.25" />
      <line x1="13" y1="9.5"  x2="21" y2="7"  stroke="var(--blue)" strokeWidth="1.25" />
      <line x1="13" y1="16.5" x2="4"  y2="18" stroke="var(--blue)" strokeWidth="1.25" />
      <line x1="13" y1="16.5" x2="22" y2="18" stroke="var(--blue)" strokeWidth="1.25" />
    </svg>
  )
}

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
    errors.student_id = 'Student ID is required.'
  } else if (!/^\d+$/.test(form.student_id.trim())) {
    errors.student_id = 'Student ID must contain only numbers.'
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
      />
      {error && <span className={styles.fieldError}>{error}</span>}
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
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
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
        <NeuronIcon />
        <span className={styles.logoText}>Synaptech Hardware</span>
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
            <Field
              label="Student ID number"
              value={form.student_id}
              onChange={handleChange('student_id')}
              error={errors.student_id}
              placeholder="1234567"
              inputMode="numeric"
            />
          </div>

          <Field
            label="UW email address"
            value={form.uw_email}
            onChange={() => {}}
            locked
          />

          <Field
            label="Home address"
            value={form.address}
            onChange={handleChange('address')}
            error={errors.address}
            placeholder="123 Main St, Seattle, WA 98101"
          />

          <Field
            label="Discord username"
            value={form.discord}
            onChange={handleChange('discord')}
            error={errors.discord}
            placeholder="username"
          />

          {submitError && <p className={styles.submitError}>{submitError}</p>}

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
          Synaptech hardware in accordance with our Hardware Checkout &amp; Usage Policy.
        </p>
      </main>
    </div>
  )
}
