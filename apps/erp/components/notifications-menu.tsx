"use client";

import * as React from "react";
import { Bell, PackageCheck, ShieldCheck, TriangleAlert } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@jewellery/ui";

/** Illustrative shell only — no notification service exists yet, nothing here is live. */
const SAMPLE_NOTIFICATIONS = [
  {
    icon: TriangleAlert,
    tone: "text-warning",
    title: "Job work discrepancy flagged",
    detail: "JW-1042 — issued weight exceeds returned + finished by 0.42g",
    time: "12m ago",
  },
  {
    icon: ShieldCheck,
    tone: "text-success",
    title: "Hallmarking certificate received",
    detail: "HK8X2M4T · Zaira Necklace 18K",
    time: "1h ago",
  },
  {
    icon: PackageCheck,
    tone: "text-info",
    title: "Goods receipt posted",
    detail: "GRN-2094 from Meera Gems Pvt. Ltd.",
    time: "3h ago",
  },
];

export function NotificationsMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Notifications">
          <span className="relative">
            <Bell className="h-4 w-4" />
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="flex flex-col gap-1 py-1">
          {SAMPLE_NOTIFICATIONS.map((n, i) => (
            <div key={i} className="flex gap-2.5 rounded-sm px-2 py-2 hover:bg-surface-sunken">
              <n.icon className={`mt-0.5 h-4 w-4 shrink-0 ${n.tone}`} aria-hidden="true" />
              <div className="flex flex-col gap-0.5">
                <span className="text-body-sm font-medium text-foreground">{n.title}</span>
                <span className="text-caption text-muted">{n.detail}</span>
                <span className="text-caption text-muted">{n.time}</span>
              </div>
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
