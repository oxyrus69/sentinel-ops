'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * Shell state shared between the top utility bar (Zona B) and the navigation
 * rail (Zona A). The collapse button lives in the bar but resizes the rail, so
 * both read one piece of state here instead of one reaching into the other's
 * DOM.
 */

interface ShellContextValue {
  collapsed: boolean;
  toggleCollapsed: () => void;
  paletteOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <ShellContext.Provider
      value={{
        collapsed,
        toggleCollapsed: () => setCollapsed((v) => !v),
        paletteOpen,
        openPalette: () => setPaletteOpen(true),
        closePalette: () => setPaletteOpen(false),
      }}
    >
      {children}
    </ShellContext.Provider>
  );
}

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be used inside ShellProvider');
  return ctx;
}
