import { ApiError, request } from './api'
import { uploadFile } from './file'

const ROOT = '/api/admin/articles'

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

export const getArticles = (params = {}) => request(`${ROOT}${queryString(params)}`).then(unwrap)
export const getArticleOverview = () => request(`${ROOT}/overview`).then(unwrap)
export const getArticle = (id) => request(`${ROOT}/${id}`).then(unwrap)
export const previewArticle = (id) => request(`${ROOT}/${id}/preview`).then(unwrap)
export const createArticle = (payload) => request(ROOT, { method: 'POST', body: JSON.stringify(payload) }).then(unwrap)
export const updateArticle = (id, payload) => request(`${ROOT}/${id}`, { method: 'PUT', body: JSON.stringify(payload) }).then(unwrap)
export const updateArticleStatus = (id, status) => request(`${ROOT}/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }).then(unwrap)
export const batchPublishArticles = (ids) => request(`${ROOT}/batch-publish`, { method: 'POST', body: JSON.stringify({ ids }) }).then(unwrap)
export const deleteArticle = (id) => request(`${ROOT}/${id}`, { method: 'DELETE' }).then(unwrap)
export const deleteArticles = (ids) => request(`${ROOT}/batch`, { method: 'DELETE', body: JSON.stringify({ ids }) }).then(unwrap)

export async function uploadArticleFile(file, uploadType) {
  const result = await uploadFile(file, uploadType)
  return { url: result.url, name: result.originalFileName, size: result.size }
}
