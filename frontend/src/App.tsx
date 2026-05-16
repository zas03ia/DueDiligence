import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Layout from './components/Layout'
import ProjectList from './pages/ProjectList'
import ProjectDetail from './pages/ProjectDetail'
import CreateProject from './pages/CreateProject'
import GenerateAnswers from './pages/GenerateAnswers'
import DocumentManagement from './pages/DocumentManagement'
import EvaluationIndex from './pages/EvaluationIndex'
import EvaluationReport from './pages/EvaluationReport'
import RequestStatus from './pages/RequestStatus'

function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectList />} />
          <Route path="/projects/new" element={<CreateProject />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/projects/:id/generate" element={<GenerateAnswers />} />
          <Route path="/projects/:id/documents" element={<DocumentManagement />} />
          <Route path="/projects/:id/evaluation" element={<EvaluationReport />} />
          <Route path="/projects/:id/requests" element={<RequestStatus />} />
          <Route path="/documents" element={<DocumentManagement />} />
          <Route path="/evaluation" element={<EvaluationIndex />} />
        </Route>
      </Routes>
      <Toaster position="top-right" />
    </Router>
  )
}

export default App
