import { ApiError, request } from './api'
import { UPLOAD_TYPES, uploadFile } from './file'

const ROOT = '/api/admin/settings'

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

export const getCurrentSettingsUser = () => request(`${ROOT}/current-user`).then(unwrap)
export const getStudents = (params = {}) => request(`${ROOT}/students${queryString(params)}`).then(unwrap)
export const getStudent = (studentId) => request(`${ROOT}/students/${studentId}`).then(unwrap)
export const updateStudent = (studentId, payload) => request(`${ROOT}/students/${studentId}`, { method:'PUT', body:JSON.stringify(payload) }).then(unwrap)
export const deleteStudent = (studentId) => request(`${ROOT}/students/${studentId}`, { method:'DELETE' }).then(unwrap)
export const getDepartmentDistribution = (params = {}) => request(`${ROOT}/students/department-distribution${queryString(params)}`).then(unwrap)
export const getStudentCourseProgress = (studentId) => request(`${ROOT}/students/${studentId}/course-progress`).then(unwrap)
export const completeStudentCourseProgress = (studentId, courseId) => request(`${ROOT}/students/${studentId}/courses/${courseId}/progress/complete`, { method:'PATCH' }).then(unwrap)
export const resetStudentCourseProgress = (studentId, courseId) => request(`${ROOT}/students/${studentId}/courses/${courseId}/progress/reset`, { method:'PATCH' }).then(unwrap)
export const sendStudentCourseMessage = (studentId, courseId, content) => request(`${ROOT}/students/${studentId}/courses/${courseId}/messages`, { method:'POST', body:JSON.stringify({ content }) }).then(unwrap)
export const getSettingsDepartmentOptions = () => request(`${ROOT}/departments/options`).then(unwrap)

export async function uploadStudentAvatar(file) {
  const result = await uploadFile(file, UPLOAD_TYPES.STUDENT_AVATAR)
  return {
    url: result.url,
    objectKey: result.objectKey || result.key || result.fileKey || result.path || '',
    name: result.originalFileName || result.fileName,
    size: result.size,
  }
}
