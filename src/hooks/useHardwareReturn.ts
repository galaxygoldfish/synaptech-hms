import { useCallback, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { normalizeSerialNumber, SERIAL_PREFIX } from '../lib/serialNumber'

export type ReturnStep = 'scan' | 'serial' | 'loading' | 'error' | 'success'

/**
 * Drives the admin "return hardware" sequence: scan or type a serial,
 * look up its unit + open loan in Supabase, and mark the loan returned.
 *
 * NOTE ON SCHEMA ASSUMPTIONS: the README documents `equipment_units` and
 * `loans` but not exact column names. This assumes `equipment_units.serial_number`
 * and `loans.equipment_unit_id`. Adjust the two `.eq(...)` calls below if your
 * schema differs.
 */
export function useHardwareReturn() {
  const [step, setStep] = useState<ReturnStep>('scan')
  const [serialInput, setSerialInput] = useState('')
  const [resolvedSerial, setResolvedSerial] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  // Remembers which entry method brought the user here, so "Try again"
  // from the error screen returns them to the right step.
  const lastEntryStep = useRef<'scan' | 'serial'>('scan')

  const goToScan = useCallback(() => {
    lastEntryStep.current = 'scan'
    setStep('scan')
  }, [])

  const goToSerialEntry = useCallback(() => {
    lastEntryStep.current = 'serial'
    setStep('serial')
  }, [])

  const submitSerial = useCallback(async (rawSerial: string) => {
    const serial = normalizeSerialNumber(rawSerial)
    if (!serial || serial === SERIAL_PREFIX) {
      setErrorMessage('Please provide a serial number.')
      setStep('error')
      return
    }

    setResolvedSerial(serial)
    setStep('loading')

    // 1. Find the physical unit by its serial number.
    const { data: unit, error: unitError } = await supabase
      .from('equipment_units')
      .select('id')
      .eq('serial_number', serial)
      .maybeSingle()

    if (unitError || !unit) {
      setErrorMessage(`Could not find an active loan associated with the serial ${serial}`)
      setStep('error')
      return
    }

    // 2. Find the open loan for that unit (active, overdue, or already
    //    mid pending-return — any of these can be closed out here).
    const { data: loan, error: loanError } = await supabase
      .from('loans')
      .select('id')
      .eq('equipment_unit_id', unit.id)
      .in('status', ['active', 'overdue', 'pending_return'])
      .order('checked_out_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (loanError || !loan) {
      setErrorMessage(`Could not find an active loan associated with the serial ${serial}`)
      setStep('error')
      return
    }

    // 3. Mark the loan as returned.
    const { error: updateError } = await supabase
      .from('loans')
      .update({ status: 'returned', returned_at: new Date().toISOString() })
      .eq('id', loan.id)

    if (updateError) {
      setErrorMessage(`Could not find an active loan associated with the serial ${serial}`)
      setStep('error')
      return
    }

    setStep('success')
  }, [])

  const retry = useCallback(() => {
    setErrorMessage('')
    setSerialInput('')
    setStep(lastEntryStep.current)
  }, [])

  return {
    step,
    serialInput,
    setSerialInput,
    resolvedSerial,
    errorMessage,
    goToScan,
    goToSerialEntry,
    submitSerial,
    retry,
  }
}
