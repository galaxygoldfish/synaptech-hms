import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import ConfirmationModal from '../components/ConfirmationModal'
import AccountErrorModal from '../components/AccountErrorModal'
import HardwareCarousel from '../components/HardwareCarousel'
import brainLogo from '../assets/synaptech-brain.png'
import googleIcon from '../assets/google-icon.png'
import starGlow from '../assets/welcome-star-bg.svg'
import styles from './WelcomePage.module.css'

const WELCOMED_KEY = 'hms_welcomed'

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
        <img src={starGlow} alt="" aria-hidden="true" className={styles.starGlow} />

        <div className={styles.content}>
          <div className={styles.logoBlock}>
            <img src={brainLogo} alt="" className={styles.brainLogo} />
            <p className={styles.orgName}>Synaptech @ UW</p>
          </div>

          <h1 className={styles.portalName}>Hardware portal</h1>

          <p className={styles.description}>
            Synaptech is UW&rsquo;s neurotechnology student organization, providing members with
            free access to a wide variety of hardware for use in independent research and neural
            engineering projects.
          </p>

          <p className={styles.subDescription}>
            Use this portal to browse our available inventory, request to checkout hardware and
            get technical support.
          </p>

          <button className={styles.signInButton} onClick={handleSignInClick}>
            Sign in with
            <img src={googleIcon} alt="" aria-hidden="true" className={styles.googleIcon} />
            Google
          </button>
        </div>

        <HardwareCarousel />
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
