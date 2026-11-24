import { googleMeetProvider } from "@/server/meet/google";
import { noMeetProvider, type MeetProvider } from "@/server/meet/provider";

type Source = Readonly<Record<string, string | undefined>>;

/**
 * The provider the environment names. `MEET_PROVIDER` unset or `none` is no provider at all: no room is made, nothing is read, the call never leaves the process.
 * `google` needs the three `GOOGLE_MEET_*` variables, which the environment check already insists on, and throws naming the missing one rather than falling back.
 */
export function meetProviderFromEnv(source: Source = process.env): MeetProvider {
  const name = source.MEET_PROVIDER === undefined || source.MEET_PROVIDER === "" ? "none" : source.MEET_PROVIDER;
  if (name === "none") return noMeetProvider;
  if (name !== "google") throw new Error(`MEET_PROVIDER must be none or google, not ${JSON.stringify(name)}.`);
  const clientId = source.GOOGLE_MEET_CLIENT_ID;
  const clientSecret = source.GOOGLE_MEET_CLIENT_SECRET;
  const refreshToken = source.GOOGLE_MEET_REFRESH_TOKEN;
  for (const [variable, value] of [["GOOGLE_MEET_CLIENT_ID", clientId], ["GOOGLE_MEET_CLIENT_SECRET", clientSecret], ["GOOGLE_MEET_REFRESH_TOKEN", refreshToken]] as const) {
    if (value === undefined || value === "") throw new Error(`MEET_PROVIDER is google, so ${variable} must be set.`);
  }
  return googleMeetProvider({ clientId: clientId as string, clientSecret: clientSecret as string, refreshToken: refreshToken as string });
}
