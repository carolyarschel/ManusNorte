import { useEffect } from "react";
import { useLocation } from "wouter";

export default function SettingsPage() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/calendar"); }, [navigate]);
  return null;
}
