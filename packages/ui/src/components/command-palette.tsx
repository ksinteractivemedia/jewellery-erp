import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import { cn } from "../lib/utils";

export interface CommandPaletteGroup {
  heading: string;
  items: {
    id: string;
    label: string;
    description?: string;
    icon?: React.ReactNode;
    shortcut?: string;
    onSelect: () => void;
  }[];
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: CommandPaletteGroup[];
  placeholder?: string;
  emptyMessage?: string;
}

/** Global ⌘K search across orders/customers/inventory. Mount once; toggle `open` from a keyboard shortcut listener. */
export function CommandPalette({
  open,
  onOpenChange,
  groups,
  placeholder = "Search or jump to…",
  emptyMessage = "No results found.",
}: CommandPaletteProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[18%] z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-lg data-[state=open]:animate-scale-in"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <CommandPrimitive className="flex flex-col" shouldFilter>
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="h-4 w-4 text-muted" aria-hidden="true" />
              <CommandPrimitive.Input
                autoFocus
                placeholder={placeholder}
                className="h-11 w-full bg-transparent text-body outline-none placeholder:text-muted"
              />
            </div>
            <CommandPrimitive.List className="max-h-80 overflow-y-auto p-2">
              <CommandPrimitive.Empty className="py-8 text-center text-body-sm text-muted">
                {emptyMessage}
              </CommandPrimitive.Empty>
              {groups.map((group) => (
                <CommandPrimitive.Group
                  key={group.heading}
                  heading={group.heading}
                  className="mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted"
                >
                  {group.items.map((item) => (
                    <CommandPrimitive.Item
                      key={item.id}
                      value={item.label}
                      onSelect={() => {
                        item.onSelect();
                        onOpenChange(false);
                      }}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-body-sm data-[selected=true]:bg-surface-sunken"
                      )}
                    >
                      {item.icon && <span className="text-muted">{item.icon}</span>}
                      <span className="flex flex-col">
                        <span>{item.label}</span>
                        {item.description && <span className="text-caption text-muted">{item.description}</span>}
                      </span>
                      {item.shortcut && (
                        <kbd className="ml-auto rounded border border-border px-1.5 py-0.5 text-caption text-muted">
                          {item.shortcut}
                        </kbd>
                      )}
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              ))}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
