import { Link, useParams } from 'react-router-dom'

export function ModulePage() {
  const { moduleId } = useParams()

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-6 py-8">
      <Link to="/" className="text-sm text-muted-foreground hover:underline">
        &larr; Back to overview
      </Link>
      <h1 className="text-2xl font-semibold">Module {moduleId}</h1>
      <p className="text-sm text-muted-foreground">The module page hasn't been built yet.</p>
    </div>
  )
}
