import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConfirmationModal from '../components/ConfirmationModal'

describe('ConfirmationModal', () => {
  const onClose = vi.fn()
  const onConfirm = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ConfirmationModal isOpen={false} onClose={onClose} onConfirm={onConfirm} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the heading and UW disclaimer when open', () => {
    render(<ConfirmationModal isOpen onClose={onClose} onConfirm={onConfirm} />)
    expect(screen.getByRole('heading', { name: /welcome/i })).toBeInTheDocument()
    expect(
      screen.getByText(/intended solely for the use of current University of Washington/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/select your UW Google account/i)).toBeInTheDocument()
  })

  it('calls onConfirm when "Sounds good" is clicked', async () => {
    const user = userEvent.setup()
    render(<ConfirmationModal isOpen onClose={onClose} onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: /sounds good/i }))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when the overlay backdrop is clicked directly', () => {
    const { container } = render(
      <ConfirmationModal isOpen onClose={onClose} onConfirm={onConfirm} />
    )
    // fireEvent dispatches to the overlay element itself, not via pointer position,
    // so stopPropagation on the inner modal card does not interfere.
    fireEvent.click(container.firstChild as Element)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not call onClose when content inside the modal card is clicked', async () => {
    const user = userEvent.setup()
    render(<ConfirmationModal isOpen onClose={onClose} onConfirm={onConfirm} />)
    await user.click(screen.getByRole('heading', { name: /welcome/i }))
    expect(onClose).not.toHaveBeenCalled()
  })
})
