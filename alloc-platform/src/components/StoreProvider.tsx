"use client";
import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const fetchAll = useAppStore((s) => s.fetchAll);
  useEffect(() => { fetchAll(); }, []);
  return <>{children}</>;
}