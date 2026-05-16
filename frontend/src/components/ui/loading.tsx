import React from 'react'
import { cn } from '@/lib/utils'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  }

  return (
    <div
      className={cn(
        'animate-spin rounded-full border-2 border-gray-300 border-t-blue-600',
        sizeClasses[size],
        className
      )}
    />
  )
}

interface LoadingStateProps {
  message?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function LoadingState({ message = 'Loading...', size = 'md', className }: LoadingStateProps) {
  return (
    <div className={cn('flex items-center justify-center space-x-3', className)}>
      <LoadingSpinner size={size} />
      <span className="text-gray-600">{message}</span>
    </div>
  )
}

interface LoadingCardProps {
  title?: string
  message?: string
  className?: string
}

export function LoadingCard({ title = 'Loading', message = 'Please wait...', className }: LoadingCardProps) {
  return (
    <div className={cn('bg-white rounded-lg border border-gray-200 p-8 text-center', className)}>
      <LoadingSpinner size="lg" className="mx-auto mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600">{message}</p>
    </div>
  )
}
