import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "coin" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
}

// Chunky game-style button (styles live in index.css under .btn).
export function Button({ variant = "primary", size = "md", block, loading, disabled, className = "", children, ...rest }: Props) {
  const classes = ["btn", `btn-${variant}`, size !== "md" && `btn-${size}`, block && "w-full", className].filter(Boolean).join(" ");
  return (
    <button className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-[3px] border-current border-r-transparent" />}
      {children}
    </button>
  );
}
