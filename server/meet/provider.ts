/**
 * Where a meeting's room comes from (phase 6). The decision is Google Meet and nothing else (the Meet note); the interface exists so the portal runs with no
 * provider at all (`none`: the screens say the link will follow) and so tests run with a fake.
 */
export interface MeetRoom {
  /** The link a person opens. Always `https://meet.google.com/...`. */
  readonly url: string;
  /** The space behind the link, kept to read who joined after the meeting. Never shown to a person of the portal. */
  readonly spaceId: string;
}

/**
 * One person's visit to a room: the name as it appeared in the room, when they joined and left, and how long they stayed. These four fields are everything
 * the portal keeps; an email address or an account id that the room reports is dropped before it gets here.
 */
export interface JoinEntry {
  readonly displayName: string;
  readonly joinedAt: Date;
  readonly leftAt: Date | null;
  readonly durationSeconds: number;
}

export interface MeetProvider {
  /** Makes an open room, or answers null when this provider makes none. Throws when the provider fails: the caller books the meeting anyway. */
  createRoom(meeting: { readonly startsAt: Date; readonly durationMinutes: number }): Promise<MeetRoom | null>;
  /** Everyone who joined the room, whatever the number of times it was opened. Throws when the provider cannot be read, so the import is tried again. */
  readJoinRecord(spaceId: string): Promise<readonly JoinEntry[]>;
}

/** No provider: no room is made and nothing is read. The default, and the way the portal runs until the owner has set Google up. */
export const noMeetProvider: MeetProvider = {
  createRoom: async () => null,
  readJoinRecord: async () => [],
};

/**
 * Makes a room for a booking without ever failing it: a provider that is down, slow or misconfigured leaves the meeting with no link (the screens say it will
 * follow). Only the error's name is logged, never its message, which could hold a response body.
 */
export async function createRoomSafely(provider: MeetProvider | undefined, meeting: { readonly startsAt: Date; readonly durationMinutes: number }): Promise<MeetRoom | null> {
  if (provider === undefined) return null;
  try {
    return await provider.createRoom(meeting);
  } catch (error) {
    console.error(`A meeting room could not be created (${error instanceof Error ? error.name : "unknown error"}).`);
    return null;
  }
}
