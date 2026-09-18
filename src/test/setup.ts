import '@testing-library/jest-dom'

// jsdom has no ResizeObserver, and useEdgeFade constructs one on mount — so
// without this any screen with a scrolling chip row throws on render rather
// than failing on whatever the test was actually about. A no-op is enough
// here: the hook's own behaviour is covered in useEdgeFade.test.tsx, which
// stubs a measuring version of its own.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
