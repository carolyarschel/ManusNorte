"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { LuCalendar, LuGauge, LuGroup, LuBriefcaseBusiness, LuChartGantt, LuSun, LuMoon, LuBot } from "react-icons/lu";

const NAV = [
  { href: "/calendar",    icon: <LuCalendar />,          label: "Calendário"  },
  { href: "/dashboard",   icon: <LuGauge />,             label: "Dashboard"   },
  { href: "/consultants", icon: <LuGroup />,             label: "Consultores" },
  { href: "/projects",    icon: <LuBriefcaseBusiness />, label: "Projetos"    },
  { href: "/simulation",  icon: <LuChartGantt />,        label: "Simulação"   },
  { href: "/agent",       icon: <LuBot />,               label: "Agente"      },
];

export function Sidebar() {
  const pathname = usePathname();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark") {
      setDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-company">Nortegubisian</div>
        <div className="sidebar-sub">Gestão de Alocações</div>
      </div>

      <nav style={{ flex: 1 }}>
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`nav-link ${pathname.startsWith(n.href) ? "active" : ""}`}
          >
            <span style={{ fontSize: 15, width: 18, textAlign: "center" }}>{n.icon}</span>
            {n.label}
          </Link>
        ))}
      </nav>

      <div style={{ padding: "12px 8px", borderTop: "1px solid var(--border)" }}>
        <button
          onClick={toggleTheme}
          className="nav-link"
          style={{ width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <span style={{ fontSize: 15, width: 18, textAlign: "center", display: "inline-flex" }}>
            {dark ? <LuSun /> : <LuMoon />}
          </span>
          {dark ? "Modo Claro" : "Modo Escuro"}
        </button>
      </div>
    </aside>
  );
}
