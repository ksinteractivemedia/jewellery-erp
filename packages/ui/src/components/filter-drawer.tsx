import * as React from "react";
import { Drawer, DrawerBody, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "./drawer";
import { Button } from "./button";

export interface FilterDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
  children: React.ReactNode;
  onApply?: () => void;
  onClear?: () => void;
  resultCount?: number;
}

/** Storefront filter panel (category/price/purity/metal). Bottom sheet on mobile-first layouts. */
export function FilterDrawer({ open, onOpenChange, trigger, children, onApply, onClear, resultCount }: FilterDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {trigger && <DrawerTrigger asChild>{trigger}</DrawerTrigger>}
      <DrawerContent side="bottom" className="max-h-[80vh]">
        <DrawerHeader>
          <DrawerTitle>Filter</DrawerTitle>
        </DrawerHeader>
        <DrawerBody>{children}</DrawerBody>
        <DrawerFooter className="justify-between">
          {onClear && (
            <Button variant="ghost" onClick={onClear}>
              Clear all
            </Button>
          )}
          {onApply && (
            <Button variant="primary" onClick={onApply} className="flex-1 sm:flex-none">
              {resultCount !== undefined ? `Show ${resultCount} results` : "Apply"}
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
