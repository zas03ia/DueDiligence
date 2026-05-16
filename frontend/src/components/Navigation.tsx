import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Home, FileText, BarChart3, HelpCircle, Sparkles, Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function Navigation() {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)

  const navItems = [
    { href: '/projects', label: 'Projects', icon: Home },
    { href: '/documents', label: 'Documents', icon: FileText },
    { href: '/evaluation', label: 'Evaluation', icon: BarChart3 },
  ]

  const isActive = (href: string) => {
    if (href === '/projects') return location.pathname.startsWith('/projects')
    if (href === '/evaluation') return location.pathname.includes('/evaluation')
    return location.pathname === href || location.pathname.startsWith(href + '/')
  }

  const showHelp = () => {
    alert(
      'DueDiligence Help\n\n' +
        '1. Create a project under Projects → New Project\n' +
        '2. Upload documents (global or per-project)\n' +
        '3. Generate AI answers from the project detail page\n' +
        '4. Confirm or reject answers, then run evaluation\n' +
        '5. Track background jobs under Request Status'
    )
  }

  return (
    <nav className="bg-background border-b border-border sticky top-0 z-50 backdrop-blur-sm bg-background/95">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link to="/projects" className="flex items-center space-x-3 group">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-sm group-hover:shadow-md transition-all">
                <Sparkles className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <span className="text-xl font-bold text-foreground">DueDiligence</span>
                <span className="text-xs text-muted-foreground block leading-none">AI Platform</span>
              </div>
            </Link>

            <div className="hidden lg:flex items-center space-x-1">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      isActive(item.href)
                        ? 'bg-primary/10 text-primary'
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

          <div className="flex items-center space-x-3">
            <Button variant="ghost" size="sm" className="hidden md:flex" onClick={showHelp}>
              <HelpCircle className="w-4 h-4 mr-2" />
              Help
            </Button>
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

        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-border py-4 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium ${
                    isActive(item.href) ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </nav>
  )
}
