import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import ConfirmationModal from '../components/ConfirmationModal'
import AccountErrorModal from '../components/AccountErrorModal'
import heroImg from '../assets/hero.png'
import styles from './WelcomePage.module.css'

const WELCOMED_KEY = 'hms_welcomed'

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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.781 14.013 17.64 11.71 17.64 9.2z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961l3.007 2.332C4.672 5.164 6.656 3.58 9 3.58z" />
    </svg>
  )
}

export default function WelcomePage() {
  const { accountError, signInWithGoogle } = useAuth()
  const [showConfirmation, setShowConfirmation] = useState(false)

  function handleSignInClick() {
    const welcomed = localStorage.getItem(WELCOMED_KEY)
    if (!welcomed) {
      setShowConfirmation(true)
    } else {
      signInWithGoogle()
    }
  }

  function handleConfirm() {
    localStorage.setItem(WELCOMED_KEY, 'true')
    setShowConfirmation(false)
    signInWithGoogle()
  }

  return (
    <>
      <div className={styles.page}>
        <div className={styles.left}>
          <div className={styles.content}>
            <div className={styles.logoRow}>
              <NeuronIcon />
              <span className={styles.orgName}>Synaptech @ UW</span>
            </div>

            <h1 className={styles.portalName}>Hardware Portal</h1>

            <p className={styles.description}>
              Synaptech is UW&rsquo;s neurotechnology student organization, providing members
              with free access to a wide variety of hardware for use in independent research
              and neural engineering projects. Use this portal to browse our available
              inventory, request to checkout hardware and get technical support.
            </p>

            <button className={styles.signInButton} onClick={handleSignInClick}>
              <GoogleIcon />
              Sign in with Google
            </button>
          </div>
        </div>

        <div className={styles.right}>
          <img
            src={heroImg}
            alt="Muse 2 EEG headset"
            className={styles.productImage}
          />
        </div>
      </div>

      <ConfirmationModal
        isOpen={showConfirmation}
        onClose={() => setShowConfirmation(false)}
        onConfirm={handleConfirm}
      />

      <AccountErrorModal
        isOpen={accountError}
        onRetry={signInWithGoogle}
      />
    </>
  )
}
