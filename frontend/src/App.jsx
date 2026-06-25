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
import {
  LayoutDashboard, Tags, Users, PhoneCall, Phone, BarChart3, Settings as SettingsIcon,
  LogOut, User, ChevronDown, Menu, X, Key, ChevronRight,
} from 'lucide-react'

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
  const [profileOpen, setProfileOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handler = () => {
      setProfileOpen(false)
      setMobileMenuOpen(false)
    }
    window.addEventListener('sarp:route', handler)
    return () => window.removeEventListener('sarp:route', handler)
  }, [])

  useEffect(() => {
    const close = (e) => { if (!e.target.closest('[data-profile]')) setProfileOpen(false) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  const links = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/categories', label: 'Categories', icon: Tags },
    { path: '/agents', label: 'Agents', icon: Users },
    { path: '/callers', label: 'Callers', icon: PhoneCall },
    { path: '/dids', label: 'DIDs', icon: Phone },
    { path: '/reports', label: 'Reports', icon: BarChart3 },
  ]

  const go = (to) => {
    navigate(to)
    window.dispatchEvent(new Event('sarp:route'))
  }

  const isActive = (path) => location.pathname === path

  return (
    <div className="min-h-screen bg-bg-light">
      {/* ── Desktop Navigation ── */}
      <nav className="bg-navy shadow-[0_2px_12px_rgba(0,0,0,0.12)] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Brand */}
            <button onClick={() => go('/')} className="flex items-center gap-2.5 shrink-0">
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-blue-400 rounded-lg flex items-center justify-center shadow-sm">
                <span className="text-white font-bold text-sm">E</span>
              </div>
              <span className="font-heading font-bold text-lg text-white tracking-tight hidden sm:inline">Efada.Ai</span>
            </button>

            {/* Global Search - Desktop */}
            <div className="hidden md:block flex-1 max-w-md mx-6">
              <GlobalSearch />
            </div>

            {/* Nav Links + Profile - Desktop */}
            <div className="hidden md:flex items-center gap-0.5">
              {links.map((link) => {
                const LinkIcon = link.icon
                return (
                  <button
                    key={link.path}
                    onClick={() => go(link.path)}
                    className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                      isActive(link.path)
                        ? 'text-white bg-white/10'
                        : 'text-gray-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <LinkIcon size={15} />
                    {link.label}
                    {isActive(link.path) && (
                      <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
                    )}
                  </button>
                )
              })}

              {/* Settings */}
              {isAdmin() && (
                <button
                  onClick={() => go('/settings')}
                  className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ml-1 ${
                    isActive('/settings')
                      ? 'text-white bg-white/10'
                      : 'text-gray-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <SettingsIcon size={15} />
                  Settings
                  {isActive('/settings') && (
                    <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
                  )}
                </button>
              )}

              {/* Separator */}
              <div className="w-px h-6 bg-white/10 mx-2" />

              {/* Profile Dropdown */}
              <div className="relative" data-profile>
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                    profileOpen ? 'bg-white/10 text-white' : 'text-gray-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <div className="w-7 h-7 bg-gradient-to-br from-primary to-blue-400 rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-sm">
                    {(user?.full_name || user?.username || '?')[0].toUpperCase()}
                  </div>
                  <span className="hidden lg:inline max-w-[120px] truncate">{user?.full_name || user?.username}</span>
                  <ChevronDown size={12} className={`transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`} />
                </button>

                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl py-1 z-50 border border-border animate-in">
                    <div className="px-4 py-3 border-b border-border">
                      <div className="text-sm font-semibold text-text-dark">{user?.full_name || user?.username}</div>
                      <div className="text-xs text-text-muted mt-0.5">{user?.email}</div>
                      <div className="mt-1.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                          {user?.role}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => { go('/settings'); setProfileOpen(false) }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-text-dark hover:bg-gray-50 transition-colors"
                    >
                      <User size={14} className="text-text-muted" />
                      My Profile
                    </button>
                    <button
                      onClick={() => { go('/settings'); setProfileOpen(false) }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-text-dark hover:bg-gray-50 transition-colors"
                    >
                      <Key size={14} className="text-text-muted" />
                      Change Password
                    </button>
                    <div className="border-t border-border mt-1 pt-1">
                      <button
                        onClick={() => { logout(); setProfileOpen(false) }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <LogOut size={14} />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Mobile Hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-gray-300 hover:bg-white/10 transition"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* ── Mobile Menu ── */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-navy-light/50 backdrop-blur-sm">
            <div className="px-4 py-3 space-y-1 max-h-[80vh] overflow-y-auto">
              {/* User Card */}
              <div className="flex items-center gap-3 px-3 py-3 mb-3 bg-white/5 rounded-xl border border-white/10">
                <div className="w-9 h-9 bg-gradient-to-br from-primary to-blue-400 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {(user?.full_name || user?.username || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{user?.full_name || user?.username}</div>
                  <div className="text-xs text-gray-400">{user?.email}</div>
                </div>
              </div>

              {links.map((link) => {
                const LinkIcon = link.icon
                return (
                  <button
                    key={link.path}
                    onClick={() => go(link.path)}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                      isActive(link.path)
                        ? 'bg-primary/15 text-primary'
                        : 'text-gray-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <LinkIcon size={16} />
                    {link.label}
                    {isActive(link.path) && <ChevronRight size={14} className="ml-auto text-primary" />}
                  </button>
                )
              })}

              {isAdmin() && (
                <>
                  <div className="border-t border-white/10 my-2" />
                  <button
                    onClick={() => go('/settings')}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                      isActive('/settings')
                        ? 'bg-primary/15 text-primary'
                        : 'text-gray-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <SettingsIcon size={16} />
                    Settings
                    {isActive('/settings') && <ChevronRight size={14} className="ml-auto text-primary" />}
                  </button>
                </>
              )}

              <div className="border-t border-white/10 my-2" />

              <button
                onClick={() => { logout(); setMobileMenuOpen(false) }}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-900/20 transition"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* ── Main Content ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
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
