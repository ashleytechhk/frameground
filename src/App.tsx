import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ProjectPicker } from './pages/ProjectPicker'
import { CanvasRoute } from './pages/CanvasRoute'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProjectPicker />} />
        <Route path="/p/:projectId/:canvasId?" element={<CanvasRoute />} />
      </Routes>
    </BrowserRouter>
  )
}
