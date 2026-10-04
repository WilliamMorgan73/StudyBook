import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, Home, RotateCcw } from 'lucide-react'

import { DesktopTitleBar } from '@/components/WindowControls'
import { ErrorState } from '@/components/ErrorState'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode)
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  info: ErrorInfo | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, info: null }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info })
    console.error('Uncaught error caught by ErrorBoundary:', error, info)
  }

  reset = () => {
    this.setState({ hasError: false, error: null, info: null })
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error, this.reset)
      }
      if (this.props.fallback) {
        return this.props.fallback
      }

      const details = [
        this.state.error.toString(),
        this.state.error.stack ? `\nStack trace:\n${this.state.error.stack}` : '',
        this.state.info?.componentStack ? `\nComponent stack:${this.state.info.componentStack}` : '',
      ]
        .filter(Boolean)
        .join('\n')

      return (
        <div className="flex h-full min-h-[60vh] w-full flex-col">
          <DesktopTitleBar />
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <ErrorState
              icon={AlertTriangle}
              iconVariant="destructive"
              badge="Application Error"
              title="Something went wrong"
              description="An unexpected error prevented this view from displaying properly. You can try refreshing the page or returning to the overview."
              primaryAction={{
                label: 'Reload page',
                icon: RotateCcw,
                onClick: () => window.location.reload(),
              }}
              secondaryAction={{
                label: 'Go to Overview',
                icon: Home,
                onClick: () => {
                  this.reset()
                  window.location.href = '/'
                },
              }}
              details={details}
            />
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
