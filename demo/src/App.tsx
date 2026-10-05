/**
 * Poimandres Theme Builder: the pmndrs colour layer, seen in a browser.
 *
 * The palette is computed live by `<Mtb>` from the real seed, `pmndrsMtb` —
 * imported, not mirrored — and painted by Material Theme Builder's own poster
 * (`Poster`, `Scheme` and `Shades`, from `material-theme-builder/react`). The
 * controls are plain state feeding `<Mtb>`'s props; nothing is precomputed.
 */
import { Mtb, Poster, Scheme, Shades } from 'material-theme-builder/react'
import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import { pmndrsMtb } from '../../registry/md3-base/md3'
import { ink, nearestIn, rampsOf } from './palette'

/** The seven brand colours, in the seed's order — lime first, since it is the one that ships. */
const BRAND = pmndrsMtb.customColors
const HUES = BRAND.map(({ name }) => name)
const hexOf = (hue: string) => BRAND.find(({ name }) => name === hue)!.hex
const cap = (word: string) => word[0].toUpperCase() + word.slice(1)

/**
 * "Tint neutrals": a neutral seed at the lime's hue (124), chroma 48, in place of
 * the shipped warm grey. Under Color match a neutral ramp gets an eighth of its
 * seed's chroma, so surfaces and body text go to the lime's hue at chroma 6.
 */
const TINTED_NEUTRAL = '#b1cc63'

/** MD3's three contrast levels. Standard is what the registry ships. */
const CONTRASTS = { standard: 0, medium: 0.5, high: 1 }
type Contrast = keyof typeof CONTRASTS

/** Secondary and tertiary are `auto` (MD3 derives them from the primary) or a brand hue. */
type Role = 'secondary' | 'tertiary'
const ROLES: Role[] = ['secondary', 'tertiary']

type State = {
  mode: 'light' | 'dark'
  contrast: Contrast
  primary: string
  secondary: string
  tertiary: string
  /** Keep primary, secondary and tertiary on different brand hues. */
  unique: boolean
  /** Seed neutral at the lime's hue instead of the shipped warm grey. */
  tint: boolean
  /** Harmonize the brand colours toward the primary, instead of keeping their exact hex as the registry ships. */
  harmonize: boolean
}

const hueName = (key: string) => (key === 'auto' ? 'Auto' : cap(key))

/**
 * With Unique on, a seeded secondary or tertiary may not share the primary's
 * hue or each other's. Changing the primary (or switching Unique on) onto a
 * taken hue moves the role that now clashes to the next free brand hue, in
 * toolbar order. `auto` never clashes. Returns the settled state and a
 * sentence saying what moved.
 */
function keepUnique(state: State): [State, string] {
  if (!state.unique) return [state, '']
  const next = { ...state }
  const moved: string[] = []
  const settle = (which: Role, others: string[]) => {
    if (next[which] === 'auto' || !others.includes(next[which])) return
    const was = next[which]
    next[which] = HUES.find((hue) => !others.includes(hue))!
    moved.push(`${which} from ${hueName(was)} to ${hueName(next[which])}`)
  }
  settle('secondary', [next.primary, next.tertiary].filter((hue) => hue !== 'auto'))
  settle('tertiary', [next.primary, next.secondary].filter((hue) => hue !== 'auto'))
  return [next, moved.length ? `Moved ${moved.join(' and ')} to keep the colors unique.` : '']
}

/** The four SVGs the `logo` registry item installs, in the order it lists them. */
const LOGOS = [
  ['logo_complete.svg', 'Complete', 'The full mark'],
  ['logo_idle.svg', 'Idle', 'The resting state'],
  ['logo_animated.svg', 'Animated', 'Idle → complete, once'],
  ['logo_loading.svg', 'Loading', 'Each corner and back, looping'],
]

export function App() {
  const [state, setState] = useState<State>(() => ({
    // Mode opens on the viewer's system setting.
    mode: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    contrast: 'standard',
    primary: 'lime',
    secondary: 'auto',
    tertiary: 'auto',
    unique: true,
    tint: false,
    harmonize: false,
  }))
  const [lastMove, setLastMove] = useState('')
  const change = (patch: Partial<State>) => {
    const [next, moved] = keepUnique({ ...state, ...patch })
    setState(next)
    setLastMove(moved)
  }

  // `.dark` on <html> is what `<Mtb>` keys the dark scheme on, for the page
  // chrome as for the poster.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.mode === 'dark')
  }, [state.mode])

  const config = useMemo(
    () => ({
      ...pmndrsMtb,
      source: hexOf(state.primary),
      contrast: CONTRASTS[state.contrast],
      neutral: state.tint ? TINTED_NEUTRAL : pmndrsMtb.neutral,
      secondary: state.secondary === 'auto' ? undefined : hexOf(state.secondary),
      tertiary: state.tertiary === 'auto' ? undefined : hexOf(state.tertiary),
      customColors: BRAND.map((color) => ({ ...color, blend: state.harmonize })),
    }),
    [state.primary, state.contrast, state.tint, state.secondary, state.tertiary, state.harmonize]
  )
  const ramps = useMemo(() => rampsOf(config), [config])

  // 'Primary (Lime)', 'Secondary (Auto)'.
  const roleTitle = (which: 'primary' | Role) => `${cap(which)} (${hueName(state[which])})`
  const seeded = ROLES.filter((which) => state[which] !== 'auto')
  // The primary's hue, and a brand hue picked as secondary or tertiary, show as
  // that role instead, so they drop out of the scheme's custom-colour rows and
  // the brand swatches: the seven brand colours, each once. The ramps still
  // show every one.
  const picked = new Set([state.primary, ...seeded.map((which) => state[which])])
  const customs = config.customColors.filter(({ name }) => !picked.has(name))

  const nearest = [
    { label: roleTitle('primary'), authored: config.source, ...nearestIn(config.source, ramps.primary) },
    ...seeded.map((which) => ({ label: roleTitle(which), authored: hexOf(state[which]), ...nearestIn(hexOf(state[which]), ramps[which]) })),
    ...customs.map(({ name, hex }) => ({ label: cap(name), authored: hex, ...nearestIn(hex, ramps[name]) })),
  ]

  const taken = (which: Role) => (state.unique ? [state.primary, state[which === 'secondary' ? 'tertiary' : 'secondary']] : [])
  const role = (which: Role) => (state[which] === 'auto' ? `${which} from the primary` : `${hueName(state[which])} ${which}`)
  const summary = [
    `${cap(state.primary)} (${config.source}) primary, ${role('secondary')}, ${role('tertiary')}.`,
    `${cap(state.contrast)} contrast${state.tint ? ', tinted neutrals' : ''}, ${state.harmonize ? 'brand colors harmonized toward the primary.' : 'exact brand colors.'}`,
    lastMove,
  ]
    .filter(Boolean)
    .join(' ')

  // A fresh query string loads the SVG as a new document, so its animation starts over.
  const [replays, setReplays] = useState(0)

  return (
    <Mtb {...config}>
      <aside
        aria-labelledby="builder-title"
        className="fixed top-4 left-4 z-3 grid max-h-[calc(100vh-32px)] w-81 gap-3.5 overflow-y-auto rounded-[14px] border border-outline-variant bg-surface-container-high p-4.5 font-mono shadow-[0_12px_32px_rgba(0,0,0,.18)] max-[900px]:static max-[900px]:mx-4 max-[900px]:mt-4 max-[900px]:max-h-none max-[900px]:w-auto max-[900px]:shadow-none"
      >
        <h1 id="builder-title" className="m-0 font-sans text-xl leading-tight tracking-[-.01em]">
          Poimandres Theme Builder
        </h1>
        <Field label="Mode">
          <Segmented options={{ light: 'Light', dark: 'Dark' }} value={state.mode} onChange={(mode) => change({ mode })} />
        </Field>
        <Field label="Contrast">
          <Segmented options={{ standard: 'Standard', medium: 'Medium', high: 'High' }} value={state.contrast} onChange={(contrast) => change({ contrast })} />
        </Field>
        <Field label={`Primary Color: ${hueName(state.primary)}`}>
          <Swatches value={state.primary} onChange={(primary) => change({ primary })} />
        </Field>
        {ROLES.map((which) => (
          <Field key={which} label={`${cap(which)} Color: ${hueName(state[which])}`}>
            <Swatches value={state[which]} disabled={taken(which)} onChange={(hue) => change({ [which]: hue })}>
              <button
                title="Derived from the primary"
                aria-pressed={state[which] === 'auto'}
                onClick={() => change({ [which]: 'auto' })}
                className="h-6.5 cursor-pointer rounded-full border border-dashed border-outline-variant px-2.5 text-xs aria-pressed:border-solid aria-pressed:border-on-surface aria-pressed:bg-on-surface aria-pressed:text-surface-container-high"
              >
                Auto
              </button>
            </Swatches>
          </Field>
        ))}
        <div className="grid gap-2.5">
          <Check title="Keep primary, secondary and tertiary on different brand hues" checked={state.unique} onChange={(unique) => change({ unique })}>
            Unique colors
          </Check>
          <Check
            title="Seed the neutral at the lime's hue: surfaces and body text take a hint of it, instead of the warm grey that ships"
            checked={state.tint}
            onChange={(tint) => change({ tint })}
          >
            Tint neutrals
          </Check>
          <Check
            title="Checked: brand colors are harmonized toward the primary. Unchecked: they keep their exact hex."
            checked={state.harmonize}
            onChange={(harmonize) => change({ harmonize })}
          >
            Harmonize colors
          </Check>
        </div>
        <p aria-live="polite" className="m-0 border-t border-outline-variant pt-3 text-xs leading-[1.45] text-on-surface-variant">
          {summary}
        </p>
      </aside>

      <main className="pt-8 pr-10 pl-[380px] max-[900px]:px-4">
        <Poster>
          <Scheme
            theme={state.mode}
            title={state.mode === 'light' ? 'Light Scheme' : 'Dark Scheme'}
            fixedAccents={false}
            customColors={customs}
            className="rounded-2xl"
          />
        </Poster>

        <Heading>Tonal reference ramps (--md-ref-palette-*)</Heading>
        <Legend>
          Scheme-independent tones the roles alias onto — identical in light and dark. Neutral is a warm grey; Neutral-Variant carries a hint of the lime.
          {state.tint && ' Tint neutrals seeds Neutral at the lime’s hue too.'}
        </Legend>
        {/* Every ramp, even where a brand colour repeats as the primary, secondary or tertiary. */}
        <Poster>
          <Shades customColors={config.customColors} />
        </Poster>

        <Heading>Poimandres brand colors → nearest MD3 ramp step</Heading>
        <Legend>
          For each brand colour, the closest step in its own ramp (by CIELAB ΔE). Each swatch puts the brand hex (left) against the generated MD3 step (right); the
          big number is that step’s tone.
        </Legend>
        <div className="flex flex-wrap gap-3">
          {nearest.map((n) => (
            <div key={n.label} className="w-42 overflow-hidden rounded-lg border border-outline-variant">
              {/* Brand and generated colours touching, so the eye compares them directly. */}
              <div className="grid h-18 grid-cols-2">
                <div className="flex min-w-0 flex-col justify-between px-2 py-1.5" style={{ background: n.authored, color: ink(n.authored) }}>
                  <Caption>Brand</Caption>
                </div>
                <div className="flex min-w-0 flex-col justify-between px-2 py-1.5" style={{ background: n.hex, color: ink(n.hex) }}>
                  <Caption>M3</Caption>
                  <span className="self-end text-lg font-black tabular-nums">{n.tone}</span>
                </div>
              </div>
              <div className="flex flex-col gap-0.75 bg-surface-container-high px-2.25 py-1.75">
                <span className="text-xs font-semibold break-words">{n.label}</span>
                <span className="grid grid-cols-2 font-mono text-[11px] text-on-surface-variant tabular-nums">
                  <span>{n.authored.toLowerCase()}</span>
                  <span>{n.hex}</span>
                </span>
                <span className="text-[10px] text-on-surface-variant tabular-nums">
                  ΔE {n.de} · tone {n.tone}
                </span>
              </div>
            </div>
          ))}
        </div>
      </main>

      <section className="pt-2 pr-10 pb-16 pl-[380px] max-[900px]:px-4">
        <Heading>
          Logo (registry item <code className="font-mono">logo</code>)
        </Heading>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          {LOGOS.map(([file, label, note]) => (
            <figure key={file} className="m-0 flex flex-col overflow-hidden rounded-lg border border-outline-variant">
              <img
                src={file === 'logo_animated.svg' && replays ? `/${file}?${replays}` : `/${file}`}
                alt={`pmndrs logo, ${label.toLowerCase()}`}
                width="600"
                height="600"
                className="block aspect-square h-auto w-full"
              />
              <figcaption className="flex flex-1 flex-col gap-0.5 bg-surface-container-high px-2.5 py-2">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{label}</span>
                  {file === 'logo_animated.svg' && (
                    <button
                      onClick={() => setReplays(replays + 1)}
                      className="cursor-pointer rounded-full border border-outline-variant px-2.5 py-0.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-surface"
                    >
                      Replay
                    </button>
                  )}
                </span>
                <span className="text-[11px] text-on-surface-variant">
                  {note} · {file}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
        <Legend className="mt-3">
          The animation is CSS inside each SVG, so a plain &lt;img&gt; plays it. Under reduced motion the one-shot holds still and the loader only fades.
        </Legend>
      </section>
    </Mtb>
  )
}

function Heading({ children }: { children: ReactNode }) {
  return <h2 className="mt-9 mb-3 text-[13px] tracking-[.08em] text-on-surface-variant uppercase">{children}</h2>
}

function Legend({ className, ...props }: ComponentProps<'p'>) {
  return <p className={`mb-3 text-xs text-on-surface-variant ${className ?? ''}`} {...props} />
}

function Caption({ children }: { children: ReactNode }) {
  return <span className="text-[10px] font-semibold tracking-[.04em] uppercase opacity-85">{children}</span>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="grid gap-1.5">
      <span className="text-xs text-on-surface-variant">{label}</span>
      {children}
    </div>
  )
}

/** Segmented choices, full width in the sheet. */
function Segmented<T extends string>({ options, value, onChange }: { options: Record<T, string>; value: T; onChange: (value: T) => void }) {
  return (
    <div className="grid auto-cols-fr grid-flow-col rounded-full border border-outline-variant p-0.5">
      {(Object.entries(options) as [T, string][]).map(([key, label]) => (
        <button
          key={key}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className="cursor-pointer rounded-full px-2 py-1.25 text-[13px] aria-pressed:bg-on-surface aria-pressed:font-semibold aria-pressed:text-surface-container-high focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-surface"
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/** Colour pickers: one swatch per brand hue; the name is on hover and in the label. */
function Swatches({
  value,
  disabled = [],
  onChange,
  children,
}: {
  value: string
  disabled?: string[]
  onChange: (hue: string) => void
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {BRAND.map(({ name, hex }) => (
        <button
          key={name}
          title={`${cap(name)} ${hex}`}
          aria-label={cap(name)}
          aria-pressed={value === name}
          disabled={disabled.includes(name)}
          onClick={() => onChange(name)}
          style={{ background: hex }}
          className="size-6.5 cursor-pointer rounded-full border-2 border-surface-container-high p-0 shadow-[0_0_0_1px_var(--md-sys-color-outline-variant)] disabled:cursor-not-allowed disabled:opacity-20 aria-pressed:shadow-[0_0_0_2px_var(--md-sys-color-on-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-surface"
        />
      ))}
      {children}
    </div>
  )
}

function Check({ title, checked, onChange, children }: { title: string; checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <label title={title} className="flex cursor-pointer items-center gap-2 text-[13px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="m-0 size-4 cursor-pointer accent-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-surface"
      />
      {children}
    </label>
  )
}
