import { useMemo, useRef, useState } from 'react'
import { api, fontPreviewUrl } from '../api/client'
import type { FormatInfo, StylePreset } from '../api/types'
import { Banner, Button, Card, ColorField, Field, Slider, Switch, Tabs } from '../components/ui'
import { usePreviewUrl } from '../hooks/useAsync'
import { LOW_CONTRAST, contrastRatio } from '../lib/color'
import { useCatalog } from '../state/catalog'
import { DEFAULT_DRAFT, effectiveStyle, toProject, useDraft } from '../state/project'
import { useScriptInfo } from '../state/scriptInfo'
import { useSession } from '../state/session'

const FONT_TAGS = [
  { id: 'all', label: 'All' },
  { id: 'bold', label: 'Bold' },
  { id: 'clean', label: 'Clean' },
  { id: 'fun', label: 'Fun' },
  { id: 'handwritten', label: 'Handwritten' },
  { id: 'multilingual', label: 'Multilingual' },
  { id: 'yours', label: 'Yours' },
] as const

const THUMB_TEXT = 'Grind hard every single day.'

function FormatPicker() {
  const formats = useCatalog((s) => s.formats)
  const format = useDraft((s) => s.format)
  const { patch, setCaptions } = useDraft()
  const styles = useCatalog((s) => s.styles)
  const pick = (f: FormatInfo) => {
    patch({ format: f.id })
    // landscape formats default to the classic subtitle look
    if (f.id === 'youtube' && useDraft.getState().captions.preset === 'bold-pop' && styles.some((s) => s.id === f.default_style)) {
      setCaptions({ preset: f.default_style, overrides: {}, font: null })
    }
  }
  return (
    <Card className="stack" as="section">
      <h2 className="title">Format</h2>
      <div className="format-grid" role="radiogroup" aria-label="Video format">
        {formats.map((f) => {
          const on = f.id === format
          const w = f.width ?? 0
          const h = f.height ?? 0
          const box = w && h ? { width: w >= h ? 44 : (44 * w) / h, height: w >= h ? (44 * h) / w : 44 } : null
          return (
            <button key={f.id} type="button" role="radio" aria-checked={on} className={`format ${on ? 'format--on' : ''}`} onClick={() => pick(f)}>
              <span className="format__shape" aria-hidden="true">
                {box ? <span style={{ width: box.width, height: box.height }} /> : <span className="format__audio" />}
              </span>
              <span className="format__name">{f.name}</span>
              <span className="format__size">{w && h ? `${w} × ${h}` : 'No video'}</span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

function FontGrid() {
  const fonts = useCatalog((s) => s.fonts)
  const refreshFonts = useCatalog((s) => s.refreshFonts)
  const styles = useCatalog((s) => s.styles)
  const { captions, setCaptions } = useDraft()
  const { analysis } = useScriptInfo()
  const toast = useSession((s) => s.toast)
  const [tag, setTag] = useState<(typeof FONT_TAGS)[number]['id']>('all')
  const fileRef = useRef<HTMLInputElement>(null)
  const preset = styles.find((s) => s.id === captions.preset)
  const current = captions.font ?? preset?.font.id
  const currentInfo = fonts.find((f) => f.id === current)
  const needsDevanagari =
    (analysis.data?.language_hint === 'hi' || analysis.data?.warnings.some((w) => w.code === 'mixed_scripts')) &&
    currentInfo &&
    !currentInfo.scripts.includes('devanagari')

  const shown = fonts.filter((f) => tag === 'all' || f.tags.includes(tag))

  const upload = async (file: File) => {
    try {
      const info = await api.uploadFont(file)
      await refreshFonts()
      setCaptions({ font: info.id })
      toast('success', `Added ${info.name}. Make sure you may use this font in your videos.`)
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'That font could not be added.')
    }
  }

  return (
    <Card className="stack" as="section">
      <div className="card-head">
        <h2 className="title">Font</h2>
        <input
          ref={fileRef}
          type="file"
          accept=".ttf,.otf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void upload(f)
            e.target.value = ''
          }}
        />
        <Button variant="secondary" onClick={() => fileRef.current?.click()}>
          Add your font
        </Button>
      </div>
      <div className="chip-row" role="group" aria-label="Font style">
        {FONT_TAGS.map((t) => (
          <button key={t.id} type="button" className={`chip ${tag === t.id ? 'chip--on' : ''}`} aria-pressed={tag === t.id} onClick={() => setTag(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {needsDevanagari && (
        <Banner tone="warn" title="This font can't show Hindi">
          Your script has Devanagari text. Choose Noto Sans Devanagari so every character shows.
        </Banner>
      )}
      {shown.length === 0 ? (
        <p className="muted">{tag === 'yours' ? 'No fonts added yet. Add a .ttf or .otf file you have the right to use.' : 'No fonts in this group.'}</p>
      ) : (
        <div className="font-grid" role="radiogroup" aria-label="Caption font">
          {shown.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={f.id === current}
              className={`font-card ${f.id === current ? 'font-card--on' : ''}`}
              onClick={() => setCaptions({ font: f.id })}
            >
              <img className="font-card__img" src={fontPreviewUrl(f.id, 'Your caption')} alt={`Sample text in ${f.name}`} loading="lazy" />
              <span className="font-card__name">{f.name}</span>
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}

function PresetThumb({ preset, format }: { preset: StylePreset; format: FormatInfo | undefined }) {
  const project = useMemo(
    () =>
      toProject({
        ...DEFAULT_DRAFT,
        script: THUMB_TEXT,
        format: format?.id && format.width ? format.id : 'reels',
        captions: { preset: preset.id, overrides: {}, font: null },
      }),
    [preset.id, format],
  )
  const { url } = usePreviewUrl(project, true)
  const pos = (format?.positions[preset.layout.position] ?? 0.62) * 100
  return (
    <span className="preset__thumb" aria-hidden="true">
      {url ? <img src={url} alt="" style={{ objectPosition: `50% ${pos}%`, transformOrigin: `50% ${pos}%` }} /> : <span className="preset__loading" />}
    </span>
  )
}

function PresetGrid() {
  const styles = useCatalog((s) => s.styles)
  const formats = useCatalog((s) => s.formats)
  const { captions, setCaptions, format } = useDraft()
  const fmt = formats.find((f) => f.id === format)
  return (
    <Card className="stack" as="section">
      <h2 className="title">Style</h2>
      <div className="preset-grid" role="radiogroup" aria-label="Caption style">
        {styles.map((s) => {
          const on = s.id === captions.preset
          return (
            <button key={s.id} type="button" role="radio" aria-checked={on} className={`preset ${on ? 'preset--on' : ''}`} onClick={() => setCaptions({ preset: s.id, overrides: {}, font: null })}>
              <PresetThumb preset={s} format={fmt} />
              <span className="preset__name">{s.name}</span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

const PLACE_ROWS = [
  { id: 'top', label: 'top' },
  { id: 'middle', label: 'middle' },
  { id: 'lower_middle', label: 'lower middle' },
  { id: 'bottom', label: 'bottom' },
] as const
const PLACE_COLS = [
  { id: 'left', label: 'left' },
  { id: 'center', label: 'centre' },
  { id: 'right', label: 'right' },
] as const

/** A small map of the frame: tap where the captions should sit. */
function PlacementPad({
  position,
  align,
  wide,
  onPick,
}: {
  position: StylePreset['layout']['position']
  align: StylePreset['layout']['align_x']
  wide: boolean
  onPick: (position: StylePreset['layout']['position'], align: StylePreset['layout']['align_x']) => void
}) {
  return (
    <div className={`placement ${wide ? 'placement--wide' : ''}`} role="radiogroup" aria-label="Caption placement">
      {PLACE_ROWS.map((row) =>
        PLACE_COLS.map((col) => {
          const on = row.id === position && col.id === align
          return (
            <button
              key={`${row.id}-${col.id}`}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${row.label}, ${col.label}`}
              className="placement__cell"
              style={wide ? { aspectRatio: '16 / 9' } : undefined}
              onClick={() => onPick(row.id, col.id)}
            />
          )
        }),
      )}
    </div>
  )
}

function FineTune() {
  const styles = useCatalog((s) => s.styles)
  const refreshStyles = useCatalog((s) => s.refreshStyles)
  const { captions, setOverride, clearOverrides, setCaptions, background, format } = useDraft()
  const formats = useCatalog((s) => s.formats)
  const fmt = formats.find((f) => f.id === format)
  const frameW = fmt?.width ?? 1080
  const xRange = Math.round((frameW * 0.35) / 10) * 10
  const toast = useSession((s) => s.toast)
  const [name, setName] = useState('')
  const base = styles.find((s) => s.id === captions.preset)
  const eff = effectiveStyle(base, captions.overrides)
  const dirty = Object.keys(captions.overrides).length > 0 || captions.font !== null
  if (!eff) return null

  const highlightMode: 'colour' | 'box' | 'none' = eff.highlight.mode === 'none' ? 'none' : eff.highlight.box ? 'box' : 'colour'
  const setHighlight = (m: typeof highlightMode) => {
    setOverride('highlight.mode', m === 'none' ? 'none' : eff.highlight.mode === 'none' ? 'word' : eff.highlight.mode)
    setOverride('highlight.box', m === 'box')
  }

  // a highlight nobody can see looks like a broken one, so say so
  const backdrop = background.type === 'solid' ? background.color : null
  let highlightWarning: string | null = null
  if (highlightMode === 'box') {
    const c = backdrop ? contrastRatio(eff.highlight.box_color, backdrop) : null
    if (c !== null && c < LOW_CONTRAST) highlightWarning = 'This box is almost the same colour as the background, so you will not see it. Pick a brighter colour.'
  } else if (highlightMode === 'colour') {
    const c = contrastRatio(eff.colors.highlight, eff.colors.text)
    if (c !== null && c < 1.1) highlightWarning = 'The highlight colour matches the text colour, so the spoken word will not stand out.'
  }

  const save = async () => {
    try {
      const saved = await api.saveStyle({ name: name.trim(), preset: captions.preset, overrides: captions.overrides, font: captions.font })
      await refreshStyles()
      setCaptions({ preset: saved.id, overrides: {}, font: null })
      setName('')
      toast('success', `Saved “${saved.name}”. It now appears with the other styles.`)
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not save the style.')
    }
  }

  return (
    <Card className="stack" as="section">
      <details className="fine" open={dirty}>
        <summary className="title">Fine-tune</summary>
        <div className="fine__body stack stack--lg">
          <div className="color-row">
            <ColorField label="Text" value={eff.colors.text} onChange={(v) => setOverride('colors.text', v)} />
            {highlightMode !== 'box' && (
              <ColorField label="Highlight" value={eff.colors.highlight} onChange={(v) => setOverride('colors.highlight', v)} />
            )}
            <ColorField label="Outline" value={eff.colors.outline} onChange={(v) => setOverride('colors.outline', v)} />
          </div>

          <Field label="Highlight the spoken word with">
            <Tabs
              label="Highlight style"
              value={highlightMode}
              onChange={setHighlight}
              items={[
                { id: 'colour', label: 'Colour' },
                { id: 'box', label: 'Box' },
                { id: 'none', label: 'Nothing' },
              ]}
            />
          </Field>
          {highlightMode === 'box' && (
            <ColorField label="Box" value={eff.highlight.box_color} onChange={(v) => setOverride('highlight.box_color', v)} />
          )}
          {highlightWarning && <p className="field__hint">{highlightWarning}</p>}

          <div className="grid-2">
            <Slider label="Font size" value={eff.font.size} min={40} max={220} step={2} onChange={(v) => setOverride('font.size', v)} />
            <Slider label="Outline width" value={eff.outline_width} min={0} max={20} step={0.5} onChange={(v) => setOverride('outline_width', v)} />
            <Slider label="Words per caption" value={eff.layout.words_per_chunk} min={1} max={8} step={1} onChange={(v) => setOverride('layout.words_per_chunk', v)} />
          </div>

          <Switch label="Capital letters" checked={eff.font.uppercase} onChange={(v) => setOverride('font.uppercase', v)} />

          <Field label="Where the text sits">
            <div className="placement-row">
              <PlacementPad
                position={eff.layout.position}
                align={eff.layout.align_x}
                wide={!!fmt && !!fmt.width && !!fmt.height && fmt.width > fmt.height}
                onPick={(p, a) => {
                  setOverride('layout.position', p)
                  setOverride('layout.align_x', a)
                }}
              />
              <div className="stack">
                <Slider label="Move left / right" value={eff.layout.offset_x} min={-xRange} max={xRange} step={10} onChange={(v) => setOverride('layout.offset_x', v)} format={(v) => `${v > 0 ? '+' : ''}${v} px`} />
                <Slider label="Move up / down" value={eff.layout.offset_y} min={-400} max={400} step={10} onChange={(v) => setOverride('layout.offset_y', v)} format={(v) => `${v > 0 ? '+' : ''}${v} px`} />
              </div>
            </div>
            <p className="field__hint">Pick a spot, then nudge it. Captions stay inside the platform safe zones unless you move them out.</p>
          </Field>
          <div className="grid-2">
            <Field label="Lines">
              <Tabs
                label="Maximum lines"
                value={String(eff.layout.max_lines) as '1' | '2'}
                onChange={(v) => setOverride('layout.max_lines', Number(v))}
                items={[
                  { id: '1', label: '1 line' },
                  { id: '2', label: '2 lines' },
                ]}
              />
            </Field>
            <Field label="Entrance">
              <Tabs
                label="Caption entrance"
                value={eff.animation.in}
                onChange={(v) => setOverride('animation.in', v)}
                items={[
                  { id: 'none', label: 'None' },
                  { id: 'pop', label: 'Pop' },
                  { id: 'bounce', label: 'Bounce' },
                  { id: 'fade', label: 'Fade' },
                ]}
              />
            </Field>
          </div>

          <div className="fine__foot">
            <Button variant="secondary" disabled={!dirty} onClick={clearOverrides}>
              Reset to preset
            </Button>
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault()
                if (name.trim()) void save()
              }}
            >
              <div className="field field--grow">
                <label className="field__label" htmlFor="preset-name">
                  Save these settings as
                </label>
                <input id="preset-name" className="input" value={name} maxLength={60} placeholder="My bold look" onChange={(e) => setName(e.target.value)} />
              </div>
              <Button variant="secondary" type="submit" disabled={!name.trim()}>
                Save style
              </Button>
            </form>
          </div>
        </div>
      </details>
    </Card>
  )
}

function BackgroundPicker() {
  const { background, setBackground, setExport } = useDraft()
  const toast = useSession((s) => s.toast)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const type = background.type

  const upload = async (file: File) => {
    setBusy(true)
    try {
      const r = await api.uploadBackground(file)
      setBackground({ type: r.type, path: r.path, fileName: r.name })
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'That file could not be used.')
    } finally {
      setBusy(false)
    }
  }

  const choose = (t: typeof type) => {
    setBackground({ type: t })
    if (t === 'transparent') setExport({ video: 'webm' })
    else setExport({ video: 'mp4' })
  }

  return (
    <Card className="stack" as="section">
      <h2 className="title">Background</h2>
      <Tabs
        label="Background type"
        value={type}
        onChange={choose}
        items={[
          { id: 'solid', label: 'Colour' },
          { id: 'transparent', label: 'Transparent overlay' },
          { id: 'image', label: 'Image' },
          { id: 'video', label: 'Video loop' },
        ]}
      />
      {type === 'solid' && <ColorField label="Background colour" value={background.color} onChange={(v) => setBackground({ color: v })} />}
      {type === 'transparent' && (
        <p className="muted">
          Exports captions on a transparent background so you can lay them over footage in CapCut, Premiere or DaVinci
          Resolve. The preview shows a neutral grey instead.
        </p>
      )}
      {(type === 'image' || type === 'video') && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept={type === 'image' ? 'image/png,image/jpeg,image/webp' : 'video/mp4,video/quicktime,video/webm'}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void upload(f)
              e.target.value = ''
            }}
          />
          <div className="row">
            <Button variant="secondary" busy={busy} onClick={() => fileRef.current?.click()}>
              {background.fileName && background.path ? 'Replace file' : `Choose ${type === 'image' ? 'an image' : 'a video'}`}
            </Button>
            <span className="muted">{background.path ? background.fileName : 'The file is used as a full-frame background.'}</span>
          </div>
          <div className="grid-2">
            <Slider label="Blur" value={background.blur} min={0} max={30} step={1} onChange={(v) => setBackground({ blur: v })} />
            <Slider label="Darken" value={background.darken} min={0} max={1} step={0.05} onChange={(v) => setBackground({ darken: v })} format={(v) => `${Math.round(v * 100)}%`} />
          </div>
        </>
      )}
    </Card>
  )
}

export function CaptionsStep() {
  return (
    <div className="stack stack--lg">
      <header className="step-head">
        <h1 className="display">Style the captions</h1>
        <p className="lede">The preview frame is rendered from your own script and updates as you choose.</p>
      </header>
      <FormatPicker />
      <PresetGrid />
      <FontGrid />
      <FineTune />
      <BackgroundPicker />
    </div>
  )
}
