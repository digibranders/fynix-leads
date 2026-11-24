/** What one campaign's agreement shows a client or a coordinator: the version in force, a newer version waiting to be accepted, and the rest as history. */
export interface VersionLike {
  readonly version: number;
  readonly status: "current" | "superseded";
  readonly inForce: boolean;
}

export interface AgreementCardModel<T extends VersionLike> {
  /** The newest version both sides accepted. Its numbers are the campaign's. Null until both have accepted one. */
  readonly inForce: T | null;
  /** The newest version when it is not in force: it waits for one or both sides. */
  readonly pending: T | null;
  /** Every other version, newest first. */
  readonly history: readonly T[];
}

/** Splits versions (newest first) into what is in force, what is pending and the history. */
export function agreementCard<T extends VersionLike>(versions: readonly T[]): AgreementCardModel<T> {
  const inForce = versions.find((row) => row.inForce) ?? null;
  const pending = versions.find((row) => row.status === "current" && !row.inForce) ?? null;
  return { inForce, pending, history: versions.filter((row) => row !== inForce && row !== pending) };
}
