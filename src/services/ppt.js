import { ApiError, request } from './api'
import { UPLOAD_TYPES, uploadFile } from './file'

const ROOT = '/api/admin/ppts'

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

export const getPpts = (params = {}) => request(`${ROOT}${queryString(params)}`).then(unwrap)
export const getPptOverview = () => request(`${ROOT}/overview`).then(unwrap)
export const getPpt = (id) => request(`${ROOT}/${id}`).then(unwrap)
export const createPpt = (payload) => request(ROOT, { method: 'POST', body: JSON.stringify(payload) }).then(unwrap)
export const updatePpt = (id, payload) => request(`${ROOT}/${id}`, { method: 'PUT', body: JSON.stringify(payload) }).then(unwrap)
export const updatePptStatus = (id, status) => request(`${ROOT}/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }).then(unwrap)
export const deletePpt = (id) => request(`${ROOT}/${id}`, { method: 'DELETE' }).then(unwrap)
export const getPptDownload = (id) => request(`${ROOT}/${id}/download-url`).then(unwrap)

export async function uploadPptFile(file) {
  const result = await uploadFile(file, UPLOAD_TYPES.PPT_FILE)
  return { originalUrl: result.url, originalName: result.originalFileName, fileSize: result.size }
}
