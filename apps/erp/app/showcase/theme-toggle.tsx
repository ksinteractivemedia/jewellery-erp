"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@jewellery/ui";

/** Design-system-preview-only theme toggle. Real apps will wire this to a persisted user preference. */
export function ThemeToggle() {
  const [dark, setDark] = React.useState(false);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <Button variant="secondary" size="icon" aria-label="Toggle dark mode" onClick={() => setDark((d) => !d)}>
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
