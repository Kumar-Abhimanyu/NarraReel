import { useEffect, useMemo, useRef, useState } from 'react'
import { api, voiceSampleUrl, watchJob } from '../api/client'
import type { Quality, Voice } from '../api/types'
import { Badge, Banner, Button, Card, CodeWindow, ProgressBar, QualityBadge, Slider, Tabs } from '../components/ui'
import { speedQuality } from '../lib/time'
import { useCatalog } from '../state/catalog'
import { useDraft } from '../state/project'
import { useSession } from '../state/session'
import { MyVoicePanel } from './MyVoicePanel'

type Mode = 'ai' | 'mine'
type EngineFilter = 'all' | 'edge' | 'kokoro'

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  hi: 'Hindi',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ja: 'Japanese',
  zh: 'Chinese',
  ar: 'Arabic',
  ru: 'Russian',
  ko: 'Korean',
  bn: 'Bengali',
  ta: 'Tamil',
  te: 'Telugu',
  mr: 'Marathi',
  ur: 'Urdu',
  gu: 'Gujarati',
}

const PAGE = 48

/** Some names already read "Heart (US, female)"; do not repeat the accent and gender under them. */
function voiceMeta(voice: Voice): string {
  const named = voice.accent != null && voice.name.includes(`(${voice.accent}`)
  return [
    named ? null : voice.accent,
    named || voice.gender === 'unknown' ? null : voice.gender,
    voice.language,
  ]
    .filter(Boolean)
    .join(', ')
}

function VoiceCard({
  voice,
  selected,
  playing,
  onUse,
  onPlay,
}: {
  voice: Voice
  selected: boolean
  playing: boolean
  onUse: () => void
  onPlay: () => void
}) {
  return (
    <article className={`voice ${selected ? 'voice--on' : ''}`}>
      <div className="voice__head">
        <h3 className="voice__name">{voice.name}</h3>
        <Badge tone={voice.offline ? 'good' : 'plain'}>{voice.offline ? 'Offline' : 'Online'}</Badge>
      </div>
      <p className="voice__meta">
        {voiceMeta(voice)}
      </p>
      <div className="voice__actions">
        <Button variant="text" onClick={onPlay} aria-label={`${playing ? 'Stop' : 'Play'} sample of ${voice.name}`}>
          {playing ? 'Stop sample' : 'Play sample'}
        </Button>
        <Button variant={selected ? 'primary' : 'secondary'} aria-pressed={selected} onClick={onUse}>
          {selected ? 'Selected' : 'Use'}
        </Button>
      </div>
    </article>
  )
}

function EnginePanel() {
  const engines = useCatalog((s) => s.engines)
  const refreshEngines = useCatalog((s) => s.refreshEngines)
  const refreshVoices = useCatalog((s) => s.refreshVoices)
  const toast = useSession((s) => s.toast)
  const [progress, setProgress] = useState<{ fraction: number; message: string } | null>(null)
  const kokoro = engines.find((e) => e.id === 'kokoro')
  const stop = useRef<(() => void) | null>(null)
  useEffect(() => () => stop.current?.(), [])

  if (!kokoro || (kokoro.status.available && !kokoro.status.needs_download)) return null

  const download = async () => {
    try {
      const { task_id } = await api.prepareEngine('kokoro')
      setProgress({ fraction: 0, message: 'Starting download' })
      stop.current = watchJob(
        task_id,
        (e) => setProgress({ fraction: e.fraction, message: e.message }),
        async (status) => {
          setProgress(null)
          if (status.status === 'done') {
            toast('success', 'Offline voices are ready.')
            await Promise.all([refreshEngines(), refreshVoices()])
          } else toast('error', status.error ?? 'The download did not finish.')
        },
        () => {
          setProgress(null)
          toast('error', 'Lost connection while downloading. Try again.')
        },
        'tasks',
      )
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not start the download.')
    }
  }

  if (!kokoro.status.available) {
    return (
      <Card className="stack">
        <h2 className="title">Offline voices need one more install</h2>
        <p className="muted">They run fully on your computer, with no internet after a one-time model download.</p>
        <CodeWindow title="Terminal">{'pip install "narrareel[offline]"'}</CodeWindow>
      </Card>
    )
  }
  return (
    <Card className="stack">
      <h2 className="title">Download the offline voices</h2>
      <p className="muted">
        About {kokoro.status.download_size_mb} MB, once. After that they work without internet.
      </p>
      {progress ? (
        <>
          <ProgressBar fraction={progress.fraction} label="Download progress" />
          <p className="field__hint">{progress.message}</p>
        </>
      ) : (
        <div>
          <Button variant="primary" onClick={download}>
            Download ({kokoro.status.download_size_mb} MB)
          </Button>
        </div>
      )}
    </Card>
  )
}

export function VoiceStep() {
  const { voice, speed, energy, script, targetSeconds, patch } = useDraft()
  const voices = useCatalog((s) => s.voices)
  const health = useCatalog((s) => s.health)
  const toast = useSession((s) => s.toast)
  const [mode, setMode] = useState<Mode>('ai')
  const [engine, setEngine] = useState<EngineFilter>('all')
  const [lang, setLang] = useState('en')
  const [gender, setGender] = useState<'all' | 'female' | 'male'>('all')
  const [limit, setLimit] = useState(PAGE)
  const [playing, setPlaying] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)

  useEffect(() => () => audio.current?.pause(), [])
  useEffect(() => {
    setLimit(PAGE)
  }, [engine, lang, gender])

  const languages = useMemo(() => {
    const seen = new Set(voices.map((v) => v.language.split('-')[0]))
    return [...seen].sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : a.localeCompare(b)))
  }, [voices])

  const filtered = useMemo(
    () =>
      voices.filter(
        (v) =>
          (engine === 'all' || v.engine === engine) &&
          (lang === 'all' || v.language.startsWith(lang)) &&
          (gender === 'all' || v.gender === gender),
      ),
    [voices, engine, lang, gender],
  )

  const stopAudio = () => {
    audio.current?.pause()
    audio.current = null
    setPlaying(null)
  }

  const play = (v: Voice) => {
    if (playing === v.ref) return stopAudio()
    stopAudio()
    const el = new Audio(voiceSampleUrl(v.engine, v.id))
    audio.current = el
    setPlaying(v.ref)
    el.onended = () => setPlaying(null)
    el.onerror = () => {
      setPlaying(null)
      toast('error', `Could not play ${v.name}. Check your connection or pick another voice.`)
    }
    void el.play().catch(() => setPlaying(null))
  }

  const preview = async () => {
    stopAudio()
    setPreviewing(true)
    try {
      const blob = await api.voicePreview(script.trim() || 'Every great video starts with a simple idea.', {
        engine: voice.engine,
        voice_id: voice.voice_id,
        speed,
        energy,
      })
      const el = new Audio(URL.createObjectURL(blob))
      audio.current = el
      el.onended = () => URL.revokeObjectURL(el.src)
      await el.play()
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not generate the preview.')
    } finally {
      setPreviewing(false)
    }
  }

  const quality: Quality = speedQuality(speed)
  const shown = filtered.slice(0, limit)

  return (
    <div className="stack stack--lg">
      <header className="step-head">
        <h1 className="display">Choose the voice</h1>
        <p className="lede">Free AI voices today. Your own cloned voice, with adjustable energy, lives in the second tab.</p>
      </header>

      <Tabs
        label="Voice source"
        value={mode}
        onChange={setMode}
        items={[
          { id: 'ai', label: 'AI voices' },
          { id: 'mine', label: 'My voice', disabled: !!health?.demo, hint: health?.demo ? 'Not available in the demo' : undefined },
        ]}
      />

      {mode === 'mine' ? (
        <MyVoicePanel />
      ) : (
        <>
          <EnginePanel />
          <Card className="stack">
            <div className="filters">
              <div className="field">
                <label className="field__label" htmlFor="engine-filter">
                  Where it runs
                </label>
                <select id="engine-filter" className="select" value={engine} onChange={(e) => setEngine(e.target.value as EngineFilter)}>
                  <option value="all">Online and offline</option>
                  <option value="edge">Online (Microsoft Edge)</option>
                  <option value="kokoro">Offline (Kokoro)</option>
                </select>
              </div>
              <div className="field">
                <label className="field__label" htmlFor="lang-filter">
                  Language
                </label>
                <select id="lang-filter" className="select" value={lang} onChange={(e) => setLang(e.target.value)}>
                  <option value="all">All languages</option>
                  {languages.map((l) => (
                    <option key={l} value={l}>
                      {LANGUAGE_NAMES[l] ?? l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field__label" htmlFor="gender-filter">
                  Voice
                </label>
                <select id="gender-filter" className="select" value={gender} onChange={(e) => setGender(e.target.value as typeof gender)}>
                  <option value="all">Any</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </div>
            </div>

            {voices.length === 0 ? (
              <p className="muted">Loading voices…</p>
            ) : filtered.length === 0 ? (
              <p className="muted">No voices match those filters. Try another language or where it runs.</p>
            ) : (
              <div className="voice-grid">
                {shown.map((v) => (
                  <VoiceCard
                    key={v.ref}
                    voice={v}
                    selected={voice.engine === v.engine && voice.voice_id === v.id}
                    playing={playing === v.ref}
                    onUse={() => patch({ voice: { engine: v.engine, voice_id: v.id } })}
                    onPlay={() => play(v)}
                  />
                ))}
              </div>
            )}
            {filtered.length > limit && (
              <div>
                <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
                  Show {Math.min(PAGE, filtered.length - limit)} more of {filtered.length - limit}
                </Button>
              </div>
            )}
          </Card>
        </>
      )}

      <Card className="stack">
        <h2 className="title">Delivery</h2>
        {targetSeconds ? (
          <Banner tone="info" title="Speed follows your target length">
            Clear the target on the duration step to set the speed yourself.
          </Banner>
        ) : (
          <>
            <Slider
              label="Speed"
              value={speed}
              min={0.5}
              max={2}
              step={0.05}
              onChange={(v) => patch({ speed: v })}
              format={(v) => `${v.toFixed(2)}×`}
            />
            <div>
              <QualityBadge quality={quality} />
            </div>
          </>
        )}
        <Slider
          label="Energy"
          value={energy}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => patch({ energy: v })}
          format={(v) => (v < 0.35 ? 'Calm' : v > 0.65 ? 'Hype' : 'Normal')}
          marks={['Calm', 'Normal', 'Hype']}
          hint="Subtle with AI voices. It makes the biggest difference with your own cloned voice."
        />
        <div className="row">
          <Button variant="secondary" busy={previewing} onClick={preview} disabled={!health?.ffmpeg}>
            Preview the first sentences
          </Button>
          <span className="field__hint">Uses your script and the settings above.</span>
        </div>
      </Card>
    </div>
  )
}
