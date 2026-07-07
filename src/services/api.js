import { clearSession, getToken } from './auth'

const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

export async function request(path, options = {}) {
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response
  try {
    response = await fetch(`${baseUrl}${path}`, { ...options, headers })
  } catch {
    throw new ApiError('网络连接失败，请稍后重试', 0)
  }

  const contentType = response.headers.get('content-type') || ''
  const data = contentType.includes('application/json') ? await response.json().catch(() => null) : null
  if (!response.ok) {
    if (response.status === 401) {
      clearSession()
      if (window.location.pathname !== '/login') window.location.assign('/login')
    }
    throw new ApiError(data?.message || '请求失败，请稍后重试', response.status, data)
  }
  return data
}

export const login = (credentials) => request('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify(credentials),
})

export const fetchCurrentUser = () => request('/api/auth/me')
