'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

interface SpinnerProps {
  size?: number; // px
  className?: string;
  'aria-label'?: string;
}

export function Spinner({ size = 16, className, 'aria-label': ariaLabel = 'Loading' }: SpinnerProps) {
  const style = { width: size, height: size } as React.CSSProperties;
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('animate-spin text-foreground', className)}
      style={style}
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

Spinner.displayName = 'Spinner';


