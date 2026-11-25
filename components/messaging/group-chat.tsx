"use client";

import { CheckCircle, ChatCircle, CircleNotch, MagnifyingGlass, Plus, SignOut, Trash, UserPlus, UsersThree, WarningCircle, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  addGroupMembersAction,
  createGroupAction,
  deleteGroupAction,
  leaveGroupAction,
  openDirectChatAction,
  loadGroupCandidatesAction,
  loadGroupMembersAction,
  removeGroupMemberAction,
  renameGroupAction,
} from "@/server/domain/group-actions";
import type { GroupCandidate, GroupMemberView } from "@/server/domain/groups";
import { NATIVE_FIELD } from "@/components/kit/field-classes";
import { GROUP_RULE_TEXT } from "@/lib/messaging/group-rules";
import { CONTROL } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface GroupInfoView {
  readonly groupId: string;
  readonly name: string;
  readonly canManage: boolean;
  readonly memberCount: number;
  readonly kind: "group" | "direct";
}

/** A person's role as a small tinted chip: it, not a company name, is how people are told apart inside a group. */
function RoleChip({ label }: { readonly label: string }) {
  // The database still calls this role "Coordinator"; people see "Coordinator".
  const shown = label === "Coordinator" ? "Coordinator" : label;
  const tone = shown === "Fynix" ? "bg-navy text-offwhite" : shown === "Client" ? "bg-blue-soft text-blue-text" : shown === "Coordinator" ? "bg-green-soft text-green-text" : "bg-amber-soft text-amber-text";
  return <span className={`inline-flex h-5 items-center rounded-xs px-2 text-[11px] font-semibold ${tone}`}>{shown}</span>;
}

function Problem({ message }: { readonly message: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-sm bg-red-soft px-3.5 py-3 text-table text-red-text">
      <WarningCircle aria-hidden size={18} className="mt-px shrink-0" />
      <span>{message}</span>
    </p>
  );
}

/**
 * The picker: a search box, then the people grouped by organisation with a checkbox each. Used to make a group and to add to one.
 * The list itself comes from the database, already limited to whom this person may add.
 */
export function PeoplePicker({ candidates, selected, onToggle, onPick, showRule = false }: { readonly candidates: readonly GroupCandidate[]; readonly selected: ReadonlySet<string>; readonly onToggle: (userId: string) => void; readonly onPick?: (userId: string) => void; /** Say what a group may hold. Left off for a chat between two people. */ readonly showRule?: boolean }) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const shown = candidates.filter((row) => needle === "" || row.displayName.toLowerCase().includes(needle) || row.orgName.toLowerCase().includes(needle));
    const byOrg = new Map<string, GroupCandidate[]>();
    for (const row of shown) byOrg.set(row.orgName, [...(byOrg.get(row.orgName) ?? []), row]);
    return [...byOrg.entries()];
  }, [candidates, query]);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="relative">
        <MagnifyingGlass aria-hidden size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" />
        <label htmlFor="group-people-search" className="sr-only">Search people</label>
        <input id="group-people-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people or companies" className={`${CONTROL} h-(--h-control) w-full rounded-sm pr-3 pl-10 text-base placeholder:text-ink-muted md:text-[13.5px]`} />
      </div>
      {showRule ? <p className="text-caption text-ink-muted">{GROUP_RULE_TEXT}</p> : null}
      <div className="max-h-72 min-h-24 overflow-y-auto rounded-md bg-tonal p-1.5">
        {groups.length === 0 ? (
          <p className="p-4 text-center text-table text-ink-muted">{candidates.length === 0 ? "There is nobody you can add." : "No one matches."}</p>
        ) : (
          groups.map(([org, rows]) => (
            <fieldset key={org} className="mb-1">
              <legend className="px-2 pt-2 pb-1 text-caption font-semibold text-ink-muted">{org}</legend>
              {rows.map((row) => (
                onPick === undefined ? (
                  <label key={row.userId} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-2 hover:bg-navy-05">
                    <input type="checkbox" checked={selected.has(row.userId)} onChange={() => onToggle(row.userId)} className="size-4 accent-[var(--navy)]" />
                    <span className="min-w-0 flex-1 truncate text-table font-medium text-ink">{row.displayName}</span>
                    <RoleChip label={row.roleLabel} />
                  </label>
                ) : (
                  <button key={row.userId} type="button" onClick={() => onPick(row.userId)} className="flex min-h-11 w-full items-center gap-3 rounded-sm px-2 text-left hover:bg-navy-05">
                    <span className="min-w-0 flex-1 truncate text-table font-medium text-ink">{row.displayName}</span>
                    <RoleChip label={row.roleLabel} />
                  </button>
                )
              ))}
            </fieldset>
          ))
        )}
      </div>
    </div>
  );
}

const EMPTY_CHOICE: ReadonlySet<string> = new Set();

/**
 * Who may be picked. The list is asked for again each time the choice changes: once someone of one side is chosen, the database offers only Fynix and that
 * same side, so the picker can never be filled with a mix it would refuse. The old list stays on screen until the new one arrives.
 */
function useCandidates(active: boolean, chosen: ReadonlySet<string> = EMPTY_CHOICE, groupId?: string): readonly GroupCandidate[] | null {
  const [candidates, setCandidates] = useState<readonly GroupCandidate[] | null>(null);
  const key = [...chosen].sort().join(",");
  useEffect(() => {
    if (!active) return;
    let live = true;
    void loadGroupCandidatesAction({ groupId, chosen: key === "" ? [] : key.split(",") }).then((rows) => {
      if (live) setCandidates(rows);
    });
    return () => {
      live = false;
    };
  }, [active, groupId, key]);
  return candidates;
}

/** The + button: a menu with New group and New chat, and the dialog behind each. */
export function NewChatMenu({ onCreated }: { readonly onCreated: (conversationId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const chatCandidates = useCandidates(chatOpen);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const candidates = useCandidates(open, selected);

  function toggle(userId: string): void {
    const next = new Set(selected);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setSelected(next);
  }

  function submit(): void {
    setError(null);
    const form = new FormData();
    form.set("name", name);
    for (const id of selected) form.append("memberIds", id);
    startTransition(async () => {
      const result = await createGroupAction({ status: "idle" }, form);
      if (result.status === "success" && result.conversationId !== undefined) {
        setOpen(false);
        setName("");
        setSelected(new Set());
        onCreated(result.conversationId);
      } else {
        setError(result.message ?? "The group could not be created.");
      }
    });
  }

  function openChat(userId: string): void {
    setError(null);
    startTransition(async () => {
      const result = await openDirectChatAction(userId);
      if (result.status === "success" && result.conversationId !== undefined) {
        setChatOpen(false);
        onCreated(result.conversationId);
      } else {
        setError(result.message ?? "The chat could not be opened.");
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className={buttonVariants({ variant: "secondary", size: "sm" })}>
          <Plus aria-hidden weight="bold" />
          New
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="min-w-48">
          <DropdownMenuItem onClick={() => { setError(null); setChatOpen(true); }} className="gap-3 py-2.5">
            <ChatCircle aria-hidden size={18} />
            New chat
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => { setError(null); setOpen(true); }} className="gap-3 py-2.5">
            <UsersThree aria-hidden size={18} />
            New group
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={chatOpen} onOpenChange={setChatOpen}>
        <DialogContent className="max-w-lg gap-4">
          <DialogHeader>
            <DialogTitle>New chat</DialogTitle>
            <DialogDescription>Choose one person. If you already chat with them, that chat opens.</DialogDescription>
          </DialogHeader>
          {chatCandidates === null ? (
            <p className="flex items-center gap-2 text-table text-ink-muted"><CircleNotch aria-hidden className="motion-safe:animate-spin" size={16} />Loading people</p>
          ) : (
            <PeoplePicker candidates={chatCandidates} selected={new Set()} onToggle={() => undefined} onPick={pending ? undefined : openChat} />
          )}
          {error !== null ? <Problem message={error} /> : null}
        </DialogContent>
      </Dialog>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg gap-4">
          <DialogHeader>
            <DialogTitle>New group</DialogTitle>
            <DialogDescription>Name it, then choose who joins. People see each other by first name and role, and contact details are removed from messages.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group-name">Group name</Label>
            <input id="group-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} className={NATIVE_FIELD} autoComplete="off" />
          </div>
          {candidates === null ? (
            <p className="flex items-center gap-2 text-table text-ink-muted"><CircleNotch aria-hidden className="motion-safe:animate-spin" size={16} />Loading people</p>
          ) : (
            <PeoplePicker candidates={candidates} selected={selected} onToggle={toggle} showRule />
          )}
          {selected.size > 0 ? <p className="text-caption text-ink-muted">{selected.size} chosen, plus you</p> : null}
          {error !== null ? <Problem message={error} /> : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" disabled={pending || name.trim() === ""} onClick={submit} aria-busy={pending}>
              {pending ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : <UsersThree aria-hidden />}
              Create group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The side panel of one group: who is in it, and for the creator or a Fynix admin, the controls to change it. */
export function GroupPanel({ group, open, onOpenChange, onChanged, onLeft }: { readonly group: GroupInfoView; readonly open: boolean; readonly onOpenChange: (open: boolean) => void; readonly onChanged: () => void; readonly onLeft: () => void }) {
  const [members, setMembers] = useState<readonly GroupMemberView[] | null>(null);
  // What is typed in the rename box; null means "as saved", so a renamed group shows its new name without an effect.
  const [draft, setDraft] = useState<string | null>(null);
  const name = draft ?? group.name;
  const setName = setDraft;
  const [adding, setAdding] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const candidates = useCandidates(open && adding && group.canManage, chosen, group.groupId);

  useEffect(() => {
    if (!open) return;
    let live = true;
    void loadGroupMembersAction(group.groupId).then((rows) => {
      if (live) setMembers(rows);
    });
    return () => {
      live = false;
    };
  }, [open, group.groupId, group.memberCount]);

  const present = new Set((members ?? []).map((row) => row.userId));
  const addable = (candidates ?? []).filter((row) => !present.has(row.userId));

  function run(work: () => Promise<{ status: string; message?: string }>, after?: () => void): void {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (result.status === "success") {
        after?.();
        onChanged();
      } else setError(result.message ?? "That did not work. Try again.");
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="end" className="w-full gap-0 overflow-y-auto p-0 md:w-full md:max-w-[400px]">
        <SheetHeader className="p-5 pb-3">
          <SheetTitle>{group.name}</SheetTitle>
          <SheetDescription>{members === null ? "Group" : `${members.length} ${members.length === 1 ? "person" : "people"}`}. People appear by first name and role only.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-5 pb-6">
          {group.canManage ? (
            <form
              className="flex flex-col gap-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                if (name.trim() !== "" && name.trim() !== group.name) run(() => renameGroupAction(group.groupId, name));
              }}
            >
              <Label htmlFor="group-rename">Group name</Label>
              <div className="flex gap-2">
                <input id="group-rename" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} className={NATIVE_FIELD} autoComplete="off" />
                <Button type="submit" variant="secondary" disabled={pending || name.trim() === "" || name.trim() === group.name}>Save</Button>
              </div>
            </form>
          ) : null}

          <section aria-label="People in this group">
            <h3 className="mb-1 text-label font-semibold text-ink">People</h3>
            {members === null ? (
              <p className="py-3 text-table text-ink-muted">Loading</p>
            ) : (
              <ul className="flex flex-col">
                {members.map((row) => (
                  <li key={row.userId} className="flex min-h-12 items-center gap-3 py-2 shadow-[inset_0_-1px_0_var(--line)] last:shadow-none">
                    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-sm bg-navy-06 text-[12px] font-semibold text-ink-2">{row.firstName.charAt(0).toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-table font-semibold text-ink">{row.firstName}{row.isMe ? " (you)" : ""}</span>
                      {row.isCreator ? <span className="block text-caption text-ink-muted">Created the group</span> : null}
                    </span>
                    <RoleChip label={row.roleLabel} />
                    {group.canManage && !row.isMe ? (
                      <button type="button" aria-label={`Remove ${row.firstName}`} disabled={pending} onClick={() => run(() => removeGroupMemberAction(group.groupId, row.userId))} className="grid size-8 place-items-center rounded-sm text-ink-2 hover:bg-navy-07 max-md:size-10">
                        <X aria-hidden size={14} weight="bold" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {group.canManage ? (
            adding ? (
              <section aria-label="Add people" className="flex flex-col gap-3">
                <h3 className="text-label font-semibold text-ink">Add people</h3>
                {candidates === null ? (
                  <p className="text-table text-ink-muted">Loading people</p>
                ) : (
                  <PeoplePicker showRule candidates={addable} selected={chosen} onToggle={(id) => setChosen((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} />
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    disabled={pending || chosen.size === 0}
                    onClick={() => {
                      const form = new FormData();
                      form.set("groupId", group.groupId);
                      for (const id of chosen) form.append("memberIds", id);
                      run(() => addGroupMembersAction({ status: "idle" }, form), () => { setChosen(new Set()); setAdding(false); });
                    }}
                  >
                    <CheckCircle aria-hidden />
                    Add {chosen.size === 0 ? "" : chosen.size}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => { setAdding(false); setChosen(new Set()); }}>Cancel</Button>
                </div>
              </section>
            ) : (
              <Button type="button" variant="secondary" className="w-fit" onClick={() => setAdding(true)}>
                <UserPlus aria-hidden />
                Add people
              </Button>
            )
          ) : null}

          {error !== null ? <Problem message={error} /> : null}

          <div className="flex flex-wrap gap-2 pt-4 shadow-[inset_0_1px_0_var(--line)]">
            <Button type="button" variant="destructive" disabled={pending} onClick={() => run(() => leaveGroupAction(group.groupId), onLeft)}>
              <SignOut aria-hidden />
              Leave group
            </Button>
            {group.canManage ? (
              <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)}>
                <Trash aria-hidden />
                Delete group
              </Button>
            ) : null}
          </div>
        </div>
      </SheetContent>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {group.name}</DialogTitle>
            <DialogDescription>The group and all its messages are removed for everyone. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setConfirmDelete(false)}>Keep it</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => run(() => deleteGroupAction(group.groupId), () => { setConfirmDelete(false); onLeft(); })}
            >
              <Trash aria-hidden />
              Delete for everyone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
