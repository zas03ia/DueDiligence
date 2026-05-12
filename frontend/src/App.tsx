import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import ProjectList from './pages/ProjectList'
import ProjectDetail from './pages/ProjectDetail'
import DocumentManagement from './pages/DocumentManagement'
import EvaluationReport from './pages/EvaluationReport'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectList />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/documents" element={<DocumentManagement />} />
          <Route path="/evaluation" element={<EvaluationReport />} />
        </Routes>
        <Toaster position="top-right" />
      </div>
    </Router>
  )
}

export default App
