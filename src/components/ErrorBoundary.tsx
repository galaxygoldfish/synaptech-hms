import { Component, type ErrorInfo, type ReactNode } from 'react'

// Last line of defence for an error nothing else caught — most likely a code
// chunk that failed to load and couldn't be recovered by the reload in
// main.tsx. Without a boundary React 19 unmounts the whole tree and leaves a
// blank page with no way forward; this at least says what happened and
// offers the one thing that fixes it.
export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Unhandled error:', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div role="alert" style={{ padding: '4rem 1.5rem', textAlign: 'center', fontFamily: 'Rubik, sans-serif' }}>
        <p>Something went wrong loading this page.</p>
        <button type="button" onClick={() => window.location.reload()} style={{ marginTop: '1rem' }}>
          Reload
        </button>
      </div>
    )
  }
}
