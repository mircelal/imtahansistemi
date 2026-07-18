import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-white shadow-sm ring-1 ring-brand/20 hover:bg-brand-dark active:scale-[0.99] disabled:opacity-50",
  secondary:
    "bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50 active:scale-[0.99] disabled:opacity-50",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-100 active:scale-[0.99] disabled:opacity-50",
  danger:
    "bg-red-600 text-white shadow-sm hover:bg-red-700 active:scale-[0.99] disabled:opacity-50"
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "rounded-lg px-3 py-1.5 text-xs font-semibold",
  md: "rounded-xl px-4 py-2.5 text-sm font-semibold",
  lg: "rounded-xl px-5 py-3 text-sm font-semibold"
};

export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 transition ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
