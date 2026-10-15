'use client';

import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { ApiClientError } from '@/lib/api/client';
import { ReferencedAlert } from '@/components/ui/ReferencedAlert';

export interface LinkCodesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  availableItems: { code: string; text?: string }[];
  currentLinkedCodes: string[];
  onSave: (selectedCodes: string[]) => Promise<void>;
}

export function LinkCodesDialog({
  open,
  onOpenChange,
  title,
  description = 'Chọn một hoặc nhiều mục liên kết trong cùng hồ sơ.',
  availableItems,
  currentLinkedCodes,
  onSave,
}: LinkCodesDialogProps) {
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [apiErrorObj, setApiErrorObj] = useState<{
    code?: string;
    message?: string;
    details?: unknown;
  } | null>(null);

  useEffect(() => {
    setSelectedCodes([...currentLinkedCodes]);
    setGeneralError(null);
    setApiErrorObj(null);
  }, [currentLinkedCodes, open]);

  const toggleCode = (code: string) => {
    setSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const handleSave = async () => {
    setIsLoading(true);
    setGeneralError(null);
    setApiErrorObj(null);
    try {
      await onSave(selectedCodes);
      onOpenChange(false);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.code === 'REFERENCED') {
          setApiErrorObj({
            code: err.code,
            message: err.message,
            details: err.details,
          });
        } else {
          setGeneralError(err.message);
        }
      } else {
        setGeneralError('Đã xảy ra lỗi không xác định.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity animate-in fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-surface p-6 shadow-2xl transition-all animate-in zoom-in-95 duration-150">
          <div className="flex items-start justify-between pb-3 border-b border-border">
            <div>
              <Dialog.Title className="text-base font-bold text-text">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-xs text-text-muted">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="rounded-control p-1 text-text-muted hover:text-text transition-colors"
              aria-label="Đóng"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className="py-4 space-y-3">
            {generalError && (
              <div role="alert" className="rounded-control border border-state-bad-line/40 bg-state-bad-bg p-3 text-xs text-state-bad-fg">
                {generalError}
              </div>
            )}
            <ReferencedAlert error={apiErrorObj} />

            <div className="max-h-60 overflow-y-auto divide-y divide-border/60 border border-border rounded-control p-1 text-xs">
              {availableItems.length === 0 ? (
                <div className="p-4 text-center text-text-muted">
                  Không có mục nào trong hồ sơ để liên kết.
                </div>
              ) : (
                availableItems.map((item) => {
                  const isChecked = selectedCodes.includes(item.code);
                  return (
                    <label
                      key={item.code}
                      className="flex items-start gap-2.5 p-2.5 hover:bg-bg-tint/60 rounded-control cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCode(item.code)}
                        className="mt-0.5 rounded border-border text-brand-blue focus:ring-brand-blue"
                      />
                      <div className="flex-1">
                        <span className="font-mono font-semibold text-brand-navy">
                          {item.code}
                        </span>
                        {item.text && (
                          <p className="text-[11px] text-text-muted mt-0.5 line-clamp-2">
                            {item.text}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            <p className="text-[11px] text-text-muted">
              Đã chọn: <strong className="text-text">{selectedCodes.length}</strong> mục
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => onOpenChange(false)}
              className="rounded-control border border-border bg-surface px-4 py-2 text-xs font-medium text-text hover:bg-bg-tint transition-colors disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={handleSave}
              className="rounded-control bg-brand-blue px-4 py-2 text-xs font-semibold text-white hover:bg-brand-navy transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Đang lưu...' : 'Lưu liên kết'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
