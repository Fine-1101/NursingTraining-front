import { ApiError, request } from './api'

const ROOT = '/api/admin/dashboard'

function unwrap(response) {
  if (!response || typeof response.code !== 'number') throw new ApiError('接口响应格式不正确', 0, response)
  if (response.code !== 0) throw new ApiError(response.message || '操作失败', response.code, response)
  return response.data
}

function queryString(params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) query.set(key, value)
  })
  return query.toString() ? `?${query}` : ''
}

export const getAdminDashboard = (params = {}) => request(`${ROOT}${queryString(params)}`).then(unwrap)
export const getDashboardSummary = () => request(`${ROOT}/summary`).then(unwrap)
export const getLearningStatusDistribution = () => request(`${ROOT}/learning-status-distribution`).then(unwrap)
export const getLearningTrend = (params = {}) => request(`${ROOT}/learning-trend${queryString(params)}`).then(unwrap)
export const getDepartmentCompletionRanking = (params = {}) => request(`${ROOT}/department-completion-ranking${queryString(params)}`).then(unwrap)
export const getQuickEntries = () => request(`${ROOT}/quick-entries`).then(unwrap)
