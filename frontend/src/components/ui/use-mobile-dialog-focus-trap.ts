import type { RefObject } from "react";
import { useEffect } from "react";

import { getFocusTrapTarget } from "@/components/ui/navbar-helpers";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type UseMobileDialogFocusTrapArgs = {
  isOpen: boolean;
  dialogRef: RefObject<HTMLDivElement | null>;
  onEscape: () => void;
};

export function useMobileDialogFocusTrap({
  isOpen,
  dialogRef,
  onEscape,
}: UseMobileDialogFocusTrapArgs) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    if (isDesktop) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousActiveElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.body.style.overflow = "hidden";

    const root = dialogRef.current;
    const focusable = root
      ? Array.from(
          root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).filter(
          (element) =>
            !element.hasAttribute("disabled") &&
            element.tabIndex !== -1 &&
            element.getAttribute("aria-hidden") !== "true",
        )
      : [];
    const initialFocusTarget = focusable[0] ?? root;
    const frameId = window.requestAnimationFrame(() => {
      initialFocusTarget?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onEscape();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const root = dialogRef.current;
      if (!root) {
        return;
      }

      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (element) =>
          !element.hasAttribute("disabled") &&
          element.tabIndex !== -1 &&
          element.getAttribute("aria-hidden") !== "true",
      );

      const target = getFocusTrapTarget(
        focusable,
        document.activeElement,
        event.shiftKey,
      );

      if (target) {
        event.preventDefault();
        target.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frameId);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (previousActiveElement?.isConnected) {
        previousActiveElement.focus();
      }
    };
  }, [dialogRef, isOpen, onEscape]);
}
