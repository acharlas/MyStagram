"use client";

import type { ReactNode } from "react";
import { useId, useRef } from "react";

import { CloseIcon } from "@/components/ui/icons";
import { useMobileDialogFocusTrap } from "@/components/ui/use-mobile-dialog-focus-trap";

type MobileNavDialogProps = {
  isOpen: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  panelClassName?: string;
  bodyClassName?: string;
};

export function MobileNavDialog({
  isOpen,
  title,
  closeLabel,
  onClose,
  children,
  panelClassName,
  bodyClassName,
}: MobileNavDialogProps) {
  const dialogId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useMobileDialogFocusTrap({
    isOpen,
    dialogRef,
    onEscape: onClose,
  });

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 px-3 pb-20 pt-4 lg:hidden">
      <button
        type="button"
        onClick={onClose}
        className="ui-surface-overlay absolute inset-0"
        aria-label={closeLabel}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogId}
        tabIndex={-1}
        className={`ui-surface-card-strong relative z-10 mx-auto flex h-full w-full max-w-lg flex-col rounded-2xl border ui-border p-3 shadow-2xl ${panelClassName ?? ""}`}
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 id={dialogId} className="ui-text-strong text-sm font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ui-focus-ring ui-text-muted ui-hover-surface rounded-md p-1 transition hover:text-[color:var(--ui-text-strong)]"
            aria-label={closeLabel}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div
          className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName ?? ""}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
