"use client";

import { createContext, useContext } from "react";
import { DEFAULT_CITY } from "@/lib/constants";

const CityContext = createContext<string>(DEFAULT_CITY);

export function CityProvider({
  city,
  children,
}: {
  city: string;
  children: React.ReactNode;
}) {
  return <CityContext.Provider value={city}>{children}</CityContext.Provider>;
}

export function useCity() {
  return useContext(CityContext);
}
