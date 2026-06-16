import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)
const API = '/api/v1'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [loading, setLoading] = useState(true)
  const initRef = useRef(false)

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
      localStorage.setItem('token', token)
    } else {
      delete axios.defaults.headers.common['Authorization']
      localStorage.removeItem('token')
    }
  }, [token])

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    const initAuth = async () => {
      try {
        if (token) {
          const res = await axios.get(`${API}/auth/me/`).catch(() => null)
          if (res?.data) {
            setUser(res.data)
            setLoading(false)
            return
          }
        }
      } catch {
        // invalidate token below
      }
      setToken(null)
      setUser(null)
      setLoading(false)
    }

    initAuth()
  }, [token])

  const login = async (username, password) => {
    const res = await axios.post(`${API}/auth/login/`, { username, password })
    setToken(res.data.access_token)
    setUser(res.data.user)
    setLoading(false)
    return res.data.user
  }

  const register = async (data) => {
    const res = await axios.post(`${API}/auth/register/`, data)
    setToken(res.data.access_token)
    setUser(res.data.user)
    setLoading(false)
    return res.data.user
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    setLoading(false)
  }

  const isAdmin = () => user?.role === 'admin'
  const isManager = () => user?.role === 'admin' || user?.role === 'supervisor'

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, isAdmin, isManager }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
