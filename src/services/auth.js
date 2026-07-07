const TOKEN_KEY = 'nursing_admin_token'
const USER_KEY = 'nursing_admin_user'
const REMEMBER_KEY = 'nursing_remembered_username'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const hasToken = () => Boolean(getToken())
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token)
export const getRememberedUsername = () => localStorage.getItem(REMEMBER_KEY) || ''
export const rememberUsername = (username) => localStorage.setItem(REMEMBER_KEY, username)
export const forgetUsername = () => localStorage.removeItem(REMEMBER_KEY)

export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)) }
  catch { return null }
}

export const setStoredUser = (user) => localStorage.setItem(USER_KEY, JSON.stringify(user))

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}
