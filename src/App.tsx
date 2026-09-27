import { AppRouter } from './router'
import { ErrorBoundary } from './components/ErrorBoundary'

export default function App() {
  return (
    <ErrorBoundary>
      <AppRouter />
    </ErrorBoundary>
  )
}
