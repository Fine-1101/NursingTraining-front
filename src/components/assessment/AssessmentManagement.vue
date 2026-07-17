<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import {
  closeAssessment,
  createAssessment,
  createAssessmentQuestion,
  deleteAssessmentDraft,
  deleteAssessmentQuestion,
  exportAssessmentResults,
  getAssessment,
  getAssessmentQuestion,
  getAssessmentQuestionCapacity,
  getAssessmentQuestions,
  getAssessmentResult,
  getAssessmentResults,
  getAssessmentResultSummary,
  getAssessmentParticipants,
  getAssessmentReminders,
  getAssessments,
  publishAssessment,
  sendNonParticipantReminders,
  updateAssessment,
  updateAssessmentQuestion,
  updateAssessmentQuestionStatus,
} from '@/services/assessment'
import { getCategoryTree } from '@/services/category'
import { getCourses } from '@/services/course'
import { getSettingsDepartmentOptions } from '@/services/settings'

const props = defineProps({ section: { type:String, default:'题库管理' } })
const emit = defineEmits(['section-change'])

const active = ref(props.section || '题库管理')
const message = ref(null)
const loading = ref(false)
const categories = ref([])
const courses = ref([])
const departments = ref([])
const categoryTree = ref([])

const questionQuery = reactive({ keyword:'', categoryId:'', courseId:'', questionType:'', difficulty:'', status:'', scope:'', page:1, size:10 })
const questionPage = reactive({ records:[], total:0, pages:1 })
const questionModal = reactive({
  open:false, loading:false, mode:'create', id:null, categoryId:'', questionType:1, stem:'', analysis:'', difficulty:2, status:1,
  options:[option('A'), option('B'), option('C'), option('D')],
  courseIds:[],
})

const assessmentQuery = reactive({ keyword:'', courseId:'', categoryId:'', status:'', startFrom:'', startTo:'', page:1, size:10 })
const assessmentPage = reactive({ records:[], total:0, pages:1 })
const assessmentModal = reactive({
  open:false, loading:false, mode:'create', id:null, categoryId:'', courseId:'', title:'', description:'', startAt:'', endAt:'',
  durationMinutes:60, passScore:60, maxAttempts:1, difficultyLevel:2,
  drawRules:createDefaultDrawRules(),
})
const capacity = ref(null)

const resultQuery = reactive({ assessmentId:'', courseId:'', categoryId:'', departmentId:'', keyword:'', passed:'', submittedFrom:'', submittedTo:'', page:1, size:10 })
const resultPage = reactive({ records:[], total:0, pages:1 })
const resultDetail = reactive({ open:false, loading:false, data:null, summary:null })
const participantDialog = reactive({ open:false, loading:false, assessment:null, summary:null, records:[], total:0, pages:1 })
const participantQuery = reactive({ participationStatus:'ALL', keyword:'', departmentId:'', page:1, size:20 })
const reminderForm = reactive({ content:'', remindAll:true, sending:false, lastResult:null })
const selectedParticipantIds = ref(new Set())

const categoryOptions = computed(() => categories.value)
const courseOptions = computed(() => courses.value)
const currentTitle = computed(() => active.value)

/** 构建每个类别ID到其所有子孙ID（含自身）的映射 */
const categoryDescendantMap = computed(() => {
  const map = {}
  function walk(nodes) {
    for (const node of (nodes || [])) {
      const id = node.id || node.categoryId
      const desc = new Set([id])
      function collect(children) {
        for (const child of (children || [])) {
          const cid = child.id || child.categoryId
          if (cid) desc.add(cid)
          collect(child.children || [])
        }
      }
      collect(node.children || [])
      if (id) map[id] = desc
      walk(node.children || [])
    }
  }
  walk(categoryTree.value)
  return map
})

/** 题目弹窗中，按所选类别过滤可选课程（含子类别） */
const questionCourseOptions = computed(() => {
  const catId = questionModal.categoryId
  if (!catId) return courses.value
  const descendants = categoryDescendantMap.value[catId]
  if (!descendants) return []
  return courses.value.filter(c => descendants.has(c.categoryId))
})

/** 考核弹窗中，按所选类别过滤可选课程（含子类别） */
const assessmentCourseOptions = computed(() => {
  const catId = assessmentModal.categoryId
  if (!catId) return courses.value
  const descendants = categoryDescendantMap.value[catId]
  if (!descendants) return []
  return courses.value.filter(c => descendants.has(c.categoryId))
})

watch(() => props.section, value => {
  if (value && value !== active.value) {
    active.value = value
    loadCurrent()
  }
})

/** 切换所属类别时，清空已选课程并重新过滤 */
watch(() => questionModal.categoryId, () => {
  questionModal.courseIds = []
})

/** 考核弹窗切换类别时，清空已选课程 */
watch(() => assessmentModal.categoryId, () => {
  assessmentModal.courseId = ''
})

function option(key, content = '', isCorrect = false, sortOrder = 1) {
  return { optionKey:key, content, isCorrect, sortOrder }
}
function toast(text, type = 'success') {
  message.value = { text, type }
  window.setTimeout(() => { message.value = null }, 2600)
}
function number(value) { return Number(value || 0).toLocaleString('zh-CN') }
function money(value) { return Number(value || 0).toFixed(2) }
function statusText(value) { return ({ 0:'草稿', 1:'已发布', 2:'已关闭' })[Number(value)] || '未知' }
function questionStatusText(value) { return Number(value) === 1 ? '启用' : '停用' }
function questionTypeText(value) { return Number(value) === 1 ? '单选题' : '判断题' }
function difficultyText(value) { return value == null ? '不限难度' : (({ 1:'简单', 2:'中等', 3:'困难' })[Number(value)] || '中等') }
function createDefaultDrawRules() {
  return [
    { questionType:1, difficulty:null, questionCount:40, scorePerQuestion:2 },
    { questionType:2, difficulty:null, questionCount:20, scorePerQuestion:1 },
  ]
}
function passText(value) { return value === true ? '通过' : value === false ? '未通过' : '—' }
function participationText(value) {
  return ({ ALL:'全部', PARTICIPATED:'已参加', NOT_PARTICIPATED:'未参加', IN_PROGRESS:'答题中', SUBMITTED:'已交卷' })[value] || value || '—'
}
function normalizeDateTime(value) {
  if (!value) return ''
  return value.length === 16 ? `${value}:00` : value
}
function toInputDateTime(value) {
  if (!value) return ''
  return String(value).slice(0, 16)
}
function displayDateTime(value) {
  if (!value) return '—'
  return String(value).replace('T', ' ').replace(/\+\d{2}:\d{2}$/, '').replace(/Z$/, '')
}
function flattenCategories(nodes, prefix = '') {
  return (nodes || []).flatMap(item => {
    const name = item.name || item.categoryName || item.title || ''
    const id = item.id || item.categoryId
    const label = prefix ? `${prefix} / ${name}` : name
    const children = flattenCategories(item.children || [], label)
    return [{ id, name:label }, ...children].filter(row => row.id && row.name)
  })
}

async function loadOptions() {
  try {
    const [tree, coursePage, deptOptions] = await Promise.all([
      getCategoryTree({}),
      getCourses({ page:1, size:100 }),
      getSettingsDepartmentOptions().catch(() => []),
    ])
    const rawTree = tree?.categories || tree?.children || []
    categoryTree.value = rawTree
    categories.value = flattenCategories(rawTree)
    courses.value = (coursePage?.records || []).map(item => ({ id:item.id || item.courseId, title:item.title || item.courseTitle, categoryId:item.categoryId || null })).filter(item => item.id && item.title)
    departments.value = (deptOptions || []).map(item => ({ id:item.departmentId || item.id, name:item.departmentName || item.name })).filter(item => item.id && item.name)
  } catch (error) {
    toast(error.message, 'error')
  }
}
async function loadCurrent() {
  if (active.value === '题库管理') await loadQuestions()
  else if (active.value === '考核发布') await loadAssessments()
  else await loadResults()
}
function switchTab(tab) {
  active.value = tab
  emit('section-change', tab)
  loadCurrent()
}

async function loadQuestions() {
  loading.value = true
  try {
    const data = await getAssessmentQuestions({ ...questionQuery, keyword:questionQuery.keyword.trim() })
    Object.assign(questionPage, { records:data?.records || [], total:data?.total || 0, pages:data?.pages || 1 })
  } catch (error) { toast(error.message, 'error') }
  finally { loading.value = false }
}
function resetQuestionQuery() {
  Object.assign(questionQuery, { keyword:'', categoryId:'', courseId:'', questionType:'', difficulty:'', status:'', scope:'', page:1 })
  loadQuestions()
}
function resetQuestionOptions(type = questionModal.questionType) {
  if (Number(type) === 2) {
    questionModal.options = [option('TRUE', '正确', true, 1), option('FALSE', '错误', false, 2)]
  } else {
    questionModal.options = [option('A', '', true, 1), option('B', '', false, 2), option('C', '', false, 3), option('D', '', false, 4)]
  }
}
function openCreateQuestion() {
  Object.assign(questionModal, { open:true, loading:false, mode:'create', id:null, categoryId:'', questionType:1, stem:'', analysis:'', difficulty:2, status:1, courseIds:[] })
  resetQuestionOptions(1)
}
async function openEditQuestion(row) {
  Object.assign(questionModal, { open:true, loading:true, mode:'edit', id:row.id })
  try {
    const data = await getAssessmentQuestion(row.id)
    Object.assign(questionModal, {
      loading:false, categoryId:data.categoryId || '', questionType:data.questionType || 1, stem:data.stem || '',
      analysis:data.analysis || '', difficulty:data.difficulty || 2, status:data.status ?? 1,
      options:(data.options || []).map((item, index) => ({ optionKey:item.optionKey, content:item.content, isCorrect:Boolean(item.isCorrect), sortOrder:item.sortOrder || index + 1 })),
      courseIds:(data.courseIds || []).map(String),
    })
  } catch (error) {
    questionModal.open = false
    toast(error.message, 'error')
  }
}
function setCorrectOption(key) {
  questionModal.options.forEach(item => { item.isCorrect = item.optionKey === key })
}
function questionPayload() {
  const options = questionModal.options.map((item, index) => ({ optionKey:item.optionKey, content:item.content.trim(), isCorrect:Boolean(item.isCorrect), sortOrder:index + 1 }))
  if (!questionModal.categoryId) throw new Error('请选择课程类别')
  if (!questionModal.stem.trim()) throw new Error('请输入题干')
  if (!options.some(item => item.isCorrect)) throw new Error('请设置正确答案')
  if (options.some(item => !item.content)) throw new Error('请填写所有选项内容')
  return {
    categoryId:Number(questionModal.categoryId),
    questionType:Number(questionModal.questionType),
    stem:questionModal.stem.trim(),
    analysis:questionModal.analysis.trim() || null,
    difficulty:Number(questionModal.difficulty),
    status:Number(questionModal.status),
    options,
    courseIds:questionModal.courseIds.map(Number),
  }
}
async function saveQuestion() {
  try {
    questionModal.loading = true
    const payload = questionPayload()
    if (questionModal.mode === 'edit') await updateAssessmentQuestion(questionModal.id, payload)
    else await createAssessmentQuestion(payload)
    toast(questionModal.mode === 'edit' ? '题目已更新' : '题目已创建')
    questionModal.open = false
    await loadQuestions()
  } catch (error) { toast(error.message, 'error') }
  finally { questionModal.loading = false }
}
async function toggleQuestionStatus(row) {
  try {
    await updateAssessmentQuestionStatus(row.id, Number(row.status) === 1 ? 0 : 1)
    toast('题目状态已更新')
    await loadQuestions()
  } catch (error) { toast(error.message, 'error') }
}
async function removeQuestion(row) {
  if (!window.confirm(`确定删除题目“${String(row.stem || '').slice(0, 24)}”吗？`)) return
  try { await deleteAssessmentQuestion(row.id); toast('题目已删除'); await loadQuestions() }
  catch (error) { toast(error.message, 'error') }
}

async function loadAssessments() {
  loading.value = true
  try {
    const data = await getAssessments({ ...assessmentQuery, keyword:assessmentQuery.keyword.trim() })
    Object.assign(assessmentPage, { records:data?.records || [], total:data?.total || 0, pages:data?.pages || 1 })
  } catch (error) { toast(error.message, 'error') }
  finally { loading.value = false }
}
function resetAssessmentQuery() {
  Object.assign(assessmentQuery, { keyword:'', courseId:'', categoryId:'', status:'', startFrom:'', startTo:'', page:1 })
  loadAssessments()
}
function openCreateAssessment() {
  capacity.value = null
  Object.assign(assessmentModal, { open:true, loading:false, mode:'create', id:null, categoryId:'', courseId:'', title:'', description:'', startAt:'', endAt:'', durationMinutes:60, passScore:60, maxAttempts:1, difficultyLevel:2 })
  assessmentModal.drawRules = createDefaultDrawRules()
}
async function openEditAssessment(row) {
  capacity.value = null
  Object.assign(assessmentModal, { open:true, loading:true, mode:'edit', id:row.id })
  try {
    const data = await getAssessment(row.id)
    Object.assign(assessmentModal, {
      loading:false, categoryId:data.categoryId || '', title:data.title || '', description:data.description || '',
      startAt:toInputDateTime(data.startAt), endAt:toInputDateTime(data.endAt), durationMinutes:data.durationMinutes || 60,
      passScore:data.passScore || 60, maxAttempts:data.maxAttempts || 1,
      difficultyLevel:data.difficultyLevel || 2,
    })
    // categoryId 变化触发的 watch 是异步的，会在渲染前清空 courseId
    // 用 nextTick 等 watch 执行完后再设置 courseId
    await nextTick()
    assessmentModal.courseId = data.courseId || ''
    assessmentModal.drawRules = [1, 2].map(questionType => {
      const items = (data.drawRules || []).filter(item => Number(item.questionType) === questionType)
      return {
        questionType,
        difficulty:null,
        questionCount:items.reduce((sum, item) => sum + Number(item.questionCount || 0), 0),
        scorePerQuestion:Number(items[0]?.scorePerQuestion ?? (questionType === 1 ? 2 : 1)),
      }
    })
  } catch (error) {
    assessmentModal.open = false
    toast(error.message, 'error')
  }
}
function assessmentPayload() {
  if (!assessmentModal.courseId) throw new Error('请选择课程')
  if (!assessmentModal.title.trim()) throw new Error('请输入考核名称')
  if (!assessmentModal.startAt) throw new Error('请选择开考时间')
  const drawRules = assessmentModal.drawRules
    .filter(item => Number(item.questionCount) > 0)
    .map(item => ({ questionType:Number(item.questionType), difficulty:item.difficulty == null ? null : Number(item.difficulty), questionCount:Number(item.questionCount), scorePerQuestion:Number(item.scorePerQuestion) }))
  if (!drawRules.length) throw new Error('请至少设置一种抽题规则')
  return {
    courseId:Number(assessmentModal.courseId),
    title:assessmentModal.title.trim(),
    description:assessmentModal.description.trim() || null,
    startAt:normalizeDateTime(assessmentModal.startAt),
    endAt:normalizeDateTime(assessmentModal.endAt) || null,
    durationMinutes:Number(assessmentModal.durationMinutes),
    passScore:Number(assessmentModal.passScore),
    maxAttempts:Number(assessmentModal.maxAttempts),
    difficultyLevel:Number(assessmentModal.difficultyLevel),
    drawRules,
  }
}
async function saveAssessment() {
  try {
    assessmentModal.loading = true
    const payload = assessmentPayload()
    if (assessmentModal.mode === 'edit') await updateAssessment(assessmentModal.id, payload)
    else await createAssessment(payload)
    toast(assessmentModal.mode === 'edit' ? '考核已更新' : '考核草稿已创建')
    assessmentModal.open = false
    await loadAssessments()
  } catch (error) { toast(error.message, 'error') }
  finally { assessmentModal.loading = false }
}
async function checkCapacity(row) {
  try { capacity.value = await getAssessmentQuestionCapacity(row.id); toast(capacity.value.publishable ? '题量满足发布条件' : '题量不足，请调整题库或抽题规则', capacity.value.publishable ? 'success' : 'error') }
  catch (error) { toast(error.message, 'error') }
}
async function publishRow(row) {
  try {
    const data = await getAssessmentQuestionCapacity(row.id)
    if (!data.publishable && !window.confirm('当前题量检查未通过，仍要尝试发布吗？')) return
    await publishAssessment(row.id)
    toast('考核已发布')
    await loadAssessments()
  } catch (error) { toast(error.message, 'error') }
}
async function closeRow(row) {
  if (!window.confirm(`确定关闭考核“${row.title}”吗？`)) return
  try { await closeAssessment(row.id); toast('考核已关闭'); await loadAssessments() }
  catch (error) { toast(error.message, 'error') }
}
async function removeAssessment(row) {
  if (!window.confirm(`确定删除草稿“${row.title}”吗？`)) return
  try { await deleteAssessmentDraft(row.id); toast('考核草稿已删除'); await loadAssessments() }
  catch (error) { toast(error.message, 'error') }
}

async function openParticipants(row) {
  Object.assign(participantDialog, { open:true, loading:true, assessment:row, summary:null, records:[], total:0, pages:1 })
  Object.assign(participantQuery, { participationStatus:'ALL', keyword:'', departmentId:'', page:1, size:20 })
  Object.assign(reminderForm, { content:'', remindAll:true, sending:false, lastResult:null })
  selectedParticipantIds.value = new Set()
  try {
    const [detail, summary] = await Promise.all([
      getAssessment(row.id).catch(() => row),
      getAssessmentResultSummary(row.id).catch(() => null),
    ])
    participantDialog.assessment = { ...row, ...detail }
    participantDialog.summary = summary
    await loadParticipants()
  } catch (error) {
    toast(error.message, 'error')
  } finally {
    participantDialog.loading = false
  }
}

async function loadParticipants() {
  if (!participantDialog.assessment?.id) return
  participantDialog.loading = true
  try {
    const data = await getAssessmentParticipants(participantDialog.assessment.id, {
      participationStatus:participantQuery.participationStatus,
      keyword:participantQuery.keyword.trim(),
      departmentId:participantQuery.departmentId,
      page:participantQuery.page,
      size:participantQuery.size,
    })
    participantDialog.records = data?.records || []
    participantDialog.total = data?.total || 0
    participantDialog.pages = data?.pages || 1
    selectedParticipantIds.value = new Set([...selectedParticipantIds.value].filter(id => participantDialog.records.some(row => row.userId === id)))
  } catch (error) {
    toast(error.message, 'error')
  } finally {
    participantDialog.loading = false
  }
}

function switchParticipants(status) {
  participantQuery.participationStatus = status
  participantQuery.page = 1
  selectedParticipantIds.value = new Set()
  loadParticipants()
}

function toggleParticipant(id) {
  const next = new Set(selectedParticipantIds.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selectedParticipantIds.value = next
}

function toggleAllParticipants() {
  const candidates = participantDialog.records.filter(row => row.participationStatus === 'NOT_PARTICIPATED')
  const allSelected = candidates.length && candidates.every(row => selectedParticipantIds.value.has(row.userId))
  selectedParticipantIds.value = allSelected ? new Set() : new Set(candidates.map(row => row.userId))
}

async function sendReminders(remindAll = false) {
  const content = reminderForm.content.trim()
  if (content.length > 500) return toast('提醒备注不能超过 500 字', 'error')
  const userIds = [...selectedParticipantIds.value]
  if (!remindAll && !userIds.length) return toast('请先勾选未参加人员，或使用一键提醒全部未参加人员', 'error')
  if (!window.confirm(remindAll ? '确定提醒全部当前未参加考核的学员吗？' : `确定提醒已勾选的 ${userIds.length} 名未参加学员吗？`)) return
  reminderForm.sending = true
  try {
    const result = await sendNonParticipantReminders(participantDialog.assessment.id, {
      userIds:remindAll ? [] : userIds,
      remindAll,
      content:content || null,
    })
    reminderForm.lastResult = result
    selectedParticipantIds.value = new Set()
    toast(`提醒已发送：成功 ${number(result.sentCount)} 人，跳过 ${number(result.skippedCount)} 人`)
    if (participantQuery.participationStatus !== 'NOT_PARTICIPATED') participantQuery.participationStatus = 'NOT_PARTICIPATED'
    participantQuery.page = 1
    await loadParticipants()
  } catch (error) {
    toast(error.message, 'error')
  } finally {
    reminderForm.sending = false
  }
}

async function loadResults() {
  loading.value = true
  try {
    const data = await getAssessmentResults({ ...resultQuery, keyword:resultQuery.keyword.trim() })
    Object.assign(resultPage, { records:data?.records || [], total:data?.total || 0, pages:data?.pages || 1 })
  } catch (error) { toast(error.message, 'error') }
  finally { loading.value = false }
}
function resetResultQuery() {
  Object.assign(resultQuery, { assessmentId:'', courseId:'', categoryId:'', departmentId:'', keyword:'', passed:'', submittedFrom:'', submittedTo:'', page:1 })
  loadResults()
}
async function openResult(row) {
  Object.assign(resultDetail, { open:true, loading:true, data:null, summary:null })
  try {
    const [detail, summary] = await Promise.all([
      getAssessmentResult(row.attemptId),
      row.assessmentId ? getAssessmentResultSummary(row.assessmentId).catch(() => null) : Promise.resolve(null),
    ])
    Object.assign(resultDetail, { loading:false, data:detail, summary })
  } catch (error) {
    resultDetail.open = false
    toast(error.message, 'error')
  }
}
async function exportResults() {
  try {
    const { page, size, ...params } = resultQuery
    const file = await exportAssessmentResults({ ...params, keyword:resultQuery.keyword.trim() })
    const url = URL.createObjectURL(file.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = file.filename
    link.click()
    URL.revokeObjectURL(url)
  } catch (error) { toast(error.message, 'error') }
}

function prevPage(query, loader) {
  if (query.page > 1) { query.page -= 1; loader() }
}
function nextPage(query, page, loader) {
  if (query.page < page.pages) { query.page += 1; loader() }
}

onMounted(async () => {
  await loadOptions()
  await loadCurrent()
})
</script>

<template>
  <section class="assessment-page">
    <div v-if="message" class="toast" :class="message.type">{{ message.text }}</div>
    <div class="tabs">
      <button v-for="tab in ['题库管理','考核发布','成绩管理']" :key="tab" :class="{ active:active === tab }" @click="switchTab(tab)">{{ tab }}</button>
      <span>{{ currentTitle }}</span>
    </div>

    <section v-if="active === '题库管理'" class="panel">
      <div class="toolbar">
        <input v-model="questionQuery.keyword" placeholder="搜索题干..." @keyup.enter="questionQuery.page=1;loadQuestions()" />
        <select v-model="questionQuery.categoryId" @change="questionQuery.page=1;loadQuestions()"><option value="">全部类别</option><option v-for="item in categoryOptions" :key="item.id" :value="item.id">{{ item.name }}</option></select>
        <select v-model="questionQuery.courseId" @change="questionQuery.page=1;loadQuestions()"><option value="">全部课程</option><option v-for="item in courseOptions" :key="item.id" :value="item.id">{{ item.title }}</option></select>
        <select v-model="questionQuery.questionType" @change="questionQuery.page=1;loadQuestions()"><option value="">全部题型</option><option value="1">单选题</option><option value="2">判断题</option></select>
        <select v-model="questionQuery.difficulty" @change="questionQuery.page=1;loadQuestions()"><option value="">全部难度</option><option value="1">简单</option><option value="2">中等</option><option value="3">困难</option></select>
        <select v-model="questionQuery.status" @change="questionQuery.page=1;loadQuestions()"><option value="">全部状态</option><option value="1">启用</option><option value="0">停用</option></select>
        <button @click="resetQuestionQuery">重置</button>
        <button class="primary" @click="openCreateQuestion">＋ 新建题目</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>题干</th><th>题型</th><th>类别</th><th>难度</th><th>适用范围</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="row in questionPage.records" :key="row.id">
              <td class="stem">{{ row.stem }}</td><td>{{ row.questionTypeName || questionTypeText(row.questionType) }}</td><td>{{ row.categoryName || '—' }}</td><td>{{ row.difficultyName || difficultyText(row.difficulty) }}</td><td>{{ row.scopeName || (row.courseIds?.length ? '指定课程' : '类别及子类别通用') }}</td><td><span class="badge" :class="{ off:Number(row.status)!==1 }">{{ questionStatusText(row.status) }}</span></td><td>{{ displayDateTime(row.updatedAt || row.createdAt) }}</td>
              <td class="actions"><button @click="openEditQuestion(row)">编辑</button><button @click="toggleQuestionStatus(row)">{{ Number(row.status) === 1 ? '停用' : '启用' }}</button><button class="danger-text" @click="removeQuestion(row)">删除</button></td>
            </tr>
          </tbody>
        </table>
        <div v-if="loading" class="state">正在加载...</div><div v-else-if="!questionPage.records.length" class="state">暂无题目</div>
      </div>
      <footer class="pager"><span>共 {{ number(questionPage.total) }} 条</span><button @click="prevPage(questionQuery, loadQuestions)">上一页</button><b>{{ questionQuery.page }} / {{ questionPage.pages }}</b><button @click="nextPage(questionQuery, questionPage, loadQuestions)">下一页</button></footer>
    </section>

    <section v-else-if="active === '考核发布'" class="panel">
      <div class="toolbar">
        <input v-model="assessmentQuery.keyword" placeholder="搜索考核名或课程名..." @keyup.enter="assessmentQuery.page=1;loadAssessments()" />
        <select v-model="assessmentQuery.courseId" @change="assessmentQuery.page=1;loadAssessments()"><option value="">全部课程</option><option v-for="item in courseOptions" :key="item.id" :value="item.id">{{ item.title }}</option></select>
        <select v-model="assessmentQuery.categoryId" @change="assessmentQuery.page=1;loadAssessments()"><option value="">全部类别</option><option v-for="item in categoryOptions" :key="item.id" :value="item.id">{{ item.name }}</option></select>
        <select v-model="assessmentQuery.status" @change="assessmentQuery.page=1;loadAssessments()"><option value="">全部状态</option><option value="0">草稿</option><option value="1">已发布</option><option value="2">已关闭</option></select>
        <button @click="resetAssessmentQuery">重置</button>
        <button class="primary" @click="openCreateAssessment">＋ 新建考核</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>考核名称</th><th>课程</th><th>开考时间</th><th>时长</th><th>总分/及格</th><th>参与/通过</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="row in assessmentPage.records" :key="row.id">
              <td><button class="link-title" @click="openParticipants(row)">{{ row.title }}</button></td><td>{{ row.courseTitle || '—' }}</td><td>{{ displayDateTime(row.startAt) }}<small v-if="row.endAt"> 至 {{ displayDateTime(row.endAt) }}</small></td><td>{{ row.durationMinutes }} 分钟</td><td>{{ money(row.totalScore) }} / {{ money(row.passScore) }}</td><td>{{ number(row.participantCount) }} / {{ number(row.passedCount) }}</td><td><span class="badge" :class="{ draft:Number(row.status)===0, off:Number(row.status)===2 }">{{ statusText(row.status) }}</span></td>
              <td class="actions"><button @click="openParticipants(row)">情况</button><button v-if="Number(row.status)===0" @click="openEditAssessment(row)">编辑</button><button v-if="Number(row.status)===0" @click="checkCapacity(row)">检查</button><button v-if="Number(row.status)===0" @click="publishRow(row)">发布</button><button v-if="Number(row.status)===1" @click="closeRow(row)">关闭</button><button v-if="Number(row.status)===0" class="danger-text" @click="removeAssessment(row)">删除</button></td>
            </tr>
          </tbody>
        </table>
        <div v-if="loading" class="state">正在加载...</div><div v-else-if="!assessmentPage.records.length" class="state">暂无考核</div>
      </div>
      <footer class="pager"><span>共 {{ number(assessmentPage.total) }} 条</span><button @click="prevPage(assessmentQuery, loadAssessments)">上一页</button><b>{{ assessmentQuery.page }} / {{ assessmentPage.pages }}</b><button @click="nextPage(assessmentQuery, assessmentPage, loadAssessments)">下一页</button></footer>
    </section>

    <section v-else class="panel">
      <div class="toolbar">
        <input v-model="resultQuery.keyword" placeholder="姓名、工号或考核名称..." @keyup.enter="resultQuery.page=1;loadResults()" />
        <select v-model="resultQuery.courseId" @change="resultQuery.page=1;loadResults()"><option value="">全部课程</option><option v-for="item in courseOptions" :key="item.id" :value="item.id">{{ item.title }}</option></select>
        <select v-model="resultQuery.categoryId" @change="resultQuery.page=1;loadResults()"><option value="">全部类别</option><option v-for="item in categoryOptions" :key="item.id" :value="item.id">{{ item.name }}</option></select>
        <select v-model="resultQuery.departmentId" @change="resultQuery.page=1;loadResults()"><option value="">全部科室</option><option v-for="item in departments" :key="item.id" :value="item.id">{{ item.name }}</option></select>
        <select v-model="resultQuery.passed" @change="resultQuery.page=1;loadResults()"><option value="">全部结果</option><option value="true">通过</option><option value="false">未通过</option></select>
        <button @click="resetResultQuery">重置</button>
        <button class="primary" @click="exportResults">导出成绩</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>学员</th><th>考核</th><th>课程</th><th>科室</th><th>分数</th><th>结果</th><th>交卷时间</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="row in resultPage.records" :key="row.attemptId">
              <td>{{ row.realName }}<small>{{ row.username }}</small></td><td>{{ row.assessmentTitle }}</td><td>{{ row.courseTitle }}</td><td>{{ row.departmentName || '—' }}</td><td>{{ money(row.score) }} / {{ money(row.totalScore) }}</td><td><span class="badge" :class="{ off:row.passed===false }">{{ passText(row.passed) }}</span></td><td>{{ displayDateTime(row.submittedAt) }}</td><td class="actions"><button @click="openResult(row)">详情</button></td>
            </tr>
          </tbody>
        </table>
        <div v-if="loading" class="state">正在加载...</div><div v-else-if="!resultPage.records.length" class="state">暂无成绩</div>
      </div>
      <footer class="pager"><span>共 {{ number(resultPage.total) }} 条</span><button @click="prevPage(resultQuery, loadResults)">上一页</button><b>{{ resultQuery.page }} / {{ resultPage.pages }}</b><button @click="nextPage(resultQuery, resultPage, loadResults)">下一页</button></footer>
    </section>

    <div v-if="questionModal.open" class="overlay" @mousedown.self="questionModal.open=false">
      <form class="dialog wide" @submit.prevent="saveQuestion">
        <header><h2>{{ questionModal.mode === 'edit' ? '编辑题目' : '新建题目' }}</h2><button type="button" @click="questionModal.open=false">×</button></header>
        <div class="form-grid">
          <label>所属类别<select v-model="questionModal.categoryId" required><option value="">请选择</option><option v-for="item in categoryOptions" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
          <label>题型<select v-model="questionModal.questionType" @change="resetQuestionOptions(questionModal.questionType)"><option :value="1">单选题</option><option :value="2">判断题</option></select></label>
          <label>难度<select v-model="questionModal.difficulty"><option :value="1">简单</option><option :value="2">中等</option><option :value="3">困难</option></select></label>
          <label>状态<select v-model="questionModal.status"><option :value="1">启用</option><option :value="0">停用</option></select></label>
          <label class="full">题干<textarea v-model="questionModal.stem" maxlength="2000" required /></label>
          <label class="full">答案解析<textarea v-model="questionModal.analysis" /></label>
          <div class="full options">
            <strong>选项与答案</strong>
            <label v-for="item in questionModal.options" :key="item.optionKey"><input type="radio" name="correct" :checked="item.isCorrect" @change="setCorrectOption(item.optionKey)" /><b>{{ item.optionKey }}</b><input v-model="item.content" placeholder="选项内容" /></label>
          </div>
          <label class="full">指定课程范围<select v-model="questionModal.courseIds" multiple><option v-for="item in questionCourseOptions" :key="item.id" :value="String(item.id)">{{ item.title }}</option></select><small>不选表示该类别及其子类别下所有课程可用</small></label>
        </div>
        <footer><button type="button" @click="questionModal.open=false">取消</button><button class="primary" :disabled="questionModal.loading">保存</button></footer>
      </form>
    </div>

    <div v-if="assessmentModal.open" class="overlay" @mousedown.self="assessmentModal.open=false">
      <form class="dialog wide" @submit.prevent="saveAssessment">
        <header><h2>{{ assessmentModal.mode === 'edit' ? '编辑考核草稿' : '新建考核草稿' }}</h2><button type="button" @click="assessmentModal.open=false">×</button></header>
        <div class="form-grid">
          <label>所属类别（筛选课程）<select v-model="assessmentModal.categoryId"><option value="">全部</option><option v-for="item in categoryOptions" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
          <label>所属课程<select v-model="assessmentModal.courseId" required><option value="">请选择</option><option v-for="item in assessmentCourseOptions" :key="item.id" :value="item.id">{{ item.title }}</option></select></label>
          <label>考核名称<input v-model="assessmentModal.title" maxlength="200" required /></label>
          <label>开考时间<input v-model="assessmentModal.startAt" type="datetime-local" required /></label>
          <label>最晚提交时间<input v-model="assessmentModal.endAt" type="datetime-local" /></label>
          <label>答题时长<input v-model.number="assessmentModal.durationMinutes" type="number" min="1" /></label>
          <label>及格分<input v-model.number="assessmentModal.passScore" type="number" min="0" step="0.5" /></label>
          <label>最多次数<input v-model.number="assessmentModal.maxAttempts" type="number" min="1" /></label>
          <label>考核难度<select v-model.number="assessmentModal.difficultyLevel"><option :value="1">简单（简单题为主）</option><option :value="2">中等（中等题为主）</option><option :value="3">困难（困难题为主）</option></select></label>
          <label class="full">考核说明<textarea v-model="assessmentModal.description" maxlength="1000" /></label>
          <div class="full rules"><strong>随机组卷规则</strong><div v-for="rule in assessmentModal.drawRules" :key="rule.questionType"><span>{{ questionTypeText(rule.questionType) }}</span><input v-model.number="rule.questionCount" type="number" min="0" /> 道 × <input v-model.number="rule.scorePerQuestion" type="number" min="0" step="0.5" /> 分</div><small>系统会根据考核难度自动计算简单、中等、困难题目的数量。</small></div>
          <div v-if="capacity" class="full capacity"><b>题量检查：</b><span :class="{ ok:capacity.publishable }">{{ capacity.publishable ? '满足发布条件' : '题量不足' }}</span><p v-for="item in capacity.items" :key="`${item.questionType}-${item.difficulty ?? 'all'}`">{{ questionTypeText(item.questionType) }} · {{ difficultyText(item.difficulty) }}：需要 {{ item.requiredCount }}，可用 {{ item.availableCount }}</p></div>
        </div>
        <footer><button type="button" @click="assessmentModal.open=false">取消</button><button class="primary" :disabled="assessmentModal.loading">保存草稿</button></footer>
      </form>
    </div>

    <div v-if="participantDialog.open" class="overlay" @mousedown.self="participantDialog.open=false">
      <div class="dialog participants-dialog">
        <header><h2>考试情况</h2><button type="button" @click="participantDialog.open=false">×</button></header>
        <div class="participants-body">
          <section class="assessment-brief">
            <div><strong>{{ participantDialog.assessment?.title }}</strong><span>{{ participantDialog.assessment?.courseTitle || '—' }}</span></div>
            <p>{{ displayDateTime(participantDialog.assessment?.startAt) }}<template v-if="participantDialog.assessment?.endAt"> 至 {{ displayDateTime(participantDialog.assessment?.endAt) }}</template></p>
          </section>
          <div class="participant-stats">
            <span>参加 {{ number(participantDialog.summary?.participantCount) }}</span>
            <span>通过 {{ number(participantDialog.summary?.passedCount) }}</span>
            <span>未参加 {{ number(participantDialog.summary?.notParticipatedCount) }}</span>
            <span>答题中 {{ number(participantDialog.summary?.inProgressCount) }}</span>
            <span>平均分 {{ money(participantDialog.summary?.averageScore) }}</span>
          </div>
          <div class="participant-tabs">
            <button v-for="status in ['ALL','PARTICIPATED','NOT_PARTICIPATED','IN_PROGRESS','SUBMITTED']" :key="status" :class="{ active:participantQuery.participationStatus===status }" @click="switchParticipants(status)">{{ participationText(status) }}</button>
          </div>
          <div class="participant-tools">
            <input v-model="participantQuery.keyword" placeholder="搜索姓名或工号..." @keyup.enter="participantQuery.page=1;loadParticipants()" />
            <select v-model="participantQuery.departmentId" @change="participantQuery.page=1;loadParticipants()"><option value="">全部科室</option><option v-for="item in departments" :key="item.id" :value="item.id">{{ item.name }}</option></select>
            <button @click="participantQuery.page=1;loadParticipants()">查询</button>
            <button @click="Object.assign(participantQuery,{ keyword:'', departmentId:'', page:1 });loadParticipants()">重置</button>
          </div>
          <div class="reminder-box">
            <textarea v-model="reminderForm.content" maxlength="500" placeholder="提醒备注（选填），课程和考核信息由后端自动附带"></textarea>
            <small>{{ reminderForm.content.trim().length }}/500</small>
            <div>
              <button :disabled="reminderForm.sending" @click="sendReminders(false)">提醒勾选未参加人员</button>
              <button class="primary" :disabled="reminderForm.sending" @click="sendReminders(true)">一键提醒全部未参加</button>
            </div>
            <p v-if="reminderForm.lastResult">最近批次：{{ reminderForm.lastResult.batchId }}；成功 {{ number(reminderForm.lastResult.sentCount) }}，跳过 {{ number(reminderForm.lastResult.skippedCount) }}，失败 {{ number(reminderForm.lastResult.failedCount) }}</p>
          </div>
          <div class="table-wrap participant-table">
            <table>
              <thead><tr><th><input type="checkbox" @change="toggleAllParticipants" /></th><th>学员</th><th>科室</th><th>状态</th><th>次数</th><th>最高分</th><th>最近分数</th><th>结果</th><th>开考/交卷</th><th>提醒</th></tr></thead>
              <tbody>
                <tr v-for="row in participantDialog.records" :key="row.userId">
                  <td><input type="checkbox" :disabled="row.participationStatus !== 'NOT_PARTICIPATED'" :checked="selectedParticipantIds.has(row.userId)" @change="toggleParticipant(row.userId)" /></td>
                  <td><strong>{{ row.realName }}</strong><small>{{ row.username }}</small></td>
                  <td>{{ row.departmentName || '—' }}</td>
                  <td><span class="badge" :class="{ off:row.participationStatus==='NOT_PARTICIPATED', draft:row.participationStatus==='IN_PROGRESS' }">{{ participationText(row.participationStatus) }}</span></td>
                  <td>{{ number(row.attemptCount) }}</td>
                  <td>{{ row.bestScore == null ? '—' : money(row.bestScore) }}</td>
                  <td>{{ row.latestScore == null ? '—' : money(row.latestScore) }}</td>
                  <td>{{ passText(row.passed) }}</td>
                  <td><small>{{ displayDateTime(row.startedAt) }}<template v-if="row.submittedAt"> / {{ displayDateTime(row.submittedAt) }}</template></small></td>
                  <td><small>{{ row.reminded ? `已提醒 ${displayDateTime(row.lastRemindedAt)}` : '未提醒' }}</small></td>
                </tr>
              </tbody>
            </table>
            <div v-if="participantDialog.loading" class="state">正在加载...</div><div v-else-if="!participantDialog.records.length" class="state">暂无人员</div>
          </div>
          <footer class="pager"><span>共 {{ number(participantDialog.total) }} 人</span><button @click="prevPage(participantQuery, loadParticipants)">上一页</button><b>{{ participantQuery.page }} / {{ participantDialog.pages }}</b><button @click="nextPage(participantQuery, participantDialog, loadParticipants)">下一页</button></footer>
        </div>
      </div>
    </div>

    <div v-if="resultDetail.open" class="overlay" @mousedown.self="resultDetail.open=false">
      <div class="dialog result-dialog">
        <header><h2>成绩详情</h2><button type="button" @click="resultDetail.open=false">×</button></header>
        <div v-if="resultDetail.loading" class="state">正在加载...</div>
        <div v-else-if="resultDetail.data" class="result-body">
          <div class="score-card"><strong>{{ money(resultDetail.data.score) }}</strong><span>/ {{ money(resultDetail.data.totalScore) }}</span><em>{{ passText(resultDetail.data.passed) }}</em></div>
          <div v-if="resultDetail.summary" class="summary-line"><span>参加 {{ number(resultDetail.summary.participantCount) }}</span><span>通过 {{ number(resultDetail.summary.passedCount) }}</span><span>通过率 {{ resultDetail.summary.passRate }}%</span><span>平均分 {{ money(resultDetail.summary.averageScore) }}</span></div>
          <h3>{{ resultDetail.data.assessmentTitle }}</h3>
          <p>{{ resultDetail.data.user?.realName }} / {{ resultDetail.data.user?.username }} / {{ resultDetail.data.user?.departmentName }}</p>
          <ol class="question-review">
            <li v-for="q in resultDetail.data.questions" :key="q.number">
              <b>{{ q.number }}. {{ q.stem }}</b>
              <p>选择：{{ q.selectedOptionKey || '未答' }}；正确：{{ q.correctOptionKey }}；得分：{{ money(q.score) }} / {{ money(q.maxScore) }}</p>
              <small v-if="q.analysis">解析：{{ q.analysis }}</small>
            </li>
          </ol>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.assessment-page{min-height:calc(100vh - 79px);padding:22px;background:#f7f9f8;color:#1f2924}.tabs{height:64px;display:flex;align-items:center;gap:12px;margin-bottom:14px;padding:0 16px;background:#fff;border:1px solid #e5ebe7;border-radius:14px;box-shadow:0 4px 14px rgba(17,62,42,.045)}.tabs button{height:38px;padding:0 18px;border:1px solid #dce5df;border-radius:20px;background:#fff;cursor:pointer}.tabs button.active{color:#fff;background:#087443;border-color:#087443}.tabs span{margin-left:auto;color:#6d7772}.panel{background:#fff;border:1px solid #e5ebe7;border-radius:14px;box-shadow:0 4px 14px rgba(17,62,42,.045);overflow:hidden}.toolbar{min-height:72px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 18px;border-bottom:1px solid #edf1ef}.toolbar input,.toolbar select{height:38px;padding:0 12px;border:1px solid #dce2de;border-radius:8px;background:#fff;outline:none}.toolbar input{width:230px}.toolbar button,.pager button,.dialog footer button{height:38px;padding:0 16px;border:1px solid #dce2de;border-radius:8px;background:#fff;cursor:pointer}.primary{color:#fff!important;background:linear-gradient(90deg,#16884b,#69b820)!important;border:0!important}.table-wrap{overflow:auto;position:relative}table{width:100%;min-width:1060px;border-collapse:collapse;font-size:13px}th{height:48px;background:#fbfcfb;color:#303733;text-align:left}td{height:58px;border-top:1px solid #edf1ef;color:#4f5853;vertical-align:middle}th:first-child,td:first-child{padding-left:18px}.stem{max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.badge{display:inline-flex;align-items:center;height:24px;padding:0 10px;color:#16864b;background:#eaf8e9;border-radius:14px}.badge.off{color:#d05252;background:#fff0f0}.badge.draft{color:#777;background:#eef1f0}.actions{white-space:nowrap}.actions button{margin-right:10px;color:#126d42;background:none;cursor:pointer}.danger-text{color:#d84b4b!important}.state{height:180px;display:flex;align-items:center;justify-content:center;color:#8a948f}.pager{height:56px;display:flex;align-items:center;justify-content:flex-end;gap:16px;padding:0 18px;border-top:1px solid #edf1ef}.toast{position:fixed;z-index:80;top:92px;left:50%;transform:translateX(-50%);padding:10px 18px;color:#fff;background:#228653;border-radius:8px;box-shadow:0 8px 20px rgba(0,0,0,.15)}.toast.error{background:#d15050}.overlay{position:fixed;z-index:70;inset:0;display:grid;place-items:center;padding:20px;background:rgba(11,31,21,.38);backdrop-filter:blur(2px)}.dialog{width:min(720px,96vw);max-height:90vh;overflow:auto;background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,35,20,.22)}.dialog.wide{width:min(920px,96vw)}.dialog header{height:60px;display:flex;align-items:center;justify-content:space-between;padding:0 22px;border-bottom:1px solid #eaeeeb}.dialog h2{margin:0;font-size:19px}.dialog header button{font-size:26px;background:none;cursor:pointer}.form-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:22px}.form-grid label{display:flex;flex-direction:column;gap:8px;font-size:13px;font-weight:600}.form-grid input,.form-grid select,.form-grid textarea{width:100%;padding:10px;border:1px solid #dce2de;border-radius:8px;background:#fff;outline:none}.form-grid textarea{height:92px;resize:vertical}.form-grid select[multiple]{height:110px}.full{grid-column:1/-1}.options{display:grid;gap:10px}.options strong,.rules strong{margin-bottom:4px}.options label{display:grid;grid-template-columns:20px 36px 1fr;align-items:center}.rules{padding:14px;border:1px solid #e5ebe7;border-radius:10px}.rules div{display:flex;align-items:center;gap:10px;margin-top:10px}.rules input{width:90px}.capacity{padding:12px;border:1px solid #f0d4a9;background:#fffaf0;border-radius:10px}.capacity .ok{color:#16864b}.dialog footer{height:62px;display:flex;justify-content:flex-end;align-items:center;gap:12px;padding:0 22px;background:#fafbfa;border-top:1px solid #eef2f0}.result-dialog{width:min(900px,96vw)}.result-body{padding:22px}.score-card{display:flex;align-items:baseline;gap:8px;margin-bottom:14px}.score-card strong{font-size:42px;color:#087443}.score-card em{margin-left:12px;color:#16864b;font-style:normal}.summary-line{display:flex;gap:16px;flex-wrap:wrap;padding:12px;background:#f5fbf7;border-radius:10px}.question-review{padding-left:20px}.question-review li{margin:14px 0;padding-bottom:12px;border-bottom:1px solid #eef2f0}.question-review p{margin:8px 0;color:#5d6762}.question-review small{color:#7c8681}
.link-title{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#126d42;background:none;cursor:pointer;text-align:left}
.participants-dialog{width:min(1180px,98vw)}
.participants-body{padding:18px}
.assessment-brief{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;background:#f6fbf7;border:1px solid #dfeee4;border-radius:12px}
.assessment-brief strong,.assessment-brief span{display:block}
.assessment-brief strong{font-size:18px}
.assessment-brief span,.assessment-brief p{margin:4px 0 0;color:#65716b}
.participant-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:14px 0}
.participant-stats span{padding:12px;color:#166d42;background:#f3faf5;border:1px solid #e1eee6;border-radius:10px;font-weight:600}
.participant-tabs{display:flex;gap:8px;margin-bottom:12px}
.participant-tabs button{height:34px;padding:0 14px;border:1px solid #dce5df;border-radius:18px;background:#fff;cursor:pointer}
.participant-tabs button.active{color:#fff;background:#087443;border-color:#087443}
.participant-tools{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.participant-tools input,.participant-tools select{height:38px;padding:0 12px;border:1px solid #dce2de;border-radius:8px}
.participant-tools input{width:230px}
.participant-tools button,.reminder-box button{height:38px;padding:0 14px;border:1px solid #dce2de;border-radius:8px;background:#fff;cursor:pointer}
.reminder-box{display:grid;grid-template-columns:1fr auto;gap:8px;margin-bottom:12px;padding:12px;border:1px solid #e4ebe7;border-radius:12px}
.reminder-box textarea{grid-column:1/2;height:64px;padding:10px;border:1px solid #dce2de;border-radius:8px;resize:vertical}
.reminder-box small{align-self:end;color:#8a948f}
.reminder-box div{grid-column:1/-1;display:flex;gap:10px;justify-content:flex-end}
.reminder-box p{grid-column:1/-1;margin:0;color:#5d6762}
.participant-table table{min-width:1120px}
.participant-table td strong,.participant-table td small{display:block}
.participant-table td small{margin-top:3px;color:#7b8580}
@media(max-width:760px){.assessment-page{padding:10px}.toolbar input{width:100%}.form-grid{grid-template-columns:1fr}.tabs{overflow:auto}.tabs span{display:none}.participant-stats{grid-template-columns:1fr 1fr}.assessment-brief{align-items:flex-start;flex-direction:column}.reminder-box{grid-template-columns:1fr}.reminder-box textarea{grid-column:1}}
</style>
