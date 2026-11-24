/**
 * What the second-step forms on the profile page get back from their server actions. Plain data only. `started` carries the secret for the app
 * (the person's own, shown on their own screen); `enabled` carries the backup codes, which are read out of the database once and shown once.
 */
export type SecondFactorFormState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "started"; readonly secret: string; readonly otpauthUri: string }
  | { readonly status: "enabled"; readonly backupCodes: readonly string[]; readonly notice: string | null }
  | { readonly status: "disabled" };

export const IDLE_SECOND_FACTOR: SecondFactorFormState = { status: "idle" };

export const SECOND_FACTOR_MESSAGES = {
  wrongPassword: "That is not your current password.",
  wrongCode: "That code is not right. Check the app and try again.",
  wrongBackupCode: "That backup code is not right, or it has been used already.",
  locked: "Too many wrong codes. Wait 15 minutes and try again.",
  notStarted: "Start again: the setup was not completed.",
  notAllowed: "The second step is for Fynix people only.",
  alreadyOn: "The second step is already turned on.",
  recordFailed: "The change was made but could not be recorded. Refresh the page to see where it stands.",
} as const;
