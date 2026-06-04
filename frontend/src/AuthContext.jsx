import React, { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

const API = '/api/v1'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [loading, setLoading] = useState(true)

  // Set axios default header when token changes
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
      localStorage.setItem('token', token)
    } else {
      delete axios.defaults.headers.common['Authorization']
      localStorage.removeItem('token')
    }
  }, [token])

  // Check if token is valid on mount
  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const res = await axios.get(`${API}/auth/me/`)
          setUser(res.data)
        } catch (e) {
  // Token expired or invalid
          setToken(null)
          setUser(null)
        }
      }
      setLoading(false)
    }
    initAuth()
  }, [])

  const login = async (username, password) => {
    const res = await axios.post(`${API}/auth/login/`, { username, password })
    setToken(res.data.access_token)
    setUser(res.data.user)
    return res.data.user
  }

  const register = async (data) => {
    const res = await axios.post(`${API}/auth/register/`, data)
    setToken(res.data.access_token)
    setUser(res.data.user)
    return res.data.user
  }

  const logout = () => {
    setToken(null)
    setUser(null)
  }

  const isAdmin = () => user?.role === 'admin'
  const isManager = () => user?.role === 'admin' || user?.role === 'manager'

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
