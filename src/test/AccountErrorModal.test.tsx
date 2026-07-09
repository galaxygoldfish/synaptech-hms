import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AccountErrorModal from '../components/AccountErrorModal'

describe('AccountErrorModal', () => {
  const onRetry = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<AccountErrorModal isOpen={false} onRetry={onRetry} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the error heading and body text when open', () => {
    render(<AccountErrorModal isOpen onRetry={onRetry} />)
    expect(screen.getByRole('heading', { name: /account error/i })).toBeInTheDocument()
    expect(screen.getByText(/you must use your UW Google account/i)).toBeInTheDocument()
    expect(screen.getByText(/personal accounts are not accepted/i)).toBeInTheDocument()
  })

  it('calls onRetry when "Try again" is clicked', async () => {
    const user = userEvent.setup()
    render(<AccountErrorModal isOpen onRetry={onRetry} />)
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
