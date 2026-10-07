# Quatre

Quatre is a personal AI workspace that coordinates several model providers around a person’s task. Ask in ordinary language, choose **Just answer**, **Compare answers**, **Ask several perspectives**, or **Let Quatre decide**. In Auto mode, clear comparison and multi-perspective cues select a predictable workflow; other questions use one model.

## Run locally

Requirements: Node.js 20.12+ and pnpm 11.

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. Without credentials, Quatre runs in deterministic demo mode. Demo outputs are identified as demos, are streamed into the interface, and do not contact an AI provider. Browser conversations remain available without an account.

## Configure providers and accounts

Copy `.env.example` to `.env.local`. Configure only the services you want to use. Never expose AI provider credentials using `NEXT_PUBLIC_` variables or commit `.env.local`.

| Variable | Used for |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI Responses API |
| `ANTHROPIC_API_KEY` | Anthropic Messages API |
| `GOOGLE_AI_API_KEY` | Gemini streaming API |
| `XAI_API_KEY` | xAI streaming chat API |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Auth and client connection |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase browser-safe key; database access is restricted by RLS |
| `DATABASE_URL` | Optional Drizzle migration tooling |
| `QUATRE_GATEWAY_URL`, `QUATRE_GATEWAY_API_KEY` | Reserved for a future managed provider gateway; not yet used |

Provider keys are read only in server modules. Models without a configured key are marked unavailable. Live model calls require a valid signed-in Supabase user; without live keys, guest/demo use does not require Supabase. Configure Google OAuth and email OTP/magic links in Supabase Auth for account sign-in.

Apply the migrations to a Supabase PostgreSQL project before enabling cloud history:

```bash
pnpm db:migrate
```

The migrations create a profile and a personal workspace when Supabase Auth creates a user. Guest history is retained in browser storage. After sign-in, Quatre merges local conversations with that user’s cloud workspace; authenticated conversation and message queries are constrained by RLS. Sign-out does not remove the local browser copy. A database function limits live prompts to 5 per minute and 20 per hour per account; demo prompts do not use provider credentials.

## Architecture

- `src/app/page.tsx`: responsive conversation experience, local guest history, settings, appearance, account UI, command palette, streamed progress, and cloud sync.
- `src/app/api/demo/route.ts`: validated SSE endpoint. It enforces authenticated access before using configured providers; demo fallback remains available without credentials.
- `src/app/api/models/route.ts`: exposes the public model catalog and key availability, never secret values.
- `src/lib/models.ts`: central provider/model registry, readable mode labels, deterministic Auto planning, and demo responses.
- `src/lib/providers/`: provider interface and streaming adapters. Quatre orchestration consumes normalized text streams rather than provider SDK types.
- `src/lib/supabase/`: browser/server auth clients and RLS-scoped conversation synchronization.
- `src/features/onboarding/`, `src/features/profile/`, and `src/features/community/`: optional first-use preferences, editable profile, private avatar storage, opted-in profile discovery, connection requests, message requests, blocking, reporting, and privacy controls.
- `src/features/notifications/`: authenticated notification center with private server-created events, category preferences, unread state, polling, and in-app destinations.
- `src/db/schema.ts`, `drizzle/`: Drizzle schema and Supabase migrations for profiles, workspaces, conversations, messages, grants, and RLS policies.
- `src/lib/env.ts`: server-only environment validation. Placeholder values in `.env.example` do not enable providers.

For Compare and Panel, individual streams remain separate. Quatre then asks a configured model to call out agreement, meaningful disagreement, differences, and uncertainty. Demo synthesis is explicitly labeled and does not claim factual verification.

## Checks

```bash
pnpm lint
pnpm test
pnpm build
```

## Current limits

Google OAuth and email magic link flows require Supabase dashboard configuration. Provider model IDs are centralized and should be reviewed against provider catalogs during routine maintenance. There is no billing, usage analytics, AI conversation attachments, vector search, background work, realtime collaboration, or native mobile app. The provider adapters currently submit the active prompt plus a bounded recent text transcript; they do not yet have tool use, attachments, or server-side conversation retrieval. Authentication, rate limiting, cloud sync, and cloud profiles require valid Supabase credentials and applied migrations to exercise end-to-end.

## Profile and Community

Apply the Drizzle migrations before using cloud profiles, Community, or notifications. `0004_profiles_community.sql` adds optional profile preferences and a private `quatre-avatars` storage bucket with a 4 MB image limit. `0005_notifications.sql` creates private notifications, server-side event triggers, and preference fields. `0006_notification_visibility.sql` hides events from blocked or muted actors and debounces rapid message notices. Profiles are private by default; users must opt in to discovery. Search runs through an authenticated, bounded RPC rather than open profile-table access. Connection requests, message requests, private reports, and blocks are protected with RLS and block-aware database guards. Community shows only opted-in members; it does not create sample people or imply that a member network already exists.

Guest profile preferences stay in browser storage. Cloud profile edits and uploaded photos require Supabase sign-in and the applied migration. Profile photos are stored in Supabase Storage and served with expiring signed URLs. Notification creation runs through database triggers; the client cannot insert notifications for itself or others. The center refreshes on focus and polls every 45 seconds; it does not use Realtime. Community messaging is a request-based foundation, not an open direct-message inbox or moderation service. The existing `consume_quatre_request_limit` function is a request throttle (5 per minute and 20 per hour), not a credit ledger or plan-specific allowance. Account plan cards are informational only; billing, credits, cost classes, and usage metering are not implemented.
