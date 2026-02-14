"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRef } from "react";

import { CloseIcon, SearchIcon } from "@/components/ui/icons";
import { NavSearchResults } from "@/components/ui/navbar-search-results";
import { useMobileDialogFocusTrap } from "@/components/ui/use-mobile-dialog-focus-trap";
import { useNavSearch } from "@/components/ui/use-nav-search";
import { useSearchInputFocus } from "@/components/ui/use-search-input-focus";

const SEARCH_INPUT_ID = "navbar-user-search";

type NavSearchLayerProps = {
  onClose: () => void;
};

export function NavSearchLayer({ onClose }: NavSearchLayerProps) {
  const desktopSearchInputRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const mobileDialogRef = useRef<HTMLDivElement | null>(null);
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    isLoading,
    searchError,
    hasSearchValue,
  } = useNavSearch(true);

  useSearchInputFocus({
    isSearching: true,
    desktopInputRef: desktopSearchInputRef,
    mobileInputRef: mobileSearchInputRef,
  });
  useMobileDialogFocusTrap({
    isOpen: true,
    dialogRef: mobileDialogRef,
    onEscape: onClose,
  });

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <>
      <section className="ui-surface-card-strong absolute left-full top-28 z-40 ml-5 hidden w-[22rem] rounded-2xl border ui-border p-4 text-sm text-zinc-100 shadow-2xl lg:block">
        <div className="ui-surface-input flex items-center gap-2 rounded-xl border ui-border px-3 py-2 text-sm text-zinc-100 shadow-sm">
          <SearchIcon className="ui-text-muted h-4 w-4" />
          <input
            id={SEARCH_INPUT_ID}
            ref={desktopSearchInputRef}
            type="search"
            name="navbar-search"
            placeholder="Rechercher un utilisateur"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-[color:var(--ui-text-subtle)] focus:outline-none"
            aria-label="Rechercher des utilisateurs"
          />
          <button
            type="button"
            onClick={onClose}
            className="ui-text-muted ui-hover-surface rounded-md p-1 transition hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:ring-offset-2 focus:ring-offset-[color:var(--background)]"
            aria-label="Fermer la recherche"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="ui-text-muted mt-3 flex items-center justify-between text-xs font-semibold tracking-[0.1em]">
          <span>Résultats</span>
          {isLoading ? <span className="text-xs">Chargement…</span> : null}
        </div>
        <NavSearchResults
          hasSearchValue={hasSearchValue}
          isLoading={isLoading}
          searchError={searchError}
          searchResults={searchResults}
          onSelect={onClose}
          panelClassName="mt-3 max-h-[60vh] space-y-2 overflow-y-auto"
        />
      </section>

      <div className="fixed inset-0 z-40 px-4 pb-6 pt-20 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={onClose}
          className="ui-surface-overlay absolute inset-0"
          aria-label="Fermer la recherche"
        />
        <div
          ref={mobileDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-search-title"
          className="ui-surface-card-strong relative z-10 mx-auto flex h-full w-full max-w-md flex-col rounded-2xl border ui-border p-4 shadow-2xl"
        >
          <div className="ui-surface-input flex items-center gap-2 rounded-xl border ui-border px-3 py-2">
            <SearchIcon className="ui-text-muted h-4 w-4" />
            <input
              id={`${SEARCH_INPUT_ID}-mobile`}
              ref={mobileSearchInputRef}
              type="search"
              name="navbar-search-mobile"
              placeholder="Rechercher un utilisateur"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-[color:var(--ui-text-subtle)] focus:outline-none"
              aria-label="Rechercher des utilisateurs"
            />
            <button
              type="button"
              onClick={onClose}
              className="ui-text-muted ui-hover-surface rounded-md p-1 transition hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500/70"
              aria-label="Fermer la recherche"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="ui-text-muted mt-3 flex items-center justify-between text-xs font-semibold tracking-[0.1em]">
            <h2 id="mobile-search-title">Résultats</h2>
            {isLoading ? <span className="text-xs">Chargement…</span> : null}
          </div>

          <NavSearchResults
            hasSearchValue={hasSearchValue}
            isLoading={isLoading}
            searchError={searchError}
            searchResults={searchResults}
            onSelect={onClose}
            panelClassName="mt-3 flex-1 space-y-2 overflow-y-auto"
            focusRingClassName="focus:outline-none focus:ring-2 focus:ring-sky-500/70"
          />
        </div>
      </div>
    </>
  );
}
