import React, { createContext, useContext, useState } from "react";

type Ctx = { isOpen: boolean; openDrawer: () => void; closeDrawer: () => void };

const AccountDrawerCtx = createContext<Ctx>({
  isOpen: false,
  openDrawer: () => {},
  closeDrawer: () => {},
});

export function AccountDrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <AccountDrawerCtx.Provider
      value={{ isOpen, openDrawer: () => setIsOpen(true), closeDrawer: () => setIsOpen(false) }}
    >
      {children}
    </AccountDrawerCtx.Provider>
  );
}

export function useAccountDrawer() {
  return useContext(AccountDrawerCtx);
}
