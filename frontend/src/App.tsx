import { useEffect } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { PhoneFrame } from './components/PhoneFrame'
import { StepNav, SummaryBar, TopNav, Toasts } from './components/Shell'
import { Banner, Button } from './components/ui'
import { ScriptInfoProvider } from './state/scriptInfo'
import { useCatalog } from './state/catalog'
import { CaptionsStep } from './steps/CaptionsStep'
import { DurationStep } from './steps/DurationStep'
import { ExportStep } from './steps/ExportStep'
import { ScriptStep } from './steps/ScriptStep'
import { VoiceStep } from './steps/VoiceStep'

function Layout() {
  const { pathname } = useLocation()
  const { loaded, error, load, health } = useCatalog()
  useEffect(() => {
    void load()
  }, [load])
  // the frame is the payoff of the caption choices, so it stays next to them
  const withPreview = pathname === '/captions' || pathname === '/export'

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <TopNav />
      <main id="main" className="page">
        <SummaryBar />
        {error && (
          <Banner
            tone="error"
            title="Can’t reach NarraReel"
            action={
              <Button variant="secondary" onClick={() => void load()}>
                Try again
              </Button>
            }
          >
            {error}
          </Banner>
        )}
        {health?.demo && (
          <Banner tone="info" title="You are using the public demo">
            Scripts are limited to about two minutes, and uploads and voice cloning are off. Install NarraReel on your
            computer to remove the limits.
          </Banner>
        )}
        {loaded && (
          <div className={`layout ${withPreview ? 'layout--split' : ''}`}>
            <div className="layout__main">
              <Outlet />
              <StepNav />
            </div>
            {withPreview && (
              <div className="layout__aside">
                <PhoneFrame />
              </div>
            )}
          </div>
        )}
        {!loaded && !error && <p className="muted">Loading…</p>}
      </main>
      <Toasts />
    </>
  )
}

export default function App() {
  return (
    <ScriptInfoProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/script" replace />} />
          <Route path="/script" element={<ScriptStep />} />
          <Route path="/duration" element={<DurationStep />} />
          <Route path="/voice" element={<VoiceStep />} />
          <Route path="/captions" element={<CaptionsStep />} />
          <Route path="/export" element={<ExportStep />} />
          <Route path="*" element={<Navigate to="/script" replace />} />
        </Route>
      </Routes>
    </ScriptInfoProvider>
  )
}
