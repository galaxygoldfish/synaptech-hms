// Minimal ambient types for the native BarcodeDetector API. TypeScript's
// DOM lib doesn't ship these yet, and the API itself is currently only
// available in Chromium-based browsers (checked at runtime in
// useBarcodeScanner via `'BarcodeDetector' in window`).
// Safe to delete once @types/dom or TS itself adds official types.

interface BarcodeDetectorOptions {
  formats?: string[]
}

interface DetectedBarcode {
  rawValue: string
  format: string
}

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions)
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}
