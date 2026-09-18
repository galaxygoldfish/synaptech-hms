import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InfoTooltip } from '../components/InfoTooltip'

function mockBubbleRect(left: number, right: number) {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const isBubble = this.getAttribute('role') === 'tooltip'
    return {
      left: isBubble ? left : 0,
      right: isBubble ? right : 0,
      top: 0,
      bottom: 0,
      width: isBubble ? right - left : 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }
  })
}

function shiftOf(bubble: HTMLElement): number {
  return parseFloat(bubble.style.getPropertyValue('--bubble-shift'))
}

beforeEach(() => {
  // jsdom has no layout, so its viewport reports 0 wide.
  Object.defineProperty(document.documentElement, 'clientWidth', { value: 1024, configurable: true })
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(document.documentElement, 'clientWidth')
})

describe('InfoTooltip — staying on screen', () => {
  it('slides left when the bubble would run off the right edge', async () => {
    mockBubbleRect(700, 1100)
    render(<InfoTooltip label="What is this?" text="Some help text" />)

    await userEvent.click(screen.getByRole('button', { name: 'What is this?' }))

    // 1100 -> 1012 (1024 less the 12px margin).
    expect(shiftOf(await screen.findByRole('tooltip'))).toBe(-88)
  })

  it('slides right when the bubble would run off the left edge', async () => {
    mockBubbleRect(-40, 300)
    render(<InfoTooltip label="What is this?" text="Some help text" />)

    await userEvent.click(screen.getByRole('button', { name: 'What is this?' }))

    expect(shiftOf(await screen.findByRole('tooltip'))).toBe(52)
  })

  it('leaves a bubble that already fits where it is', async () => {
    mockBubbleRect(300, 600)
    render(<InfoTooltip label="What is this?" text="Some help text" />)

    await userEvent.click(screen.getByRole('button', { name: 'What is this?' }))

    expect(shiftOf(await screen.findByRole('tooltip'))).toBe(0)
  })
})
