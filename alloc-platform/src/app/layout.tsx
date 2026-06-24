import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { StoreProvider } from "@/components/StoreProvider"; // <- adiciona

export const metadata: Metadata = {
  title: "NORTE",
  description: "Plataforma de alocação de consultores",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}` }} />
      </head>
      <body>
        <StoreProvider> {/* <- envolve tudo */}
          <div className="app-shell">
            <Sidebar />
            <main className="main-content">{children}</main>
          </div>
        </StoreProvider>
      </body>
    </html>
  );
}