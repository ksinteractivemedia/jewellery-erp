import { AuthGate, Shell } from "../../components/shell";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <Shell>{children}</Shell>
    </AuthGate>
  );
}
