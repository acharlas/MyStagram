import type { ButtonHTMLAttributes, DetailedHTMLProps } from "react";

export type ButtonProps = DetailedHTMLProps<
  ButtonHTMLAttributes<HTMLButtonElement>,
  HTMLButtonElement
> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ variant = "primary", ...props }: ButtonProps) {
  const classes = [
    "inline-flex items-center justify-center rounded-md border text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500/70",
  ];

  switch (variant) {
    case "secondary":
      classes.push(
        "border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-zinc-500 hover:bg-zinc-800",
      );
      break;
    case "ghost":
      classes.push("border-transparent text-zinc-300 hover:bg-zinc-800");
      break;
    default:
      classes.push("border-transparent bg-sky-600 text-white hover:bg-sky-500");
      break;
  }

  return <button className={classes.join(" ")} {...props} />;
}
