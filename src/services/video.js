import { ApiError, request } from './api'
import { uploadFile } from './file'

const ROOT = '/api/admin/videos'

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

export const getVideos = (params = {}) => request(`${ROOT}${queryString(params)}`).then(unwrap)
export const getVideoOverview = () => request(`${ROOT}/overview`).then(unwrap)
export const getVideo = (id) => request(`${ROOT}/${id}`).then(unwrap)
export const getVideoPlayUrl = (id) => request(`${ROOT}/${id}/play-url`).then(unwrap)
export const createVideo = (payload) => request(ROOT, { method: 'POST', body: JSON.stringify(payload) }).then(unwrap)
export const updateVideo = (id, payload) => request(`${ROOT}/${id}`, { method: 'PUT', body: JSON.stringify(payload) }).then(unwrap)
export const updateVideoStatus = (id, status) => request(`${ROOT}/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }).then(unwrap)
export const deleteVideo = (id) => request(`${ROOT}/${id}`, { method: 'DELETE' }).then(unwrap)
export const deleteVideos = (ids) => request(`${ROOT}/batch`, { method: 'DELETE', body: JSON.stringify({ ids }) }).then(unwrap)

export async function uploadVideoAsset(file, uploadType) {
  return uploadFile(file, uploadType)
}
