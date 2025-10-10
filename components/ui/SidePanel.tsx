'use client';

import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@/lib/cn';

interface SidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  widthClassName?: string; // e.g., 'max-w-xl'
}

export function SidePanel({ open, onOpenChange, title, description, children, widthClassName = 'max-w-xl' }: SidePanelProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed right-0 top-0 z-50 h-full w-full sm:w-[480px] bg-surface-elevated border-l border-border shadow-card focus:outline-none',
            widthClassName
          )}
        >
          <div className="p-4 border-b border-border">
            <Dialog.Title className="text-lg font-semibold text-foreground">
              {title || 'Panel'}
            </Dialog.Title>
            {description && (
              <Dialog.Description className="text-sm text-muted mt-1">
                {description}
              </Dialog.Description>
            )}
          </div>
          <div className="p-4 h-[calc(100%-64px)] overflow-auto">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

SidePanel.displayName = 'SidePanel';


