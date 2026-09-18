import { useCallback, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { handOffLoanRequestItem } from '../lib/loanRequests'
import { normalizeSerialNumber, SERIAL_PREFIX } from '../lib/serialNumber'

export type CheckoutStep = 'scan' | 'loading' | 'attest' | 'finalizing' | 'error' | 'success'

const LOAN_AGREEMENTS_BUCKET = 'loan-agreements'

interface PendingApproval {
  loanId: string | null
  itemId: string
  requestId: string
  agreementPath: string
  agreementUrl: string
  itemName: string
  serial: string
  managerId: string
  managerName: string
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
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null)

  // Lets `cancel()` (the × button on the loading screen) ignore a lookup
  // that's already in flight instead of racing it back to 'scan'.
  const cancelledRef = useRef(false)

  const submitSerial = useCallback(async (rawSerial: string, managerId: string, managerName: string) => {
    const serial = normalizeSerialNumber(rawSerial)
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

    // 3. Resolve the signed agreement attached to the requested item.
    const { data: requestItem, error: requestItemError } = await supabase
      .from('loan_request_items')
      .select('id, loan_request_id, signed_agreement_path, equipment(name)')
      .eq('equipment_unit_id', unit.id)
      .maybeSingle()

    if (cancelledRef.current) return

    if (requestItemError || !requestItem?.signed_agreement_path) {
      setErrorMessage('Could not find the signed agreement for this loan request.')
      setStep('error')
      return
    }

    const { data: signedAgreement, error: signedAgreementError } = await supabase.storage
      .from(LOAN_AGREEMENTS_BUCKET)
      .createSignedUrl(requestItem.signed_agreement_path, 60 * 60)

    if (signedAgreementError || !signedAgreement?.signedUrl) {
      setErrorMessage('Could not open the signed agreement for this loan request.')
      setStep('error')
      return
    }

    const equipment = Array.isArray(requestItem.equipment) ? requestItem.equipment[0] : requestItem.equipment
    setPendingApproval({
      loanId: loan.id,
      itemId: requestItem.id,
      requestId: requestItem.loan_request_id,
      agreementPath: requestItem.signed_agreement_path,
      agreementUrl: signedAgreement.signedUrl,
      itemName: equipment?.name ?? 'this hardware item',
      serial,
      managerId,
      managerName,
    })
    setStep('attest')
  }, [])

  const submitRequestItem = useCallback(async (itemId: string, managerId: string, managerName: string) => {
    cancelledRef.current = false
    setStep('loading')

    const { data: requestItem, error: requestItemError } = await supabase
      .from('loan_request_items')
      .select('id, loan_request_id, equipment_id, equipment_unit_id, signed_agreement_path')
      .eq('id', itemId)
      .maybeSingle()

    if (cancelledRef.current) return

    if (requestItemError || !requestItem?.signed_agreement_path) {
      setErrorMessage('Could not find the signed agreement for this loan request.')
      setStep('error')
      return
    }

    const [{ data: equipment }, { data: unit }] = await Promise.all([
      supabase.from('equipment').select('name').eq('id', requestItem.equipment_id).single(),
      requestItem.equipment_unit_id
        ? supabase.from('equipment_units').select('serial_number').eq('id', requestItem.equipment_unit_id).single()
        : Promise.resolve({ data: null }),
    ])

    const { data: signedAgreement, error: signedAgreementError } = await supabase.storage
      .from(LOAN_AGREEMENTS_BUCKET)
      .createSignedUrl(requestItem.signed_agreement_path, 60 * 60)

    if (signedAgreementError || !signedAgreement?.signedUrl) {
      setErrorMessage('Could not open the signed agreement for this loan request.')
      setStep('error')
      return
    }

    const serial = unit?.serial_number ?? 'Not assigned'
    setResolvedSerial(serial)
    setPendingApproval({
      loanId: null,
      itemId: requestItem.id,
      requestId: requestItem.loan_request_id,
      agreementPath: requestItem.signed_agreement_path,
      agreementUrl: signedAgreement.signedUrl,
      itemName: equipment?.name ?? 'this hardware item',
      serial,
      managerId,
      managerName,
    })
    setStep('attest')
  }, [])

  const approveAgreement = useCallback(async () => {
    if (!pendingApproval) return
    cancelledRef.current = false
    setStep('finalizing')

    try {
      // The hand-off itself — stamping the certificate onto the signed
      // agreement and moving the request to approved — lives in
      // handOffLoanRequestItem so this flow and the "Mark as handed off"
      // button on the loan detail screen can't drift apart. Only the legacy
      // `loans` row below is specific to this scan-based path.
      await handOffLoanRequestItem({
        itemId: pendingApproval.itemId,
        adminId: pendingApproval.managerId,
        adminName: pendingApproval.managerName,
      })

      if (pendingApproval.loanId) {
        const approvedAt = new Date().toISOString()
        const { error: updateError } = await supabase
          .from('loans')
          .update({
            status: 'active',
            checked_out_at: approvedAt,
            approved_by: pendingApproval.managerId,
            approved_at: approvedAt,
          })
          .eq('id', pendingApproval.loanId)

        if (updateError) throw updateError
      }
      setStep('success')
    } catch (approvalError) {
      // eslint-disable-next-line no-console
      console.error('Failed to approve signed agreement:', approvalError)
      setErrorMessage('Could not approve the signed agreement. Please try again.')
      setStep('error')
    }
  }, [pendingApproval])

  const cancelApproval = useCallback(() => {
    cancelledRef.current = true
    setPendingApproval(null)
    setErrorMessage('')
    setStep('scan')
  }, [])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    setPendingApproval(null)
    setErrorMessage('')
    setStep('scan')
  }, [])

  const retry = useCallback(() => {
    setErrorMessage('')
    setStep('scan')
  }, [])

  return {
    step,
    resolvedSerial,
    errorMessage,
    pendingApproval,
    submitSerial,
    submitRequestItem,
    approveAgreement,
    cancelApproval,
    cancel,
    retry,
  }
}
