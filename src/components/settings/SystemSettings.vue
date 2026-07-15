<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import AppIcon from '@/components/AppIcon.vue'
import {
  completeStudentCourseProgress, deleteStudent, getCurrentSettingsUser, getDepartmentDistribution,
  getSettingsDepartmentOptions, getStudent, getStudentCourseProgress, getStudents,
  resetStudentCourseProgress, sendStudentCourseMessage, updateStudent, uploadStudentAvatar,
} from '@/services/settings'

echarts.use([BarChart, TooltipComponent, LegendComponent, GridComponent, CanvasRenderer])

const admin = ref(null)
const students = ref([])
const departments = ref([])
const selectedStudent = ref(null)
const courseProgress = ref(null)
const departmentDistribution = ref(null)
const loading = ref(false)
const detailLoading = ref(false)
const saving = ref(false)
const message = ref(null)
const hoveredCourse = ref(null)
const hoverPosition = reactive({ left:0, top:0 })
const chartRef = ref(null)
const chart = ref(null)
const query = reactive({ keyword:'', departmentId:'', page:1, size:10 })
const pager = reactive({ total:0, pages:1 })
const form = reactive({ avatarUrl:'', avatarObjectKey:'', realName:'', username:'', phone:'', departmentId:'', status:'ENABLED' })
const confirmBox = reactive({ open:false, title:'', content:'', action:null, loading:false })
const messageDialog = reactive({ open:false, sending:false, studentId:null, studentName:'', courseId:null, courseTitle:'', progressPercent:0, content:'' })

const currentPerson = computed(() => selectedStudent.value || admin.value || {})
const isStudent = computed(() => Boolean(selectedStudent.value))
const pageNumbers = computed(() => {
  if (pager.pages <= 7) return Array.from({ length:pager.pages }, (_, index) => index + 1)
  return [...new Set([1, pager.pages, query.page - 1, query.page, query.page + 1])].filter(page => page > 0 && page <= pager.pages).sort((a, b) => a - b)
})

function toast(text, type='success') {
  message.value = { text, type }
  window.setTimeout(() => { message.value = null }, 2600)
}
function number(value) { return Number(value || 0).toLocaleString('zh-CN') }
function roleLabel(role) { return { ADMIN:'管理员', STUDENT:'学员' }[role] || role || '—' }
function statusLabel(status) { return { ENABLED:'启用', DISABLED:'停用' }[status] || status || '—' }
function date(value) { return value || '—' }
function progressTone(value) { return Number(value) >= 80 ? 'good' : Number(value) >= 50 ? 'warn' : 'low' }
function avatarText(person) { return (person.realName || person.username || '用').slice(0, 1) }
function fieldValue(person, key, fallback='—') { return person?.[key] || fallback }
function fillForm(data) {
  Object.assign(form, {
    avatarUrl:data.avatarUrl || '',
    avatarObjectKey:data.avatarObjectKey || '',
    realName:data.realName || '',
    username:data.username || '',
    phone:data.phone || '',
    departmentId:data.departmentId || '',
    status:data.status || 'ENABLED',
  })
}

async function loadBase() {
  loading.value = true
  try {
    const [current, deptOptions] = await Promise.all([getCurrentSettingsUser(), getSettingsDepartmentOptions()])
    admin.value = current
    departments.value = (deptOptions || []).map(item => ({ id:item.departmentId || item.id, name:item.departmentName || item.name }))
    await Promise.all([loadStudents(), loadDistribution()])
  } catch (error) {
    toast(error.message, 'error')
  } finally {
    loading.value = false
  }
}
async function loadStudents() {
  try {
    const params = { keyword:query.keyword.trim(), departmentId:query.departmentId, page:query.page, size:query.size }
    const data = await getStudents(params)
    students.value = data?.records || []
    pager.total = data?.total || 0
    pager.pages = data?.pages || 1
    if (query.page > pager.pages) {
      query.page = pager.pages || 1
      return loadStudents()
    }
  } catch (error) {
    toast(error.message, 'error')
  }
}
async function loadDistribution() {
  try {
    departmentDistribution.value = await getDepartmentDistribution({ activeOnly:true })
    renderChart()
  } catch (error) {
    toast(error.message, 'error')
  }
}
async function selectStudent(row) {
  if (selectedStudent.value?.studentId === row.studentId) {
    clearSelected()
    return
  }
  detailLoading.value = true
  hoveredCourse.value = null
  try {
    const [detail, progress] = await Promise.all([getStudent(row.studentId), getStudentCourseProgress(row.studentId)])
    selectedStudent.value = detail
    courseProgress.value = progress
    fillForm(detail)
    renderChart()
  } catch (error) {
    toast(error.message, 'error')
  } finally {
    detailLoading.value = false
  }
}
function clearSelected() {
  selectedStudent.value = null
  courseProgress.value = null
  hoveredCourse.value = null
  renderChart()
}
function search() { query.page = 1; loadStudents() }
function resetSearch() { Object.assign(query, { keyword:'', departmentId:'', page:1 }); loadStudents() }
function goPage(page) {
  if (page < 1 || page > pager.pages || page === query.page) return
  query.page = page
  loadStudents()
}

function ask(title, content, action) {
  Object.assign(confirmBox, { open:true, title, content, action, loading:false })
}
async function confirmAction() {
  confirmBox.loading = true
  try {
    await confirmBox.action?.()
    confirmBox.open = false
  } finally {
    confirmBox.loading = false
  }
}
async function chooseAvatar(file) {
  if (!file) return
  if (!/^image\/(jpeg|png)$/.test(file.type)) return toast('头像仅支持 JPG、JPEG、PNG', 'error')
  if (file.size > 2 * 1024 * 1024) return toast('头像大小不能超过 2MB', 'error')
  try {
    const result = await uploadStudentAvatar(file)
    form.avatarUrl = result.url
    form.avatarObjectKey = result.objectKey
    toast('头像上传成功')
  } catch (error) {
    toast(error.message, 'error')
  }
}
function validateForm() {
  if (!form.realName.trim()) return '请输入学员姓名'
  if (!form.username.trim()) return '请输入工号'
  if (form.phone && !/^1[3-9]\d{9}$/.test(form.phone)) return '手机号格式不正确'
  return ''
}
async function saveStudent() {
  if (!selectedStudent.value || saving.value) return
  const error = validateForm()
  if (error) return toast(error, 'error')
  saving.value = true
  try {
    const payload = {
      realName:form.realName.trim(),
      username:form.username.trim(),
      phone:form.phone.trim() || null,
      avatarUrl:form.avatarUrl || null,
      avatarObjectKey:form.avatarObjectKey || null,
      departmentId:form.departmentId || null,
      status:form.status,
    }
    const updated = await updateStudent(selectedStudent.value.studentId, payload)
    const detail = await getStudent(updated.studentId || selectedStudent.value.studentId)
    selectedStudent.value = detail
    fillForm(detail)
    await Promise.all([loadStudents(), loadDistribution()])
    toast('学员信息已保存')
  } catch (err) {
    toast(err.message, 'error')
  } finally {
    saving.value = false
  }
}
function removeStudent() {
  if (!selectedStudent.value) return
  ask('删除学员', `确定删除“${selectedStudent.value.realName}”吗？该操作为软删除，不删除历史学习记录。`, async () => {
    try {
      await deleteStudent(selectedStudent.value.studentId)
      clearSelected()
      await Promise.all([loadStudents(), loadDistribution()])
      toast('学员已删除')
    } catch (error) {
      toast(error.message, 'error')
      throw error
    }
  })
}

function ensureChart() {
  if (!chartRef.value) return null
  if (!chart.value) {
    chart.value = echarts.init(chartRef.value)
    chart.value.on('mouseover', params => {
      if (!selectedStudent.value || params.componentType !== 'series') return
      const item = (courseProgress.value?.items || [])[params.dataIndex]
      if (!item) return
      const point = chart.value.convertToPixel({ xAxisIndex:0, yAxisIndex:0 }, [item.courseTitle, item.progressPercent])
      hoveredCourse.value = item
      hoverPosition.left = Math.min(Math.max(point[0] - 54, 8), chartRef.value.clientWidth - 132)
      hoverPosition.top = Math.max(point[1] - 46, 8)
    })
  }
  return chart.value
}
function renderChart() {
  nextTick(() => {
    const instance = ensureChart()
    if (!instance) return
    if (selectedStudent.value) renderProgressChart(instance)
    else renderDistributionChart(instance)
  })
}
function renderDistributionChart(instance) {
  hoveredCourse.value = null
  const rows = departmentDistribution.value?.items || []
  instance.setOption({
    color:['#078844'],
    tooltip:{ trigger:'axis', axisPointer:{ type:'shadow' }, formatter:params => `${params[0].name}<br/>学员人数：${number(params[0].value)} 人` },
    grid:{ left:70, right:55, top:24, bottom:36, containLabel:true },
    xAxis:{ type:'value', splitLine:{ lineStyle:{ color:'#edf1ef' } } },
    yAxis:{ type:'category', inverse:true, data:rows.map(item => item.departmentName), axisTick:{ show:false } },
    series:[{
      name:'学员人数',
      type:'bar',
      data:rows.map(item => item.studentCount),
      barWidth:13,
      label:{ show:true, position:'right', formatter:'{c}' },
      itemStyle:{ borderRadius:[0,8,8,0] },
    }],
  }, true)
}
function renderProgressChart(instance) {
  const rows = courseProgress.value?.items || []
  instance.setOption({
    color:['#5470c6'],
    tooltip:{ trigger:'axis', axisPointer:{ type:'shadow' }, formatter:params => `${params[0].name}<br/>进度：${params[0].value}%` },
    grid:{ left:52, right:32, top:30, bottom:72, containLabel:true },
    xAxis:{ type:'category', data:rows.map(item => item.courseTitle), axisLabel:{ interval:0, rotate:28, width:90, overflow:'truncate' } },
    yAxis:{ type:'value', min:0, max:100, axisLabel:{ formatter:'{value}%' }, splitLine:{ lineStyle:{ color:'#e1e4e8' } } },
    series:[{
      name:'课程进度',
      type:'bar',
      data:rows.map(item => item.progressPercent),
      barWidth:34,
      showBackground:true,
      backgroundStyle:{ color:'rgba(180,180,180,.18)' },
      itemStyle:{ borderRadius:[5,5,0,0] },
      label:{ show:true, position:'top', formatter:'{c}%' },
    }],
  }, true)
}
async function refreshSelectedProgress() {
  if (!selectedStudent.value) return
  const [detail, progress] = await Promise.all([getStudent(selectedStudent.value.studentId), getStudentCourseProgress(selectedStudent.value.studentId)])
  selectedStudent.value = detail
  courseProgress.value = progress
  fillForm(detail)
  renderChart()
  await loadStudents()
}
function completeCourse(item) {
  ask('推满课程进度', `确定将“${item.courseTitle}”进度设置为 100% 吗？`, async () => {
    try {
      await completeStudentCourseProgress(selectedStudent.value.studentId, item.courseId)
      hoveredCourse.value = null
      await refreshSelectedProgress()
      toast('课程进度已推满')
    } catch (error) {
      toast(error.message, 'error')
      throw error
    }
  })
}
function resetCourse(item) {
  ask('清零课程进度', `确定将“${item.courseTitle}”进度清零吗？`, async () => {
    try {
      await resetStudentCourseProgress(selectedStudent.value.studentId, item.courseId)
      hoveredCourse.value = null
      await refreshSelectedProgress()
      toast('课程进度已清零')
    } catch (error) {
      toast(error.message, 'error')
      throw error
    }
  })
}
function openCourseMessage(item) {
  if (!selectedStudent.value || !item) return
  Object.assign(messageDialog, {
    open:true,
    sending:false,
    studentId:item.studentId || selectedStudent.value.studentId,
    studentName:item.studentName || selectedStudent.value.realName || selectedStudent.value.username || '',
    courseId:item.courseId,
    courseTitle:item.courseTitle || '',
    progressPercent:Number(item.progressPercent || 0),
    content:'',
  })
  hoveredCourse.value = null
}
async function sendCourseMessage() {
  const content = messageDialog.content.trim()
  if (!content) return toast('请输入消息内容', 'error')
  if (content.length > 1000) return toast('消息内容不能超过 1000 字', 'error')
  messageDialog.sending = true
  try {
    await sendStudentCourseMessage(messageDialog.studentId, messageDialog.courseId, content)
    messageDialog.open = false
    toast('消息已发送')
  } catch (error) {
    toast(error.message, 'error')
  } finally {
    messageDialog.sending = false
  }
}
function resizeChart() { chart.value?.resize() }

onMounted(() => {
  loadBase()
  window.addEventListener('resize', resizeChart)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart)
  chart.value?.dispose()
})
</script>

<template>
  <section class="settings-page" @click.self="hoveredCourse=null">
    <div v-if="message" class="toast" :class="message.type">{{ message.text }}</div>
    <aside class="profile-card card">
      <h2>{{ isStudent ? '学员详细信息' : '管理员身份信息' }}</h2>
      <div v-if="detailLoading" class="state small"><span class="loader"></span>加载详情...</div>
      <template v-else>
        <label v-if="isStudent" class="avatar-edit">
          <input type="file" accept="image/jpeg,image/png" @change="chooseAvatar($event.target.files[0])" />
          <img v-if="form.avatarUrl" :src="form.avatarUrl" alt="头像" />
          <span v-else>{{ avatarText(form) }}</span>
          <b>点击更换头像</b>
        </label>
        <div v-else class="avatar-view">
          <img v-if="currentPerson.avatarUrl" :src="currentPerson.avatarUrl" alt="头像" />
          <span v-else>{{ avatarText(currentPerson) }}</span>
        </div>

        <div v-if="isStudent" class="edit-form">
          <label>姓名<input v-model="form.realName" maxlength="50" /></label>
          <label>工号<input v-model="form.username" maxlength="50" /></label>
          <label>手机号<input v-model="form.phone" maxlength="11" /></label>
          <label>所属科室<select v-model="form.departmentId"><option value="">未分配科室</option><option v-for="item in departments" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
          <label>账号状态<select v-model="form.status"><option value="ENABLED">启用</option><option value="DISABLED">停用</option></select></label>
          <div class="info-row"><span>学习课程数</span><strong>{{ number(selectedStudent?.courseCount) }} 门</strong></div>
          <div class="info-row"><span>平均进度</span><strong>{{ number(selectedStudent?.averageProgressPercent) }}%</strong></div>
          <div class="info-row"><span>最近登录</span><strong>{{ date(selectedStudent?.lastLoginAt) }}</strong></div>
        </div>
        <div v-else class="info-list">
          <div><span>姓名</span><strong>{{ fieldValue(currentPerson, 'realName') }}</strong></div>
          <div><span>账号</span><strong>{{ fieldValue(currentPerson, 'username') }}</strong></div>
          <div><span>手机号</span><strong>{{ fieldValue(currentPerson, 'phone') }}</strong></div>
          <div><span>所属科室</span><strong>{{ fieldValue(currentPerson, 'departmentName', '无') }}</strong></div>
          <div><span>角色</span><strong>{{ roleLabel(currentPerson.roleType) }}</strong></div>
          <div><span>状态</span><strong>{{ statusLabel(currentPerson.status) }}</strong></div>
          <div><span>注册时间</span><strong>{{ date(currentPerson.createdAt) }}</strong></div>
          <div><span>最近登录</span><strong>{{ date(currentPerson.lastLoginAt) }}</strong></div>
        </div>
        <footer v-if="isStudent">
          <button class="save" :disabled="saving" @click="saveStudent"><AppIcon name="tag" :size="17" />保存</button>
          <button class="delete" @click="removeStudent"><AppIcon name="trash" :size="17" />删除</button>
          <button class="cancel" @click="clearSelected">× 取消</button>
        </footer>
      </template>
    </aside>

    <main class="main-area">
      <section class="student-list card">
        <header><h2>学员分页查询</h2></header>
        <div class="filters">
          <label class="keyword"><input v-model.trim="query.keyword" maxlength="50" placeholder="搜索学员姓名 / 工号 / 手机号" @keyup.enter="search" /><AppIcon name="search" :size="18" /></label>
          <label>科室：<select v-model="query.departmentId" @change="search"><option value="">全部科室</option><option v-for="item in departments" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
          <button class="search-btn" @click="search">查询</button>
          <button class="reset-btn" @click="resetSearch">重置</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>学员姓名</th><th>工号</th><th>科室</th><th>学习进度</th><th>手机号</th></tr></thead>
            <tbody v-if="!loading && students.length">
              <tr v-for="row in students" :key="row.studentId" :class="{ selected:selectedStudent?.studentId === row.studentId }" @click="selectStudent(row)">
                <td><div class="student-cell"><span class="mini-avatar"><img v-if="row.avatarUrl" :src="row.avatarUrl" alt="" /><b v-else>{{ avatarText(row) }}</b></span>{{ row.realName }}</div></td>
                <td>{{ row.username }}</td>
                <td>{{ row.departmentName || '未分配' }}</td>
                <td><div class="progress-cell"><i><b :class="progressTone(row.averageProgressPercent)" :style="{ width:`${Math.min(Number(row.averageProgressPercent||0),100)}%` }"></b></i><span>{{ number(row.averageProgressPercent) }}%</span></div></td>
                <td>{{ row.maskedPhone || '—' }}</td>
              </tr>
            </tbody>
          </table>
          <div v-if="loading" class="state"><span class="loader"></span>正在加载学员...</div>
          <div v-else-if="!students.length" class="state">暂无符合条件的学员</div>
        </div>
        <footer class="pager">
          <span>共 {{ number(pager.total) }} 条记录</span>
          <select v-model="query.size" @change="query.page=1;loadStudents()"><option :value="10">10条/页</option><option :value="20">20条/页</option><option :value="50">50条/页</option></select>
          <nav><button :disabled="query.page===1" @click="goPage(query.page-1)">‹</button><template v-for="(page,index) in pageNumbers" :key="page"><i v-if="index&&page-pageNumbers[index-1]>1">…</i><button :class="{ active:page===query.page }" @click="goPage(page)">{{ page }}</button></template><button :disabled="query.page===pager.pages" @click="goPage(query.page+1)">›</button></nav>
        </footer>
      </section>

      <section class="chart-card card">
        <header>
          <div><h2>{{ isStudent ? `${selectedStudent.realName}的课程进度` : '学员按科室分布' }}</h2><p>{{ isStudent ? '鼠标悬停课程柱可推满、清零或发送消息' : `合计：${number(departmentDistribution?.total)} 人` }}</p></div>
          <button v-if="isStudent" class="ghost" @click="clearSelected">返回科室分布</button>
        </header>
        <div class="chart-box" @mouseleave="hoveredCourse=null">
          <div ref="chartRef" class="chart"></div>
          <div v-if="hoveredCourse" class="progress-pop" :style="{ left:`${hoverPosition.left}px`, top:`${hoverPosition.top}px` }" @mouseenter.stop>
            <button @click="completeCourse(hoveredCourse)">推满</button>
            <button @click="resetCourse(hoveredCourse)">清零</button>
            <button @click="openCourseMessage(hoveredCourse)">消息</button>
          </div>
        </div>
      </section>
    </main>

    <div v-if="messageDialog.open" class="overlay">
      <form class="confirm message-modal card" @submit.prevent="sendCourseMessage">
        <header><h2>发送课程消息</h2><button type="button" @click="messageDialog.open=false">×</button></header>
        <div class="message-body">
          <div><span>学员</span><strong>{{ messageDialog.studentName }}</strong></div>
          <div><span>课程</span><strong>{{ messageDialog.courseTitle }}</strong></div>
          <label>消息内容
            <textarea v-model="messageDialog.content" maxlength="1000" placeholder="请输入要发送给学员的消息内容..." autofocus></textarea>
            <small>{{ messageDialog.content.trim().length }}/1000</small>
          </label>
          <p class="message-tip">发送成功表示消息已保存并尝试实时推送，不代表学员已经阅读。</p>
        </div>
        <footer>
          <button type="button" class="cancel" @click="messageDialog.open=false">取消</button>
          <button class="save" :disabled="messageDialog.sending || !messageDialog.content.trim()">{{ messageDialog.sending ? '发送中...' : '发送' }}</button>
        </footer>
      </form>
    </div>

    <div v-if="confirmBox.open" class="overlay">
      <div class="confirm card">
        <header><h2>{{ confirmBox.title }}</h2><button @click="confirmBox.open=false">×</button></header>
        <p>{{ confirmBox.content }}</p>
        <footer><button class="cancel" @click="confirmBox.open=false">取消</button><button class="delete solid" :disabled="confirmBox.loading" @click="confirmAction">{{ confirmBox.loading ? '处理中...' : '确定' }}</button></footer>
      </div>
    </div>
  </section>
</template>

<style scoped>
.settings-page{min-height:calc(100vh - 79px);display:grid;grid-template-columns:350px 1fr;gap:16px;padding:18px;background:#f7f9f8;color:#202b25}.card{background:#fff;border:1px solid #e5ebe8;border-radius:12px;box-shadow:0 4px 14px rgba(17,62,42,.045)}.profile-card{min-height:760px;padding:20px}.profile-card h2,.student-list h2,.chart-card h2{margin:0;font-size:19px}.avatar-view,.avatar-edit{position:relative;width:132px;height:132px;display:grid;place-items:center;margin:28px auto 24px;border-radius:50%;overflow:hidden;background:#eef3f0;color:#0b7c49;font-size:42px;font-weight:700}.avatar-view img,.avatar-edit img{width:100%;height:100%;object-fit:cover}.avatar-edit input{position:absolute;inset:0;opacity:0;cursor:pointer}.avatar-edit b{position:absolute;inset:auto 0 0;padding:8px;color:#fff;background:rgba(0,0,0,.42);font-size:12px;text-align:center}.info-list>div,.info-row{display:grid;grid-template-columns:110px 1fr;gap:12px;padding:15px 8px;border-bottom:1px solid #eef1ef}.info-list span,.info-row span{color:#6f7974}.info-list strong,.info-row strong{font-weight:600}.edit-form label{display:block;margin-bottom:13px;color:#6f7974}.edit-form input,.edit-form select{width:100%;height:40px;margin-top:7px;padding:0 11px;border:1px solid #dbe2df;border-radius:8px;background:#fff}.profile-card footer{display:flex;gap:12px;margin-top:24px}.profile-card footer button{height:42px;display:flex;align-items:center;justify-content:center;gap:6px;padding:0 20px;border-radius:8px;cursor:pointer}.save{color:#fff;background:#007a46}.delete{color:#e03e3e;border:1px solid #f0caca;background:#fff}.delete.solid{color:#fff;background:#d84b4b}.cancel{color:#202b25;border:1px solid #d7ddda;background:#fff}.main-area{display:grid;grid-template-rows:auto 1fr;gap:16px}.student-list{padding:18px}.filters{display:grid;grid-template-columns:minmax(260px,1fr) 220px auto auto;gap:14px;align-items:center;margin:18px 0}.keyword{height:42px;display:flex;align-items:center;padding:0 12px;border:1px solid #dce2de;border-radius:8px}.keyword input{flex:1;border:0;outline:0}.filters label:not(.keyword){display:flex;align-items:center;gap:8px;white-space:nowrap}.filters select{height:40px;min-width:135px;padding:0 10px;border:1px solid #dce2de;border-radius:8px;background:#fff}.filters button{height:40px;padding:0 22px;border-radius:8px;cursor:pointer}.search-btn{color:#fff;background:#007a46}.reset-btn,.ghost{border:1px solid #d7ddda;background:#fff}.table-wrap{min-height:350px;overflow:auto;border:1px solid #edf1ef;border-radius:8px}table{width:100%;min-width:820px;border-collapse:collapse;font-size:14px}th{height:42px;background:#fbfcfb;text-align:left}td{height:48px;border-top:1px solid #edf1ef;color:#3f4944}th:first-child,td:first-child{padding-left:18px}tbody tr{cursor:pointer}tbody tr:hover,tbody tr.selected{background:#f3fbf5}.student-cell{display:flex;align-items:center;gap:10px}.mini-avatar{width:28px;height:28px;display:grid;place-items:center;overflow:hidden;border-radius:50%;background:#e8f2ec;color:#0b7c49;font-size:12px}.mini-avatar img{width:100%;height:100%;object-fit:cover}.progress-cell{display:flex;align-items:center;gap:12px}.progress-cell i{width:170px;height:8px;overflow:hidden;background:#eef0f0;border-radius:999px}.progress-cell b{display:block;height:100%;border-radius:999px}.progress-cell .good{background:#078844}.progress-cell .warn,.progress-cell .low{background:#ff7b16}.pager{height:52px;display:flex;align-items:center;gap:16px;padding:0 10px}.pager select{height:34px;border:1px solid #dfe4e1;border-radius:7px;background:#fff}.pager nav{display:flex;align-items:center;gap:7px;margin-left:auto}.pager nav button{width:32px;height:32px;border:1px solid #dfe4e1;border-radius:7px;background:#fff;cursor:pointer}.pager nav button.active{color:#fff;background:#087640}.pager nav button:disabled{opacity:.45}.pager nav i{font-style:normal}.chart-card{padding:18px}.chart-card>header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}.chart-card p{margin:6px 0 0;color:#66716c}.chart-card .ghost{height:36px;padding:0 14px;border-radius:8px;cursor:pointer}.chart-box{position:relative;height:300px}.chart{width:100%;height:100%}.progress-pop{position:absolute;z-index:4;display:flex;gap:6px;padding:6px;background:#fff;border:1px solid #dfe6e2;border-radius:8px;box-shadow:0 10px 24px rgba(0,40,20,.14)}.progress-pop button{height:28px;padding:0 10px;border-radius:6px;cursor:pointer}.progress-pop button:first-child{color:#fff;background:#087640}.progress-pop button:nth-child(2){color:#d84343;background:#fff;border:1px solid #efc8c8}.progress-pop button:nth-child(3){color:#0b6f9a;background:#eef8ff;border:1px solid #bfe2f5}.state{min-height:240px;display:flex;align-items:center;justify-content:center;gap:10px;color:#87908b}.state.small{min-height:220px}.loader{width:22px;height:22px;border:2px solid #d9e4dd;border-top-color:#26905a;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.toast{position:fixed;z-index:60;top:92px;left:50%;transform:translateX(-50%);padding:11px 20px;color:#fff;background:#238b57;border-radius:8px}.toast.error{background:#ce4e4e}.overlay{position:fixed;z-index:50;inset:0;display:grid;place-items:center;background:rgba(11,31,21,.42);backdrop-filter:blur(2px)}.confirm{width:min(450px,94vw);overflow:hidden}.confirm header{height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;border-bottom:1px solid #edf1ef}.confirm header button{font-size:24px;background:none;cursor:pointer}.confirm p{padding:28px;margin:0;line-height:1.8}.confirm footer{display:flex;justify-content:flex-end;gap:12px;padding:0 20px 18px}.confirm footer button{height:38px;padding:0 22px;border-radius:7px;cursor:pointer}.message-modal{width:min(520px,94vw)}.message-body{padding:22px}.message-body>div{display:grid;grid-template-columns:82px 1fr;gap:12px;padding:10px 0;border-bottom:1px solid #eef2f0}.message-body span{color:#6f7974}.message-body label{display:block;margin-top:16px;color:#6f7974}.message-body textarea{width:100%;height:130px;margin-top:8px;padding:10px;border:1px solid #dbe2df;border-radius:8px;resize:vertical;outline:none}.message-body small{display:block;margin-top:6px;text-align:right;color:#8b948f}.message-tip{padding:10px 12px!important;margin:10px 0 0!important;color:#60736a;background:#f4faf7;border:1px solid #dceee5;border-radius:8px;font-size:13px;line-height:1.6}
@media(max-width:1200px){.settings-page{grid-template-columns:1fr}.profile-card{min-height:auto}.filters{grid-template-columns:1fr 1fr}.chart-box{height:330px}}@media(max-width:760px){.settings-page{padding:10px}.filters{grid-template-columns:1fr}.pager{flex-wrap:wrap;height:auto;padding:12px 0}.pager nav{width:100%;justify-content:center;margin-left:0}.profile-card footer{flex-wrap:wrap}.profile-card footer button{flex:1}.chart-card>header{gap:12px;flex-direction:column}.chart-box{height:280px}}
</style>
