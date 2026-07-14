import { ApiError, request, requestBlob } from './api'

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

const QUESTION_ROOT = '/api/admin/assessment/questions'
const ASSESSMENT_ROOT = '/api/admin/assessments'
const RESULT_ROOT = '/api/admin/assessment-results'

export const getAssessmentQuestions = (params = {}) => request(`${QUESTION_ROOT}${queryString(params)}`).then(unwrap)
export const getAssessmentQuestion = (questionId) => request(`${QUESTION_ROOT}/${questionId}`).then(unwrap)
export const createAssessmentQuestion = (payload) => request(QUESTION_ROOT, { method:'POST', body:JSON.stringify(payload) }).then(unwrap)
export const updateAssessmentQuestion = (questionId, payload) => request(`${QUESTION_ROOT}/${questionId}`, { method:'PUT', body:JSON.stringify(payload) }).then(unwrap)
export const updateAssessmentQuestionStatus = (questionId, status) => request(`${QUESTION_ROOT}/${questionId}/status`, { method:'PATCH', body:JSON.stringify({ status }) }).then(unwrap)
export const deleteAssessmentQuestion = (questionId) => request(`${QUESTION_ROOT}/${questionId}`, { method:'DELETE' }).then(unwrap)

export const getAssessments = (params = {}) => request(`${ASSESSMENT_ROOT}${queryString(params)}`).then(unwrap)
export const createAssessment = (payload) => request(ASSESSMENT_ROOT, { method:'POST', body:JSON.stringify(payload) }).then(unwrap)
export const getAssessment = (assessmentId) => request(`${ASSESSMENT_ROOT}/${assessmentId}`).then(unwrap)
export const updateAssessment = (assessmentId, payload) => request(`${ASSESSMENT_ROOT}/${assessmentId}`, { method:'PUT', body:JSON.stringify(payload) }).then(unwrap)
export const getAssessmentQuestionCapacity = (assessmentId) => request(`${ASSESSMENT_ROOT}/${assessmentId}/question-capacity`).then(unwrap)
export const publishAssessment = (assessmentId) => request(`${ASSESSMENT_ROOT}/${assessmentId}/publish`, { method:'POST' }).then(unwrap)
export const closeAssessment = (assessmentId) => request(`${ASSESSMENT_ROOT}/${assessmentId}/close`, { method:'POST' }).then(unwrap)
export const deleteAssessmentDraft = (assessmentId) => request(`${ASSESSMENT_ROOT}/${assessmentId}`, { method:'DELETE' }).then(unwrap)

export const getAssessmentResults = (params = {}) => request(`${RESULT_ROOT}${queryString(params)}`).then(unwrap)
export const getAssessmentResult = (attemptId) => request(`${RESULT_ROOT}/${attemptId}`).then(unwrap)
export const getAssessmentResultSummary = (assessmentId) => request(`${ASSESSMENT_ROOT}/${assessmentId}/result-summary`).then(unwrap)
export const exportAssessmentResults = (params = {}) => requestBlob(`${RESULT_ROOT}/export${queryString(params)}`)
