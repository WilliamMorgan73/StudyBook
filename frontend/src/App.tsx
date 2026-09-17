import { Route, Routes } from 'react-router-dom'

import { AssignmentPage } from '@/pages/AssignmentPage'
import { ModulePage } from '@/pages/ModulePage'
import { ModuleSettingsPage } from '@/pages/ModuleSettingsPage'
import { Overview } from '@/pages/Overview'
import { SubmodulePage } from '@/pages/SubmodulePage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Overview />} />
      <Route path="/modules/:moduleId" element={<ModulePage />} />
      <Route path="/modules/:moduleId/assignments/:assignmentId" element={<AssignmentPage />} />
      <Route path="/modules/:moduleId/settings" element={<ModuleSettingsPage />} />
      <Route path="/modules/:moduleId/submodules/:submoduleId" element={<SubmodulePage />} />
    </Routes>
  )
}

export default App
