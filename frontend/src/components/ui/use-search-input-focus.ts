import type { RefObject } from "react";
import { useEffect } from "react";

type UseSearchInputFocusArgs = {
  isSearching: boolean;
  desktopInputRef: RefObject<HTMLInputElement | null>;
  mobileInputRef: RefObject<HTMLInputElement | null>;
};

export function useSearchInputFocus({
  isSearching,
  desktopInputRef,
  mobileInputRef,
}: UseSearchInputFocusArgs) {
  useEffect(() => {
    if (!isSearching) {
      return;
    }

    const focusTimer = setTimeout(() => {
      const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
      if (isDesktop) {
        desktopInputRef.current?.focus();
        return;
      }
      mobileInputRef.current?.focus();
    }, 10);

    return () => clearTimeout(focusTimer);
  }, [desktopInputRef, isSearching, mobileInputRef]);
}
