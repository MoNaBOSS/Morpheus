# Morpheus Design System

Permanent reference. Every Morpheus surface composes from the primitives here.
If a page needs something this document does not describe, extend the system —
do not solve it locally.

## Intent

Morpheus should read as a **calm technical instrument**: something that shows
you real machine state and does real work. Not a SaaS dashboard, not a hacker
terminal.

| We want | We avoid |
| --- | --- |
| Layered near-black surfaces, quiet contrast | Flat grey slabs, generic card grids |
| Dense but breathable; information per pixel | Whitespace padding for its own sake |
| One accent, used to mean something | Neon green everywhere |
| Monospace for machine truth (paths, ids) | Monospace as decoration |
| Motion that reports state | Motion as flourish |

**Matrix influence is an accent, not a theme.** The rain belongs to the boot
sequence only. Elsewhere, the Matrix inheritance shows as: precise monospace
detail, green reserved for *live/verified* states, and layered depth.

## Colour

### Semantic tokens (existing shadcn set)

Keep using `background`, `foreground`, `muted`, `border`, `card`,
`destructive`, and the `--surface-*` family from `globals.css`. Do not fork them.

### Morpheus tokens

Scoped to `[data-morpheus]`, defined in `globals.css`.

| Token | Meaning |
| --- | --- |
| `--morpheus-accent` | **Live execution and verified state only.** Running step, READY, granted, connected. |
| `--morpheus-accent-dim` | Same meaning, de-emphasised (borders, rules) |
| `--morpheus-glow` | Halo behind accent elements. Boot and active execution only. |
| `--morpheus-surface-1/2/3` | Elevation ramp. 1 = page, 2 = panel, 3 = raised/inset. |
| `--morpheus-grid` | Faint structural grid line |

### Accent discipline — the rule that keeps this from looking cheap

**Green is not "the brand colour". Green means "this is live or confirmed."**

| State | Colour |
| --- | --- |
| Running, ready, succeeded, granted | accent (green) |
| Awaiting input, medium risk | amber |
| Denied, failed, high/critical risk, degraded | red |
| Idle, queued, skipped, unknown | muted foreground |

Risk is **never** green. A page at rest should be near-monochrome; colour
appears when something is actually happening.

## Elevation

Three levels. More than three reads as noise.

1. **Page** — `--morpheus-surface-1`. Never carries a border.
2. **Panel** — `--morpheus-surface-2` + 1px border. The default container.
3. **Inset / raised** — `--morpheus-surface-3`. Inputs, code, nested rows.

No drop shadows except on true overlays (dialog, Quick Command).

## Density

Morpheus is information-dense by design. Everything must fit **1280×800**
without scrolling for primary content.

| Scale | Use |
| --- | --- |
| `text-2xs` | Metadata, timestamps, ids |
| `text-tiny` | Body of dense rows, secondary labels |
| `text-sm` | Primary body |
| `font-serif` (existing) | Page and panel headings only |
| `font-mono` | Paths, capability ids, hashes, command input |

Panel padding `p-3`; row padding `px-2.5 py-1.5`; gaps `gap-1.5`/`gap-2`.

## Motion

| Duration | Use |
| --- | --- |
| 120ms | Hover, focus |
| 200–320ms | Panel/overlay enter-exit |
| 30fps cap | Any canvas animation |

All animation respects `prefers-reduced-motion`. A running step may pulse; a
completed one must be still.

## Primitives

Located in `src/components/morpheus/ui/`. Pages compose these.

| Primitive | Responsibility |
| --- | --- |
| `Panel` | Titled elevation-2 container with optional description and actions |
| `StatusDot` | Semantic state dot: running / ok / warn / error / idle |
| `RiskBadge` | Renders a `MorpheusRiskTier` with correct colour — never green |
| `KeyValue` | Aligned label/value row for machine facts |
| `PlanTimeline` | Ordered steps with dependency, status, duration |
| `EmptyState` | Honest empty message; never a fake placeholder row |
| `MonoPath` | Truncating middle-ellipsis path with full value on hover |
| `SectionHeading` | Consistent heading rhythm |

### Rules

1. **A primitive never fetches.** Data arrives via props; pages own stores.
2. **A primitive never invents state.** No fake rows, no skeleton implying data.
3. **Truthful empties.** "No actions yet", never a greyed-out sample.
4. **Every interactive element carries a `data-testid`.**

## Layout

```
┌ Sidebar ─┬ Page ────────────────────────────────────┐
│          │ Header: identity · status · command      │  ← always above fold
│  nav     ├──────────────────────────────────────────┤
│          │ Primary   (plan / execution)   │ Aside   │
│          │                                │ (trust, │
│          │                                │ actions,│
│          │                                │ output) │
└──────────┴──────────────────────────────────────────┘
```

At 1280×800 the header and the top of Primary must be visible without scrolling.
Aside collapses below Primary under `xl`.

## Writing

- Say what happened, not what might have. "Created notes.txt" not "Operation completed."
- Name the real thing: absolute paths, real capability ids.
- Never claim unknown state. "No provider configured" beats a guessed name.
- Permission copy states the **boundary**, not the mechanism: "Allow Morpheus to
  create files in this folder" not "Grant file.createText for resourceScope X."
