import { clearSession, getToken } from './auth'

const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const basePath = (() => {
  if (!baseUrl) return ''
  try {
    return new URL(baseUrl, 'http://local').pathname.replace(/\/$/, '')
  } catch {
    return ''
  }
})()

function buildUrl(path) {
  if (!baseUrl) return normalizeUrl(path)
  let url
  if (basePath && (path === basePath || path.startsWith(`${basePath}/`))) {
    const stripped = path.slice(basePath.length) || '/'
    url = `${baseUrl}${stripped.startsWith('/') ? stripped : `/${stripped}`}`
  } else {
    url = `${baseUrl}${path}`
  }
  return normalizeUrl(url)
}

function normalizeUrl(url) {
  let next = url
  let previous
  do {
    previous = next
    next = next.replace(/(\/api\/admin\/[^/?#]+)\1(?=\/|$|\?|#)/g, '$1')
    next = next.replace(/(\/api\/files)\1(?=\/|$|\?|#)/g, '$1')
    next = next.replace(/(\/api\/auth)\1(?=\/|$|\?|#)/g, '$1')
  } while (next !== previous)
  return next
}

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
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  if (options.body && !isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response
  try {
    response = await fetch(buildUrl(path), { ...options, headers })
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

export async function requestBlob(path, options = {}) {
  const headers = new Headers(options.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response
  try {
    response = await fetch(buildUrl(path), { ...options, headers })
  } catch {
    throw new ApiError('网络连接失败，请稍后重试', 0)
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearSession()
      if (window.location.pathname !== '/login') window.location.assign('/login')
    }
    const contentType = response.headers.get('content-type') || ''
    const data = contentType.includes('application/json') ? await response.json().catch(() => null) : null
    throw new ApiError(data?.message || '请求失败，请稍后重试', response.status, data)
  }

  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition') || ''
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const quoted = disposition.match(/filename="?([^"]+)"?/i)?.[1]
  const filename = encoded ? decodeURIComponent(encoded) : (quoted || 'download.xlsx')
  return { blob, filename, contentType: response.headers.get('content-type') || '' }
}

export const login = (credentials) => request('/api/admin/login', {
  method: 'POST',
  body: JSON.stringify(credentials),
})

export const fetchCurrentUser = () => request('/api/auth/me')
