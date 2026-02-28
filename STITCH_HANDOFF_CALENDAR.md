# STITCH_HANDOFF_CALENDAR.md
## Stitch Export → `/portal/calendar` Implementation Spec

**Source:** `~/Downloads/progress feature stitch.zip`
**Extracted:** `_stitch_import/progress-feature-stitch/`
**Files:** `code.html` + `screen.png`
**Branch:** `feature/stitch-portal-calendar`

---

## Layout Overview

The Stitch design exports a 3-panel layout. The existing portal `layout.tsx`
already provides the **left sidebar (88px)** and **top header**. The
`/portal/calendar` page (`page.tsx`) is rendered inside the layout's
`<main class="min-h-0 flex-1 overflow-y-auto">` container.

### Panel Mapping
| Stitch Panel | Portal Implementation |
|---|---|
| Left sidebar (80px icons) | `layout.tsx` – already exists, untouched |
| Top header bar | `layout.tsx` – already exists, untouched |
| Main content (flex-1) | `page.tsx` – our implementation |
| Right inbox (w-96) | `page.tsx` – fixed slide-in drawer, 420px |

---

## Design Tokens (from Stitch code.html)

| Token | Value |
|---|---|
| Blue accent | `#2F6BFF` |
| Blue shadow | `rgba(47,107,255,0.3)` |
| Active nav gradient | `135deg, #2F6BFF → #1A4BCC` |
| Card background | `white` / `var(--surface)` |
| Inbox background | `#F9FBFF` / `var(--surface)` |
| Item hover background | `#F8FAFC` / `var(--surface-2)` |
| Active project row | `bg-gray-900` text-white (dark mode toggle) |
| Month labels opacity | `0.04` (extremely faded large uppercase text) |
| Timeline track | `rgba(47,107,255,0.18)` |
| Timeline progress | `#2F6BFF` solid |

---

## Section 1: Project Header

```
[ Zap icon (blue bg) ]  [ Project Name (bold xl) ]        [ Inbox button ]
                         [ status label (xs uppercase) ]
```

- Left: square blue icon + project name + status/subtitle
- Right: MessageSquare button to toggle inbox drawer

---

## Section 2: Milestones

### Header row
```
Milestones                                    [ Year | Week | Day ]
X de Y milestones completos (blue X)
```

### Timeline visualization
```
FEBRUARY          MARCH           APRIL              MAY
           ← extremely faded large text background →

──[✓]──────────────[⚡]──────────────[🕐]──────────────[○]──
 Budget           LongMilestoneName  Yet Another    Incoming
 Planning         12 MAR             Milestone      Milestone
 05 FEB                              18 APR         22 MAY
```

#### Node types (by milestone status)
| Status | Node | Style |
|---|---|---|
| `done` / `completed` | `h-6 w-6` filled blue circle with ✓ | `bg-#2F6BFF` border-white shadow |
| `in_progress` / `active` | `h-10 w-10` white circle blue border + ⚡ icon | ping ring animation |
| pending / `upcoming` | `h-6 w-6` white circle blue border + 🕐 clock icon | subtle shadow |
| future / `future` | `h-4 w-4` gray circle | `opacity: 0.4` |

#### Timeline positioning logic
1. `computeTimelineRange(milestones, filter)` → `{ start, end }`
   - `year`: span across all milestone dates with 10% padding
   - `week`: current week Mon–Sun
   - `day`: today 00:00–23:59
2. `dateToPercent(date, start, end)` → `0–100` (clamped to 2–98)
3. `progressPct` = `(doneCount / total) * 100`
4. `getMonthLabels(start, end)` → array of `{ label: string, left: number }`
5. Month names rendered as `text-4xl font-black uppercase opacity-4` background text

---

## Section 3: Other Projects

```
[ Colored initials avatar ]  [ Project Name ]       [ STATUS badge ]  [ Tue, 12 Mar ]
                             [ status text  ]                          [ 13:22         ]
```

- Shows all projects EXCEPT the currently selected one
- Click → changes selected project, reloads milestones + inbox
- Hover: scale 1.005, border reveals blue hint
- Date/time from `project.updated_at`

---

## Section 4: Inbox Drawer

- Fixed right panel: `w-full max-w-[420px]` from `right: 0`
- Slide in from right with spring animation (`x: "100%" → 0`)
- Header: `INBOX` label (uppercase tracking-widest) + X close button
- Messages: grouped by date with divider lines
- Chat bubbles:
  - Team (`sender_type === "team"`): left-aligned, blue avatar "BP"
  - Client: right-aligned, surface-2 avatar "C"
  - Bubble border-radius: `16px 16px 16px 4px` (team) / `16px 16px 4px 16px` (client)
- Message input: text input + Send button
- Enter key to send (shift+Enter = newline)

---

## Data Sources

| Data | Function | Notes |
|---|---|---|
| Projects | `getClientProjects()` | Auto-selects `list[0]` on mount |
| Milestones | `getProjectMilestones(projectId)` | Sorted by `due_date` asc |
| Conversation ID | `getConversationForProject(projectId)` | Can be null |
| Messages | `getMessages(conversationId)` | Loaded after convId known |
| Send message | `sendConversationMessage(convId, body)` | Returns boolean |

---

## Key UX Rules

1. **Auto-load**: `projects[0]` is selected on mount — no project selection step
2. **Scroll**: main content scrolls via portal layout's `overflow-y-auto`
3. **Inbox open**: adds `padding-right: 420px` to main content to avoid overlap
4. **Mobile**: inbox shows full-screen with dark backdrop
5. **No duplicate sidebar**: layout.tsx already handles left nav
6. **Dark mode**: all colors use `var(--text)`, `var(--surface)`, etc. + inline `#2F6BFF`

---

## Files Changed

- `src/app/portal/calendar/page.tsx` — complete rewrite
- No other files modified
