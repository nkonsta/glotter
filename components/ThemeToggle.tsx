"use client";

import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { themeStore } from "@/lib/theme";

export function ThemeToggle() {
  const theme = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getServerSnapshot
  );

  const toggle = () => themeStore.toggle();

  return (
    <Button variant="ghost" size="sm" aria-label="Toggle theme" onClick={toggle} className="px-2">
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}



