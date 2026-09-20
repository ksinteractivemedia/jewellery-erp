import { UserCircle } from "lucide-react";
import { Button, EmptyState } from "@jewellery/ui";

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <EmptyState
        icon={<UserCircle className="h-8 w-8" />}
        title="Sign in to your account"
        description="Track orders, save addresses and view invoices. Accounts and authentication are on the implementation roadmap."
        action={
          <Button variant="secondary" disabled>
            Sign in (coming soon)
          </Button>
        }
      />
    </div>
  );
}
