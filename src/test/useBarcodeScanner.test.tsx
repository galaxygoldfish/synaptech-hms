import { renderHook, waitFor } from '@testing-library/react'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'

function fakeStream() {
  const track = { stop: vi.fn() }
  const stream = { getTracks: () => [track] } as unknown as MediaStream
  return { stream, track }
}

let getUserMedia: ReturnType<typeof vi.fn>

beforeEach(() => {
  getUserMedia = vi.fn()
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
  vi.stubGlobal(
    'BarcodeDetector',
    class {
      detect = vi.fn().mockResolvedValue([])
    },
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useBarcodeScanner — camera lifecycle', () => {
  it('does not touch the camera while inactive', () => {
    renderHook(() => useBarcodeScanner(vi.fn(), false))

    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('releases the camera when the screen unmounts', async () => {
    const { stream, track } = fakeStream()
    getUserMedia.mockResolvedValue(stream)

    const { unmount } = renderHook(() => useBarcodeScanner(vi.fn(), true))
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled())
    await Promise.resolve()
    unmount()

    expect(track.stop).toHaveBeenCalled()
  })

  // The browser can still be asking for permission when the admin leaves the
  // screen; the stream that arrives afterwards must not be left running.
  it('releases a stream that arrives after the screen was already left', async () => {
    const { stream, track } = fakeStream()
    let grant: (value: MediaStream) => void = () => {}
    getUserMedia.mockReturnValue(new Promise<MediaStream>((resolve) => (grant = resolve)))

    const { unmount } = renderHook(() => useBarcodeScanner(vi.fn(), true))
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled())
    unmount()
    grant(stream)

    await waitFor(() => expect(track.stop).toHaveBeenCalled())
  })

  it('releases the camera when the scanner is switched off', async () => {
    const { stream, track } = fakeStream()
    getUserMedia.mockResolvedValue(stream)

    const { rerender } = renderHook(({ active }) => useBarcodeScanner(vi.fn(), active), {
      initialProps: { active: true },
    })
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled())
    await Promise.resolve()
    rerender({ active: false })

    expect(track.stop).toHaveBeenCalled()
  })
})
