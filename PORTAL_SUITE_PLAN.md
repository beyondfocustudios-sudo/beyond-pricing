# Portal Suite Plan — 054

## Baseline
- Branch: `feature/client-portal-wow-suite-054`
- Base: `main` @ `b6fdf99`
- Forward-ported commits from donor history:
  - `691c093` (from `4d0d109`) portal v1 + invites + impersonation + migration 046
  - `84ac58f` (from `b08076a`) seed script hardening
  - `79727f7` (from `64f4c37`) stateless impersonation fallback
  - `cbc4763` (from `fed9680`) build stamp route + badge

## Audit (what already exists and is reused)
### Routes already present
- `/portal/login`
- `/portal`
- `/portal/projects/[id]`
- `/portal/onboarding`
- `/portal/invite`
- `/portal/review/[deliverableId]`
- `/app/clients`
- `/app/inbox`, `/api/notifications`

### Existing backend capabilities reused
- Review WOW base: `review_threads`, `review_comments`, `approvals`, review links, comment->task
- Deliverables and versions
- Portal messaging via `conversations` and `messages`
- Notifications table + email fallback queue (`email_outbox`)
- Onboarding session API
- ICS feed/event endpoints (`/api/calendar/feed.ics`, `/api/calendar/event.ics`, `/api/calendar/quick-event.ics`)

### Supabase table check (via runtime audit)
All required portal-suite tables are present in `public`:
- `clients`, `client_users`, `projects`, `project_members`
- `deliverables`, `deliverable_files`, `approvals`, `review_threads`, `review_comments`, `change_requests`
- `conversations`, `messages`, `notifications`, `email_outbox`
- `documents`, `references`, `milestones`
- `brand_kits`, `brand_kit_versions`, `brand_assets`, `brand_colors`, `brand_fonts`
- `onboarding_sessions`

## Gaps to implement in 054
1. Remove legacy role gateway from `/login` (direct login only).
2. Add missing portal route `/portal/projects`.
3. Add missing presentation route `/portal/presentation/[projectId]`.
4. Add brand kit workflow in portal project tabs:
   - logos/colors/fonts/guidelines fields
   - versioning + changelog writes
   - “apply brand accent” toggle and live preview hints
5. Harden notifications recipients to internal roles only (`owner/admin/editor/producer`) and exclude `freelancer` by default.
6. Add idempotent migration for portal-suite data consistency (brand kit/version fields + helper columns if missing).
7. Add seed execution helper for “Cliente Teste” fixtures.

## Table responsibility + RLS intent
- `clients`, `client_users`: tenant mapping and portal account membership.
- `projects`, `project_members`: project assignment and per-role access.
- `deliverables`, `deliverable_files`: reviewable outputs and downloadable versions.
- `review_threads`, `review_comments`, `approvals`, `change_requests`: review/audit cycle.
- `conversations`, `messages`: portal inbox.
- `notifications`, `email_outbox`: internal alert fan-out + fallback dispatch.
- `documents`, `references`, `milestones`: project context for client portal tabs.
- `brand_kits`, `brand_kit_versions`, `brand_assets`, `brand_colors`, `brand_fonts`: client brand wizard and history.
- `onboarding_sessions`: onboarding completion state per user/scope.

