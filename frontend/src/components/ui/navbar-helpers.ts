export function resolveProfileHref(href: string, username?: string): string {
  if (href === "/profile" && username) {
    return `/users/${encodeURIComponent(username)}`;
  }
  return href;
}

export function resolveOwnRequestsHref(username?: string): string {
  if (typeof username === "string" && username.trim().length > 0) {
    return `/users/${encodeURIComponent(username)}?panel=requests`;
  }
  return "/login";
}

type SearchParamsLike = {
  toString(): string;
};

export function buildPathWithoutSearchParam(
  pathname: string,
  searchParams: SearchParamsLike,
  paramKey: string,
): string {
  const params = new URLSearchParams(searchParams.toString());
  params.delete(paramKey);
  const query = params.toString();
  return query.length > 0 ? `${pathname}?${query}` : pathname;
}

export function isPathActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function shouldCloseSearch(
  previousPathname: string,
  currentPathname: string,
): boolean {
  return previousPathname !== currentPathname;
}

export function getFocusTrapTarget(
  focusable: HTMLElement[],
  activeElement: Element | null,
  isShiftKey: boolean,
): HTMLElement | null {
  if (focusable.length === 0) {
    return null;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (isShiftKey) {
    if (activeElement === first || activeElement === null) {
      return last;
    }
    return null;
  }

  if (activeElement === last) {
    return first;
  }

  return null;
}
