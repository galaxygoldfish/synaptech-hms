import { render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { useEdgeFade, useVerticalEdgeFade } from '../lib/useEdgeFade'

// jsdom has neither layout nor ResizeObserver, so both are stood up here:
// the sizes below describe an element whose content overflows it in both
// directions, which is the only condition under which a fade should show.
const OVERFLOWING = { scrollWidth: 2240, clientWidth: 830, scrollHeight: 705, clientHeight: 532 }
const FITS = { scrollWidth: 830, clientWidth: 830, scrollHeight: 532, clientHeight: 532 }

function stubLayout(sizes: Record<string, number>) {
  for (const [property, value] of Object.entries(sizes)) {
    Object.defineProperty(HTMLElement.prototype, property, { configurable: true, get: () => value })
  }
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  for (const property of ['scrollWidth', 'clientWidth', 'scrollHeight', 'clientHeight']) {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)[property]
  }
  vi.unstubAllGlobals()
})

/**
 * Mirrors the shape that actually broke: the faded element doesn't exist on
 * the first render, because the screen is showing a loading skeleton, and
 * appears only once the data arrives.
 */
function LateTable() {
  const [isLoaded, setLoaded] = useState(false)
  const { ref: hRef, maskImage: hMask } = useEdgeFade<HTMLDivElement>()
  const { ref: vRef, maskImage: vMask } = useVerticalEdgeFade<HTMLDivElement>()

  return (
    <>
      <button type="button" onClick={() => setLoaded(true)}>
        Load
      </button>
      {isLoaded ? (
        <div data-testid="wrap" style={{ maskImage: vMask }}>
          <div
            data-testid="scroll"
            ref={(el) => {
              hRef(el)
              vRef(el)
            }}
            style={{ maskImage: hMask }}
          />
        </div>
      ) : (
        <p>Loading…</p>
      )}
    </>
  )
}

describe('useEdgeFade / useVerticalEdgeFade', () => {
  // The regression: the hooks used to measure once on mount via a ref
  // object, so an element that attached later kept a flat mask and the
  // content simply cut off at the edge with no hint there was more.
  it('fades an element that only attaches after the data loads', async () => {
    stubLayout(OVERFLOWING)
    render(<LateTable />)

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    screen.getByRole('button', { name: 'Load' }).click()

    await waitFor(() => {
      expect(screen.getByTestId('scroll').style.maskImage).toContain('transparent')
    })
    expect(screen.getByTestId('wrap').style.maskImage).toContain('transparent')
  })

  it('leaves both masks flat when nothing overflows', async () => {
    stubLayout(FITS)
    render(<LateTable />)
    screen.getByRole('button', { name: 'Load' }).click()

    await waitFor(() => expect(screen.getByTestId('scroll')).toBeInTheDocument())
    expect(screen.getByTestId('scroll').style.maskImage).not.toContain('transparent')
    expect(screen.getByTestId('wrap').style.maskImage).not.toContain('transparent')
  })
})
