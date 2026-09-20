import { AuthGate } from "../../components/auth/auth-gate";
import { AppShell } from "../../components/app-shell";

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
