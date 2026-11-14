# Phase 2: Leads Domain, Submission, Exclusions & Client Review Queue

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the complete Leads domain for Fynix Leads (Spec v2 section 8), including exclusion lists, duplicate checks, lead submission with alias identities, stage machine transitions, client "To respond" review queue with side panel actions, and role-scoped lead views across Client, Supplier, Partner Agency, and Fynix.

**Architecture:**
- **Database Schema & Migrations:**
  - `exclusion_entry`: Client domain/email/company exclusion records.
  - `lead`: Public ref (`LD-...`), prospect details (name, title, company, companyDomain, linkedinUrl, email, phone), BANT criteria answers, campaignId, hostMemberId, aliasIdentityId, sourceOrgId, submittedByUserId, current stage (`draft`, `awaiting_client`, `scheduled`, `outcome_due`, `reschedule_needed`, `held`, `client_no_show`, `prospect_no_show`, `delivered`, `disputed`, `declined`, `withdrawn`, `lost`, `rejected`), flags (`over_share`, `duplicate_override`), and timestamps.
  - `lead_history`: Immutable event log of stage transitions and edits with actor, action, before/after snapshots.
  - Custom SQL migration with PostgreSQL check constraints, RLS policies, audit triggers, and column grants for `leads_client`, `leads_agency`, and `leads_fynix`.
- **Domain Services:**
  - `server/domain/exclusions.ts`: Add/remove client exclusions, check prospect against client exclusion rules.
  - `server/domain/leads.ts`: Duplicate detection (same normalized email or LinkedIn URL across client campaigns), submission validation, stage transitions, over-share calculations, and history logging.
  - `server/domain/lead-review.ts`: Client actions on `awaiting_client` leads: accept time, propose alternative times, decline with reason.
- **Tenant & Fynix UI Integration:**
  - **Agency & Supplier Portals:** Lead submission form with client-brand alias selector, host picker with availability warning, lead table with stage badges and side panel details.
  - **Client Portal:** "To respond" review queue (`/client/review`), leads table (`/client/leads`) with side panel actions (accept, propose, decline) and dispute view.
  - **Fynix Admin Portal:** Global leads browser (`/fynix/leads`), campaign leads tab (`/fynix/campaigns/[ref]`), over-share indicators, and Fynix override actions.
- **Strict Isolation & Security:**
  - Clients never see `sourceOrgId` or agency names.
  - Agencies never see client contacts' emails/phones.
  - Real test verification with Vitest, TypeScript typecheck, ESLint, and Next.js build.

---

## Tasks

- [ ] **Task 1: Leads & Exclusions Database Schema & Migrations**
  - Add `server/db/schema/exclusion.ts`, `server/db/schema/lead.ts`, and `server/db/schema/lead-history.ts`
  - Export in `server/db/schema/index.ts`
  - Authored migrations: `0033_exclusion_entry.sql`, `0034_lead_tables.sql`
  - Snapshots `0033_snapshot.json` and `0034_snapshot.json`, updated `_journal.json`
  - Add `"LD"` prefix to `RefPrefix` in `lib/domain/public-ref.ts`

- [ ] **Task 2: Duplicate Detection & Exclusion Logic**
  - Normalization helpers for LinkedIn URL and email
  - Domain service for checking exclusions (domain, exact email, company name matching)
  - Domain service for duplicate detection across client campaigns
  - Unit tests for duplicate and exclusion detection rules

- [ ] **Task 3: Lead Submission & Stage State Machine Services**
  - `submitLead`: Validates alias verification, checks duplicates and exclusions, computes over-share flag, creates lead record and audit/history entry
  - `clientReviewLead`: Accept time (advances to `scheduled`), propose alternative times, decline with reason
  - Unit tests for all stage transitions and role authorizations

- [ ] **Task 4: Role-Scoped Lead Reads & Queries**
  - `selectClientLeads`, `selectAgencyLeads`, `selectFynixLeads`
  - Strict column projection enforcing zero PII leakage
  - Boundary and column tests

- [ ] **Task 5: Portal UI Components & Screens**
  - Lead submission form for agencies and suppliers
  - Client "To respond" review queue table and side panel actions
  - Full lead record view (`[ref]/page.tsx`) with timeline and BANT criteria
  - Fynix admin leads dashboard

- [ ] **Task 6: Verification & Test Suite Execution**
  - Unit test suite (`pnpm test`)
  - TypeScript check (`pnpm typecheck`)
  - Linting (`pnpm lint`)
  - Next.js production build (`pnpm build`)
