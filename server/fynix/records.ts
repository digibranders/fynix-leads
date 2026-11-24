import "server-only";
import { cache } from "react";
import { getDomain } from "@/server/domain";
import { readClientDetail, type ClientDetail } from "@/server/domain/client-overview";
import { readSupplierDetail, type SupplierDetail } from "@/server/domain/supplier-overview";
import { orNotFound } from "@/server/fynix/session";

/** The client a page is about, found by the reference in the address. The layout and the tab share one read per request. An unknown reference is the not-found page. */
export const loadClient = cache((reference: string, userId: string): Promise<ClientDetail> => orNotFound(readClientDetail(getDomain(), { userId }, reference)));

/** The coordinator a page is about, found the same way. */
export const loadSupplier = cache((reference: string, userId: string): Promise<SupplierDetail> => orNotFound(readSupplierDetail(getDomain(), { userId }, reference)));
