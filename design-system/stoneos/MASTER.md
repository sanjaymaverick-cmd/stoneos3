# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** StoneOS — Vedam Granites Pilot
**Source of truth:** `packages/frontend/app/globals.css`
**Category:** Operational data entry (factory floor + back office)
**Design dials:** Variance 4/10 (Restrained / Utilitarian) | Motion 2/10 (Minimal) | Density 8/10 (Dense)

> **On the ston3gpt version of this file.** That build's MASTER.md documents a
> different design language — Fira Code / Fira Sans, slate `#334155`, green
> `#059669`, on `#F8FAFC` — a conventional analytics dashboard. This app does
> not use it and never has. Adopting that document verbatim would describe a
> system the code contradicts, so this file documents what `globals.css`
> actually implements. If the palette is ever changed, change it here and in
> `globals.css` together.

---

## The metaphor

Every surface is a **stamped factory work-ticket**: warm paper stock, a dark
inked header, dashed tear-lines, punched notches down the sides. This is
deliberate. The people entering data spend their day around cut stone and
paper dockets, not SaaS dashboards, and the interface reads as an extension of
that. It is why cards have notches, why rules are dashed rather than solid, and
why the background carries a faint dot texture instead of flat white.

Restraint is the rule. Colour carries meaning — it is never decoration.

---

## Global rules

### Colour palette

| Role | Hex | CSS variable |
|------|-----|--------------|
| Ink / body text | `#241F1A` | `--ink` |
| Header ground | `#1C1B1A` | `--graphite` |
| Header ground, raised | `#2A2825` | `--graphite-soft` |
| Page ground (paper) | `#EDEAE4` | `--stone-100` |
| Fill, subtle | `#E1DCD2` | `--stone-200` |
| Border, light | `#C9C2B4` | `--stone-300` |
| Border, standard | `#A79E8C` | `--stone-400` |
| Accent (brass) | `#A97142` | `--brass` |
| Accent, text-safe | `#8A5A32` | `--brass-dark` |
| Success / complete | `#5C6B4F` | `--moss` |
| Danger / destructive | `#A6432E` | `--rust` |
| Secondary text | `#6B6255` | `--muted` |

Card interiors are `#FBFAF7` (a shade warmer than white); plain white is
reserved for input fields and list rows so they read as *writable* against the
paper.

**Semantic assignment — do not improvise:**

- **brass** — the active state, the primary action, the focus ring, progress fill
- **moss** — completed, saved, invoiced
- **rust** — destructive, required-field marks, cash-type badges
- **graphite** — the header stamp and the date box only, never a body surface

### Accessibility rules that are load-bearing

These were measured, not guessed. Do not "simplify" them back:

1. **White text on brass uses `--brass-dark`, never `--brass`.** White on
   `--brass` measures ~4.1:1, under the 4.5:1 WCAG AA floor. `--brass-dark`
   clears it at ~5.9:1. Applies to `.primary-btn` and `.nav-links a.active`.
2. **`--muted` is `#6B6255`,** darkened from the original label grey which
   measured ~4.2:1 on white and ~3.5:1 on `--stone-100`. This shade clears
   4.5:1 on both.
3. **Touch targets are at least 40px.** `.row-remove` carries explicit
   `min-width`/`min-height`; without them the icon button was ~22×22px.
4. **Focus is always visible.** `.nav-links a:focus-visible` uses a 2px
   `--stone-100` outline; inputs take a brass border plus a 2px brass glow.
   Never remove an outline without replacing it.

### Typography

- **Display / UI:** `Space Grotesk` — 500, 600, 700
- **Data / numerals:** `IBM Plex Mono` — 400, 500, 600

The split is functional, not stylistic. **Anything a person reads as a value
is mono**: serials, quantities, dates, amounts, table cells, stat numbers.
Anything that is a label, button or heading is Space Grotesk. `.mono` also sets
`font-variant-numeric: tabular-nums` so figures align in columns.

```css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
```

**Scale** (dense by intent — this is a data-entry app, not a marketing page):

| Use | Size | Weight |
|-----|------|--------|
| Stamp title | 18px | 700 |
| Stat number | 20px | 600 mono |
| Ticket title | 15px | 700 |
| Body / table | 13px | 400 |
| Input | 13px | mono |
| Button | 13.5px | 700 |
| Nav link | 12.5px | 600 |
| Field label | 10.5px | 600, uppercase, 0.4px tracking |

### Layout

- `.app-shell` — `max-width: 900px`, centred, `padding: 20px 14px 60px`.
  Deliberately narrow: forms are single-column and read top-to-bottom.
- `.grid` — auto-fill, `minmax(140px, 1fr)`, 10px gap
- `.row-grid` — auto-fill, `minmax(120px, 1fr)`, 8px gap
- Wide content scrolls inside `.table-scroll`; the page itself never scrolls
  sideways.
- Single breakpoint at **520px**, where `.stamp` stacks vertically.

### Motion

Minimal and functional only:

- Card hover: `translateY(-2px)` + brass border, 0.15s ease
- Dashboard tickets: 0.35s staggered fade-in, 40ms apart
- Buttons: `filter: brightness(0.88)` on hover

No parallax, no scroll animation, no loading skeletons that move.

---

## Component specs

### Stamp — the page header

Dark graphite bar, title plus a mono subtitle, with nav links on the right.
Wraps to a column under 520px. `.nav-links` must keep `flex-wrap` — an owner
sees up to 8 links plus the Clerk `UserButton`, which overflows without it.

### Ticket — the primary container

```css
.ticket {
  position: relative;
  background: #FBFAF7;
  border: 1px solid var(--stone-400);
  border-radius: 4px;
  padding: 18px 20px 20px;
}
```

Two `.ticket-notch` elements (14px circles filled with the page ground) sit at
`left: -8px` and `right: -8px` to punch the edge. The header row carries a
30px `.ticket-icon` in brass, moss or rust and closes with a **dashed**
bottom border — dashed reads as a tear-line and is used for every internal
rule.

### Buttons

| Class | Use |
|-------|-----|
| `.primary-btn` | The one committing action per form. Brass-dark, white, 700. Turns moss with `.saved`. |
| `.mini-btn` | Inline secondary action. Stone fill, stone border. |
| `.add-btn` | Add-a-row. Full width, **dashed** border — it adds structure rather than committing. |

One primary button per view. If a screen seems to need two, one of them is a
`.mini-btn`.

### Fields

Uppercase 10.5px label above a mono input. Required fields take a rust
`.required-mark`. `select.field-input` switches to Space Grotesk because option
lists are prose, not values.

### Status colours

| Pattern | Meaning | Fill / text |
|---------|---------|-------------|
| `.badge.invoiced`, `.status-pill.completed` | settled, done | `#DCE6D3` / moss |
| `.badge.cash` | cash | `#F0DAD3` / rust |
| `.badge.mixed`, `.status-pill.in_progress` | partial, running | `#EAE0C8` / brass-dark |

Pills are uppercase 10px/700; badges are sentence-case 10.5px/600.

---

## Adding a page

1. Wrap in `.app-shell`, open with `.stamp`.
2. One `.ticket` per logical group. Do not nest tickets.
3. Values in mono, labels in Space Grotesk uppercase.
4. Long lists go in `.table-scroll > .list-table`.
5. Loading uses `.loading-note`, empty uses `.empty-note` — never a spinner.
6. Gate the route in `packages/frontend/lib/routePolicy.ts` **and** confirm the
   backend `@Roles` on every endpoint the page calls. The nav is generated from
   that policy, so a page that is not in it is unreachable.
