import type { Metadata } from "next";

export const metadata: Metadata = { title: "Calendário | Alloc Platform" };

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Calendário de Alocações</div>
        </div>
      </div>
      {children}
    </>
  );
}
