import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router'
import { database } from './data/database'
import { AddMeal } from './features/AddMeal'
import { Diary } from './features/Diary'
import { Measurements } from './features/Measurements'
import { useQuery } from './features/shared'

const Analysis = lazy(() => import('./features/Analysis'))
const Settings = lazy(() => import('./features/Settings'))

const pages = [
  { path: '/', label: 'Dnes', title: 'Dnes', screen: <Diary today /> },
  { path: '/pridat', label: 'Pridať', title: 'Pridať jedlo', screen: <AddMeal /> },
  { path: '/dennik', label: 'Denník', title: 'Denník', screen: <Diary /> },
  { path: '/analyza', label: 'Analýza', title: 'Analýza', screen: <Suspense fallback={<p role="status">Načítavam analýzu…</p>}><Analysis /></Suspense> },
  { path: '/merania', label: 'Merania', title: 'Merania', screen: <Measurements /> },
  { path: '/nastavenia', label: 'Nastavenia', title: 'Nastavenia', screen: <Suspense fallback={<p role="status">Načítavam nastavenia…</p>}><Settings /></Suspense> },
]

function Screen({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · NutriTrack`
  }, [title])

  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title">{title}</h1>
      <div className="page-content">{children}</div>
    </section>
  )
}

function Theme() {
  const theme = useQuery(() => database.preferences.get('local').then((record) => record?.theme ?? 'system'))
  useEffect(() => {
    if (theme && theme !== 'system') document.documentElement.dataset.theme = theme
    return () => { delete document.documentElement.dataset.theme }
  }, [theme])
  return null
}

class StorageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section className="content-panel form-stack">
        <p className="action-error" role="alert">Aplikáciu sa nepodarilo načítať.</p>
        <button className="button" type="button" onClick={() => window.location.reload()}>Obnoviť stránku</button>
      </section>
    )
  }
}

export function App() {
  const main = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const [storage, setStorage] = useState<'loading' | 'ready' | 'failed'>('loading')

  useEffect(() => {
    let active = true
    void database.open().then(() => {
      if (active) setStorage('ready')
    }).catch(() => {
      if (active) setStorage('failed')
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="layout">
      <button className="skip-link" onClick={() => main.current?.focus()}>Prejsť na obsah</button>
      <aside className="sidebar">
        <header className="brand">
          <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} width={36} height={36} alt="" />
          <span>NutriTrack</span>
        </header>
        <nav className="navigation" aria-label="Hlavná navigácia">
          {pages.map(({ path, label }) => <NavLink key={path} to={path} end>{label}</NavLink>)}
        </nav>
      </aside>
      <main ref={main} tabIndex={-1}>
        <StorageBoundary>
          {storage === 'ready' && <Theme />}
          <Routes>
            {pages.map(({ path, title, screen }) => (
              <Route key={path} path={path} element={
                <Screen title={title}>
                  {storage === 'ready' ? screen : storage === 'failed'
                    ? <p className="action-error" role="alert">Lokálne úložisko sa nepodarilo otvoriť. Skúste obnoviť stránku.</p>
                    : <p role="status">Otváram lokálne úložisko…</p>}
                </Screen>
              } />
            ))}
            <Route path="*" element={
              <Screen title="Stránka sa nenašla">
                <div className="content-panel form-stack">
                  <p>Skontrolujte odkaz alebo prejdite na denný prehľad.</p>
                  <Link className="button" to="/">Späť na Dnes</Link>
                </div>
              </Screen>
            } />
          </Routes>
        </StorageBoundary>
      </main>
    </div>
  )
}
