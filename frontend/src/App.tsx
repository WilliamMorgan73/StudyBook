import { motion, MotionConfig } from 'motion/react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { AssignmentPage } from '@/pages/AssignmentPage'
import { ModulePage } from '@/pages/ModulePage'
import { Overview } from '@/pages/Overview'
import { SetupPage } from '@/pages/SetupPage'
import { SubmodulePage } from '@/pages/SubmodulePage'
import { getAppSettings } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { useApplyTheme } from '@/lib/theme'

function App() {
  useApplyTheme()
  const location = useLocation()
  const settings = useAsync(() => getAppSettings(), [])

  // Hold the first paint until we know whether this is a first run, so a new install doesn't
  // flash an empty Overview before the redirect. If settings can't load, carry on as normal.
  if (settings.loading) return null
  const needsSetup = settings.data?.setup_completed === false
  if (needsSetup && location.pathname !== '/setup') return <Navigate to="/setup" replace />

  return (
    // reducedMotion="user" drops transform animations (keeping opacity fades) for anyone with the
    // OS reduced-motion setting on.
    <MotionConfig reducedMotion="user" transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}>
      {/* Keyed on the path so each navigation mounts a fresh page that fades in. Entrance only,
          no exit: waiting on an exit would make every navigation feel slower. */}
      <motion.div
        key={location.pathname}
        className="h-full"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <Routes location={location}>
          <Route path="/" element={<Overview />} />
          <Route path="/setup" element={<SetupPage onFinished={settings.refetch} />} />
          <Route path="/modules/:moduleId" element={<ModulePage />} />
          <Route path="/modules/:moduleId/assignments/:assignmentId" element={<AssignmentPage />} />
          <Route path="/modules/:moduleId/submodules/:submoduleId" element={<SubmodulePage />} />
        </Routes>
      </motion.div>
    </MotionConfig>
  )
}

export default App
