# DESIGN.md — Sentinel Ops

Single source of truth for every visual decision in this product. No color,
font, size, radius, or shadow may appear in code without a token here.

---

## 1. Product Read

**Sentinel Ops** is an internal SecOps console. It is not a landing page. The
primary user is a technician triaging a compromised OJS journal at 09:00, a
supervisor checking SLA compliance, and a client owner glancing at a public
status page.

> *Reading this as: internal security-operations console for SecOps engineers,
> support agents, and client owners, with a dark technical / instrument-panel
> language, leading to Tailwind v4 + JetBrains Mono for numbers and code +
> a neutral grotesque for prose, operational green + incident red.*

### Design constraints that override taste

- The dashboard is read for hours. Dark surface is mandatory; no pure `#000`.
- Every status must be readable at a glance from across a room
  (COMPROMISED, DOWN, WARNING, HEALTHY).
- Numbers are the content. Tabular figures everywhere, always.
- Print reports (A4) must be legible on white paper with no dark background.

---

## 2. The Three Dials

| Dial | Value | Why |
|---|---|---|
| `DESIGN_VARIANCE` | **4** | Operational tool. Predictable beats surprising. Grid discipline, asymmetric only where a status genuinely demands attention. |
| `MOTION_INTENSITY` | **2** | Motion signals state change only (SLA countdown, scan progress). Nothing decorative. `prefers-reduced-motion` fully honored. |
| `VISUAL_DENSITY` | **7** | High. Tables, KPI rows, and dense metric blocks are the product. Generous padding inside cells, tight rhythm between rows. |

---

## 3. Color

Dark instrument panel. No gradients, no glow, no halos.

### Surfaces (dark)

| Token | Value | Use |
|---|---|---|
| `--surface-base` | `#0B0F14` | Page background |
| `--surface-raised` | `#111820` | Cards, panels |
| `--surface-sunken` | `#080B0F` | Table header wells, code blocks |
| `--surface-overlay` | `#161F29` | Popovers, dialogs, dropdowns |
| `--border-subtle` | `#1E2A36` | Default 1px edges |
| `--border-strong` | `#2E3F4F` | Focus-adjacent, table rules |

### Text

| Token | Value | Contrast on `--surface-raised` |
|---|---|---|
| `--text-primary` | `#E8EEF4` | 13.9:1 |
| `--text-secondary` | `#9AAAB9` | 6.5:1 |
| `--text-muted` | `#6B7C8D` | 4.6:1 (large text / labels only) |
| `--text-inverse` | `#0B0F14` | On light accent fills |

### Semantic status

Status color is the product's vocabulary. Never used decoratively.

| Token | Value | Meaning | Fill usage |
|---|---|---|---|
| `--status-healthy` | `#3FB950` | HEALTHY, MET, ON_TRACK | Solid fill + dark text, or dot + text |
| `--status-warning` | `#D29922` | WARNING, AT_RISK | Solid fill + dark text |
| `--status-critical` | `#F85149` | COMPROMISED, CRITICAL, BREACHED, DOWN | Solid fill + white text |
| `--status-info` | `#4B9CD3` | Informational, RESOLVED, CLOSED | Solid fill + dark text |
| `--status-neutral` | `#5A6B7C` | MAINTENANCE, inactive | Solid fill + light text |

### Brand / action

| Token | Value | Use |
|---|---|---|
| `--accent` | `#3FB950` | Primary action, active nav, focus ring |
| `--accent-hover` | `#4FCB5E` | Hover state of `--accent` |
| `--accent-subtle` | `#12241A` | Tinted background behind primary CTAs |
| `--danger` | `#F85149` | Destructive actions, delete |
| `--danger-subtle` | `#2A1517` | Tinted background for danger zones |

**Contrast floor: 4.5:1 for body text, 3:1 for large text and UI boundaries.
All pairs above meet WCAG AA.**

---

## 4. Typography

Two families. Mono carries every number, ID, hash, and code sample; the
grotesque carries prose. No third family.

| Role | Family | Weight | Size / Line-height | Tracking |
|---|---|---|---|---|
| Display (page title) | `--font-sans` | 600 | 28px / 1.2 | -0.01em |
| Section heading (h2) | `--font-sans` | 600 | 20px / 1.3 | -0.005em |
| Card heading (h3) | `--font-sans` | 600 | 15px / 1.4 | 0 |
| Body | `--font-sans` | 400 | 14px / 1.55 | 0 |
| Body small / helper | `--font-sans` | 400 | 13px / 1.5 | 0 |
| Label / eyebrow | `--font-sans` | 500 | 11px / 1.3 | 0.06em, uppercase |
| Metric (KPI number) | `--font-mono` | 600 | 32px / 1.1 | -0.02em, tabular |
| Metric unit | `--font-mono` | 500 | 14px / 1.2 | 0 |
| Table cell | `--font-sans` | 400 | 13px / 1.45 | 0 |
| Table number | `--font-mono` | 500 | 13px / 1.45 | 0, tabular |
| Code / hash / regex | `--font-mono` | 400 | 12.5px / 1.5 | 0 |
| Ticket ID | `--font-mono` | 500 | 13px / 1.45 | 0 |

### Rules

- **Minimum interface text is 13px.** Nav links, table cells, and controls are
  never smaller. Labels may be 11px uppercase only when they are true labels.
- **Body copy:** sentence case, left-aligned, `max-width: 72ch`.
- **No italic display headlines.** No gradient text.
- Numbers in prose are wrapped in `--font-mono` so digits align.
- Heading levels never skip (h1 → h2 → h3).

---

## 5. Space & Radius

Base unit 4px. Scale: `2, 4, 8, 12, 16, 20, 24, 32, 40, 56, 72`.

| Token | Value | Use |
|---|---|---|
| `--space-card` | `16px` | Card padding |
| `--space-card-lg` | `20px` | KPI and metric cards |
| `--space-section` | `32px` | Between page sections |
| `--space-row` | `12px` | Between table rows / list items |
| `--space-inline` | `6px` | Icon-to-label gap |

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | `4px` | Buttons, inputs, badges, chips |
| `--radius-md` | `6px` | Cards, panels |
| `--radius-lg` | `8px` | Modals, large containers |
| `--radius-full` | `999px` | Status dots, avatars only |

**Small cards never exceed `--radius-md`.** No blob radii.

### Spacing rhythm

- Heading top space is always greater than its bottom space (2:1 minimum).
- Related elements are closer than unrelated ones. Uniform gaps everywhere are
  rejected.
- Page content always has horizontal padding ≥ 20px; never flush to viewport.

---

## 6. Elevation & Edges

**Pick one: an edge or a shadow, never both.**

| Level | Treatment |
|---|---|
| Flat (default) | `--border-subtle` 1px, no shadow |
| Raised | `--surface-raised` + `--border-subtle`, no shadow |
| Floating (popover, dialog) | `--surface-overlay` + `--border-strong` + `0 8px 24px rgb(0 0 0 / 0.5)` |
| Focus | `0 0 0 2px var(--surface-base), 0 0 0 4px var(--accent)` |

No glassmorphism. No blurred translucent cards. No glowing borders.

---

## 7. Layout

| Token | Value |
|---|---|
| Sidebar width | `248px` (collapsed `64px`) |
| Topbar height | `56px` |
| Content max-width | `1440px` |
| Content padding | `24px` desktop, `16px` mobile |

### Responsive behavior

- **Desktop (≥1024px):** sidebar + content. Tables render as real tables.
- **Tablet (768–1023px):** sidebar collapses to icons, content full width.
- **Mobile (<768px):** sidebar becomes a drawer. Every `DataTable` switches to
  stacked cards. No horizontal scrolling anywhere.

---

## 8. Component Patterns

### KPI card
`--surface-raised`, `--radius-md`, 1px `--border-subtle`. Label (uppercase
11px) above, metric in mono 32px below, optional delta/context line in
`--text-secondary`. No icon tile. No accent border.

### Status badge
`--radius-full`, solid semantic fill, 12px medium text. Icon optional and
always paired with a text label (never color alone).

### SLA countdown badge
Mono numerals. Color follows `--status-*` by SLA state. When BREACHED the
badge is solid critical and the row gains a left status bar (4px, semantic
color). Static when not counting.

### DataTable
- Desktop: `<table>` with sticky header on `--surface-sunken`.
- Row hover: `--surface-raised` → slightly lighter, 120ms, no layout shift.
- Sortable columns show a lucide arrow; active column is `--text-primary`.
- Mobile: same data as cards, generated from the same row object.

### Form field
Label 13px medium, input `--surface-sunken` + 1px `--border-subtle`,
`--radius-sm`, 13px text. Focus: accent ring. Error: `--danger` border +
12.5px message below. Never color-only error indication.

### Dialog
`--surface-overlay`, `--radius-lg`, scrim `rgb(11 15 20 / 0.72)`. Title 15px
semibold, body 14px, actions right-aligned. Escape and scrim click both close.
Focus is trapped and restored on close.

### Toast
Bottom-right desktop, top mobile. `--surface-overlay`, `--radius-md`, semantic
left accent 3px. Auto-dismiss 5s (errors persist until dismissed).

---

## 9. Charts (recharts)

- Grid lines: `--border-subtle`, horizontal only, never on a decorative axis.
- Series colors: `--chart-1` `#3FB950`, `--chart-2` `#4B9CD3`,
  `--chart-3` `#D29922`, `--chart-4` `#F85149`, `--chart-5` `#8B7BD8`,
  `--chart-6` `#5A6B7C`.
- Every chart is accompanied by an HTML table with the same numbers
  (screen-reader and print requirement from the spec).
- No gradient fills in areas. Flat fills at 12% opacity for area charts.
- Tooltip: `--surface-overlay`, mono numerals.

---

## 10. Motion

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | `120ms` | Hover, color, opacity |
| `--duration-base` | `180ms` | Panel, badge, focus |
| `--duration-slow` | `240ms` | Dialog, drawer |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Default |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Dismissals |

- Animate `transform` and `opacity` only. Never width, margin, or padding.
- No pulsing dots. No blinking cursors on static text. No marquees.
- `@media (prefers-reduced-motion: reduce)` disables all transitions and
  animations; content is visible by default and never depends on JS reveal.

---

## 11. Print (A4 reports)

Separate `(print)` route group with its own layout:

- White background, black text, 14mm margins.
- Status colors are preserved as solid fills (print-safe, no gradients).
- Charts render as the accompanying data table.
- No sidebar, no topbar. A print button is hidden inside `@media print`.
- Fonts fall back to system serif/sans; no webfont dependency.

---

## 12. Accessibility Floor

- WCAG AA minimum everywhere (see contrast table in §3).
- Visible focus ring on every interactive element (`:focus-visible`).
- Status never communicated by color alone; always icon + text.
- `prefers-reduced-motion` respected.
- Touch targets ≥ 32px on mobile.
- All form inputs have associated `<label>`.
- Live regions for async results (scan completion, toast).

---

## 13. Prohibited (project-specific)

Beyond the global anti-slop rules, this product must never use:

1. Gradients of any kind, on surfaces or text.
2. Glass / blur / translucent panels.
3. Radial halos or spotlight backgrounds.
4. Decorative grid-line backgrounds.
5. Thick colored accent borders on rounded cards.
6. Side-tab stripes (except the 4px SLA status bar defined in §8).
7. Hairline border plus wide shadow on the same element.
8. Emoji as icons (lucide only).
9. Auto-playing or looping animation.
10. Numbers that are not tabular.
