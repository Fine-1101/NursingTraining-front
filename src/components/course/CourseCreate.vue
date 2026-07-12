<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { getCategoryTree } from '@/services/category'
import { createTag, getTags } from '@/services/tag'
import {
  createChapter, createCourse, createPoint, deleteChapter, deleteCourseDraft, deletePoint,
  getCourse, getDepartmentOptions, getInstructorOptions, getPoint, getPublishedArticles,
  getPublishedPpts, getPublishedVideos, orderChapters, orderPoints, saveCompletionRule,
  updateChapter, updateCourseBasic, updateCourseStatus, updatePoint, uploadCourseCover,
} from '@/services/course'

const emit = defineEmits(['open-library'])
const props = defineProps({
  editCourseId: { type:[Number, String], default:null },
  resetKey: { type:Number, default:0 },
})
const STORAGE_KEY = 'nursing:create-course:id'
const BASIC_CACHE_KEY = 'nursing:create-course:basic-cache'

const step = ref(1)
const courseId = ref(Number(props.editCourseId) || Number(localStorage.getItem(STORAGE_KEY)) || null)
const loading = ref(false)
const message = ref(null)
const categories = ref([])
const tags = ref([])
const tagKeyword = ref('')
const tagCreating = ref(false)
const tagPopup = ref(false)
const instructors = ref([])
const instructorKeyword = ref('')
const instructorPicker = reactive({ open:false, loading:false })
const departments = ref([])
const chapters = ref([])
const activeChapterId = ref(null)
const draggingChapterId = ref(null)
const draggingPointId = ref(null)
const editingChapterId = ref(null)
const chapterTitle = ref('')
const ruleSummary = ref(null)
const courseStatus = ref('DRAFT')
const resourcePicker = reactive({ open:false, type:'article', loading:false, keyword:'', rows:[] })
const confirmBox = reactive({ open:false, title:'', content:'', action:null, loading:false })

const basic = reactive({
  title:'', summary:'', learningObjective:'', categoryId:'', coverUrl:'',
  tagIds:[], instructorId:'', startAt:'', departments:[],
})

const point = reactive({
  id:null, loading:false, title:'', description:'', required:true,
  articleIds:[], videoIds:[], pptIds:[], articles:[], videos:[], ppts:[],
})

const activeChapter = computed(() => chapters.value.find(item => item.id === activeChapterId.value) || chapters.value[0] || null)
const selectedTagNames = computed(() => basic.tagIds.map(id => tags.value.find(tag => tag.id === id)?.name).filter(Boolean))
const selectedTags = computed(() => basic.tagIds.map(id => tags.value.find(tag => tag.id === id)).filter(Boolean))
const selectedInstructor = computed(() => instructors.value.find(item => Number(item.id) === Number(basic.instructorId)))
const canGoStep3 = computed(() => chapters.value.some(chapter => chapter.points?.length))
const resourceCount = computed(() => point.articleIds.length + point.videoIds.length + point.pptIds.length)
const stepItems = computed(() => [
  { no:1, title:'基础信息', desc:'填写课程基本信息' },
  { no:2, title:'创建章节并创建课程点', desc:'配置章节及课程点内容' },
  { no:3, title:'完成规则', desc:'设置学习与完成规则' },
])

function toast(text, type='success') { message.value={ text, type }; window.setTimeout(() => { message.value=null }, 2800) }
function number(value) { return Number(value || 0).toLocaleString('zh-CN') }
function dateInput(value) { if (!value) return ''; return String(value).slice(0, 10) }
function toDateTime(value) { return value ? `${value}T00:00:00+08:00` : null }
function flattenCategories(list = [], prefix = '') {
  return list.flatMap(item => {
    const rawName = item.name || item.categoryName || item.title || item.label || ''
    const label = `${prefix}${rawName}`
    const id = item.id || item.categoryId || item.value || item.key
    const children = flattenCategories(item.children || item.childCategories || item.childrenList || [], `${label} / `)
    return [{ id, name:label }, ...children].filter(row => row.id && row.name)
  })
}
function categorySource(tree) {
  if (Array.isArray(tree)) return tree
  if (Array.isArray(tree?.records)) return tree.records
  if (Array.isArray(tree?.children)) return tree.children
  if (Array.isArray(tree?.categories)) return tree.categories
  if (Array.isArray(tree?.list)) return tree.list
  if (Array.isArray(tree?.data)) return tree.data
  if (Array.isArray(tree?.data?.records)) return tree.data.records
  if (Array.isArray(tree?.data?.children)) return tree.data.children
  if (Array.isArray(tree?.data?.list)) return tree.data.list
  return []
}
function normalizeTag(item) { return { id:item.id || item.tagId, name:item.name || item.tagName, color:item.color } }
function normalizeInstructor(item) { return { id:item.id || item.userId, realName:item.realName || item.name, username:item.username, departmentName:item.departmentName } }
function normalizeDepartment(item) { return { id:item.id || item.departmentId, name:item.name || item.departmentName } }
function tagColor(seed = '') {
  const colors = ['#52C41A', '#13C2C2', '#1890FF', '#722ED1', '#FA8C16', '#F5222D', '#A0D911', '#2F855A']
  const index = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length
  return colors[index]
}
function resetPoint() { Object.assign(point, { id:null, loading:false, title:'', description:'', required:true, articleIds:[], videoIds:[], pptIds:[], articles:[], videos:[], ppts:[] }) }
function syncStoredId(id) { courseId.value = Number(id) || null; if (courseId.value) localStorage.setItem(STORAGE_KEY, String(courseId.value)); else localStorage.removeItem(STORAGE_KEY) }

async function loadOptions() {
  try {
    const [tree, tagData] = await Promise.all([
      getCategoryTree({ status:1 }),
      getTags({ status:1, page:1, size:50 }),
    ])
    categories.value = flattenCategories(categorySource(tree))
    tags.value = (tagData?.records || tagData || []).map(normalizeTag).filter(item => item.id && item.name)
  } catch (error) {
    toast(error.message, 'error')
  }
}

async function ensureDepartmentsLoaded() {
  if (departments.value.length) return
  const data = await getDepartmentOptions()
  departments.value = (data || []).map(normalizeDepartment).filter(item => item.id && item.name)
}

async function searchInstructors() {
  instructorPicker.loading = true
  try {
    const data = await getInstructorOptions({ keyword:instructorKeyword.value.trim(), limit:50 })
    const selected = selectedInstructor.value ? [selectedInstructor.value] : []
    const next = (data || []).map(normalizeInstructor).filter(item => item.id)
    instructors.value = [...new Map([...selected, ...next].map(item => [item.id, item])).values()]
  } catch (error) {
    toast(error.message, 'error')
  } finally {
    instructorPicker.loading = false
  }
}

async function openInstructorPicker() {
  instructorPicker.open = true
  await searchInstructors()
}

function selectInstructor(item) {
  basic.instructorId = item.id
  instructorPicker.open = false
}

async function searchTags() {
  try {
    const data = await getTags({ keyword:tagKeyword.value.trim(), status:1, page:1, size:50 })
    const next = (data?.records || data || []).map(normalizeTag).filter(item => item.id && item.name)
    const selected = basic.tagIds
      .map(id => tags.value.find(tag => tag.id === id))
      .filter(Boolean)
    const merged = new Map([...selected, ...next].map(item => [item.id, item]))
    tags.value = [...merged.values()]
  } catch (error) {
    toast(error.message, 'error')
  }
}

async function openTagPopup() {
  tagPopup.value = true
  await searchTags()
}
async function findTagByName(name) {
  const data = await getTags({ keyword:name, status:1, page:1, size:20 })
  return (data?.records || data || []).map(normalizeTag).find(item => item.name === name)
}

async function restoreCourse() {
  if (!courseId.value) return
  loading.value = true
  try {
    const data = await getCourse(courseId.value)
    fillCourse(data)
    step.value = Math.min(Math.max(data.currentStep || 2, 1), 3)
  } catch (error) {
    // 课程不存在时，清理残留的过期 ID 和缓存，避免重复报错
    syncStoredId(null)
    localStorage.removeItem(BASIC_CACHE_KEY)
    toast(error.message, 'error')
  } finally {
    loading.value = false
  }
}

function fillCourse(data = {}) {
  Object.assign(basic, {
    title:data.title || '',
    summary:data.summary || '',
    learningObjective:data.learningObjective || '',
    categoryId:data.categoryId || '',
    coverUrl:data.coverUrl || '',
    tagIds:[...(data.tagIds || [])],
    instructorId:data.instructorId || '',
    startAt:dateInput(data.startAt),
    departments:(data.departments || []).map(item => ({ departmentId:item.departmentId || item.id, required:Boolean(item.required) })),
  })
  // 将讲师信息放入 instructors 列表，使 selectedInstructor 计算属性能正确显示
  if (data.instructorId && data.instructorName) {
    instructors.value = [{ id:data.instructorId, realName:data.instructorName, username:'', departmentName:data.instructorDepartmentName||'' }]
  } else {
    instructors.value = []
  }
  chapters.value = (data.chapters || []).map(chapter => ({ ...chapter, points:chapter.points || [] }))
  activeChapterId.value = chapters.value[0]?.id || null
  courseStatus.value = data.status || 'DRAFT'
  ruleSummary.value = data.ruleSummary || null
}

function validateBasic() {
  const title = basic.title.trim()
  if (!title) return '请输入课程名称'
  if (title.length > 50) return '课程名称不能超过 50 个字符'
  if (!basic.categoryId) return '请选择所属类别'
  if (!basic.coverUrl) return '请上传课程封面'
  if (!basic.learningObjective.trim()) return '请输入学习目标'
  if (basic.learningObjective.trim().length > 300) return '学习目标不能超过 300 个字符'
  if (!basic.summary.trim()) return '请输入课程简介'
  if (basic.summary.trim().length > 500) return '课程简介不能超过 500 个字符'
  if (!basic.instructorId) return '请选择讲师'
  if (basic.tagIds.length > 3) return '标签最多选择 3 个'
  return ''
}

function departmentPayload() {
  const selected = basic.departments.length
    ? basic.departments
    : departments.value.map(item => ({ departmentId:item.id, required:false }))
  return selected.map(item => ({ departmentId:Number(item.departmentId), required:Boolean(item.required) }))
}

function basicPayload() {
  return {
    title:basic.title.trim(),
    summary:basic.summary.trim(),
    learningObjective:basic.learningObjective.trim(),
    categoryId:Number(basic.categoryId),
    coverUrl:basic.coverUrl,
    tagIds:basic.tagIds.map(Number),
    instructorId:Number(basic.instructorId),
    startAt:toDateTime(basic.startAt),
    departments:departmentPayload(),
  }
}

async function chooseCover(file) {
  if (!file) return
  if (!['image/jpeg', 'image/png'].includes(file.type)) return toast('封面仅支持 JPG、JPEG、PNG', 'error')
  if (file.size > 2 * 1024 * 1024) return toast('封面不能超过 2 MB', 'error')
  loading.value = true
  try { basic.coverUrl = (await uploadCourseCover(file)).url; toast('封面上传成功') }
  catch (error) { toast(error.message, 'error') }
  finally { loading.value = false }
}

function toggleTag(id) {
  const numeric = Number(id)
  const set = new Set(basic.tagIds)
  if (set.has(numeric)) set.delete(numeric)
  else {
    if (set.size >= 3) return toast('标签最多选择 3 个', 'error')
    set.add(numeric)
  }
  basic.tagIds = [...set]
}

async function addTagByInput() {
  const name = tagKeyword.value.trim()
  if (!name) return toast('请输入标签名称', 'error')
  if (name.length > 50) return toast('标签名称不能超过 50 个字符', 'error')
  if (basic.tagIds.length >= 3) return toast('标签最多选择 3 个，请先移除一个再新增', 'error')
  tagCreating.value = true
  try {
    const exists = tags.value.find(item => item.name === name) || await findTagByName(name)
    if (exists) {
      tags.value = [exists, ...tags.value.filter(item => item.id !== exists.id)]
      if (!basic.tagIds.includes(exists.id)) basic.tagIds = [...basic.tagIds, exists.id]
      tagKeyword.value = ''
      tagPopup.value = false
      toast('标签已添加')
      return
    }
    const created = normalizeTag(await createTag({ name, color:tagColor(name), status:1 }))
    tags.value = [created, ...tags.value.filter(item => item.id !== created.id)]
    basic.tagIds = [...basic.tagIds, created.id]
    tagKeyword.value = ''
    tagPopup.value = false
    toast('标签已新增并添加')
  } catch (error) {
    toast(error.message, 'error')
  } finally {
    tagCreating.value = false
  }
}

function toggleDepartment(id) {
  const numeric = Number(id)
  const index = basic.departments.findIndex(item => Number(item.departmentId) === numeric)
  if (index >= 0) basic.departments.splice(index, 1)
  else basic.departments.push({ departmentId:numeric, required:true })
}

function deptConfig(id) { return basic.departments.find(item => Number(item.departmentId) === Number(id)) }
function setDeptRequired(id, value) {
  const config = deptConfig(id)
  if (config) config.required = value === 'true'
}

async function syncBasicBeforeRule() {
  if (!basic.departments.length) throw new Error('请至少选择一个发布部门')
  await updateCourseBasic(courseId.value, basicPayload())
}

async function saveBasic() {
  const error = validateBasic()
  if (error) return toast(error, 'error')
  loading.value = true
  try {
    await ensureDepartmentsLoaded()
    const data = courseId.value ? await updateCourseBasic(courseId.value, basicPayload()) : await createCourse(basicPayload())
    syncStoredId(data.courseId || courseId.value)
    localStorage.removeItem(BASIC_CACHE_KEY)   // 数据已存后端，清除本地缓存
    step.value = 2
    await refreshCourse()
    toast('基础信息已保存')
  } catch (err) {
    toast(err.message, 'error')
  } finally {
    loading.value = false
  }
}

async function refreshCourse() {
  if (!courseId.value) return
  const data = await getCourse(courseId.value)
  fillCourse(data)
}

function cleanTitle(value) {
  if (!value) return ''
  if (typeof value === 'object') return value.title || value.name || ''
  const text = String(value).trim()
  if (/^\{.*\}$/.test(text)) {
    try {
      const parsed = JSON.parse(text)
      return parsed.title || parsed.name || text
    } catch {
      const match = text.match(/title["']?\s*[:：]\s*["']?([^"'}]+)["']?/i)
      return match?.[1] || text
    }
  }
  return text
}
function chapterDisplayTitle(chapter) { return cleanTitle(chapter?.title) || `第${chapter?.sort || ''}章` }

async function saveChapter() {
  const title = chapterTitle.value.trim()
  if (!title) return toast('请输入章节名称', 'error')
  if (title.length > 200) return toast('章节名称不能超过 200 个字符', 'error')
  try {
    if (editingChapterId.value) await updateChapter(courseId.value, editingChapterId.value, { title })
    else await createChapter(courseId.value, title)
    chapterTitle.value = ''
    editingChapterId.value = null
    await refreshCourse()
    toast('章节已保存')
  } catch (error) { toast(error.message, 'error') }
}

function editChapter(chapter) { editingChapterId.value = chapter.id; chapterTitle.value = chapterDisplayTitle(chapter) }
function cancelChapterEdit() { editingChapterId.value = null; chapterTitle.value = '' }
function ask(title, content, action) { Object.assign(confirmBox, { open:true, title, content, action, loading:false }) }
async function confirmAction() { confirmBox.loading = true; try { await confirmBox.action?.(); confirmBox.open = false } finally { confirmBox.loading = false } }

function removeChapter(chapter) {
  ask('删除章节', `确定删除“${chapter.title}”吗？章节下存在课程点时后端会拒绝删除。`, async () => {
    try { await deleteChapter(courseId.value, chapter.id); resetPoint(); await refreshCourse(); toast('章节已删除') }
    catch (error) { toast(error.message, 'error') }
  })
}

async function moveChapter(index, direction) {
  const next = [...chapters.value]
  const target = index + direction
  if (target < 0 || target >= next.length) return
  ;[next[index], next[target]] = [next[target], next[index]]
  try { await orderChapters(courseId.value, next.map(item => item.id)); chapters.value = next; toast('章节顺序已保存') }
  catch (error) { toast(error.message, 'error') }
}

async function dropChapter(targetId) {
  if (!draggingChapterId.value || draggingChapterId.value === targetId) return
  const from = chapters.value.findIndex(item => item.id === draggingChapterId.value)
  const to = chapters.value.findIndex(item => item.id === targetId)
  if (from < 0 || to < 0) return
  const next = [...chapters.value]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  try {
    await orderChapters(courseId.value, next.map(item => item.id))
    chapters.value = next
    toast('章节顺序已保存')
  } catch (error) {
    toast(error.message, 'error')
  } finally {
    draggingChapterId.value = null
  }
}

async function movePoint(index, direction) {
  const chapter = activeChapter.value
  const next = [...(chapter?.points || [])]
  const target = index + direction
  if (!chapter || target < 0 || target >= next.length) return
  ;[next[index], next[target]] = [next[target], next[index]]
  try { await orderPoints(courseId.value, chapter.id, next.map(item => item.id)); chapter.points = next; toast('课程点顺序已保存') }
  catch (error) { toast(error.message, 'error') }
}

async function dropPoint(targetId) {
  const chapter = activeChapter.value
  if (!chapter || !draggingPointId.value || draggingPointId.value === targetId) return
  const next = [...(chapter.points || [])]
  const from = next.findIndex(item => item.id === draggingPointId.value)
  const to = next.findIndex(item => item.id === targetId)
  if (from < 0 || to < 0) return
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  try {
    await orderPoints(courseId.value, chapter.id, next.map(item => item.id))
    chapter.points = next
    toast('课程点顺序已保存')
  } catch (error) {
    toast(error.message, 'error')
  } finally {
    draggingPointId.value = null
  }
}

async function editPoint(row = null) {
  resetPoint()
  if (!row) return
  point.loading = true
  try {
    const data = await getPoint(courseId.value, activeChapter.value.id, row.id)
    Object.assign(point, {
      id:data.id, title:data.title || '', description:data.description || '', required:Boolean(data.required),
      articles:data.articles || [], videos:data.videos || [], ppts:data.ppts || [],
      articleIds:(data.articles || []).map(item => item.id),
      videoIds:(data.videos || []).map(item => item.id),
      pptIds:(data.ppts || []).map(item => item.id),
    })
  } catch (error) { toast(error.message, 'error') }
  finally { point.loading = false }
}

function pointPayload() {
  return {
    title:point.title.trim(),
    description:point.description.trim() || null,
    required:Boolean(point.required),
    articleIds:point.articleIds.map(Number),
    videoIds:point.videoIds.map(Number),
    pptIds:point.pptIds.map(Number),
  }
}

async function savePoint() {
  if (!activeChapter.value) return toast('请先创建章节', 'error')
  if (!point.title.trim()) return toast('请输入课程点名称', 'error')
  if (point.title.trim().length > 50) return toast('课程点名称不能超过 50 个字符', 'error')
  if (point.description.length > 500) return toast('课程点简介不能超过 500 个字符', 'error')
  if (!resourceCount.value) return toast('课程点至少关联一个已发布课件', 'error')
  point.loading = true
  try {
    if (point.id) await updatePoint(courseId.value, activeChapter.value.id, point.id, pointPayload())
    else await createPoint(courseId.value, activeChapter.value.id, pointPayload())
    resetPoint()
    await refreshCourse()
    activeChapterId.value = activeChapter.value?.id || activeChapterId.value
    toast('课程点已保存')
  } catch (error) { toast(error.message, 'error') }
  finally { point.loading = false }
}

function removePoint(row) {
  ask('删除课程点', `确定删除“${row.title}”吗？只解除课件关系，不删除课件库资源。`, async () => {
    try { await deletePoint(courseId.value, activeChapter.value.id, row.id); resetPoint(); await refreshCourse(); toast('课程点已删除') }
    catch (error) { toast(error.message, 'error') }
  })
}

function resourceKey(type) { return type === 'article' ? 'articles' : type === 'video' ? 'videos' : 'ppts' }
function resourceIdsKey(type) { return type === 'article' ? 'articleIds' : type === 'video' ? 'videoIds' : 'pptIds' }
function resourceLabel(type) { return { article:'文章', video:'视频', ppt:'PPT' }[type] }
function resourceSize(row) { return row.durationText || row.fileSizeText || (row.pageCount ? `${row.pageCount} 页` : row.summary || row.description || '已发布') }

async function openPicker(type) {
  Object.assign(resourcePicker, { open:true, type, loading:true, keyword:'', rows:[] })
  await loadResources()
}

async function loadResources() {
  resourcePicker.loading = true
  try {
    const params = { keyword:resourcePicker.keyword, page:1, size:20 }
    const data = resourcePicker.type === 'article'
      ? await getPublishedArticles(params)
      : resourcePicker.type === 'video'
        ? await getPublishedVideos(params)
        : await getPublishedPpts(params)
    resourcePicker.rows = data?.records || data || []
  } catch (error) {
    resourcePicker.rows = []
    toast(resourcePicker.type === 'video' ? `视频选择接口参数不一致：${error.message}` : error.message, 'error')
  } finally {
    resourcePicker.loading = false
  }
}

function addResource(row) {
  const idsKey = resourceIdsKey(resourcePicker.type)
  const listKey = resourceKey(resourcePicker.type)
  if (point[idsKey].includes(row.id)) return toast('该课件已关联', 'error')
  point[idsKey].push(row.id)
  point[listKey].push(row)
}

function removeResource(type, id) {
  const idsKey = resourceIdsKey(type)
  const listKey = resourceKey(type)
  point[idsKey] = point[idsKey].filter(item => item !== id)
  point[listKey] = point[listKey].filter(item => item.id !== id)
}

function jumpLibrary(type) {
  resourcePicker.open = false
  toast('请在全局课件库上传并发布后，再回到课程点中关联')
  emit('open-library', type)
}

async function goStep3() {
  if (!canGoStep3.value) return toast('请至少创建一个课程点', 'error')
  step.value = 3
  try { await ensureDepartmentsLoaded() } catch (error) { toast(error.message, 'error') }
  await refreshRule()
}

async function refreshRule() {
  if (!courseId.value) return
  loading.value = true
  try { const data = await getCourse(courseId.value); ruleSummary.value = data.ruleSummary || ruleSummary.value; if (data.departments) fillCourse(data) }
  catch (error) { toast(error.message, 'error') }
  finally { loading.value = false }
}

async function saveRuleOnly() {
  if (!courseId.value) return
  loading.value = true
  try { await syncBasicBeforeRule(); ruleSummary.value = await saveCompletionRule(courseId.value); toast('草稿已保存') }
  catch (error) { toast(error.message, 'error') }
  finally { loading.value = false }
}

async function publishCourse() {
  if (!courseId.value) return
  loading.value = true
  try {
    await syncBasicBeforeRule()
    const result = await saveCompletionRule(courseId.value)
    ruleSummary.value = result
    if (!result.structureValid) return toast('结构检查未通过，请先处理错误后再发布', 'error')
    await updateCourseStatus(courseId.value, 'PUBLISHED')
    resetAll()
    toast('课程已发布，已回到新建课程')
  } catch (error) { toast(error.message, 'error') }
  finally { loading.value = false }
}

function cancelDraft() {
  if (!courseId.value) { resetAll(); return }
  ask('取消并删除草稿', '确定删除当前课程草稿吗？该操作只删除课程创建草稿，不删除全局课件库资源。', async () => {
    try { await deleteCourseDraft(courseId.value); resetAll(); toast('课程草稿已删除') }
    catch (error) { toast(error.message, 'error') }
  })
}

function resetAll() {
  syncStoredId(null)
  localStorage.removeItem(BASIC_CACHE_KEY)
  step.value = 1
  Object.assign(basic, { title:'', summary:'', learningObjective:'', categoryId:'', coverUrl:'', tagIds:[], instructorId:'', startAt:'', departments:[] })
  instructors.value = []
  chapters.value = []
  activeChapterId.value = null
  draggingChapterId.value = null
  draggingPointId.value = null
  editingChapterId.value = null
  chapterTitle.value = ''
  ruleSummary.value = null
  courseStatus.value = 'DRAFT'
  resetPoint()
}

// ---- 本地表单缓存：支持未提交数据的恢复 ----
function cacheBasic() {
  try {
    const instr = selectedInstructor.value
    const snap = { title:basic.title, summary:basic.summary, learningObjective:basic.learningObjective, categoryId:basic.categoryId, coverUrl:basic.coverUrl, tagIds:[...basic.tagIds], instructorId:basic.instructorId, instructorName:instr?.realName||'', instructorUsername:instr?.username||'', instructorDept:instr?.departmentName||'', startAt:basic.startAt }
    const has = snap.title || snap.summary || snap.categoryId || snap.coverUrl || snap.instructorId
    if (has) localStorage.setItem(BASIC_CACHE_KEY, JSON.stringify(snap))
    else localStorage.removeItem(BASIC_CACHE_KEY)
  } catch { /* quota */ }
}
function restoreBasicCache() {
  try {
    const raw = localStorage.getItem(BASIC_CACHE_KEY)
    if (!raw) return false
    const c = JSON.parse(raw)
    if (!c || (!c.title && !c.summary && !c.categoryId && !c.coverUrl && !c.instructorId)) return false
    Object.assign(basic, { title:c.title||'', summary:c.summary||'', learningObjective:c.learningObjective||'', categoryId:c.categoryId||'', coverUrl:c.coverUrl||'', tagIds:[...(c.tagIds||[])], instructorId:c.instructorId||'', startAt:c.startAt||'' })
    // 恢复讲师显示信息
    if (c.instructorId && (c.instructorName || c.instructorUsername)) {
      instructors.value = [{ id:c.instructorId, realName:c.instructorName||'', username:c.instructorUsername||'', departmentName:c.instructorDept||'' }]
    } else {
      instructors.value = []
    }
    return true
  } catch { return false }
}

onMounted(async () => {
  await loadOptions()
  if (courseId.value) {
    await restoreCourse()          // 恢复后端草稿；若失败会自动清理
  } else if (!props.editCourseId) {
    restoreBasicCache()            // 无后端草稿时恢复本地缓存
  }
})

watch(() => props.resetKey, async () => {
  if (props.editCourseId) {
    syncStoredId(props.editCourseId)
    await restoreCourse()
  } else {
    const storedId = Number(localStorage.getItem(STORAGE_KEY)) || null
    if (storedId) {
      courseId.value = storedId
      await restoreCourse()        // 恢复后端草稿；若失败会自动清理并回退到空白
    } else {
      resetAll()
      restoreBasicCache()          // 无后端草稿时恢复本地缓存
    }
  }
})

// 监听 basic 变化，自动缓存（仅在非编辑模式时）
watch(() => ({ ...basic, tagIds:[...basic.tagIds] }), () => {
  if (!props.editCourseId) cacheBasic()
}, { deep: true })
</script>

<template>
  <section class="course-create">
    <div v-if="message" class="toast" :class="message.type">{{ message.text }}</div>

    <div class="stepper card">
      <template v-for="(item, index) in stepItems" :key="item.no">
        <div class="step" :class="{ active: step === item.no, done: step > item.no }">
          <i>{{ step > item.no ? '✓' : item.no }}</i>
          <div><strong>{{ item.title }}</strong><span>{{ item.desc }}</span></div>
        </div>
        <b v-if="index < stepItems.length - 1"></b>
      </template>
    </div>

    <div v-if="loading && !courseId" class="state card"><span class="loader"></span>正在初始化课程创建模块...</div>

    <template v-else>
      <section v-if="step === 1" class="panel card basic-panel">
        <header><h2>基础信息</h2><small>字段严格按照课程创建接口提交，图片中的学时、考核方式、适用对象已删除。</small></header>
        <div class="basic-sketch">
          <div class="basic-left">
            <div class="top-row">
              <label>课程名称 <em>*</em><input v-model="basic.title" maxlength="50" placeholder="请输入课程名称" /><small>{{ basic.title.length }}/50</small></label>
              <label>所属类别 <em>*</em><select v-model="basic.categoryId"><option value="">请选择课程类别</option><option v-for="item in categories" :key="item.id" :value="item.id">{{ item.name }}</option></select><small v-if="!categories.length">暂无类别数据</small></label>
            </div>
            <label class="summary">课程简介 <em>*</em><textarea v-model="basic.summary" maxlength="500" placeholder="请输入课程简介，介绍课程目标、内容、收益等..."></textarea><small>{{ basic.summary.length }}/500</small></label>
            <div class="bottom-row">
              <label>讲师 <em>*</em><button type="button" class="picker-field" @click="openInstructorPicker"><span v-if="selectedInstructor">{{ selectedInstructor.realName || selectedInstructor.username }}{{ selectedInstructor.departmentName ? `（${selectedInstructor.departmentName}）` : '' }}</span><span v-else>搜索并选择讲师</span><AppIcon name="search" :size="16" /></button></label>
              <label>开课时间 <input v-model="basic.startAt" type="date" /></label>
              <div class="tags">
                <strong>标签 <button type="button" class="tag-add" title="添加标签" @click="openTagPopup">＋</button></strong>
                <div class="selected-tags"><span v-for="item in selectedTags" :key="item.id" :style="{ borderColor:item.color || '#d2e8d3' }">{{ item.name }}<button type="button" @click="toggleTag(item.id)">×</button></span><em v-if="!selectedTags.length">最多 3 个</em></div>
              </div>
            </div>
          </div>
          <label class="objective">学习目标 <em>*</em><textarea v-model="basic.learningObjective" maxlength="300" placeholder="请描述学员完成本课程后应达到的知识、技能或能力目标..."></textarea><small>{{ basic.learningObjective.length }}/300</small></label>
          <label class="cover">封面上传 <em>*</em><input type="file" accept="image/jpeg,image/png" @change="chooseCover($event.target.files[0])" /><img v-if="basic.coverUrl" :src="basic.coverUrl" alt="课程封面" /><span v-else><AppIcon name="image" :size="36" />点击上传封面<small>JPG/PNG，最大 2MB</small></span></label>
        </div>
      </section>

      <section v-else-if="step === 2" class="course-points">
        <div class="chapter-card card">
          <h2>章节管理</h2>
          <div class="inline-form"><input v-model="chapterTitle" maxlength="200" placeholder="请输入章节名称" /><button @click="saveChapter">{{ editingChapterId ? '保存' : '新增' }}</button><button v-if="editingChapterId" class="ghost" @click="cancelChapterEdit">取消</button></div>
          <div class="chapter-list">
            <div v-for="chapter in chapters" :key="chapter.id" class="chapter" :class="{ active: activeChapterId === chapter.id, dragging: draggingChapterId === chapter.id }" draggable="true" @dragstart="draggingChapterId = chapter.id" @dragover.prevent @drop="dropChapter(chapter.id)" @dragend="draggingChapterId = null" @click="activeChapterId = chapter.id">
              <span class="drag-handle">☰</span>
              <div><strong>{{ chapterDisplayTitle(chapter) }}</strong><small>{{ chapter.points?.length || 0 }} 个课程点</small></div>
              <button title="编辑" @click.stop="editChapter(chapter)">✎</button><button title="删除" @click.stop="removeChapter(chapter)">🗑</button>
            </div>
            <p v-if="!chapters.length" class="empty">请先创建章节，再添加课程点。</p>
          </div>
        </div>

        <div class="points-card card">
          <header><h2>课程点管理 <small v-if="activeChapter">（{{ chapterDisplayTitle(activeChapter) }}）</small></h2><button @click="resetPoint">+ 新增课程点</button></header>
          <table><thead><tr><th>顺序</th><th>课程点名称</th><th>关联课件数量</th><th>属性</th></tr></thead>
            <tbody v-if="activeChapter?.points?.length"><tr v-for="(row, index) in activeChapter.points" :key="row.id" :class="{ selected: point.id === row.id, dragging: draggingPointId === row.id }" draggable="true" @click="editPoint(row)" @dragstart="draggingPointId = row.id" @dragover.prevent @drop="dropPoint(row.id)" @dragend="draggingPointId = null">
              <td><span class="drag-handle">☰</span><span>{{ index + 1 }}</span></td>
              <td>{{ row.title }}</td><td>{{ number(row.resourceCount ?? ((row.articleCount||0)+(row.videoCount||0)+(row.pptCount||0))) }} 个</td><td>{{ row.required ? '必修' : '选修' }}</td>
            </tr></tbody>
          </table>
          <p v-if="!activeChapter?.points?.length" class="empty">当前章节暂无课程点。</p>
        </div>

        <div class="point-card card">
          <h2>课程点编辑</h2>
          <label>课程点名称 <em>*</em><input v-model="point.title" maxlength="50" placeholder="请输入课程点名称" /><small>{{ point.title.length }}/50</small></label>
          <label>学习目标/简介<textarea v-model="point.description" maxlength="500" placeholder="描述该课程点的学习内容与目标"></textarea><small>{{ point.description.length }}/500</small></label>
          <label class="required"><input v-model="point.required" type="checkbox" />设为必修课程点</label>
          <div class="resource-block" v-for="type in ['article','video','ppt']" :key="type">
            <header><strong>关联{{ resourceLabel(type) }}</strong><div class="resource-actions"><button @click="openPicker(type)">+ 从课件库选择</button><button class="upload-link" @click="jumpLibrary(type)">上传{{ resourceLabel(type) }}</button></div></header>
            <ul v-if="point[resourceKey(type)].length"><li v-for="item in point[resourceKey(type)]" :key="item.id"><span>{{ item.title }}</span><small>{{ resourceSize(item) }}</small><button @click="removeResource(type, item.id)">移除</button></li></ul>
            <p v-else>尚未关联{{ resourceLabel(type) }}</p>
          </div>
          <footer><button class="ghost" @click="resetPoint">清空</button><button class="primary" :disabled="point.loading" @click="savePoint">{{ point.id ? '保存课程点' : '新增课程点' }}</button></footer>
        </div>
      </section>

      <section v-else class="rules card">
        <header><h2>完成规则设置</h2><button @click="refreshRule">刷新状态</button></header>
        <div class="rule-layout">
          <div class="rule-main">
            <div class="publish-scope">
              <h3>选择科室 <em>*</em><small>悬停已选科室可设置必修或选修</small></h3>
              <div class="dept-choice-list">
                <label v-for="item in departments" :key="item.id" :class="{ checked: deptConfig(item.id) }">
                  <input type="checkbox" :checked="Boolean(deptConfig(item.id))" @change="toggleDepartment(item.id)" />
                  <span>{{ item.name }}</span>
                  <div v-if="deptConfig(item.id)" class="dept-mode">
                    <button type="button" :class="{ active: deptConfig(item.id).required }" @click.prevent="setDeptRequired(item.id, 'true')">必修</button>
                    <button type="button" :class="{ active: !deptConfig(item.id).required }" @click.prevent="setDeptRequired(item.id, 'false')">选修</button>
                  </div>
                  <b v-if="deptConfig(item.id)">{{ deptConfig(item.id).required ? '必修' : '选修' }}</b>
                </label>
              </div>
            </div>
          </div>
          <aside class="rule-stats">
            <div><span>必修课程点数</span><strong>{{ number(ruleSummary?.requiredPointCount) }}</strong></div>
            <div><span>选修课程点数</span><strong>{{ number(ruleSummary?.optionalPointCount) }}</strong></div>
            <div><span>当前状态</span><strong>{{ courseStatus === 'PUBLISHED' ? '已发布' : '草稿' }}</strong></div>
          </aside>
        </div>
      </section>

      <footer class="bottom-actions card">
        <button v-if="step === 1" class="ghost" @click="cancelDraft">取消</button>
        <button v-else class="ghost" @click="step--">上一步</button>
        <span></span>
        <button v-if="step === 1" class="primary" :disabled="loading" @click="saveBasic">{{ loading ? '保存中...' : '下一步' }}</button>
        <button v-else-if="step === 2" class="primary" @click="goStep3">下一步</button>
        <template v-else><button class="ghost strong" :disabled="loading" @click="saveRuleOnly">保存草稿</button><button class="primary" :disabled="loading" @click="publishCourse">发布课程</button></template>
      </footer>
    </template>

    <div v-if="resourcePicker.open" class="overlay">
      <div class="dialog picker">
        <header><h2>选择{{ resourceLabel(resourcePicker.type) }}</h2><button @click="resourcePicker.open=false">×</button></header>
        <div class="picker-tools"><input v-model="resourcePicker.keyword" placeholder="搜索标题..." @keyup.enter="loadResources" /><button @click="loadResources">查询</button><button class="upload-link" @click="jumpLibrary(resourcePicker.type)">去上传{{ resourceLabel(resourcePicker.type) }}</button></div>
        <div class="picker-list">
          <div v-if="resourcePicker.loading" class="state"><span class="loader"></span>正在加载课件...</div>
          <button v-for="row in resourcePicker.rows" v-else :key="row.id" @click="addResource(row)"><strong>{{ row.title }}</strong><span>{{ resourceSize(row) }}</span><i>{{ point[resourceIdsKey(resourcePicker.type)].includes(row.id) ? '已选' : '选择' }}</i></button>
          <p v-if="!resourcePicker.loading && !resourcePicker.rows.length" class="empty">暂无已发布{{ resourceLabel(resourcePicker.type) }}</p>
        </div>
      </div>
    </div>

    <div v-if="tagPopup" class="overlay">
      <div class="dialog mini-dialog tag-dialog">
        <header><h2>添加标签</h2><button @click="tagPopup=false">×</button></header>
        <div class="mini-body">
          <div class="mini-search"><input v-model="tagKeyword" maxlength="50" placeholder="输入标签名，已有则添加，不存在则创建" autofocus @keyup.enter="addTagByInput" /><button :disabled="tagCreating" @click="addTagByInput">{{ tagCreating ? '处理中...' : '添加' }}</button></div>
          <div class="tag-list popup-list"><button v-for="item in tags" :key="item.id" type="button" :class="{ active: basic.tagIds.includes(item.id) }" :style="{ borderColor:item.color || '#d2e8d3' }" @click="toggleTag(item.id)">{{ item.name }}</button><span v-if="!tags.length">暂无标签，可输入名称后添加。</span></div>
        </div>
      </div>
    </div>

    <div v-if="instructorPicker.open" class="overlay">
      <div class="dialog mini-dialog">
        <header><h2>选择讲师</h2><button @click="instructorPicker.open=false">×</button></header>
        <div class="mini-body">
          <div class="mini-search"><input v-model="instructorKeyword" placeholder="输入讲师姓名" autofocus @keyup.enter="searchInstructors" /><button :disabled="instructorPicker.loading" @click="searchInstructors">{{ instructorPicker.loading ? '查询中...' : '查询' }}</button></div>
          <div class="instructor-list">
            <button v-for="item in instructors" :key="item.id" :class="{ active:Number(item.id) === Number(basic.instructorId) }" @click="selectInstructor(item)"><strong>{{ item.realName || item.username }}</strong><span>{{ item.departmentName || '' }}</span></button>
            <p v-if="!instructors.length && !instructorPicker.loading" class="empty">暂无匹配讲师</p>
          </div>
        </div>
      </div>
    </div>

    <div v-if="confirmBox.open" class="overlay">
      <div class="dialog confirm"><header><h2>{{ confirmBox.title }}</h2><button @click="confirmBox.open=false">×</button></header><p>{{ confirmBox.content }}</p><footer><button class="ghost" @click="confirmBox.open=false">取消</button><button class="danger" :disabled="confirmBox.loading" @click="confirmAction">确定</button></footer></div>
    </div>
  </section>
</template>

<style scoped>
.course-create{min-height:calc(100vh - 79px);padding:18px;background:#f7f9f8;color:#252d29}.card{background:#fff;border:1px solid #e7ebe8;border-radius:14px;box-shadow:0 4px 14px rgba(17,62,42,.05)}.toast{position:fixed;z-index:70;top:92px;left:50%;transform:translateX(-50%);padding:11px 20px;color:#fff;background:#238b57;border-radius:8px}.toast.error{background:#ce4e4e}.stepper{display:flex;align-items:center;gap:28px;margin-bottom:16px;padding:23px 7%;}.step{display:flex;align-items:center;gap:16px;min-width:190px}.step i{width:48px;height:48px;display:grid;place-items:center;border:1px solid #d7ded9;border-radius:50%;font-size:22px;font-style:normal}.step.active i,.step.done i{color:#fff;background:linear-gradient(135deg,#8bd836,#13823e);border:0}.step strong,.step span{display:block}.step strong{font-size:16px}.step span{margin-top:5px;color:#7a837f;font-size:13px}.stepper>b{height:1px;flex:1;border-top:1px dashed #72bd55}.panel{padding:26px 30px}.panel header{display:flex;align-items:baseline;gap:14px;margin-bottom:24px}.panel h2,.chapter-card h2,.points-card h2,.point-card h2,.rules h2{margin:0;font-size:20px}.panel small{color:#78827d}.basic-grid{display:grid;grid-template-columns:1.1fr 1.05fr 260px 1.35fr;gap:22px}.basic-grid label{position:relative;display:block;font-weight:600;font-size:13px}.basic-grid input,.basic-grid select,.basic-grid textarea,.inline-form input,.point-card input,.point-card textarea,.picker-tools input{width:100%;margin-top:10px;padding:12px;border:1px solid #dce2de;border-radius:8px;background:#fff;outline:none}.basic-grid textarea,.point-card textarea{height:118px;resize:vertical}.basic-grid em,.point-card em,.departments em{color:#df3d3d;font-style:normal}.basic-grid label>small,.point-card label>small{position:absolute;right:12px;bottom:10px;color:#9ba29f;font-weight:400}.cover{grid-row:span 2;height:204px;border:1px dashed #b7cfc3;border-radius:9px;overflow:hidden;text-align:center;color:#717b76}.cover input{position:absolute;inset:0;z-index:2;opacity:0;cursor:pointer}.cover img{width:100%;height:100%;object-fit:cover}.cover>span{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px}.cover small{display:block;margin-top:6px}.objective,.summary{grid-row:span 2}.tags,.departments{grid-column:span 2}.tags strong,.departments strong{display:flex;gap:10px;align-items:center;margin-bottom:10px}.tags small,.departments small{color:#8c9490;font-weight:400}.tag-tools{display:flex;gap:8px;margin-bottom:10px}.tag-tools input{flex:1;margin:0!important}.tag-tools button{height:42px;margin:0!important;border-radius:8px!important}.tag-tools button:not(.create-tag){color:#fff!important;background:#19864c!important}.tag-tools .create-tag{color:#e87527!important;border:1px solid #f0b487!important;background:#fff!important}.tag-tools button:disabled{opacity:.55;cursor:not-allowed}.tag-list{display:flex;flex-wrap:wrap;gap:8px}.tag-list button{margin:0!important;padding:7px 13px;color:#237648;background:#edf7e9;border:1px solid #d2e8d3;border-radius:16px;cursor:pointer}.tag-list button.active{color:#fff;background:#1b874a}.tag-list span{color:#909995;font-size:13px}.tags p{margin:8px 0 0;color:#58836a}.dept-list{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.dept-list label{display:flex!important;align-items:center;gap:8px;min-height:45px;padding:8px 10px;border:1px solid #e1e8e3;border-radius:8px}.dept-list label.checked{background:#f4fbf4;border-color:#b6dfb9}.dept-list select{width:88px;margin:0 0 0 auto;padding:6px}.course-points{display:grid;grid-template-columns:310px 1fr 440px;gap:14px}.chapter-card,.points-card,.point-card,.rules{padding:20px}.inline-form{display:flex;gap:8px;margin:17px 0}.inline-form button,.points-card header button,.resource-block button,.picker-tools button{padding:0 13px;border-radius:7px;cursor:pointer}.inline-form button,.points-card header button,.resource-block header button:first-child,.picker-tools button{color:#fff;background:#19864c}.ghost{color:#1c7444!important;border:1px solid #9bc4aa!important;background:#fff!important}.chapter-list{display:grid;gap:12px}.chapter{display:grid;grid-template-columns:28px 28px 1fr 30px 30px;align-items:center;gap:8px;min-height:78px;padding:12px;border:1px solid #e2e8e4;border-radius:9px;cursor:pointer}.chapter.active{border-color:#62b73b;background:#f5fbef}.chapter button,.points-card td button{height:29px;background:#fff;border:1px solid #dfe5e1;border-radius:6px;cursor:pointer}.chapter small{display:block;margin-top:7px;color:#757f7a}.points-card header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.points-card table{width:100%;border-collapse:collapse;font-size:13px}.points-card th{height:43px;background:#fbfcfb;text-align:left}.points-card td{height:62px;border-top:1px solid #e8eeea}.points-card tr.selected{background:#f5fbef}.points-card td:first-child{display:flex;align-items:center;gap:6px}.danger-text{color:#e14d4d!important;background:none!important;border:0!important}.empty{margin:20px 0;color:#8a938e;text-align:center}.point-card label{display:block;position:relative;margin-bottom:14px;font-weight:600;font-size:13px}.required{display:flex!important;align-items:center;gap:8px;font-weight:400!important}.required input{width:auto;margin:0;accent-color:#15914c}.resource-block{margin:15px 0;padding:13px;border:1px solid #e3ebe5;border-radius:10px}.resource-block header{display:flex;justify-content:space-between;gap:10px;margin-bottom:10px}.upload-link{color:#e87527!important;border:1px solid #f0b487!important;background:#fff!important}.resource-block ul{padding:0;margin:0;list-style:none}.resource-block li{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;padding:8px 0;border-top:1px solid #eef2f0}.resource-block li:first-child{border-top:0}.resource-block small{color:#838c88}.resource-block p{margin:10px 0 0;color:#8a938e}.point-card footer,.bottom-actions,.dialog footer{display:flex;align-items:center;justify-content:flex-end;gap:12px}.point-card footer button,.bottom-actions button,.dialog footer button{height:40px;padding:0 24px;border-radius:8px;cursor:pointer}.primary{color:#fff;background:linear-gradient(90deg,#18924e,#65b51f)}.bottom-actions{position:sticky;bottom:0;z-index:4;margin-top:14px;padding:16px 18px}.bottom-actions span{flex:1}.strong{font-weight:700}.rules{padding:25px}.rules>header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}.rules>header button{height:38px;padding:0 15px;border:1px solid #dbe3df;border-radius:7px;background:#fff;cursor:pointer}.rule-layout{display:grid;grid-template-columns:1fr 370px;gap:26px}.fixed-rule{display:flex;gap:16px;padding:18px;border:1px solid #dbe9dc;border-radius:10px;background:#f8fcf7}.fixed-rule i{width:40px;height:40px;display:grid;place-items:center;color:#fff;background:#2b9259;border-radius:50%;font-style:normal}.fixed-rule p{margin:7px 0 0;color:#66706b}.summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0}.summary-grid span{padding:16px;border:1px solid #e4ebe7;border-radius:10px;color:#71807a}.summary-grid strong{display:block;margin-top:8px;color:#151b18;font-size:24px}.dept-summary{display:flex;flex-wrap:wrap;gap:10px}.dept-summary span{padding:8px 12px;color:#267a4c;background:#edf8ef;border-radius:16px}.check-box{padding:22px;border:1px solid #f1d3a9;border-radius:12px;background:#fffaf0}.check-box.ok{border-color:#c9e5c8;background:#f5fbf3}.check-box h3{margin:0 0 12px}.check-box li{margin:8px 0;color:#d14e4e}.state{min-height:260px;display:flex;align-items:center;justify-content:center;gap:10px;color:#87908b}.loader{width:22px;height:22px;border:2px solid #d9e4dd;border-top-color:#26905a;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.overlay{position:fixed;z-index:50;inset:0;display:grid;place-items:center;padding:20px;background:rgba(11,31,21,.42);backdrop-filter:blur(2px)}.dialog{width:min(720px,96vw);max-height:90vh;overflow:hidden;background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,35,20,.22)}.dialog>header{height:62px;display:flex;align-items:center;justify-content:space-between;padding:0 23px;border-bottom:1px solid #eaeeeb}.dialog h2{margin:0}.dialog header button{font-size:25px;color:#727a76;background:none;cursor:pointer}.picker-tools{display:flex;gap:10px;padding:16px}.picker-tools input{margin:0;flex:1}.picker-list{max-height:55vh;overflow:auto;padding:0 16px 18px}.picker-list>button{width:100%;display:grid;grid-template-columns:1fr auto 58px;gap:12px;align-items:center;padding:13px;border:1px solid #e6ece8;border-radius:8px;background:#fff;text-align:left;cursor:pointer}.picker-list>button+button{margin-top:8px}.picker-list span{color:#7d8581}.picker-list i{color:#218348;font-style:normal}.confirm{width:min(460px,96vw)}.confirm p{padding:26px;margin:0;line-height:1.8}.danger{color:#fff;background:#d84b4b}
@media(max-width:1350px){.basic-grid{grid-template-columns:1fr 1fr}.cover{grid-row:auto}.objective,.summary{grid-row:auto}.course-points{grid-template-columns:1fr}.rule-layout{grid-template-columns:1fr}.dept-list{grid-template-columns:1fr 1fr}}
@media(max-width:760px){.course-create{padding:10px}.stepper{overflow:auto;padding:16px;gap:14px}.step{min-width:180px}.basic-grid,.dept-list,.summary-grid{grid-template-columns:1fr}.tags,.departments{grid-column:auto}.bottom-actions{flex-wrap:wrap}.bottom-actions button{flex:1}.resource-block header{flex-direction:column}.picker-list>button{grid-template-columns:1fr}.course-points{gap:10px}.chapter{grid-template-columns:24px 24px 1fr 28px 28px}.points-card{overflow:auto}.points-card table{min-width:620px}}
</style>

<style scoped>
.basic-sketch{display:grid;grid-template-columns:minmax(480px,1.55fr) minmax(210px,.58fr) minmax(240px,.7fr);gap:26px;align-items:stretch}
.basic-left{display:grid;grid-template-rows:auto 1fr auto;gap:26px;min-width:0}
.top-row,.bottom-row{display:grid;grid-template-columns:1fr 1fr;gap:26px;align-items:end}
.basic-sketch label{position:relative;display:block;font-weight:600;font-size:13px}
.basic-sketch input,.basic-sketch select,.basic-sketch textarea{width:100%;margin-top:10px;padding:12px;border:1px solid #dce2de;border-radius:8px;background:#fff;outline:none}
.basic-sketch em{color:#df3d3d;font-style:normal}
.basic-sketch label>small{position:absolute;right:12px;bottom:10px;color:#9ba29f;font-weight:400}
.basic-sketch .summary textarea{height:156px}
.basic-sketch .objective textarea{height:100%;min-height:260px}
.basic-sketch .cover{height:auto;min-height:260px}
.bottom-row .tags{align-self:end}
.bottom-row .tags strong{height:21px;margin-bottom:10px}
.bottom-row .selected-tags{min-height:43px;padding:7px 0}
@media(max-width:1250px){.basic-sketch{grid-template-columns:1fr 1fr}.basic-left{grid-column:1 / -1}.basic-sketch .objective,.basic-sketch .cover{min-height:220px}}
@media(max-width:760px){.basic-sketch,.top-row,.bottom-row{grid-template-columns:1fr}.basic-sketch .objective textarea,.basic-sketch .cover{min-height:190px}}
.picker-field{width:100%;height:43px;margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 12px;color:#38423d;background:#fff;border:1px solid #dce2de;border-radius:8px;cursor:pointer;text-align:left}
.picker-field span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.tag-add{width:30px;height:30px;margin-left:auto;color:#fff;background:#1b874a;border-radius:50%;cursor:pointer;font-size:18px;line-height:1}
.selected-tags{display:flex;flex-wrap:wrap;gap:8px;min-height:42px;padding:8px 0}
.selected-tags span{display:inline-flex;align-items:center;gap:7px;padding:7px 10px;color:#237648;background:#edf7e9;border:1px solid #d2e8d3;border-radius:16px;font-weight:600}
.selected-tags span button{width:18px;height:18px;padding:0;color:#fff;background:#75aa7f;border-radius:50%;cursor:pointer}
.selected-tags em{color:#9aa19d;font-style:normal;font-size:13px}
.publish-scope{margin-bottom:18px;padding:18px;border:1px solid #e0ebe4;border-radius:12px;background:#fbfdfb}
.publish-scope h3{display:flex;align-items:center;gap:8px;margin:0 0 12px;font-size:16px}
.publish-scope em{color:#df3d3d;font-style:normal}
.publish-scope small{color:#88928d;font-weight:400}
.rule-main{min-width:0}
.dept-choice-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.dept-choice-list label{position:relative;min-height:62px;display:flex!important;align-items:center;gap:10px;padding:12px 14px;border:1px solid #e1e9e4;border-radius:12px;background:#fff;cursor:pointer;overflow:hidden;transition:.16s ease}
.dept-choice-list label:hover{border-color:#acd9b8;box-shadow:0 6px 18px rgba(28,116,68,.08)}
.dept-choice-list label.checked{border-color:#86cb91;background:linear-gradient(135deg,#f5fbef,#fff)}
.dept-choice-list input{width:16px;height:16px;margin:0;accent-color:#16884d;flex:0 0 auto}
.dept-choice-list span{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-weight:600}
.dept-choice-list b{margin-left:auto;padding:4px 9px;color:#247648;background:#e8f6e8;border-radius:999px;font-size:12px;white-space:nowrap}
.dept-mode{position:absolute;right:10px;top:50%;z-index:2;display:flex;gap:6px;padding:5px;background:#fff;border:1px solid #dbe7df;border-radius:999px;box-shadow:0 8px 22px rgba(20,67,42,.14);transform:translate(110%,-50%);opacity:0;pointer-events:none;transition:.16s ease}
.dept-choice-list label.checked:hover .dept-mode{transform:translate(0,-50%);opacity:1;pointer-events:auto}
.dept-choice-list label.checked:hover b{opacity:0}
.dept-mode button{height:28px;padding:0 12px;color:#3c4b44;background:#f4f7f5;border:0;border-radius:999px;cursor:pointer}
.dept-mode button.active{color:#fff;background:#16884d}
.rule-stats{display:grid;gap:14px;align-content:start}
.rule-stats div{padding:22px;border:1px solid #e3ebe6;border-radius:14px;background:linear-gradient(135deg,#fff,#f7fbf8);box-shadow:0 6px 18px rgba(17,62,42,.05)}
.rule-stats span{display:block;color:#7c8781;font-size:13px}
.rule-stats strong{display:block;margin-top:10px;color:#14211a;font-size:28px;line-height:1}
.mini-dialog{width:min(520px,94vw)}
.mini-body{padding:18px}
.mini-search{display:flex;gap:10px;margin-bottom:14px}
.mini-search input{flex:1;height:42px;padding:0 12px;border:1px solid #dce2de;border-radius:8px;outline:none}
.mini-search button{height:42px;padding:0 18px;color:#fff;background:#19864c;border-radius:8px;cursor:pointer}
.mini-search button:disabled{opacity:.55;cursor:not-allowed}
.popup-list{max-height:260px;overflow:auto}
.instructor-list{display:grid;gap:8px;max-height:330px;overflow:auto}
.instructor-list button{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid #e4ebe7;border-radius:8px;background:#fff;cursor:pointer;text-align:left}
.instructor-list button.active,.instructor-list button:hover{border-color:#73bd83;background:#f3fbf4}
.instructor-list strong{color:#25302b}
.instructor-list span{color:#7b8580;font-size:12px}
.chapter{grid-template-columns:28px 1fr 30px 30px!important}
.inline-form{align-items:center}
.inline-form input{height:40px;margin:0!important}
.inline-form button{height:40px;white-space:nowrap}
.resource-actions{display:flex;align-items:center;gap:12px}
.drag-handle{display:inline-grid;place-items:center;color:#8a9690;cursor:grab;font-size:18px;user-select:none}
.chapter.dragging,.points-card tr.dragging{opacity:.48}
.points-card tbody tr{cursor:pointer}
.points-card tbody tr:hover{background:#f8fcf7}
.points-card td:first-child{gap:10px!important}
@media(max-width:760px){.mini-search{flex-direction:column}.dept-list{grid-template-columns:1fr!important}}
</style>
