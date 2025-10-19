'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

export interface SegmentedOption {
  value: string;
  label: React.ReactNode;
}

interface SegmentedControlProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SegmentedOption[];
  ariaLabel?: string;
  className?: string;
}

export function SegmentedControl({ value, onValueChange, options, ariaLabel, className }: SegmentedControlProps) {
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const containerRef = React.useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (options.length === 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (selectedIndex + 1) % options.length;
      onValueChange(options[next].value);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (selectedIndex - 1 + options.length) % options.length;
      onValueChange(options[prev].value);
    } else if (e.key === 'Home') {
      e.preventDefault();
      onValueChange(options[0].value);
    } else if (e.key === 'End') {
      e.preventDefault();
      onValueChange(options[options.length - 1].value);
    }
  };

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'flex flex-wrap items-center gap-1 rounded-lg border border-border bg-surface p-1 md:inline-flex md:flex-nowrap',
        className
      )}
      onKeyDown={handleKeyDown}
    >
      {options.map((opt) => {
        const checked = opt.value === value;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className={cn(
              'flex-1 min-w-[88px] px-3 py-1 rounded-md text-sm font-medium transition-colors duration-150 border sm:flex-none sm:min-w-0',
              checked
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-transparent text-muted hover:bg-surface-hover'
            )}
            onClick={() => onValueChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

SegmentedControl.displayName = 'SegmentedControl';
