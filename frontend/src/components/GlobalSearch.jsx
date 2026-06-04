import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

const API = '/api/v1'

const TYPE_CONFIG = {
  agent: { label: 'Agent', color: 'bg-blue-100 text-blue-700', icon: '🎧' },
  caller: { label: 'Caller', color: 'bg-orange-100 text-orange-700', icon: '📞' },
  did: { label: 'DID', color: 'bg-purple-100 text-purple-700', icon: '📱' },
  category: { label: 'Category', color: 'bg-emerald-100 text-emerald-700', icon: '📁' },
}

function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)
  const debounceRef = useRef(null)

  // Search with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (query.length < 1) {
      setResults([])
      setOpen(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await axios.get(`${API}/search/?q=${encodeURIComponent(query)}&limit=10`)
        setResults(res.data)
        setOpen(res.data.length > 0)
        setSelectedIndex(0)
      } catch (e) {
        setResults([])
      }
      setLoading(false)
    }, 250)

    return () => clearTimeout(debounceRef.current)
  }, [query])

  // Close on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!open || results.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      selectResult(results[selectedIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const selectResult = (result) => {
    navigate(result.url)
    setQuery('')
    setResults([])
    setOpen(false)
    inputRef.current?.blur()
  }

  // Cmd/Ctrl+K shortcut
  useEffect(() => {
    const handleShortcut = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleShortcut)
    return () => document.removeEventListener('keydown', handleShortcut)
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Search Input */}
      <div className="relative">
        <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search..."
          className="w-40 lg:w-56 pl-9 pr-14 py-1.5 text-sm bg-white/10 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:bg-white focus:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 bg-white/10 px-1.5 py-0.5 rounded hidden sm:inline">
          ⌘K
        </span>
      </div>

      {/* Results Dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-border overflow-hidden z-50 min-w-[300px]">
          {loading ? (
            <div className="px-4 py-3 text-sm text-text-gray text-center">Searching...</div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {results.map((result, i) => {
                const config = TYPE_CONFIG[result.type]
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => selectResult(result)}
                    onMouseEnter={() => setSelectedIndex(i)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition ${
                      i === selectedIndex ? 'bg-primary/5' : 'hover:bg-bg-light'
                    }`}
                  >
                    <span className="text-lg">{config.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text-dark truncate">{result.title}</div>
                      {result.subtitle && (
                        <div className="text-xs text-text-muted truncate">{result.subtitle}</div>
                      )}
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${config.color}`}>
                      {config.label}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default GlobalSearch
