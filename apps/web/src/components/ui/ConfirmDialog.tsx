'use client';

import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, AlertCircle, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  children?: React.ReactNode;
  confirmText?: string;
  confirmLabel?: string;
  cancelText?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  isDestructive?: boolean;
  isSubmitting?: boolean;
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmText,
  confirmLabel,
  cancelText,
  cancelLabel,
  variant,
  isDestructive,
  isSubmitting,
  isLoading,
  onConfirm,
}: ConfirmDialogProps) {
  const finalConfirmText = confirmText || confirmLabel || 'Xác nhận';
  const finalCancelText = cancelText || cancelLabel || 'Hủy';
  const isDanger = variant === 'danger' || isDestructive === true;
  const loading = Boolean(isSubmitting || isLoading);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity animate-in fade-in" />
        <Dialog.Content
          role="alertdialog"
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-surface p-6 shadow-2xl transition-all animate-in zoom-in-95 duration-150"
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'rounded-full p-2 shrink-0',
                isDanger
                  ? 'bg-state-bad-bg text-state-bad-fg'
                  : 'bg-state-info-bg text-state-info-fg',
              )}
            >
              {isDanger ? (
                <AlertCircle className="w-5 h-5" aria-hidden="true" />
              ) : (
                <AlertTriangle className="w-5 h-5" aria-hidden="true" />
              )}
            </div>
            <div className="flex-1">
              <Dialog.Title className="text-base font-bold text-text">
                {title}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-text-muted leading-relaxed">
                {description}
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="rounded-control p-1 text-text-muted hover:text-text transition-colors"
              aria-label="Đóng"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </Dialog.Close>
          </div>

          {children}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => onOpenChange(false)}
              className="rounded-control border border-border bg-surface px-4 py-2 text-xs font-medium text-text hover:bg-bg-tint transition-colors disabled:opacity-50"
            >
              {finalCancelText}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={async () => {
                await onConfirm();
              }}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 rounded-control px-4 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50',
                isDanger
                  ? 'bg-brand-red hover:bg-brand-red/90'
                  : 'bg-brand-blue hover:bg-brand-navy',
              )}
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
              <span>{loading ? 'Đang xử lý...' : finalConfirmText}</span>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
