import React, { lazy, Suspense, useState, useEffect, Component } from 'react'
import { createBrowserRouter, RouterProvider, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Agents from './pages/Agents'
import Categories from './pages/Categories'
import Callers from './pages/Callers'
import Dids from './pages/Dids'
import Settings from './pages/Settings'
import GlobalSearch from './components/GlobalSearch'

const Reports = lazy(() => import('./pages/Reports'))

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('App crashed:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-bg-light flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-red-200 rounded-xl shadow-sm p-6">
            <h1 className="text-xl font-heading font-semibold text-navy">Something went wrong</h1>
            <p className="mt-2 text-sm text-text-gray">
              The application hit an unexpected error. This screen prevents a blank page.
            </p>
            <pre className="mt-4 p-3 bg-gray-50 border border-border rounded-lg text-xs text-red-700 overflow-auto">
              {this.state.error?.stack || String(this.state.error)}
            </pre>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-4 w-full bg-navy text-white py-2.5 rounded-lg text-sm font-medium hover:bg-navy-light transition"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

function Shell() {
  const { user, logout, isAdmin } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [profileOpen, setProfileOpen] = React.useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)

  React.useEffect(() => {
    const handler = () => {
      setProfileOpen(false)
      setMobileMenuOpen(false)
    }
    window.addEventListener('sarp:route', handler)
    return () => window.removeEventListener('sarp:route', handler)
  }, [])

  const links = [
    { path: '/', label: 'Dashboard' },
    { path: '/categories', label: 'Categories' },
    { path: '/agents', label: 'Agents' },
    { path: '/callers', label: 'Callers' },
    { path: '/dids', label: 'DIDs' },
    { path: '/reports', label: 'Reports' },
  ]

  const go = (to) => {
    navigate(to)
    window.dispatchEvent(new Event('sarp:route'))
  }

  const isActive = (path) => location.pathname === path

  return (
    <div className="min-h-screen bg-bg-light">
      <nav className="bg-navy text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => go('/')} className="flex items-center gap-2">
            <span className="font-heading font-bold text-xl tracking-tight">Efada.Ai</span>
          </button>

          <div className="hidden md:block">
            <GlobalSearch />
          </div>

          <div className="hidden md:flex items-center gap-1">
            {links.map((link) => (
              <button
                key={link.path}
                onClick={() => go(link.path)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive(link.path) ? 'bg-primary text-white' : 'text-gray-300 hover:bg-navy-light hover:text-white'
                }`}
              >
                {link.label}
              </button>
            ))}
            {isAdmin() && (
              <button
                onClick={() => go('/settings')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1 ${
                  isActive('/settings') ? 'bg-primary text-white' : 'text-gray-300 hover:bg-navy-light hover:text-white'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </button>
            )}

            <div className="relative ml-2">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-navy-light hover:text-white transition"
              >
                <div className="w-7 h-7 bg-primary/20 rounded-full flex items-center justify-center text-primary text-xs font-bold">
                  {(user?.full_name || user?.username || '?')[0].toUpperCase()}
                </div>
                <span className="hidden lg:inline">{user?.full_name || user?.username}</span>
                <span className="hidden lg:inline px-1.5 py-0.5 rounded text-[10px] bg-white/10">{user?.role}</span>
              </button>
              {profileOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl py-1 z-50 border border-border">
                  <div className="px-4 py-2 border-b border-border">
                    <div className="text-sm font-medium text-text-dark">{user?.full_name || user?.username}</div>
                    <div className="text-xs text-text-muted">{user?.email}</div>
                  </div>
                  <button
                    onClick={() => { logout(); setProfileOpen(false) }}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign Out
                  </button>
                  <button
                    onClick={() => { go('/settings'); setProfileOpen(false) }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    My Profile
                  </button>
                  <button
                    onClick={() => { go('/settings'); setProfileOpen(false) }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m0 0a2 2 0 01-2 2 2 0 01-2-2m2 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9m0 0a2 2 0 012-2h2a2 2 0 012 2z" />
                    </svg>
                    Change Password
                  </button>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-gray-300 hover:bg-navy-light hover:text-white transition"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-navy-light">
            <div className="px-4 py-3 space-y-1">
              <div className="flex items-center gap-3 px-3 py-2 mb-2 bg-navy-light/50 rounded-lg">
                <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center text-primary text-sm font-bold">
                  {(user?.full_name || user?.username || '?')[0].toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{user?.full_name || user?.username}</div>
                  <div className="text-xs text-gray-400">{user?.role}</div>
                </div>
              </div>
              {links.map((link) => (
                <button
                  key={link.path}
                  onClick={() => go(link.path)}
                  className={`block w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition ${
                    isActive(link.path) ? 'bg-primary text-white' : 'text-gray-300 hover:bg-navy-light hover:text-white'
                  }`}
                >
                  {link.label}
                </button>
              ))}
              {isAdmin() && (
                <>
                  <div className="border-t border-navy-light my-2" />
                  <button
                    onClick={() => go('/settings')}
                    className="block w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-navy-light hover:text-white transition"
                  >
                    Settings
                  </button>
                </>
              )}
              <button
                onClick={() => { logout(); setMobileMenuOpen(false) }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-900/30 transition"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <AppRoutes />
      </main>
    </div>
  )
}

function AppRoutes() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-light flex items-center justify-center">
        <div className="text-text-gray text-sm">Loading...</div>
      </div>
    )
  }

  if (!user && !['/login', '/register'].includes(location.pathname)) {
    return <Navigate to="/login" replace />
  }

  if (user && ['/login', '/register'].includes(location.pathname)) {
    return <Navigate to="/" replace />
  }

  if (!user) {
    return location.pathname === '/login' ? <Login /> : <Register />
  }

  const pageMap = {
    '/': Dashboard,
    '/categories': Categories,
    '/agents': Agents,
    '/callers': Callers,
    '/dids': Dids,
    '/reports': Reports,
    '/settings': Settings,
  }

  const Component = pageMap[location.pathname]

  if (!Component) {
    return <Navigate to="/" replace />
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="text-center py-10 text-text-gray">Loading...</div>}>
        <Component />
      </Suspense>
    </ErrorBoundary>
  )
}

function App() {
  const [router] = React.useState(() =>
    createBrowserRouter([
      {
        path: '/',
        element: (
          <AuthProvider>
            <Shell />
          </AuthProvider>
        ),
      },
      { path: '/login', element: (
        <AuthProvider>
          <Login />
        </AuthProvider>
      ) },
      { path: '/register', element: (
        <AuthProvider>
          <Register />
        </AuthProvider>
      ) },
      { path: '*', element: (
        <AuthProvider>
          <Shell />
        </AuthProvider>
      ) },
    ])
  )

  return <RouterProvider router={router} />
}

export default App
