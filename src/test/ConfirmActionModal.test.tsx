import { fireEvent, render } from '@testing-library/react'
import ConfirmActionModal from '../components/ConfirmActionModal'

function renderModal(confirmDisabled: boolean) {
  const onCancel = vi.fn()
  const { container } = render(
    <ConfirmActionModal
      isOpen
      heading="Delete this unit?"
      body={['This cannot be undone.']}
      confirmLabel="Delete"
      confirmDisabled={confirmDisabled}
      onConfirm={vi.fn()}
      onCancel={onCancel}
    />,
  )
  return { overlay: container.firstChild as HTMLElement, onCancel }
}

describe('ConfirmActionModal', () => {
  it('cancels when the overlay is clicked', () => {
    const { overlay, onCancel } = renderModal(false)
    fireEvent.click(overlay)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('ignores overlay clicks and Escape while the action is in flight', () => {
    const { overlay, onCancel } = renderModal(true)
    fireEvent.click(overlay)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
  })
})
