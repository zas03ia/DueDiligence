import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import ProjectList from './pages/ProjectList'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectList />} />
          <Route path="/projects/:id" element={<div>Project Detail (Coming Soon)</div>} />
          <Route path="/documents" element={<div>Documents (Coming Soon)</div>} />
          <Route path="/evaluation" element={<div>Evaluation (Coming Soon)</div>} />
        </Routes>
        <Toaster position="top-right" />
      </div>
    </Router>
  )
}

export default App
