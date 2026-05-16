import React from 'react'
import { Link } from 'react-router-dom'
import { Home } from 'lucide-react'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface PageHeaderProps {
  breadcrumbs?: BreadcrumbItem[]
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export default function PageHeader({ breadcrumbs = [], title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="border-b border-border bg-muted/30">
      <div className="container mx-auto px-4 py-6">
        {breadcrumbs.length > 0 && (
          <nav className="flex mb-3 text-sm" aria-label="Breadcrumb">
            <ol className="flex items-center flex-wrap gap-1">
              <li>
                <Link to="/projects" className="text-muted-foreground hover:text-foreground flex items-center">
                  <Home className="w-4 h-4 mr-1" />
                  Home
                </Link>
              </li>
              {breadcrumbs.map((item, index) => (
                <li key={index} className="flex items-center gap-1">
                  <span className="text-muted-foreground">/</span>
                  {item.href ? (
                    <Link to={item.href} className="text-muted-foreground hover:text-foreground">
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
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{title}</h1>
            {subtitle && <p className="text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  )
}
