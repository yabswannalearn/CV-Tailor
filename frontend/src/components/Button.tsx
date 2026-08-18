import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "outline";
type Size = "sm" | "md";

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5",
  md: "px-4 py-2",
};

const variantClasses: Record<Variant, string> = {
  primary: "bg-[#1a1814] text-[#f5f2ed] hover:bg-[#332e27] focus-visible:outline-[#1a1814] disabled:bg-[#d4cfc7] disabled:text-[#7a7570]",
  outline: "border border-[#b83030] text-[#7d2525] hover:bg-[#ffe1e1] focus-visible:outline-[#b83030]",
};

function buttonClass(variant: Variant, size: Size, className: string) {
  return [
    "inline-block rounded-sm text-xs font-bold uppercase tracking-[0.08em] transition-colors duration-150",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
    sizeClasses[size],
    variantClasses[variant],
    className,
  ].filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size };

export default function Button({ variant = "primary", size = "sm", className = "", type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({ variant = "outline", size = "sm", className = "", href, children }: {
  variant?: Variant; size?: Size; className?: string; href: string; children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}
