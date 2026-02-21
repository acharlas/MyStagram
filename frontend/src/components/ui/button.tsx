import type { ButtonHTMLAttributes, DetailedHTMLProps } from "react";

export type ButtonProps = DetailedHTMLProps<
  ButtonHTMLAttributes<HTMLButtonElement>,
  HTMLButtonElement
> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ variant = "primary", ...props }: ButtonProps) {
  const classes = [
    "ui-focus-ring inline-flex items-center justify-center rounded-md border text-sm font-medium transition-colors focus:outline-none",
  ];

  switch (variant) {
    case "secondary":
      classes.push(
        "ui-surface-input ui-border ui-text-strong hover:border-[color:var(--ui-border-strong)] hover:bg-[color:var(--ui-surface-muted)]",
      );
      break;
    case "ghost":
      classes.push(
        "border-transparent ui-nav-icon hover:bg-[color:var(--ui-surface-muted)] hover:text-[color:var(--ui-nav-icon-active)]",
      );
      break;
    default:
      classes.push("ui-accent-button");
      break;
  }

  return <button className={classes.join(" ")} {...props} />;
}
