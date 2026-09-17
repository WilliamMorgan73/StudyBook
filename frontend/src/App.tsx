import { Route, Routes } from 'react-router-dom'

import { ModulePage } from '@/pages/ModulePage'
import { ModuleSettingsPage } from '@/pages/ModuleSettingsPage'
import { Overview } from '@/pages/Overview'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Overview />} />
      <Route path="/modules/:moduleId" element={<ModulePage />} />
      <Route path="/modules/:moduleId/assignments/:assignmentId" element={<ModulePage />} />
      <Route path="/modules/:moduleId/settings" element={<ModuleSettingsPage />} />
    </Routes>
  )
}

export default App
