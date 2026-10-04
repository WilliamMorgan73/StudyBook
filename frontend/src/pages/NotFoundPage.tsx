import { ArrowLeft, BookOpen, FileQuestion } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ErrorState } from '@/components/ErrorState'
import { PageHeader } from '@/components/PageHeader'

export function NotFoundPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        left={
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <BookOpen className="size-6" />
            <span className="text-lg font-semibold">StudyBook</span>
          </Link>
        }
      />
      <div className="flex flex-1 items-center justify-center p-6">
        <ErrorState
          icon={FileQuestion}
          iconVariant="muted"
          badge="404"
          title="Page not found"
          description="The page you are looking for doesn't exist, was moved, or the URL might be mistyped."
          primaryAction={{
            label: 'Back to Overview',
            to: '/',
            icon: ArrowLeft,
          }}
        />
      </div>
    </div>
  )
}
