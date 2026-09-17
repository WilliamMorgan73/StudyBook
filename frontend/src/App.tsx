import { Route, Routes } from 'react-router-dom'

import { ModulePage } from '@/pages/ModulePage'
import { Overview } from '@/pages/Overview'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Overview />} />
      <Route path="/modules/:moduleId" element={<ModulePage />} />
      <Route path="/modules/:moduleId/assignments/:assignmentId" element={<ModulePage />} />
    </Routes>
  )
}

export default App
