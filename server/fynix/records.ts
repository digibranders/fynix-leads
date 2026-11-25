import "server-only";
import { cache } from "react";
import { getDomain } from "@/server/domain";
import { readAgencyDetail, type AgencyDetail } from "@/server/domain/agency-overview";
import { readClientDetail, type ClientDetail } from "@/server/domain/client-overview";
import { readCoordinatorDetail, type CoordinatorDetail } from "@/server/domain/coordinator-overview";
import { orNotFound } from "@/server/fynix/session";

/** The client a page is about, found by the reference in the address. The layout and the tab share one read per request. An unknown reference is the not-found page. */
export const loadClient = cache((reference: string, userId: string): Promise<ClientDetail> => orNotFound(readClientDetail(getDomain(), { userId }, reference)));

/** The coordinator a page is about, found the same way. */
export const loadCoordinator = cache((reference: string, userId: string): Promise<CoordinatorDetail> => orNotFound(readCoordinatorDetail(getDomain(), { userId }, reference)));

/** The partner agency a page is about, found the same way. An unknown reference, or a coordinator's, is the not-found page. */
export const loadAgency = cache((reference: string, userId: string): Promise<AgencyDetail> => orNotFound(readAgencyDetail(getDomain(), { userId }, reference)));
