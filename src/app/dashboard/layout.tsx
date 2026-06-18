import type { Metadata } from "next";
export const metadata: Metadata = { title: "Dashboard | Alloc Platform" };
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="topbar"><div className="topbar-title">Dashboard</div></div>
      {children}
    </>
  );
}
