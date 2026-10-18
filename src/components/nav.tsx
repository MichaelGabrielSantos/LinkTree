"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV = [
  { href: "/", label: "Hoje", icon: "☀" },
  { href: "/explorar", label: "Explorar", icon: "⌕" },
  { href: "/acompanhando", label: "Acompanhando", icon: "★" },
  { href: "/perfil", label: "Perfil", icon: "◉" },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

export function DesktopNav() {
  const path = usePathname();
  return (
    <nav aria-label="Navegação principal" className="hidden md:block">
      <ul className="flex gap-1">
        {NAV.map((n) => (
          <li key={n.href}>
            <Link
              href={n.href}
              aria-current={isActive(path, n.href) ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm ${isActive(path, n.href) ? "bg-surface-2 font-semibold text-ink" : "text-ink-2 hover:text-ink"}`}
            >
              {n.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function MobileNav() {
  const path = usePathname();
  return (
    <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur md:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {NAV.map((n) => (
          <li key={n.href}>
            <Link
              href={n.href}
              aria-current={isActive(path, n.href) ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-xs ${isActive(path, n.href) ? "font-semibold text-accent" : "text-ink-2"}`}
            >
              <span aria-hidden className="text-lg leading-none">
                {n.icon}
              </span>
              {n.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
