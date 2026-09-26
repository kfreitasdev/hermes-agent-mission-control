"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const pathLabels: Record<string, string> = {
  "/": "Painel",
  "/x": "X",
  "/x-content": "Publicações",
  "/x-analytics": "Análises do X",
  "/watchlist-radar": "Radar de tendências",
  "/youtube": "YouTube",
  "/longform": "Longform",
  "/articles": "Artigos",
  "/client-pulse": "Pulso dos clientes",
  "/agents": "Agentes",
  "/ideas": "Ideias",
  "/garden": "Jardim",
  "/tasks": "Tarefas",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  
  // Don't show breadcrumbs on dashboard
  if (pathname === "/") return null;
  
  const currentLabel = pathLabels[pathname] || "Página";
  
  return (
    <div className="flex items-center gap-2 text-sm text-[var(--text-3)] mb-6">
      <Link 
        href="/" 
        className="hover:text-neutral-300 transition-colors"
      >
        Painel
      </Link>
      <span>/</span>
      <span className="text-neutral-400">{currentLabel}</span>
    </div>
  );
}
