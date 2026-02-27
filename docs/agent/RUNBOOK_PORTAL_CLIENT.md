# 🏛️ Portal Client Features & Architecture

**Rules, patterns, and gotchas for client-facing portal features.**

---

## Portal Architecture

### Pages

- `/portal` - Client dashboard
- `/portal/projects` - Project list
- `/portal/projects/[id]` - Project details
- `/portal/review/[deliverableId]` - Deliverable review & approval
- `/portal/calendar` - Timeline milestones
- `/portal/deliveries` - Delivery management
- `/portal/inbox` - Messages & notifications

### Key Components

- `DeliverablePreviewDrawer` - File preview (PDF, video, images)
- `ApprovalsPanel` - Approval checklist
- `ReferencesManager` - Project references
- `VersionBadge` - Shows deployment version

---

## Dropbox Integration

### Required Env Vars

```env
NEXT_PUBLIC_DROPBOX_CLIENT_ID=xxx
DROPBOX_CLIENT_SECRET=xxx
DROPBOX_REFRESH_TOKEN=xxx
```

### File Sync

Files auto-sync from Dropbox folders:
- `/projects/{client}/{project}` → deliverables
- RLS ensures client only sees their files

### Links

- Public share links generated via `/api/portal/deliverables/link`
- Secure (token-based, time-limited if configured)
- Clients can download/preview without Dropbox account

---

## RLS (Portal-Specific)

### Client Can See

- Own team projects
- Own deliverables
- Own references
- Public information

### Client Cannot See

- Other client's projects
- Admin fields
- Sensitive team data

### Key Tables

- `projects` - RLS: user's team
- `deliverables` - RLS: user's team + project
- `project_references` - RLS: user's team
- `dropbox_sync_records` - RLS: user's team

---

## Common Portal Issues

### 1. Scroll Freezes

**Cause**: Flex layout without min-h-0

**Fix**:
```tsx
<main className="min-h-0 flex-1 overflow-y-auto">
  {/* content */}
</main>
```

**Prevention**: Use css variables + flex with min-h-0 for scrollable sections.

### 2. Dark Mode "Night Blocks"

**Cause**: Hardcoded dark colors (bg-gray-950, text-white)

**Fix**:
```tsx
// ❌ Bad
<div className="bg-gray-950 text-white">

// ✅ Good
<div style={{ backgroundColor: "var(--bg)", color: "var(--text)" }}>
```

**CSS Variables** (set in globals.css):
- `--bg` - Background
- `--text` - Text color
- `--surface-2` - Secondary surface
- `--border` - Border color

### 3. Preview Not Working

**Cause**: Missing DeliverablePreviewDrawer or API endpoint

**Fix**: Ensure `/api/portal/deliverables` returns full data with dropbox_url.

### 4. RLS Blocking Client Access

**Cause**: RLS policy too strict

**Fix**: Test policy in Supabase editor:
```sql
SELECT * FROM public.deliverables
WHERE user_id = (SELECT auth.uid())
LIMIT 1;
```

---

## File Preview

### Supported Formats

- PDF (iframe)
- Video (MP4, WebM)
- Images (PNG, JPG, SVG)
- Download fallback for others

### Preview Drawer

```tsx
<DeliverablePreviewDrawer
  deliverable={deliverable}
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
/>
```

---

## Approval Flow

### Steps

1. Client opens `/portal/review/[deliverableId]`
2. Reviews deliverable (preview, comments, refs)
3. Clicks "Approve" or "Request Changes"
4. Approval recorded in `deliverable_approvals` table
5. Team gets notified

### ApprovalsPanel Props

```tsx
<ApprovalsPanel
  deliverableId={id}
  approvals={approvals}
  onApprove={handleApprove}
  onReject={handleReject}
/>
```

---

## Testing Portal Features

### Manual

```bash
npm run dev
# Open http://localhost:3000/portal (or create test account)
# Click through projects → deliverables → review
# Test file preview
# Test approval flow
```

### Automated

```bash
npm run test:smoke
# Includes portal navigation tests
```

### Production

1. Check `/api/version` shows main
2. Open portal in production
3. Verify client can see projects
4. Test file preview
5. Test approval

---

## CSS Variables

```css
/* Light mode (default) */
:root {
  --bg: #ffffff;
  --text: #000000;
  --surface-2: #f5f5f5;
  --border: #e5e5e5;
}

/* Dark mode */
[data-theme="dark"] {
  --bg: #0a0a0a;
  --text: #ffffff;
  --surface-2: #1a1a1a;
  --border: #333333;
}
```

Use via:
```tsx
style={{ backgroundColor: "var(--bg)", color: "var(--text)" }}
```

---

## Dropbox OAuth Flow

### Connect Sequence

1. Client clicks "Connect Dropbox"
2. Redirects to `/api/integrations/dropbox/auth`
3. Dropbox login & authorize
4. Callback to `/api/integrations/dropbox/callback`
5. Token stored (encrypted)
6. Folder sync starts

### Folder Structure

```
/Dropbox
  /Beyond Pricing (configured root)
    /Client Name
      /Project Name
        /files...
```

Auto-created on first sync.

---

## References

- RUNBOOK_SUPABASE.md - RLS policies
- RUNBOOK_QA.md - Testing portal
- KNOWN_ISSUES.md - Historical portal bugs

---

**SUMMARY**: Portal is client-facing. Use RLS for security. CSS variables for theming. DeliverablePreviewDrawer for files. Test before merging.
