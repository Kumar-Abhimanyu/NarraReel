import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { DurationOption } from '../api/types'
import { Badge, Banner, Button, Card, QualityBadge, Stat } from '../components/ui'
import { QUICK_TARGETS, formatDuration } from '../lib/time'
import { useDraft } from '../state/project'
import type { DurationOptionKind } from '../state/project'
import { useScriptInfo } from '../state/scriptInfo'

const TITLES: Record<DurationOption['kind'], string> = {
  edit_script: 'Edit the script',
  adjust_delivery: 'Adjust the delivery',
  speed_only: 'Change the speed only',
}

function describe(o: DurationOption): string {
  if (o.kind === 'edit_script') return o.message
  const bits = [`Speed ${(o.speed ?? 1).toFixed(2)}×`]
  if (o.kind === 'adjust_delivery') bits.push(`pauses ×${(o.pause_scale ?? 1).toFixed(2)}`)
  return `${bits.join(', ')}. ${o.message}`
}

export function DurationStep() {
  const { targetSeconds, targetText, durationOption, speed, patch } = useDraft()
  const { plan, analysis } = useScriptInfo()
  const navigate = useNavigate()
  const [custom, setCustom] = useState(targetText)
  const [customError, setCustomError] = useState<string | null>(null)
  const a = analysis.data
  // while a new plan loads, the previous one belongs to a different target: do not show it
  const planData = plan.data?.plan
  const p = planData && (planData.target_seconds ?? null) === (targetSeconds ?? null) ? planData : undefined

  useEffect(() => {
    setCustom(targetText)
  }, [targetText])

  const setTarget = (seconds: number | null, text = '') =>
    patch({ targetSeconds: seconds, targetText: text, durationOption: null, ...(seconds ? { speed: 1 } : {}) })

  const applyCustom = async () => {
    if (!custom.trim()) return setTarget(null)
    try {
      const r = await api.parseDuration(custom)
      setCustomError(null)
      setTarget(r.seconds, custom)
    } catch (e) {
      setCustomError(e instanceof Error ? e.message : 'That is not a valid length.')
    }
  }

  const natural = a?.estimate.total_seconds ?? null
  const diff = natural !== null && targetSeconds ? targetSeconds - natural : null
  const selected: DurationOptionKind = durationOption ?? 'adjust_delivery'

  if (!a || a.word_count === 0) {
    return (
      <div className="stack stack--lg">
        <header className="step-head">
          <h1 className="display">How long should it run?</h1>
        </header>
        <Banner tone="info" title="Add a script first" action={<Button variant="secondary" onClick={() => navigate('/script')}>Go to script</Button>}>
          NarraReel needs your words to tell you how long they take to say.
        </Banner>
      </div>
    )
  }

  return (
    <div className="stack stack--lg">
      <header className="step-head">
        <h1 className="display">How long should it run?</h1>
        <p className="lede">Pick a target and NarraReel hits it to the second, or skip the target and set a speed.</p>
      </header>

      <Card className="stack">
        <div className="chip-row" role="group" aria-label="Target length">
          {QUICK_TARGETS.map((t) => (
            <button
              key={t.seconds}
              type="button"
              className={`chip ${targetSeconds === t.seconds ? 'chip--on' : ''}`}
              aria-pressed={targetSeconds === t.seconds}
              onClick={() => setTarget(t.seconds, t.label.replace(' ', ''))}
            >
              {t.label}
            </button>
          ))}
          <button type="button" className={`chip ${targetSeconds === null ? 'chip--on' : ''}`} aria-pressed={targetSeconds === null} onClick={() => setTarget(null)}>
            No target
          </button>
        </div>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            void applyCustom()
          }}
        >
          <div className="field field--grow">
            <label className="field__label" htmlFor="custom-target">
              Custom length
            </label>
            <input
              id="custom-target"
              className="input"
              value={custom}
              placeholder="6m, 6:00, 90s, 1m30s"
              onChange={(e) => setCustom(e.target.value)}
              aria-invalid={!!customError}
              aria-describedby={customError ? 'custom-error' : undefined}
            />
          </div>
          <Button variant="secondary" type="submit">
            Set length
          </Button>
        </form>
        {customError && (
          <p id="custom-error" className="field__error">
            {customError}
          </p>
        )}
      </Card>

      <section className="stat-row" aria-label="Length comparison">
        <Stat size="lg" value={formatDuration(natural)} label="your script at natural speed" />
        {targetSeconds && <Stat size="lg" value={formatDuration(targetSeconds)} label="your target" />}
        {diff !== null && Math.abs(diff) >= 1 && (
          <Stat size="lg" tone="white" value={`${diff > 0 ? '+' : '−'}${formatDuration(Math.abs(diff))}`} label={diff > 0 ? 'to fill' : 'to trim'} />
        )}
      </section>

      {plan.error && <Banner tone="error" title="Could not plan the length">{plan.error}</Banner>}

      {p && targetSeconds && (
        <div className="option-grid">
          {p.options.map((o, i) => {
            const recommended = i === p.recommended
            const isSelected = o.kind === selected
            return (
              <Card key={o.kind} className={`option ${isSelected ? 'option--on' : ''}`} as="article">
                <div className="option__head">
                  <h2 className="title">{TITLES[o.kind]}</h2>
                  <div className="option__badges">
                    {recommended && <Badge tone="yellow">Recommended</Badge>}
                    <QualityBadge quality={o.quality} />
                  </div>
                </div>
                <p className="option__body">{describe(o)}</p>
                {o.kind !== 'edit_script' && (
                  <p className="option__result">
                    Lands at <strong>{formatDuration(o.resulting_seconds)}</strong>
                  </p>
                )}
                {o.kind === 'edit_script' ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      patch({ durationOption: 'edit_script' })
                      navigate('/script')
                    }}
                  >
                    Edit script with live timer
                  </Button>
                ) : (
                  <Button
                    variant={isSelected ? 'primary' : 'secondary'}
                    aria-pressed={isSelected}
                    onClick={() => patch({ durationOption: o.kind as DurationOptionKind })}
                  >
                    {isSelected ? 'Selected' : 'Use this'}
                  </Button>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {p && !targetSeconds && (
        <Card className="stack">
          <h2 className="title">Speed</h2>
          <div className="option-grid option-grid--tight">
            {p.options.map((o) => {
              const on = Math.abs((o.speed ?? 1) - speed) < 0.01
              return (
                <button
                  key={o.speed}
                  type="button"
                  className={`speed-card ${on ? 'speed-card--on' : ''}`}
                  aria-pressed={on}
                  onClick={() => patch({ speed: o.speed ?? 1 })}
                >
                  <span className="speed-card__speed">{(o.speed ?? 1).toFixed(2).replace(/0$/, '')}×</span>
                  <span className="speed-card__len">{formatDuration(o.resulting_seconds)}</span>
                  <QualityBadge quality={o.quality} />
                </button>
              )
            })}
          </div>
          <p className="field__hint">You can fine-tune speed from 0.5× to 2× on the voice step.</p>
        </Card>
      )}
    </div>
  )
}
