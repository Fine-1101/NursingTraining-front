import { ApiError, request } from './api'

const ROOT = '/api/admin/categories'

function unwrap(response) {
  if (!response || typeof response.code !== 'number') throw new ApiError('接口响应格式不正确', 0, response)
  if (response.code !== 0) throw new ApiError(response.message || '操作失败', response.code, response)
  return response.data
}

function queryString(params) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) search.set(key, value)
  })
  const value = search.toString()
  return value ? `?${value}` : ''
}

export const getCategoryTree = (params = {}) => request(`${ROOT}/tree${queryString(params)}`).then(unwrap)
export const getCategoryOverview = () => request(`${ROOT}/overview`).then(unwrap)
export const getCategory = (id) => request(`${ROOT}/${id}`).then(unwrap)
export const createCategory = (payload) => request(ROOT, { method: 'POST', body: JSON.stringify(payload) }).then(unwrap)
export const updateCategory = (id, payload) => request(`${ROOT}/${id}`, { method: 'PUT', body: JSON.stringify(payload) }).then(unwrap)
export const updateCategoryStatus = (id, status) => request(`${ROOT}/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, cascade: true }) }).then(unwrap)
export const deleteCategory = (id) => request(`${ROOT}/${id}`, { method: 'DELETE' }).then(unwrap)
export const deleteCategories = (ids) => request(`${ROOT}/batch`, { method: 'DELETE', body: JSON.stringify({ ids }) }).then(unwrap)
