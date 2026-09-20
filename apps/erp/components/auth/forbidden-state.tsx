import { ShieldAlert } from "lucide-react";
import { Card, EmptyState } from "@jewellery/ui";

export function ForbiddenState({ what, permission }: { what?: string; permission?: string }) {
  return (
    <Card>
      <EmptyState
        icon={<ShieldAlert className="h-8 w-8" />}
        title={what ? `You don't have access to ${what}` : "You don't have access to this page"}
        description={
          permission
            ? `This needs the "${permission}" permission. Ask an administrator if you think you should have it.`
            : "Ask an administrator if you think you should have access."
        }
        className="border-none py-16"
      />
    </Card>
  );
}
