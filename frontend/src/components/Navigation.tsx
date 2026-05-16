import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Home, FileText, BarChart3, Settings, HelpCircle, Sparkles, Building2, Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface NavigationProps {
  breadcrumbs?: BreadcrumbItem[]
  title?: string
  subtitle?: string
}

export default function Navigation({ breadcrumbs = [], title, subtitle }: NavigationProps) {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)

  const getNavigationItems = () => [
    { href: '/projects', label: 'Projects', icon: Home, description: 'Manage your due diligence projects' },
    { href: '/documents', label: 'Documents', icon: FileText, description: 'Upload and organize documents' },
    { href: '/evaluation', label: 'Evaluation', icon: BarChart3, description: 'View analysis results' },
  ]

  const isActive = (href: string) => {
    if (href === '/projects' && location.pathname.startsWith('/projects')) {
      return true
    }
    return location.pathname === href
  }

  return (
    <nav className="bg-background border-b border-border sticky top-0 z-50 backdrop-blur-sm bg-background/95">
      <div className="container mx-auto px-4">
        {/* Top Navigation Bar */}
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            {/* Logo */}
            <Link to="/projects" className="flex items-center space-x-3 group">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-sm group-hover:shadow-md transition-all duration-200">
                <Sparkles className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <span className="text-xl font-bold text-foreground">DueDiligence</span>
                <span className="text-xs text-muted-foreground block leading-none">AI Platform</span>
              </div>
            </Link>

            {/* Main Navigation - Desktop */}
            <div className="hidden lg:flex items-center space-x-1">
              {getNavigationItems().map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={`group flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive(item.href)
                        ? 'bg-primary/10 text-primary shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center space-x-3">
            {/* Help Button */}
            <Button variant="ghost" size="sm" className="hidden md:flex">
              <HelpCircle className="w-4 h-4 mr-2" />
              Help
            </Button>
            
            {/* Mobile Menu Toggle */}
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-border py-4">
            <div className="space-y-2">
              {getNavigationItems().map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      isActive(item.href)
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Icon className="w-5 h-5" />
                    <div>
                      <div>{item.label}</div>
                      <div className="text-xs text-muted-foreground">{item.description}</div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Breadcrumbs and Page Header */}
        {(breadcrumbs.length > 0 || title) && (
          <div className="py-6 border-t border-border bg-muted/30">
            <div className="max-w-7xl mx-auto">
              {breadcrumbs.length > 0 && (
                <nav className="flex mb-4" aria-label="Breadcrumb">
                  <ol className="flex items-center space-x-2 text-sm">
                    <li>
                      <Link to="/projects" className="text-muted-foreground hover:text-foreground transition-colors flex items-center">
                        <Home className="w-4 h-4 mr-1" />
                        Home
                      </Link>
                    </li>
                    {breadcrumbs.map((item, index) => (
                      <li key={index} className="flex items-center space-x-2">
                        <span className="text-muted-foreground">/</span>
                        {item.href ? (
                          <Link
                            to={item.href}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {item.label}
                          </Link>
                        ) : (
                          <span className="text-foreground font-medium">{item.label}</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </nav>
              )}
              
              {title && (
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-3xl font-bold text-foreground">{title}</h1>
                    {subtitle && (
                      <p className="text-muted-foreground mt-2">{subtitle}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
