import { useEffect, useRef, useState } from 'react'

/**
 * Opens the device camera and watches for a barcode using the native
 * BarcodeDetector API (Chromium-based browsers only). When unsupported,
 * `isSupported` is false and the caller should lean on manual serial entry
 * instead — this hook never throws for that case.
 */
export function useBarcodeScanner(onDetected: (value: string) => void, active: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const onDetectedRef = useRef(onDetected)
  onDetectedRef.current = onDetected

  const [isSupported] = useState(
    () => typeof window !== 'undefined' && 'BarcodeDetector' in window,
  )
  const [permissionError, setPermissionError] = useState<string | null>(null)

  useEffect(() => {
    if (!active || !isSupported) return

    let stream: MediaStream | null = null
    let frameId = 0
    let cancelled = false

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (cancelled) return

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        const detector = new BarcodeDetector({
          formats: ['code_128', 'code_39', 'ean_13', 'qr_code'],
        })

        const scan = async () => {
          if (cancelled || !videoRef.current) return
          try {
            const barcodes = await detector.detect(videoRef.current)
            if (barcodes.length > 0) {
              onDetectedRef.current(barcodes[0].rawValue)
              return // stop the loop; the caller will move to the next step
            }
          } catch {
            // Transient detection errors are expected mid-frame; keep scanning.
          }
          frameId = requestAnimationFrame(scan)
        }

        frameId = requestAnimationFrame(scan)
      } catch {
        if (!cancelled) {
          setPermissionError("Couldn't access the camera. Check your browser permissions.")
        }
      }
    }

    start()

    return () => {
      cancelled = true
      if (frameId) cancelAnimationFrame(frameId)
      stream?.getTracks().forEach(track => track.stop())
    }
  }, [active, isSupported])

  return { videoRef, isSupported, permissionError }
}
