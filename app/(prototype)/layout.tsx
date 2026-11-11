import { AppShell } from "@/components/shell/app-shell";

export default function PrototypeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
