import { ApiError, request } from './api'

export const UPLOAD_TYPES = Object.freeze({
  ARTICLE_COVER: 'ARTICLE_COVER',
  ARTICLE_ATTACHMENT: 'ARTICLE_ATTACHMENT',
  PPT_FILE: 'PPT_FILE',
  VIDEO_FILE: 'VIDEO_FILE',
  VIDEO_COVER: 'VIDEO_COVER',
  COURSE_COVER: 'COURSE_COVER',
  STUDENT_AVATAR: 'STUDENT_AVATAR',
})

export async function uploadFile(file, uploadType) {
  if (!file) throw new ApiError('请选择需要上传的文件', 400)
  if (!Object.values(UPLOAD_TYPES).includes(uploadType)) throw new ApiError('无效的文件上传类型', 400)

  const form = new FormData()
  form.append('file', file)
  form.append('uploadType', uploadType)
  const response = await request('/api/files/upload', { method: 'POST', body: form })
  if (!response || typeof response.code !== 'number') throw new ApiError('文件上传响应格式不正确', 0, response)
  if (response.code !== 0) throw new ApiError(response.message || '文件上传失败', response.code, response)
  if (!response.data?.url) throw new ApiError('文件上传响应缺少文件地址', 0, response)
  return response.data
}
