/**
 * What a client or a coordinator is told about the agreement of one campaign, on the campaign's own card: whether it is published, who has accepted
 * it, and what to do next. Pure, so the wording is tested. A campaign can go live only when both sides have accepted the current version.
 */
export type AgreementSide = "client" | "coordinator";

export interface AgreementFacts {
  readonly version: number;
  readonly clientAcceptedAt: Date | null;
  readonly coordinatorAcceptedAt: Date | null;
}

export type AgreementStep = "not-published" | "you-accept" | "waiting-other" | "in-force";

export interface AgreementProgress {
  readonly step: AgreementStep;
  readonly title: string;
  readonly body: string;
  /** Each side and whether it has accepted, for the two small chips. Empty while nothing is published. */
  readonly sides: readonly { readonly label: "Client" | "Coordinator"; readonly accepted: boolean }[];
}

const SIDE_WORD: Record<AgreementSide, string> = { client: "client", coordinator: "coordinator" };

export function agreementProgress(side: AgreementSide, agreement: AgreementFacts | null, campaignLive: boolean): AgreementProgress {
  if (agreement === null) {
    return {
      step: "not-published",
      title: "Agreement not published yet",
      body: "Fynix publishes the agreement for this campaign. The client and the coordinator both accept it before the campaign can go live.",
      sides: [],
    };
  }
  const sides = [
    { label: "Client", accepted: agreement.clientAcceptedAt !== null },
    { label: "Coordinator", accepted: agreement.coordinatorAcceptedAt !== null },
  ] as const;
  const own = side === "client" ? agreement.clientAcceptedAt : agreement.coordinatorAcceptedAt;
  const otherWord = SIDE_WORD[side === "client" ? "coordinator" : "client"];
  if (agreement.clientAcceptedAt !== null && agreement.coordinatorAcceptedAt !== null) {
    return {
      step: "in-force",
      title: "Agreement accepted by both sides",
      body: campaignLive ? `Version ${agreement.version} is in force.` : `Version ${agreement.version} is in force. Fynix can now make the campaign active.`,
      sides,
    };
  }
  if (own === null) {
    return {
      step: "you-accept",
      title: "Your acceptance is needed",
      body: `Version ${agreement.version} is published. ${agreement[side === "client" ? "coordinatorAcceptedAt" : "clientAcceptedAt"] === null ? `The ${otherWord} has not accepted it yet either.` : `The ${otherWord} has accepted it.`} The campaign can go live once both sides have.`,
      sides,
    };
  }
  return {
    step: "waiting-other",
    title: `Waiting for the ${otherWord}`,
    body: `You accepted version ${agreement.version}. The campaign can go live once the ${otherWord} accepts it too.`,
    sides,
  };
}
