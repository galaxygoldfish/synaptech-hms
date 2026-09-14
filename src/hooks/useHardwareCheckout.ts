import { useCallback, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export type CheckoutStep = 'scan' | 'loading' | 'error' | 'success'

const SERIAL_PREFIX = 'SYN-'

function normalizeSerial(raw: string) {
  const trimmed = raw.trim().toUpperCase()
  if (!trimmed) return ''
  return trimmed.startsWith(SERIAL_PREFIX) ? trimmed : `${SERIAL_PREFIX}${trimmed}`
}

/**
 * Drives the admin "check out hardware" sequence: scan a serial, look up
 * its unit + pending checkout request in Supabase, and mark the loan active.
 *
 * NOTE ON SCHEMA ASSUMPTIONS (same as useHardwareReturn): assumes
 * `equipment_units.serial_number`, `loans.equipment_unit_id`,
 * `loans.created_at`, and `loans.checked_out_at`. Adjust the `.eq(...)` /
 * `.order(...)` calls below if your schema differs.
 */
export function useHardwareCheckout() {
  const [step, setStep] = useState<CheckoutStep>('scan')
  const [resolvedSerial, setResolvedSerial] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  // Lets `cancel()` (the × button on the loading screen) ignore a lookup
  // that's already in flight instead of racing it back to 'scan'.
  const cancelledRef = useRef(false)

  const submitSerial = useCallback(async (rawSerial: string) => {
    const serial = normalizeSerial(rawSerial)
    if (!serial || serial === SERIAL_PREFIX) {
      setErrorMessage('Please provide a serial number.')
      setStep('error')
      return
    }

    cancelledRef.current = false
    setResolvedSerial(serial)
    setStep('loading')

    // 1. Find the physical unit by its serial number.
    const { data: unit, error: unitError } = await supabase
      .from('equipment_units')
      .select('id')
      .eq('serial_number', serial)
      .maybeSingle()

    if (cancelledRef.current) return

    if (unitError || !unit) {
      setErrorMessage(`Could not find an active loan request associated with the serial ${serial}`)
      setStep('error')
      return
    }

    // 2. Find the pending checkout request for that unit.
    const { data: loan, error: loanError } = await supabase
      .from('loans')
      .select('id')
      .eq('equipment_unit_id', unit.id)
      .eq('status', 'pending_checkout')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (cancelledRef.current) return

    if (loanError || !loan) {
      setErrorMessage(`Could not find an active loan request associated with the serial ${serial}`)
      setStep('error')
      return
    }

    // 3. Mark the loan as actively checked out.
    const { error: updateError } = await supabase
      .from('loans')
      .update({ status: 'active', checked_out_at: new Date().toISOString() })
      .eq('id', loan.id)

    if (cancelledRef.current) return

    if (updateError) {
      setErrorMessage(`Could not find an active loan request associated with the serial ${serial}`)
      setStep('error')
      return
    }

    setStep('success')
  }, [])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    setErrorMessage('')
    setStep('scan')
  }, [])

  const retry = useCallback(() => {
    setErrorMessage('')
    setStep('scan')
  }, [])

  return { step, resolvedSerial, errorMessage, submitSerial, cancel, retry }
}
