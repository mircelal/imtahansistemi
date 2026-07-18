import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
};

const paddingClasses = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8"
};

export default function Card({ children, className = "", padding = "md" }: CardProps) {
  return (
    <section
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-slate-100 ${paddingClasses[padding]} ${className}`}
    >
      {children}
    </section>
  );
}
