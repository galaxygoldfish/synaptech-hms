import { supabase } from './supabase'

/**
 * When a member is free — for collecting hardware, and for giving it back.
 *
 * Both live in loan_request_availability, told apart by `kind` and by what
 * they hang off: a checkout is arranged once for the whole submission, a
 * return per item, because items come back separately (see the 20260926000000
 * migration). Callers say which they mean and never touch the column layout.
 */

export type AvailabilityKind = 'checkout' | 'return'

export interface AvailabilitySlot {
  date: string // ISO date
  hour: number // 0-23
}

/**
 * What a set of slots is about. A checkout's answer belongs to the request;
 * a return's to one item of it — and the item's request id comes along
 * because the row carries both.
 */
export type AvailabilityTarget =
  | { kind: 'checkout'; loanRequestId: string }
  | { kind: 'return'; loanRequestId: string; loanRequestItemId: string }

export async function fetchAvailability(target: AvailabilityTarget): Promise<AvailabilitySlot[]> {
  let query = supabase
    .from('loan_request_availability')
    .select('available_date, available_hour')
    .eq('kind', target.kind)

  if (target.kind === 'return') {
    query = query.eq('loan_request_item_id', target.loanRequestItemId)
  } else {
    query = query.eq('loan_request_id', target.loanRequestId)
  }

  const { data, error } = await query.order('available_date').order('available_hour')
  if (error) throw error
  return (data ?? []).map((row) => ({ date: row.available_date, hour: row.available_hour }))
}

/**
 * Replaces a member's answer with the one they just painted.
 *
 * Delete-then-insert rather than a diff: the grid hands back a set, and
 * working out which rows to add and which to drop would be more code for the
 * same result on a table this small. Not atomic — the browser can't wrap two
 * statements in a transaction — so a failure between them leaves the slots
 * cleared. The screens re-read afterwards, and the worst case is a member
 * painting their hours again, not a loan in a wrong state.
 */
export async function saveAvailability(
  target: AvailabilityTarget,
  slots: AvailabilitySlot[],
): Promise<void> {
  let deletion = supabase.from('loan_request_availability').delete().eq('kind', target.kind)

  if (target.kind === 'return') {
    deletion = deletion.eq('loan_request_item_id', target.loanRequestItemId)
  } else {
    deletion = deletion.eq('loan_request_id', target.loanRequestId)
  }

  const { error: deleteError } = await deletion
  if (deleteError) throw deleteError

  if (slots.length === 0) return

  const { error: insertError } = await supabase.from('loan_request_availability').insert(
    slots.map((slot) => ({
      loan_request_id: target.loanRequestId,
      loan_request_item_id: target.kind === 'return' ? target.loanRequestItemId : null,
      kind: target.kind,
      available_date: slot.date,
      available_hour: slot.hour,
    })),
  )
  if (insertError) throw insertError
}

export interface RequestReturnInput {
  loanRequestId: string
  loanRequestItemId: string
  memberId: string
  slots: AvailabilitySlot[]
}

/**
 * Raises a return request: records when the member is free, then marks the
 * item as waiting to be collected.
 *
 * The availability goes in first on purpose. return_requested_at is what every
 * other screen reads as "this member is waiting on us" — the member's badge,
 * the admin's Requests list, the loan detail's return-availability button — so
 * setting it last means the request never appears without the times an admin
 * needs in order to act on it. A failure the other way round would put a
 * return in front of an admin with nothing to schedule against.
 */
export async function requestReturn(input: RequestReturnInput): Promise<void> {
  await saveAvailability(
    {
      kind: 'return',
      loanRequestId: input.loanRequestId,
      loanRequestItemId: input.loanRequestItemId,
    },
    input.slots,
  )

  const { error } = await supabase
    .from('loan_request_items')
    .update({
      return_requested_at: new Date().toISOString(),
      return_requested_by: input.memberId,
    })
    .eq('id', input.loanRequestItemId)
    // Guards the double-submit and the admin-checked-it-in-meanwhile case:
    // hardware already back cannot be asked for back again.
    .is('returned_at', null)

  if (error) throw error
}

/**
 * Withdraws a return request — the member changed their mind before anyone
 * collected anything. Clears the times as well as the flag, so an admin is
 * never left looking at hours for a return nobody is asking for.
 */
export async function cancelReturnRequest(
  loanRequestId: string,
  loanRequestItemId: string,
): Promise<void> {
  const { error } = await supabase
    .from('loan_request_items')
    .update({ return_requested_at: null, return_requested_by: null })
    .eq('id', loanRequestItemId)
    .is('returned_at', null)

  if (error) throw error

  await saveAvailability({ kind: 'return', loanRequestId, loanRequestItemId }, [])
}
