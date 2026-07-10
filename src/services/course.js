import { ApiError, request, requestBlob } from './api'
import { UPLOAD_TYPES, uploadFile } from './file'

const ROOT = '/api/admin/courses'

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

export const createCourse = (payload) => request(ROOT, { method: 'POST', body: JSON.stringify(payload) }).then(unwrap)
export const getCourses = (params = {}) => request(`${ROOT}${queryString(params)}`).then(unwrap)
export const getCourseOverview = () => request(`${ROOT}/overview`).then(unwrap)
export const updateCourseBasic = (courseId, payload) => request(`${ROOT}/${courseId}/basic`, { method: 'PUT', body: JSON.stringify(payload) }).then(unwrap)
export const getCourse = (courseId) => request(`${ROOT}/${courseId}`).then(unwrap)
export const previewCourse = (courseId) => request(`${ROOT}/${courseId}/preview`).then(unwrap)
export const exportCourses = (params = {}) => requestBlob(`${ROOT}/export${queryString(params)}`)
export const saveCompletionRule = (courseId) => request(`${ROOT}/${courseId}/completion-rule`, { method: 'PUT', body: JSON.stringify({ completionRule: 'ALL_REQUIRED_POINTS' }) }).then(unwrap)
export const updateCourseStatus = (courseId, status) => request(`${ROOT}/${courseId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }).then(unwrap)
export const deleteCourseDraft = (courseId) => request(`${ROOT}/${courseId}`, { method: 'DELETE' }).then(unwrap)

export const createChapter = (courseId, title) => request(`${ROOT}/${courseId}/chapters`, { method: 'POST', body: JSON.stringify(title) }).then(unwrap)
export const updateChapter = (courseId, chapterId, payload) => request(`${ROOT}/${courseId}/chapters/${chapterId}`, { method: 'PUT', body: JSON.stringify(payload) }).then(unwrap)
export const deleteChapter = (courseId, chapterId) => request(`${ROOT}/${courseId}/chapters/${chapterId}`, { method: 'DELETE' }).then(unwrap)
export const orderChapters = (courseId, chapterIds) => request(`${ROOT}/${courseId}/chapters/order`, { method: 'PUT', body: JSON.stringify({ chapterIds }) }).then(unwrap)

export const getPoint = (courseId, chapterId, pointId) => request(`${ROOT}/${courseId}/chapters/${chapterId}/points/${pointId}`).then(unwrap)
export const createPoint = (courseId, chapterId, payload) => request(`${ROOT}/${courseId}/chapters/${chapterId}/points`, { method: 'POST', body: JSON.stringify(payload) }).then(unwrap)
export const updatePoint = (courseId, chapterId, pointId, payload) => request(`${ROOT}/${courseId}/chapters/${chapterId}/points/${pointId}`, { method: 'PUT', body: JSON.stringify(payload) }).then(unwrap)
export const deletePoint = (courseId, chapterId, pointId) => request(`${ROOT}/${courseId}/chapters/${chapterId}/points/${pointId}`, { method: 'DELETE' }).then(unwrap)
export const orderPoints = (courseId, chapterId, pointIds) => request(`${ROOT}/${courseId}/chapters/${chapterId}/points/order`, { method: 'PUT', body: JSON.stringify({ pointIds }) }).then(unwrap)

export const getInstructorOptions = (params = {}) => request(`/api/admin/instructors/options${queryString(params)}`).then(unwrap)
export const getDepartmentOptions = (params = {}) => request(`/api/admin/department/options${queryString({ keyword: '', ...params })}`).then(unwrap)
export const getPublishedArticles = (params = {}) => request(`/api/admin/articles${queryString({ status: 'PUBLISHED', page: 1, size: 20, ...params })}`).then(unwrap)
export const getPublishedPpts = (params = {}) => request(`/api/admin/ppts${queryString({ status: 'PUBLISHED', page: 1, size: 20, ...params })}`).then(unwrap)
export const getPublishedVideos = (params = {}) => request(`/api/admin/videos${queryString({ status: 'PUBLISHED', page: 1, size: 20, ...params })}`).then(unwrap)

export async function uploadCourseCover(file) {
  const result = await uploadFile(file, UPLOAD_TYPES.COURSE_COVER)
  return { url: result.url, name: result.originalFileName, size: result.size }
}
