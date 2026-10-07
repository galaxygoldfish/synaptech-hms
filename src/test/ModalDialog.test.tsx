import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModalDialog } from '../components/ModalDialog'

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  const close = () => {
    onClose?.()
    setOpen(false)
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button">Behind the overlay</button>
      {open && (
        <ModalDialog aria-label="Example" onClose={close}>
          <button type="button">First</button>
          <button type="button" onClick={close}>
            Last
          </button>
        </ModalDialog>
      )}
    </>
  )
}

describe('ModalDialog', () => {
  it('is announced as a modal dialog and takes focus when it opens', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open' }))

    const dialog = screen.getByRole('dialog', { name: 'Example' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
  })

  it('keeps Tab inside the dialog rather than reaching the page behind it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open' }))

    await user.tab()
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus()
  })

  it('closes on Escape and gives focus back to what opened it', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<Harness onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Open' }))

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus()
  })

  it('ignores Escape when it has no onClose, e.g. while submitting', async () => {
    const user = userEvent.setup()
    render(
      <ModalDialog aria-label="Busy">
        <button type="button">Only</button>
      </ModalDialog>,
    )
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Busy' })).toBeInTheDocument()
  })

  it('lets only the topmost of two stacked dialogs answer Escape', async () => {
    const onCloseBottom = vi.fn()
    const onCloseTop = vi.fn()
    const user = userEvent.setup()
    render(
      <>
        <ModalDialog aria-label="Bottom" onClose={onCloseBottom}>
          <button type="button">Bottom button</button>
        </ModalDialog>
        <ModalDialog aria-label="Top" onClose={onCloseTop}>
          <button type="button">Top button</button>
        </ModalDialog>
      </>,
    )
    await user.keyboard('{Escape}')
    expect(onCloseTop).toHaveBeenCalledOnce()
    expect(onCloseBottom).not.toHaveBeenCalled()
  })
})
