import { describe, expect, it } from "vitest";
import { hasNeutralSender, launchEmailsEnabled, senderFromEnv } from "./launch";

describe("launchEmailsEnabled", () => {
  it("is off unless the word is exactly true", () => {
    for (const value of [undefined, "", "false", "TRUE", "1", "yes", " true"]) expect(launchEmailsEnabled({ LAUNCH_EMAILS_ENABLED: value }), String(value)).toBe(false);
    expect(launchEmailsEnabled({ LAUNCH_EMAILS_ENABLED: "true" })).toBe(true);
    expect(launchEmailsEnabled({})).toBe(false);
  });
});

describe("the sender", () => {
  it("is Fynix at hello@fynix.digital until MAIL_SENDER_ADDRESS is set: today's behaviour", () => {
    expect(senderFromEnv({})).toEqual({ email: "hello@fynix.digital", name: "Fynix" });
    expect(senderFromEnv({ MAIL_SENDER_ADDRESS: "  " })).toEqual({ email: "hello@fynix.digital", name: "Fynix" });
    expect(hasNeutralSender({})).toBe(false);
  });

  it("takes the address and the name from the environment, and is the address itself as a name when none is given", () => {
    expect(senderFromEnv({ MAIL_SENDER_ADDRESS: "meetings@neutral.example", MAIL_SENDER_NAME: "Meetings" })).toEqual({ email: "meetings@neutral.example", name: "Meetings" });
    expect(senderFromEnv({ MAIL_SENDER_ADDRESS: "meetings@neutral.example" })).toEqual({ email: "meetings@neutral.example", name: "meetings@neutral.example" });
    expect(hasNeutralSender({ MAIL_SENDER_ADDRESS: "meetings@neutral.example" })).toBe(true);
  });

  it("is not neutral when the address or the name names Fynix", () => {
    expect(hasNeutralSender({ MAIL_SENDER_ADDRESS: "hello@fynix.digital" })).toBe(false);
    expect(hasNeutralSender({ MAIL_SENDER_ADDRESS: "meetings@neutral.example", MAIL_SENDER_NAME: "Fynix" })).toBe(false);
  });
});
