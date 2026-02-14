import { useEffect, useState } from "react";

import { searchUsers, type UserProfilePublic } from "@/lib/api/users";

type UseNavSearchResult = {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  searchResults: UserProfilePublic[];
  isLoading: boolean;
  searchError: string | null;
  hasSearchValue: boolean;
};

export function useNavSearch(isSearching: boolean): UseNavSearchResult {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfilePublic[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (isSearching) {
      return;
    }
    setSearchQuery("");
    setSearchResults([]);
    setSearchError(null);
    setIsLoading(false);
  }, [isSearching]);

  useEffect(() => {
    if (!isSearching) {
      return;
    }

    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery.length === 0) {
      setSearchResults([]);
      setIsLoading(false);
      setSearchError(null);
      return;
    }

    setIsLoading(true);
    setSearchError(null);

    const controller = new AbortController();
    const debounceTimer = setTimeout(() => {
      searchUsers(trimmedQuery, {
        limit: 5,
        signal: controller.signal,
      })
        .then((results) => {
          setSearchResults(results);
          setIsLoading(false);
        })
        .catch((error) => {
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }
          console.error("Failed to search users", error);
          setSearchError("Impossible de charger les résultats.");
          setIsLoading(false);
        });
    }, 200);

    return () => {
      controller.abort();
      clearTimeout(debounceTimer);
    };
  }, [isSearching, searchQuery]);

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    isLoading,
    searchError,
    hasSearchValue: searchQuery.trim().length > 0,
  };
}
