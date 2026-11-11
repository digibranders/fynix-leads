import { useSyncExternalStore } from "react";
import { getServerSnapshot, getSnapshot, subscribe } from "./pending-store";

/** The live number of leads waiting on a client decision. */
export const usePendingCount = (): number => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
