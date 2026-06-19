import axios from 'axios'

const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null

axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '/api/v1'

// Attach Authorization automatically
axios.interceptors.request.use((config) => {
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Surface hidden failures from the API instead of silent failures
let errorShown = false
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!errorShown) {
      errorShown = true
      try {
        const detail = error.response?.data?.detail || error.message || 'Request failed'
        const status = error.response?.status ? `HTTP ${error.response.status}` : 'Network error'
        alert(`${status}: ${detail}`)
      } catch {}
      setTimeout(() => {
        errorShown = false
      }, 0)
    }
    return Promise.reject(error)
  }
)

export default axios
