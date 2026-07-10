<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { getCategoryTree } from '@/services/category'
import {
  deleteCourseDraft, exportCourses, getCourseOverview, getCourses, previewCourse, updateCourseStatus,
} from '@/services/course'

const emit = defineEmits(['create-course', 'edit-course'])

const rows = ref([])
const categories = ref([])
const overview = ref(null)
const loading = ref(false)
const openMenu = ref(null)
const busyIds = ref(new Set())
const message = ref(null)
const query = reactive({ keyword:'', categoryId:'', status:'', page:1, size:10 })
const pager = reactive({ total:0, pages:1 })
const preview = reactive({ open:false, loading:false, data:null })
const confirmBox = reactive({ open:false, title:'', content:'', action:null, loading:false })

const pageNumbers = computed(() => {
  if (pager.pages <= 7) return Array.from({ length:pager.pages }, (_, index) => index + 1)
  return [...new Set([1, pager.pages, query.page - 1, query.page, query.page + 1])]
    .filter(page => page > 0 && page <= pager.pages)
    .sort((a, b) => a - b)
})

const metrics = computed(() => [
  { key:'total', label:'课程总数', icon:'📖', tone:'green', value:overview.value?.total?.value, rate:overview.value?.total?.changeRate, direction:overview.value?.total?.changeDirection },
  { key:'draft', label:'草稿课程', icon:'📄', tone:'lime', value:overview.value?.draft?.value, rate:overview.value?.draft?.changeRate, direction:overview.value?.draft?.changeDirection },
  { key:'published', label:'已发布课程', icon:'➤', tone:'teal', value:overview.value?.published?.value, rate:overview.value?.published?.changeRate, direction:overview.value?.published?.changeDirection },
  { key:'offline', label:'已下架课程', icon:'⏸', tone:'orange', value:overview.value?.offline?.value, rate:overview.value?.offline?.changeRate, direction:overview.value?.offline?.changeDirection },
])

function toast(text, type = 'success') {
  message.value = { text, type }
  window.setTimeout(() => { message.value = null }, 2600)
}
function number(value) { return Number(value || 0).toLocaleString('zh-CN') }
function date(value) {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', {
    year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false,
  }).format(d).replaceAll('/', '-')
}
function statusLabel(status) {
  return { DRAFT:'草稿', PUBLISHED:'已发布', OFFLINE:'已下架' }[status] || status || '未知'
}
function statusClass(status) { return String(status || '').toLowerCase() }
function rateText(item) {
  if (item.rate === null || item.rate === undefined) return ''
  const down = item.direction === 'DOWN' || Number(item.rate) < 0
  const arrow = down ? '↓' : '↑'
  return `较上月 ${arrow} ${Math.abs(Number(item.rate))}%`
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
function flattenCategories(list = [], prefix = '') {
  return list.flatMap(item => {
    const rawName = item.name || item.categoryName || item.title || item.label || ''
    const label = `${prefix}${rawName}`
    const id = item.id || item.categoryId || item.value || item.key
    const children = flattenCategories(item.children || item.childCategories || item.childrenList || [], `${label} / `)
    return [{ id, name:label }, ...children].filter(row => row.id && row.name)
  })
}

async function loadCategories() {
  try {
    const tree = await getCategoryTree({ status:1 })
    categories.value = flattenCategories(categorySource(tree))
  } catch (error) {
    toast(error.message, 'error')
  }
}
async function loadOverview() {
  try { overview.value = await getCourseOverview() }
  catch (error) { toast(error.message, 'error') }
}
async function loadList() {
  loading.value = true
  try {
    const data = await getCourses(query)
    rows.value = data?.records || []
    pager.total = data?.total || 0
    pager.pages = data?.pages || 1
    if (query.page > pager.pages) {
      query.page = pager.pages
      return loadList()
    }
  } catch (error) {
    toast(error.message, 'error')
  } finally {
    loading.value = false
  }
}
async function refresh() {
  openMenu.value = null
  await Promise.all([loadList(), loadOverview()])
}
function search() {
  query.page = 1
  loadList()
}
function reset() {
  Object.assign(query, { keyword:'', categoryId:'', status:'', page:1, size:query.size })
  loadList()
}
function goPage(page) {
  if (page < 1 || page > pager.pages || page === query.page) return
  query.page = page
  loadList()
}

async function showPreview(row) {
  preview.open = true
  preview.loading = true
  preview.data = null
  openMenu.value = null
  try { preview.data = await previewCourse(row.id || row.courseId) }
  catch (error) { preview.open = false; toast(error.message, 'error') }
  finally { preview.loading = false }
}
function ask(title, content, action) {
  Object.assign(confirmBox, { open:true, title, content, action, loading:false })
  openMenu.value = null
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
function statusActions(status) {
  if (status === 'DRAFT') return [{ label:'发布', value:'PUBLISHED' }]
  if (status === 'PUBLISHED') return [{ label:'下架', value:'OFFLINE' }, { label:'转草稿', value:'DRAFT' }]
  if (status === 'OFFLINE') return [{ label:'发布', value:'PUBLISHED' }, { label:'转草稿', value:'DRAFT' }]
  return []
}
function changeStatus(row, status) {
  const id = row.id || row.courseId
  ask('修改课程状态', `确定将“${row.title}”改为${statusLabel(status)}吗？`, async () => {
    const next = new Set(busyIds.value)
    next.add(id)
    busyIds.value = next
    try {
      await updateCourseStatus(id, status)
      toast(`课程已${statusLabel(status)}`)
      await refresh()
    } catch (error) {
      toast(error.message, 'error')
      throw error
    } finally {
      const done = new Set(busyIds.value)
      done.delete(id)
      busyIds.value = done
    }
  })
}
function removeDraft(row) {
  const id = row.id || row.courseId
  ask('删除草稿课程', `确定删除“${row.title}”吗？只允许删除草稿课程，且不会删除全局课件库资源。`, async () => {
    try {
      await deleteCourseDraft(id)
      toast('课程草稿已删除')
      await refresh()
    } catch (error) {
      toast(error.message, 'error')
      throw error
    }
  })
}
async function exportList() {
  try {
    const params = { keyword:query.keyword.trim(), categoryId:query.categoryId, status:query.status }
    const { blob, filename } = await exportCourses(params)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename || 'courses.xlsx'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    toast('课程导出已开始')
  } catch (error) {
    toast(error.message, 'error')
  }
}

onMounted(async () => {
  await Promise.all([loadCategories(), refresh()])
})
</script>

<template>
  <section class="course-manage" @click.self="openMenu=null">
    <div v-if="message" class="toast" :class="message.type">{{ message.text }}</div>

    <div class="metric-grid">
      <article v-for="item in metrics" :key="item.key" class="metric card">
        <i :class="item.tone">{{ item.icon }}</i>
        <div>
          <span>{{ item.label }}</span>
          <strong>{{ number(item.value) }}</strong>
          <small v-if="rateText(item)" :class="{ down:item.direction === 'DOWN' || Number(item.rate) < 0 }">{{ rateText(item) }}</small>
        </div>
      </article>
    </div>

    <div class="filter-card card">
      <label class="keyword">
        <input v-model.trim="query.keyword" maxlength="100" placeholder="搜索课程名称或讲师..." @keyup.enter="search" />
        <AppIcon name="search" :size="18" />
      </label>
      <label>课程类别
        <select v-model="query.categoryId" @change="search">
          <option value="">全部类别</option>
          <option v-for="item in categories" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
      </label>
      <label>发布状态
        <select v-model="query.status" @change="search">
          <option value="">全部状态</option>
          <option value="DRAFT">草稿</option>
          <option value="PUBLISHED">已发布</option>
          <option value="OFFLINE">已下架</option>
        </select>
      </label>
      <button class="reset" @click="reset">重置</button>
      <span></span>
      <button class="new-btn" @click="emit('create-course')">＋ 新建课程</button>
      <button class="export-btn" @click="exportList">⇧ 导出课程</button>
    </div>

    <div class="table-card card">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>课程封面</th><th>课程名称</th><th>类别</th><th>讲师</th><th>学员数</th><th>发布状态</th><th>更新时间</th><th>操作</th>
            </tr>
          </thead>
          <tbody v-if="!loading && rows.length">
            <tr v-for="row in rows" :key="row.id || row.courseId">
              <td>
                <img v-if="row.coverUrl" class="cover" :src="row.coverUrl" alt="课程封面" />
                <span v-else class="cover empty-cover"><AppIcon name="image" :size="22" /></span>
              </td>
              <td><strong class="title" :title="row.title">{{ row.title }}</strong></td>
              <td>{{ row.categoryName || '—' }}</td>
              <td>{{ row.instructorName || '—' }}</td>
              <td>{{ number(row.studentCount) }}</td>
              <td><span class="status" :class="statusClass(row.status)">{{ statusLabel(row.status) }}</span></td>
              <td>{{ date(row.updatedAt) }}</td>
              <td>
                <div class="actions">
                  <button title="预览" @click="showPreview(row)">👁</button>
                  <button title="编辑" @click="emit('edit-course', row.id || row.courseId)">✎</button>
                  <div class="more">
                    <button title="更多" @click.stop="openMenu=openMenu===(row.id || row.courseId)?null:(row.id || row.courseId)">•••</button>
                    <div v-if="openMenu===(row.id || row.courseId)" class="menu">
                      <button v-for="action in statusActions(row.status)" :key="action.value" @click="changeStatus(row, action.value)">{{ action.label }}</button>
                      <button v-if="row.status === 'DRAFT'" class="danger-text" @click="removeDraft(row)">删除</button>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="loading" class="state"><span class="loader"></span>正在加载课程...</div>
        <div v-else-if="!rows.length" class="state">暂无符合条件的课程</div>
      </div>
      <footer>
        <span>共 {{ number(pager.total) }} 条记录</span>
        <nav>
          <button :disabled="query.page===1" @click="goPage(query.page-1)">‹</button>
          <template v-for="(page,index) in pageNumbers" :key="page">
            <i v-if="index && page-pageNumbers[index-1]>1">…</i>
            <button :class="{ active:page===query.page }" @click="goPage(page)">{{ page }}</button>
          </template>
          <button :disabled="query.page===pager.pages" @click="goPage(query.page+1)">›</button>
        </nav>
        <select v-model="query.size" @change="query.page=1;loadList()">
          <option :value="10">10 条/页</option>
          <option :value="20">20 条/页</option>
          <option :value="50">50 条/页</option>
        </select>
      </footer>
    </div>

    <div v-if="preview.open" class="overlay" @mousedown.self="preview.open=false">
      <article class="preview-dialog dialog">
        <header><h2>课程预览</h2><button @click="preview.open=false">×</button></header>
        <div v-if="preview.loading" class="state">正在加载预览...</div>
        <div v-else-if="preview.data" class="preview-body">
          <img v-if="preview.data.coverUrl" :src="preview.data.coverUrl" alt="课程封面" />
          <span class="status" :class="statusClass(preview.data.status)">{{ statusLabel(preview.data.status) }}</span>
          <h1>{{ preview.data.title }}</h1>
          <p class="meta">讲师：{{ preview.data.instructorName || '—' }}</p>
          <p v-if="preview.data.summary" class="summary">{{ preview.data.summary }}</p>
          <section v-for="chapter in preview.data.chapters || []" :key="chapter.id" class="preview-chapter">
            <h3>{{ chapter.title }}</h3>
            <div v-for="point in chapter.points || []" :key="point.id" class="preview-point">
              <strong>{{ point.title }} <em>{{ point.required ? '必修' : '选修' }}</em></strong>
              <p v-if="point.description">{{ point.description }}</p>
              <small>
                文章 {{ point.articles?.length || 0 }} 个 · 视频 {{ point.videos?.length || 0 }} 个 · PPT {{ point.ppts?.length || 0 }} 个
              </small>
            </div>
          </section>
        </div>
      </article>
    </div>

    <div v-if="confirmBox.open" class="overlay">
      <div class="confirm-dialog dialog">
        <header><h2>{{ confirmBox.title }}</h2><button @click="confirmBox.open=false">×</button></header>
        <div class="confirm-content"><i>!</i><p>{{ confirmBox.content }}</p></div>
        <footer><button class="cancel" @click="confirmBox.open=false">取消</button><button class="danger" :disabled="confirmBox.loading" @click="confirmAction">{{ confirmBox.loading ? '处理中...' : '确定' }}</button></footer>
      </div>
    </div>
  </section>
</template>

<style scoped>
.course-manage{min-height:calc(100vh - 79px);padding:20px;background:#f7f9f8;color:#29312d}.card{background:#fff;border:1px solid #e7ebe8;border-radius:14px;box-shadow:0 4px 14px rgba(17,62,42,.045)}.metric-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-bottom:18px}.metric{min-height:118px;display:flex;align-items:center;gap:22px;padding:22px 26px}.metric>i{width:58px;height:58px;display:grid;place-items:center;color:#fff;border-radius:18px;font-size:28px;font-style:normal}.metric .green,.metric .teal{background:linear-gradient(135deg,#079153,#006b43)}.metric .lime{background:linear-gradient(135deg,#9add22,#64b914)}.metric .orange{background:linear-gradient(135deg,#ffa928,#ff8315)}.metric span,.metric strong,.metric small{display:block}.metric span{color:#66716c}.metric strong{margin:7px 0 5px;font-size:28px}.metric small{color:#1f9a55}.metric small.down{color:#dc4f4f}.filter-card{display:grid;grid-template-columns:minmax(260px,1fr) 190px 190px auto 1fr auto auto;gap:14px;align-items:center;margin-bottom:18px;padding:20px 22px}.keyword{height:42px;display:flex;align-items:center;padding:0 13px;border:1px solid #dce2de;border-radius:9px}.keyword input{flex:1;min-width:0;border:0;outline:0;background:transparent}.filter-card label:not(.keyword){display:flex;align-items:center;gap:10px;color:#4d5752;font-size:13px}.filter-card select{height:42px;min-width:130px;padding:0 12px;border:1px solid #dce2de;border-radius:9px;background:#fff}.filter-card button{height:42px;padding:0 18px;border-radius:8px;cursor:pointer;white-space:nowrap}.new-btn{color:#fff;background:linear-gradient(90deg,#6cc41b,#159049)}.export-btn,.reset{color:#3f4b45;border:1px solid #d9e0dc;background:#fff}.table-card{overflow:hidden}.table-scroll{overflow:auto}table{width:100%;min-width:1080px;border-collapse:collapse;font-size:14px}th{height:52px;background:#fbfcfb;text-align:left;color:#2c342f}td{height:66px;border-top:1px solid #edf0ee;color:#4e5753}th:first-child,td:first-child{padding-left:26px;width:118px}th:nth-child(2){width:260px}.cover{width:86px;height:44px;display:grid;place-items:center;object-fit:cover;border-radius:8px;background:#eef4f1;color:#90a099}.title{display:block;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#202722;font-weight:600}.status{display:inline-flex;padding:5px 11px;border-radius:13px;font-size:12px}.status.published{color:#38943b;background:#eaf7e7}.status.draft{color:#7d8681;background:#eef1f0}.status.offline{color:#ee8a18;background:#fff2e3}.actions{display:flex;align-items:center;gap:8px}.actions>button,.more>button{width:31px;height:31px;border:1px solid #dfe5e1;border-radius:7px;background:#fff;cursor:pointer}.more{position:relative}.menu{position:absolute;z-index:6;right:0;top:36px;width:110px;padding:6px;background:#fff;border:1px solid #e0e5e2;border-radius:9px;box-shadow:0 10px 25px rgba(0,40,20,.14)}.menu button{width:100%;padding:8px 10px;border-radius:6px;background:none;text-align:left;cursor:pointer}.menu button:hover{background:#f1f7f3}.menu .danger-text{color:#dc4242}.state{height:240px;display:flex;align-items:center;justify-content:center;gap:10px;color:#8b938f}.loader{width:22px;height:22px;border:2px solid #d9e4dd;border-top-color:#26905a;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.table-card>footer{height:64px;display:flex;align-items:center;gap:20px;padding:0 24px;border-top:1px solid #edf0ee;font-size:13px}.table-card nav{display:flex;align-items:center;gap:7px;margin-left:auto}.table-card nav button{width:34px;height:34px;border:1px solid #e0e4e2;border-radius:7px;background:#fff;cursor:pointer}.table-card nav button.active{color:#fff;background:#78c820}.table-card nav button:disabled{opacity:.4}.table-card nav i{font-style:normal}.table-card>footer select{height:36px;border:1px solid #dfe3e1;border-radius:7px}.toast{position:fixed;z-index:60;top:92px;left:50%;transform:translateX(-50%);padding:11px 20px;color:#fff;background:#238b57;border-radius:8px;box-shadow:0 8px 25px rgba(0,0,0,.15)}.toast.error{background:#ce4e4e}.overlay{position:fixed;z-index:40;inset:0;display:grid;place-items:center;padding:20px;background:rgba(11,31,21,.42);backdrop-filter:blur(2px)}.dialog{overflow:hidden;background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,35,20,.22)}.dialog>header{height:62px;display:flex;align-items:center;justify-content:space-between;padding:0 23px;border-bottom:1px solid #eaeeeb}.dialog h2{margin:0;font-size:19px}.dialog header button{font-size:25px;color:#727a76;background:none;cursor:pointer}.preview-dialog{width:min(860px,96vw);max-height:92vh}.preview-body{max-height:calc(92vh - 62px);padding:28px 38px;overflow:auto}.preview-body>img{width:100%;max-height:280px;object-fit:cover;border-radius:12px}.preview-body h1{margin:15px 0 8px;font-size:28px}.preview-body .meta{color:#858c88;font-size:13px}.summary{padding:14px;color:#536059;background:#f4f8f5;border-radius:8px}.preview-chapter{margin-top:18px;padding:16px;border:1px solid #e3ebe6;border-radius:12px}.preview-chapter h3{margin:0 0 12px}.preview-point{padding:12px;border-top:1px solid #eef2f0}.preview-point:first-of-type{border-top:0}.preview-point strong{display:block}.preview-point em{margin-left:8px;color:#25834e;font-style:normal;font-size:12px}.preview-point p{margin:8px 0;color:#5d6862}.preview-point small{color:#81908a}.confirm-dialog{width:min(450px,96vw)}.confirm-content{display:flex;gap:15px;padding:28px}.confirm-content i{width:30px;height:30px;display:grid;place-items:center;flex:none;color:#fff;background:#ee9c24;border-radius:50%;font-style:normal}.confirm-content p{margin:4px 0;line-height:1.7}.dialog>footer{height:65px;display:flex;align-items:center;justify-content:flex-end;gap:12px;padding:0 23px;background:#fafbfa}.dialog>footer button{height:38px;padding:0 22px;border-radius:7px;cursor:pointer}.cancel{border:1px solid #d7dcda;background:#fff}.danger{color:#fff;background:#d84b4b}
@media(max-width:1180px){.metric-grid{grid-template-columns:repeat(2,1fr)}.filter-card{grid-template-columns:1fr 1fr}.filter-card>span{display:none}}@media(max-width:760px){.course-manage{padding:10px}.metric-grid,.filter-card{grid-template-columns:1fr}.filter-card label:not(.keyword){justify-content:space-between}.table-card>footer{flex-wrap:wrap;height:auto;padding:14px}.table-card nav{order:3;width:100%;margin:0;justify-content:center}.preview-body{padding:20px}}
.filter-card{grid-template-columns:minmax(260px,1fr) 220px 220px auto 1fr auto auto}
.filter-card label:not(.keyword){white-space:nowrap}
.filter-card select{min-width:145px}
@media(max-width:1180px){.filter-card{grid-template-columns:1fr 1fr}.filter-card label:not(.keyword){justify-content:flex-start}}
@media(max-width:760px){.filter-card label:not(.keyword){justify-content:space-between}}
</style>
