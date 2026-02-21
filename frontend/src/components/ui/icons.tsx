import type { ComponentPropsWithoutRef } from "react";

type IconProps = ComponentPropsWithoutRef<"svg">;

function iconClassName(className?: string): string {
  return className ? `h-5 w-5 ${className}` : "h-5 w-5";
}

export function BrandMarkIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={iconClassName(className)}
      aria-hidden="true"
      {...props}
    >
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="3.25" />
      <circle cx="17" cy="7.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function HomeIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={iconClassName(className)}
      aria-hidden="true"
      {...props}
    >
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

export function SearchIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={iconClassName(className)}
      aria-hidden="true"
      {...props}
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

export function CompassIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={iconClassName(className)}
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="8" />
      <path d="m9.5 14.5 1.5-5 5-1.5-1.5 5-5 1.5Z" />
      <circle cx="12" cy="12" r=".85" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CreateIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={iconClassName(className)}
      aria-hidden="true"
      {...props}
    >
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <path d="M12 7.5v9" />
      <path d="M7.5 12h9" />
    </svg>
  );
}

export function UserIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={iconClassName(className)}
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5 19c1.3-3 4-4.5 7-4.5s5.7 1.5 7 4.5" />
    </svg>
  );
}

export function SettingsIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={iconClassName(className)}
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.07-1l2.02-1.57-1.8-3.12-2.45.9a7 7 0 0 0-1.74-1L14.5 3h-5l-.46 2.64a7 7 0 0 0-1.74 1l-2.45-.9-1.8 3.12L5.07 11a7 7 0 0 0 0 2l-2.02 1.57 1.8 3.12 2.45-.9a7 7 0 0 0 1.74 1L9.5 21h5l.46-2.64a7 7 0 0 0 1.74-1l2.45.9 1.8-3.12L18.93 13c.05-.33.07-.66.07-1Z" />
    </svg>
  );
}

export function LogOutIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={iconClassName(className)}
      aria-hidden="true"
      {...props}
    >
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M14 16 19 12 14 8" />
      <path d="M19 12H9" />
    </svg>
  );
}

export function CloseIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={iconClassName(className)}
      aria-hidden="true"
      {...props}
    >
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </svg>
  );
}

export function TrashIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={iconClassName(className)}
      aria-hidden="true"
      {...props}
    >
      <path d="M4 7h16" />
      <path d="M9 7V5.8c0-.44.36-.8.8-.8h4.4c.44 0 .8.36.8.8V7" />
      <path d="M7.5 7 8.3 19c.03.55.49 1 1.05 1h5.3c.56 0 1.02-.45 1.05-1L16.5 7" />
      <path d="M10 10v6" />
      <path d="M14 10v6" />
    </svg>
  );
}

export function CommentIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={iconClassName(className)}
      aria-hidden="true"
      {...props}
    >
      <path d="M21 12a8.25 8.25 0 0 1-11.513 7.6L6.6 20.4l.8-2.887A8.25 8.25 0 1 1 21 12Z" />
    </svg>
  );
}

export function BookmarkIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={iconClassName(className)}
      aria-hidden="true"
      {...props}
    >
      <path d="M7.5 4.75h9A1.75 1.75 0 0 1 18.25 6.5v13.06c0 .55-.61.87-1.06.56L12 16.54l-5.19 3.58c-.45.31-1.06-.01-1.06-.56V6.5A1.75 1.75 0 0 1 7.5 4.75Z" />
    </svg>
  );
}

export function BellIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={iconClassName(className)}
      aria-hidden="true"
      {...props}
    >
      <path d="M6.5 9.75a5.5 5.5 0 1 1 11 0c0 2.1.6 3.8 1.8 5.15.46.52.1 1.35-.6 1.35H5.3c-.7 0-1.06-.83-.6-1.35 1.2-1.35 1.8-3.04 1.8-5.15Z" />
      <path d="M9.5 18.25a2.5 2.5 0 0 0 5 0" />
    </svg>
  );
}

export function UserPlusIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={iconClassName(className)}
      aria-hidden="true"
      {...props}
    >
      <circle cx="10" cy="8" r="3.25" />
      <path d="M4.7 18c1.1-2.4 3.2-3.7 5.3-3.7s4.2 1.3 5.3 3.7" />
      <path d="M18.5 8.5v5" />
      <path d="M16 11h5" />
    </svg>
  );
}
