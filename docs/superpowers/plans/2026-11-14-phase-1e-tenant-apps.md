# Phase 1E: Role-Shaped Tenant Apps & Isolation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver role-shaped portal applications for the three tenant parties (Client, Supplier, Partner Agency) on real database data, enforce tenant database privileges and row-level security (RLS) policies, implement alias identities with mailbox verification, enable supplier management of partner agencies, allow tenant agreement acceptances, and verify strict zero-leakage isolation across all four roles in the leak matrix.

**Architecture:**
- **Database Grants & RLS:** Extend `leads_client` and `leads_agency` with column grants and RLS policies on `agreement`, `agreement_acceptance`, `campaign_share`, `campaign_host`, `host_hours`, `host_block`, and the new `alias_identity` table.
  - `leads_client` reads its own campaigns, its client agreement, its agreement acceptances, and manages its own hosts and hours. It cannot see `agency_org_id`, supplier names, agency names, or supplier agreements.
  - `leads_agency` (Supplier): reads campaigns where it is the supplier, reads and creates partner agencies under it, reads its supplier agreement and accepts it, reads and manages shares for itself and its partner agencies, reads client hosts and availability. Cannot see client people's contact details or client agreements.
  - `leads_agency` (Partner Agency): reads campaigns it has an active share in, its own share, and client hosts/availability. Cannot see other agencies or client agreements.
- **Alias Identities:** Replace `agency_alias` with `alias_identity` (brand, display name, title, alias email, verification code hash, verified at). Verified before usable.
- **Tenant Applications:**
  - Client Portal: `/client` (Campaign Overview, Team & Availability, Agreements, and placeholder Leads/Meetings empty states).
  - Supplier Portal: `/supplier` (Campaign Overview, Partner Agencies, Agreements & Shares, Aliases, and placeholder Leads/Meetings empty states).
  - Agency Portal: `/agency` (Campaign Overview, My Shares, My Aliases, and placeholder Leads/Meetings empty states).
  - Shell routing in `/welcome` directing users to their respective portal based on `org.kind` and `parent_org_id`.
- **Leak Matrix:** Full verification across all four roles against two test organisations of each kind.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, PostgreSQL 16, Drizzle ORM, Better Auth, Vitest.

---

## Tasks

- [x] **Task 1: Alias Identity Schema & Migration**
  - Add `server/db/schema/alias-identity.ts`
  - DDL & custom SQL migration for `alias_identity` table, RLS, triggers, and grants (`0031_alias_identity.sql`)
  - Unit tests for alias validation and code hashing (`lib/domain/alias-code.test.ts`)

- [x] **Task 2: Tenant Database Grants & RLS Policies Migration**
  - Migration adding `leads_client` and `leads_agency` grants on `agreement`, `agreement_acceptance`, `campaign_share`, `campaign_host`, `host_hours`, `host_block` (`0032_tenant_grants.sql`)
  - Structural tests verifying column grants and journal parity

- [x] **Task 3: Domain Services for Tenant Operations**
  - Alias identity domain service (create, send code via outbox, verify code, list)
  - Supplier partner agency & user invite service (`createPartnerAgencyBySupplier`)
  - Tenant agreement acceptance service (`acceptAgreementByTenant`)
  - Unit and integration test suite

- [x] **Task 4: Tenant Reads & Session Helpers**
  - `server/client/session.ts`, `server/supplier/session.ts`, `server/agency/session.ts`
  - Role-shaped tenant queries with explicit column selections

- [x] **Task 5: Tenant Portal Screens & Routing**
  - Update `/welcome` redirect logic for `client`, `supplier`, `agency`
  - Client portal routes: `app/(client)/client/...`
  - Supplier portal routes: `app/(supplier)/supplier/...`
  - Partner Agency portal routes: `app/(agency)/agency/...`
  - Render & component tests (`components/tenant/screens.test.tsx`)

- [x] **Task 6: Multi-Tenant Leak Matrix & Security Audit**
  - Updated `server/db/testing/leak-matrix.ts` with Phase 1E granted paths and probes
  - Enforced zero-leak cross-tenant isolation and strict credential exclusion

- [x] **Task 7: Full Verification & Gravitas Checkpoint**
  - Run lint (`pnpm lint` -> 0 errors), typecheck (`pnpm typecheck` -> clean), unit tests (`pnpm test` -> 1126/1126 passed), and build (`pnpm build` -> 43/43 routes)
  - Document evidence and completion
