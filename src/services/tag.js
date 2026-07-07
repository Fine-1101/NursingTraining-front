import { ApiError, request } from './api'

const ROOT = '/api/admin/tags'

function unwrap(response) {
  if (!response || typeof response.code !== 'number') throw new ApiError('接口响应格式不正确', 0, response)
  if (response.code !== 0) throw new ApiError(response.message || '操作失败', response.code, response)
  return response.data
}

function queryString(params) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) query.set(key, value)
  })
  return query.toString() ? `?${query}` : ''
}

export const getTags = (params = {}) => request(`${ROOT}${queryString(params)}`).then(unwrap)
export const getTag = (id) => request(`${ROOT}/${id}`).then(unwrap)
export const getTagOverview = () => request(`${ROOT}/overview`).then(unwrap)
export const createTag = (payload) => request(ROOT, { method: 'POST', body: JSON.stringify(payload) }).then(unwrap)
export const updateTag = (id, payload) => request(`${ROOT}/${id}`, { method: 'PUT', body: JSON.stringify(payload) }).then(unwrap)
export const updateTagStatus = (id, status) => request(`${ROOT}/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }).then(unwrap)
export const deleteTag = (id) => request(`${ROOT}/${id}`, { method: 'DELETE' }).then(unwrap)
export const batchTags = (ids, action) => request(`${ROOT}/batch`, { method: 'POST', body: JSON.stringify({ ids, action }) }).then(unwrap)
