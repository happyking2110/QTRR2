'use client';

import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RecordDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function RecordDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: RecordDrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity animate-in fade-in" />
        <Dialog.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-surface border-l border-border p-6 shadow-2xl flex flex-col focus:outline-none transition-transform animate-in slide-in-from-right duration-200',
            className,
          )}
        >
          <div className="flex items-start justify-between pb-4 border-b border-border">
            <div>
              <Dialog.Title className="text-lg font-bold text-text">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="text-sm text-text-muted mt-0.5">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="rounded-control p-1.5 text-text-muted hover:text-text hover:bg-bg-tint transition-colors focus:outline-none focus:ring-2 focus:ring-brand-bright"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto py-4">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
