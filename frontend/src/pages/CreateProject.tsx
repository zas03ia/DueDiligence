import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Info, FileText, Upload, Target, AlertTriangle, Building2, FileCheck, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useProjectStore } from '@/stores/projectStore'
import { apiClient } from '@/services/api'
import PageHeader from '@/components/PageHeader'
import toast from 'react-hot-toast'

export default function CreateProject() {
  const navigate = useNavigate()
  const { createProject, isLoading } = useProjectStore()
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    questionnaire_id: ''
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [questionnaires, setQuestionnaires] = useState<{ id: string; name: string }[]>([])
  const [questionnaireFile, setQuestionnaireFile] = useState<File | null>(null)
  const [uploadingQuestionnaire, setUploadingQuestionnaire] = useState(false)
  const questionnaireFileRef = React.useRef<HTMLInputElement>(null)

  useEffect(() => {
    apiClient.getQuestionnaires()
      .then(setQuestionnaires)
      .catch(() => {})
  }, [])

  const handleQuestionnaireUpload = async (file: File) => {
    setUploadingQuestionnaire(true)
    try {
      toast.loading('Parsing questionnaire...', { id: 'q-upload' })
      const result = await apiClient.uploadQuestionnaire(file)
      toast.success(`Questionnaire parsed: ${result.total_questions} questions found`, { id: 'q-upload' })
      // Refresh list and auto-select the new questionnaire
      const updated = await apiClient.getQuestionnaires()
      setQuestionnaires(updated)
      setFormData(prev => ({ ...prev, questionnaire_id: result.questionnaire_id }))
      setQuestionnaireFile(file)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to parse questionnaire', { id: 'q-upload' })
    } finally {
      setUploadingQuestionnaire(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    
    if (!formData.name.trim()) {
      newErrors.name = 'Project name is required'
    } else if (formData.name.length < 3) {
      newErrors.name = 'Project name must be at least 3 characters'
    }
    
    if (!formData.description.trim()) {
      newErrors.description = 'Description is required'
    } else if (formData.description.length < 10) {
      newErrors.description = 'Description must be at least 10 characters'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    try {
      toast.loading('Creating project...', { id: 'create-project' })
      
      const projectData = {
        name: formData.name,
        description: formData.description,
        document_scope: [],
      }
      
      const project = await createProject(projectData)

      if (formData.questionnaire_id) {
        try {
          await apiClient.setProjectQuestionnaire(project.id, formData.questionnaire_id)
        } catch {
          toast.error('Project created but failed to assign questionnaire. You can assign it from the project page.')
        }
      }
      
      toast.success('Project created successfully!', { id: 'create-project' })
      navigate(`/projects/${project.id}`)
    } catch (error: any) {
      console.error('Failed to create project:', error)
      
      let errorMessage = 'Failed to create project. Please try again.'
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail
      } else if (error.message) {
        errorMessage = error.message
      }
      
      toast.error(errorMessage, { id: 'create-project' })
    }
  }

  const handleCancel = () => {
    navigate('/projects')
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: 'Create New Project' },
        ]}
        title="Create New Project"
        subtitle="Set up a new due diligence project to analyze documents and generate insights"
      />

      <div className="container mx-auto px-4 py-6">
        <div className="max-w-2xl mx-auto">
          {/* Welcome Card */}
          <Card className="border-0 shadow-lg bg-gradient-to-br from-slate-50 to-slate-100 mb-6">
            <CardContent className="p-8">
              <div className="flex items-start space-x-6">
                <div className="bg-primary/10 rounded-2xl p-4">
                  <Target className="w-8 h-8 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-2xl font-bold text-foreground mb-3">
                    Create Your Due Diligence Project
                  </CardTitle>
                  <CardDescription className="text-base text-muted-foreground mb-4">
                    Transform your document analysis workflow with AI-powered insights and comprehensive reporting.
                  </CardDescription>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="px-3 py-1">
                      <Sparkles className="w-3 h-3 mr-1" />
                      AI-Powered Analysis
                    </Badge>
                    <Badge variant="secondary" className="px-3 py-1">
                      <FileCheck className="w-3 h-3 mr-1" />
                      Automated Insights
                    </Badge>
                    <Badge variant="secondary" className="px-3 py-1">
                      <Building2 className="w-3 h-3 mr-1" />
                      Professional Reports
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Project Information */}
            <Card className="shadow-sm border">
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <div className="bg-primary/10 rounded-lg p-2">
                    <Target className="w-5 h-5 text-primary" />
                  </div>
                  Project Information
                </CardTitle>
                <CardDescription>
                  Provide the basic details for your due diligence project
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <label htmlFor="name" className="block text-sm font-medium text-foreground">
                    Project Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g., Q4 2024 Acquisition Analysis"
                    className={errors.name ? 'border-destructive focus:ring-destructive' : ''}
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" />
                      {errors.name}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Choose a descriptive name that clearly identifies your project
                  </p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="description" className="block text-sm font-medium text-foreground">
                    Project Description <span className="text-destructive">*</span>
                  </label>
                  <Textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={4}
                    placeholder="Provide a detailed description of what this project aims to accomplish..."
                    className={errors.description ? 'border-destructive focus:ring-destructive' : ''}
                  />
                  {errors.description && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" />
                      {errors.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Describe the scope, objectives, and any specific areas of focus for this due diligence project
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Questionnaire Template */}
            <Card className="shadow-sm border">
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <div className="bg-primary/10 rounded-lg p-2">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  Questionnaire Template
                </CardTitle>
                <CardDescription>
                  Choose a predefined questionnaire template or customize later
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="questionnaire_id" className="block text-sm font-medium text-foreground">
                      Select existing questionnaire
                    </label>
                    <select
                      id="questionnaire_id"
                      name="questionnaire_id"
                      value={formData.questionnaire_id}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                    >
                      <option value="">Select a questionnaire (optional)</option>
                      {questionnaires.map((q) => (
                        <option key={q.id} value={q.id}>{q.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">or upload new</span>
                    </div>
                  </div>

                  <div
                    className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => questionnaireFileRef.current?.click()}
                  >
                    {questionnaireFile ? (
                      <p className="text-sm text-primary font-medium">{questionnaireFile.name}</p>
                    ) : (
                      <>
                        <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Upload a questionnaire PDF or DOCX to parse it into questions</p>
                      </>
                    )}
                    <input
                      ref={questionnaireFileRef}
                      type="file"
                      accept=".pdf,.docx"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) handleQuestionnaireUpload(f)
                        e.target.value = ''
                      }}
                    />
                  </div>

                  {uploadingQuestionnaire && (
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <span className="animate-spin inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full" />
                      Parsing questionnaire into questions...
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground">
                    You can change the questionnaire later from the project detail page.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Next Steps Info */}
            <Card className="border-0 bg-gradient-to-r from-primary/5 to-primary/10">
              <CardContent className="p-6">
                <div className="flex items-start space-x-4">
                  <div className="bg-primary/20 rounded-full p-2">
                    <Info className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-foreground mb-3">What happens next?</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-start space-x-3">
                        <div className="bg-primary/10 rounded-full p-1 mt-0.5">
                          <CheckCircle className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">Upload Documents</p>
                          <p className="text-sm text-muted-foreground">Add your PDF, Word, Excel, and PowerPoint files</p>
                        </div>
                      </div>
                      <div className="flex items-start space-x-3">
                        <div className="bg-primary/10 rounded-full p-1 mt-0.5">
                          <CheckCircle className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">AI Analysis</p>
                          <p className="text-sm text-muted-foreground">Automatic indexing and intelligent document analysis</p>
                        </div>
                      </div>
                      <div className="flex items-start space-x-3">
                        <div className="bg-primary/10 rounded-full p-1 mt-0.5">
                          <CheckCircle className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">Review Answers</p>
                          <p className="text-sm text-muted-foreground">Evaluate AI-generated responses and insights</p>
                        </div>
                      </div>
                      <div className="flex items-start space-x-3">
                        <div className="bg-primary/10 rounded-full p-1 mt-0.5">
                          <CheckCircle className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">Generate Reports</p>
                          <p className="text-sm text-muted-foreground">Create comprehensive due diligence reports</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <CardFooter className="flex justify-between items-center pt-6 bg-muted/50">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isLoading}
                className="px-6"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              
              <Button
                type="submit"
                disabled={isLoading}
                className="px-8"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />
                    Creating Project...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Create Project
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </div>
      </div>
    </div>
  )
}
