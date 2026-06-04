import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import Login from './pages/Login'
import GlobalSearch from './components/GlobalSearch'
import Dashboard from './pages/Dashboard'
import Agents from './pages/Agents'
import Categories from './pages/Categories'
import Callers from './pages/Callers'
import CallHistory from './pages/CallHistory'
import Settings from './pages/Settings'

function Navbar() {
  const location = useLocation()
  const { user, logout, isAdmin } = useAuth()
  const [profileOpen, setProfileOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Close dropdowns on route change
  useEffect(() => {
    setProfileOpen(false)
    setMobileMenuOpen(false)
  }, [location.pathname])

  const links = [
    { path: '/', label: 'Dashboard' },
    { path: '/agents', label: 'Agents' },
    { path: '/callers', label: 'Callers' },
    { path: '/call-history', label: 'Call History' },
    { path: '/categories', label: 'Categories' },
  ]

  const isActive = (path) => location.pathname === path

  return (
    <nav className="bg-navy text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <span className="font-heading font-bold text-xl tracking-tight">Efada.Ai</span>
        </Link>

        {/* Global Search — desktop only */}
        <div className="hidden md:block">
          <GlobalSearch />
        </div>

        {/* Desktop Nav Links — hidden on mobile */}
        <div className="hidden md:flex items-center gap-1">
          {links.map(link => (
            <Link
              key={link.path}
              to={link.path}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                isActive(link.path)
                  ? 'bg-primary text-white'
                  : 'text-gray-300 hover:bg-navy-light hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          ))}

          {/* Settings — admin only, direct link */}
          {isAdmin() && (
            <Link
              to="/settings"
              className={`px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1 ${
                isActive('/settings')
                  ? 'bg-primary text-white'
                  : 'text-gray-300 hover:bg-navy-light hover:text-white'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </Link>
          )}

          {/* User Profile Dropdown */}
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
              </div>
            )}
          </div>
        </div>

        {/* Mobile Hamburger Button */}
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

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-navy-light">
          <div className="px-4 py-3 space-y-1">
            {/* User info on mobile */}
            <div className="flex items-center gap-3 px-3 py-2 mb-2 bg-navy-light/50 rounded-lg">
              <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center text-primary text-sm font-bold">
                {(user?.full_name || user?.username || '?')[0].toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-medium text-white">{user?.full_name || user?.username}</div>
                <div className="text-xs text-gray-400">{user?.role}</div>
              </div>
            </div>

            {links.map(link => (
              <Link
                key={link.path}
                to={link.path}
                className={`block px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive(link.path)
                    ? 'bg-primary text-white'
                    : 'text-gray-300 hover:bg-navy-light hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            ))}
            {isAdmin() && (
            <>
            <div className="border-t border-navy-light my-2"></div>
            <Link
              to="/settings"
              className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-navy-light hover:text-white transition"
            >
              ⚙️ Settings
            </Link>
            </>
            )}
            <button
              onClick={logout}
              className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-900/30 transition"
            >
              🚪 Sign Out
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}

function AppContent() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-light flex items-center justify-center">
        <div className="text-text-gray text-sm">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  return (
    <div className="min-h-screen bg-bg-light">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/callers" element={<Callers />} />
          <Route path="/call-history" element={<CallHistory />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
