"use client";

import { createContext, useContext } from "react";

/** The only lead fields the command palette needs. Built on the server, so no other lead data reaches the browser through the shell. */
export type SearchLead = { ref: string; name: string; company: string };

const SearchLeadsContext = createContext<readonly SearchLead[]>([]);

export const SearchLeadsProvider = SearchLeadsContext.Provider;
export const useSearchLeads = (): readonly SearchLead[] => useContext(SearchLeadsContext);
