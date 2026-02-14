import { useEffect, useState } from "react";

import { searchUsers, type UserProfilePublic } from "@/lib/api/users";

const RECENT_SEARCHES_KEY = "mystagram-nav-recent-searches-v1";
const MAX_RECENT_SEARCHES = 5;
const MAX_SUGGESTED_USERS = 6;
const SUGGESTED_QUERY_POOL = ["a", "e", "m", "s"] as const;

type UseNavSearchResult = {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  searchResults: UserProfilePublic[];
  recentSearches: UserProfilePublic[];
  suggestedUsers: UserProfilePublic[];
  rememberSelection: (user: UserProfilePublic) => void;
  clearRecentSearches: () => void;
  isLoading: boolean;
  isLoadingSuggestions: boolean;
  searchError: string | null;
  hasSearchValue: boolean;
};

function parseRecentSearches(raw: string | null): UserProfilePublic[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is UserProfilePublic => {
        if (typeof item !== "object" || item === null) {
          return false;
        }
        const candidate = item as Record<string, unknown>;
        return (
          typeof candidate.id === "string" &&
          typeof candidate.username === "string" &&
          (typeof candidate.name === "string" || candidate.name === null) &&
          (typeof candidate.bio === "string" || candidate.bio === null) &&
          (typeof candidate.avatar_key === "string" ||
            candidate.avatar_key === null)
        );
      })
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

function persistRecentSearches(users: UserProfilePublic[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(users));
}

export function useNavSearch(isSearching: boolean): UseNavSearchResult {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfilePublic[]>([]);
  const [recentSearches, setRecentSearches] = useState<UserProfilePublic[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<UserProfilePublic[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setRecentSearches(
      parseRecentSearches(window.localStorage.getItem(RECENT_SEARCHES_KEY)),
    );
  }, []);

  useEffect(() => {
    if (isSearching) {
      return;
    }
    setSearchQuery("");
    setSearchResults([]);
    setSearchError(null);
    setIsLoading(false);
    setIsLoadingSuggestions(false);
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

  useEffect(() => {
    if (!isSearching || searchQuery.trim().length > 0) {
      setIsLoadingSuggestions(false);
      return;
    }
    if (suggestedUsers.length > 0) {
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;

    const loadSuggestions = async () => {
      setIsLoadingSuggestions(true);
      const uniqueUsers = new Map<string, UserProfilePublic>();
      for (const query of SUGGESTED_QUERY_POOL) {
        const batch = await searchUsers(query, {
          limit: MAX_SUGGESTED_USERS,
          signal: controller.signal,
        });
        for (const user of batch) {
          if (!uniqueUsers.has(user.id)) {
            uniqueUsers.set(user.id, user);
          }
          if (uniqueUsers.size >= MAX_SUGGESTED_USERS) {
            break;
          }
        }
        if (uniqueUsers.size >= MAX_SUGGESTED_USERS) {
          break;
        }
      }

      if (isCancelled) {
        return;
      }
      setSuggestedUsers(
        Array.from(uniqueUsers.values()).slice(0, MAX_SUGGESTED_USERS),
      );
      setIsLoadingSuggestions(false);
    };

    loadSuggestions().catch((error) => {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Failed to preload suggested users", error);
      if (!isCancelled) {
        setIsLoadingSuggestions(false);
      }
    });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [isSearching, searchQuery, suggestedUsers.length]);

  const rememberSelection = (user: UserProfilePublic) => {
    setRecentSearches((current) => {
      const deduped = [user, ...current.filter((item) => item.id !== user.id)];
      const next = deduped.slice(0, MAX_RECENT_SEARCHES);
      persistRecentSearches(next);
      return next;
    });
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(RECENT_SEARCHES_KEY);
    }
  };

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    recentSearches,
    suggestedUsers,
    rememberSelection,
    clearRecentSearches,
    isLoading,
    isLoadingSuggestions,
    searchError,
    hasSearchValue: searchQuery.trim().length > 0,
  };
}
