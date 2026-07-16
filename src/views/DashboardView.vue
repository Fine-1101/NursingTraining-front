<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import BrandLogo from '@/components/BrandLogo.vue'
import CategoryManagement from '@/components/category/CategoryManagement.vue'
import TagManagement from '@/components/tag/TagManagement.vue'
import ArticleManagement from '@/components/article/ArticleManagement.vue'
import PptManagement from '@/components/ppt/PptManagement.vue'
import VideoManagement from '@/components/video/VideoManagement.vue'
import CourseCreate from '@/components/course/CourseCreate.vue'
import CourseManagement from '@/components/course/CourseManagement.vue'
import HomeDashboard from '@/components/dashboard/HomeDashboard.vue'
import SystemSettings from '@/components/settings/SystemSettings.vue'
import AssessmentManagement from '@/components/assessment/AssessmentManagement.vue'
import { fetchCurrentUser } from '@/services/api'
import { clearSession, getStoredUser, setStoredUser } from '@/services/auth'
import { getAssessments, getAssessmentReminders } from '@/services/assessment'

const router = useRouter()
const collapsed = ref(false)
const coursesOpen = ref(true)
const libraryOpen = ref(true)
const assessmentOpen = ref(true)
const active = ref('首页面板')
const user = ref(getStoredUser() || {})
const profileOpen = ref(false)
const courseEditor = reactive({ id:null, resetKey:0 })
const reminderPanel = reactive({ open:false, loading:false, assessments:[], assessmentId:'', keyword:'', readStatus:'ALL', records:[], total:0, pages:1, page:1, size:10 })

const displayName = computed(() => user.value?.realName || user.value?.name || user.value?.nickname || user.value?.username || '护理管理员')
const displayEmail = computed(() => user.value?.email || 'admin@nursing.com')
const avatar = computed(() => user.value?.avatarUrl || user.value?.avatar || user.value?.headImg || user.value?.photoUrl || '')
const assessmentMenuActive = computed(() => ['题库管理', '考核发布', '成绩管理'].includes(active.value))
const courseMenuActive = computed(() => ['新建课程', '课程列表', '文章管理', '视频管理', 'PPT管理'].includes(active.value) || assessmentMenuActive.value)

const mainItems = [
  { label: '首页面板', icon: 'home' },
  { label: '类别管理', icon: 'category' },
  { label: '标签管理', icon: 'tag' },
]

function normalizeCurrentUser(response) {
  return response?.data?.user || response?.data || response?.user || response || {}
}

onMounted(async () => {
  try {
    const response = await fetchCurrentUser()
    user.value = normalizeCurrentUser(response)
    setStoredUser(user.value)
  } catch { /* request layer handles authentication failures */ }
})

function select(label) {
  if (label === '新建课程') {
    courseEditor.id = null
    courseEditor.resetKey += 1
  }
  active.value = label
}
function createCourse() {
  courseEditor.id = null
  courseEditor.resetKey += 1
  active.value = '新建课程'
}
function editCourse(id) {
  courseEditor.id = id
  courseEditor.resetKey += 1
  active.value = '新建课程'
}
function openLibrary(type) {
  const target = { article:'文章管理', video:'视频管理', ppt:'PPT管理' }[type]
  if (target) {
    libraryOpen.value = true
    coursesOpen.value = true
    active.value = target
  }
}
function navigateDashboard(label) {
  if (!label) return
  if (label === '新建课程') createCourse()
  else if (label === '学员管理') select('系统设置')
  else select(label)
}
function logout() { clearSession(); router.replace('/login') }
function displayDateTime(value) {
  if (!value) return '—'
  return String(value).replace('T', ' ').replace(/\+\d{2}:\d{2}$/, '').replace(/Z$/, '')
}
async function openReminderPanel() {
  reminderPanel.open = true
  if (!reminderPanel.assessments.length) {
    reminderPanel.loading = true
    try {
      const data = await getAssessments({ page:1, size:100 })
      reminderPanel.assessments = data?.records || []
      if (!reminderPanel.assessmentId && reminderPanel.assessments.length) reminderPanel.assessmentId = reminderPanel.assessments[0].id
      await loadReminderHistory()
    } finally {
      reminderPanel.loading = false
    }
  } else {
    await loadReminderHistory()
  }
}
async function loadReminderHistory() {
  if (!reminderPanel.assessmentId) return
  reminderPanel.loading = true
  try {
    const data = await getAssessmentReminders(reminderPanel.assessmentId, {
      keyword:reminderPanel.keyword.trim(),
      readStatus:reminderPanel.readStatus,
      page:reminderPanel.page,
      size:reminderPanel.size,
    })
    reminderPanel.records = data?.records || []
    reminderPanel.total = data?.total || 0
    reminderPanel.pages = data?.pages || 1
  } finally {
    reminderPanel.loading = false
  }
}
function searchReminderHistory() {
  reminderPanel.page = 1
  loadReminderHistory()
}
</script>

<template>
  <main class="dashboard" :class="{ collapsed }">
    <aside class="sidebar">
      <div class="side-brand"><BrandLogo :compact="collapsed" /></div>
      <nav class="side-nav" aria-label="后台菜单">
        <button v-for="item in mainItems" :key="item.label" :class="{ active: active === item.label }" :title="collapsed ? item.label : ''" @click="select(item.label)">
          <AppIcon :name="item.icon" :size="24" /><span>{{ item.label }}</span>
        </button>
        <button :class="{ active: courseMenuActive }" title="课程管理" @click="coursesOpen = !coursesOpen">
          <AppIcon name="course" :size="24" /><span>课程管理</span><AppIcon class="arrow" name="chevron" :class="{ open: coursesOpen }" :size="17" />
        </button>
        <div v-show="coursesOpen && !collapsed" class="sub-menu">
          <button :class="{ activeSub: active === '新建课程' }" @click="select('新建课程')">新建课程</button>
          <button :class="{ activeSub: active === '课程列表' }" @click="select('课程列表')">课程列表</button>
          <button class="library-toggle" @click="libraryOpen = !libraryOpen"><span>课件库</span><AppIcon name="chevron" :class="{ open: libraryOpen }" :size="15" /></button>
          <div v-show="libraryOpen" class="library-list">
            <button @click="select('文章管理')">文章管理</button><button @click="select('视频管理')">视频管理</button><button @click="select('PPT管理')">PPT管理</button>
          </div>
          <button class="library-toggle" @click="assessmentOpen = !assessmentOpen"><span>考核管理</span><AppIcon name="chevron" :class="{ open: assessmentOpen }" :size="15" /></button>
          <div v-show="assessmentOpen" class="library-list">
            <button :class="{ activeSub: active === '题库管理' }" @click="select('题库管理')">题库管理</button><button :class="{ activeSub: active === '考核发布' }" @click="select('考核发布')">考核发布</button><button :class="{ activeSub: active === '成绩管理' }" @click="select('成绩管理')">成绩管理</button>
          </div>
        </div>
        <button :class="{ active: active === '系统设置' }" :title="collapsed ? '系统设置' : ''" @click="select('系统设置')">
          <AppIcon name="settings" :size="24" /><span>系统设置</span>
        </button>
      </nav>
      <div class="side-user">
        <span class="avatar"><img v-if="avatar" :src="avatar" alt="" /><AppIcon v-else name="user" :size="25" /></span>
        <div><strong>{{ displayName }}</strong><small>{{ displayEmail }}</small></div>
      </div>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div class="page-title"><button aria-label="折叠侧边栏" @click="collapsed = !collapsed"><AppIcon name="menu" :size="25" /></button><h1>{{ active }}</h1></div>
        <div class="top-actions">
          <label class="search"><input placeholder="搜索内容..." /><AppIcon name="search" :size="18" /></label>
          <button class="notification" aria-label="提醒历史" title="考核提醒历史" @click="openReminderPanel"><AppIcon name="bell" :size="24" /><i v-if="reminderPanel.total">{{ reminderPanel.total > 99 ? '99+' : reminderPanel.total }}</i></button>
          <div class="profile">
            <button class="profile-btn" @click="profileOpen = !profileOpen"><span class="avatar"><img v-if="avatar" :src="avatar" alt="" /><AppIcon v-else name="user" /></span><strong>{{ displayName }}</strong><AppIcon name="chevron" :class="{ open: profileOpen }" :size="15" /></button>
            <button v-if="profileOpen" class="logout" @click="logout"><AppIcon name="logout" :size="18" />退出登录</button>
          </div>
        </div>
      </header>
      <div class="content-area">
        <HomeDashboard v-if="active === '首页面板'" @navigate="navigateDashboard" />
        <SystemSettings v-else-if="active === '系统设置'" />
        <CategoryManagement v-else-if="active === '类别管理'" />
        <TagManagement v-else-if="active === '标签管理'" />
        <ArticleManagement v-else-if="active === '文章管理'" />
        <PptManagement v-else-if="active === 'PPT管理'" />
        <VideoManagement v-else-if="active === '视频管理'" />
        <AssessmentManagement v-else-if="assessmentMenuActive" :section="active" />
        <CourseManagement v-else-if="active === '课程列表' || active === '课程管理'" @create-course="createCourse" @edit-course="editCourse" />
        <CourseCreate v-else-if="active === '新建课程'" :edit-course-id="courseEditor.id" :reset-key="courseEditor.resetKey" @open-library="openLibrary" />
        <div v-else class="empty-module"></div>
      </div>
    </section>

    <div v-if="reminderPanel.open" class="reminder-overlay" @mousedown.self="reminderPanel.open=false">
      <section class="reminder-dialog">
        <header><h2>考核提醒历史</h2><button @click="reminderPanel.open=false">×</button></header>
        <div class="reminder-filters">
          <select v-model="reminderPanel.assessmentId" @change="searchReminderHistory">
            <option value="">请选择考核</option>
            <option v-for="item in reminderPanel.assessments" :key="item.id" :value="item.id">{{ item.title }}</option>
          </select>
          <select v-model="reminderPanel.readStatus" @change="searchReminderHistory">
            <option value="ALL">全部状态</option>
            <option value="UNREAD">未读</option>
            <option value="READ">已读</option>
          </select>
          <input v-model="reminderPanel.keyword" placeholder="搜索学员、工号或内容..." @keyup.enter="searchReminderHistory" />
          <button @click="searchReminderHistory">查询</button>
        </div>
        <div class="reminder-list">
          <div v-if="reminderPanel.loading" class="reminder-state">正在加载提醒历史...</div>
          <div v-else-if="!reminderPanel.records.length" class="reminder-state">暂无提醒历史</div>
          <article v-for="item in reminderPanel.records" v-else :key="item.messageId" class="reminder-item">
            <div>
              <strong>{{ item.receiverName || '未知学员' }} <small>{{ item.receiverUsername || '' }}</small></strong>
              <span>{{ item.departmentName || '未分配科室' }} · {{ item.read ? '已读' : '未读' }}</span>
            </div>
            <p>{{ item.content }}</p>
            <footer><span>{{ item.courseTitle }} / {{ item.assessmentTitle }}</span><time>{{ displayDateTime(item.sentAt) }}</time></footer>
          </article>
        </div>
        <footer class="reminder-pager">
          <span>共 {{ reminderPanel.total }} 条</span>
          <button :disabled="reminderPanel.page<=1" @click="reminderPanel.page--;loadReminderHistory()">上一页</button>
          <b>{{ reminderPanel.page }} / {{ reminderPanel.pages || 1 }}</b>
          <button :disabled="reminderPanel.page>=reminderPanel.pages" @click="reminderPanel.page++;loadReminderHistory()">下一页</button>
        </footer>
      </section>
    </div>
  </main>
</template>

<style scoped>
.dashboard { --sidebar:267px; min-height:100vh; display:grid; grid-template-columns:var(--sidebar) 1fr; background:#fafcfb; transition:.25s; }
.dashboard.collapsed { --sidebar:82px; }
.sidebar { position:fixed; z-index:5; inset:0 auto 0 0; width:var(--sidebar); display:flex; flex-direction:column; color:#e7f2ed; overflow:hidden; background:radial-gradient(circle at 38% 20%,#096342 0,#03472f 52%,#003b29 100%); border-radius:0 15px 0 0; transition:.25s; }
.side-brand { height:93px; display:flex; align-items:center; padding:0 21px; border-bottom:1px solid rgba(255,255,255,.04); }
.side-brand :deep(.brand-name) { font-size:22px; letter-spacing:1px; }
.side-brand :deep(.mark) { width:40px; height:40px; }.side-brand :deep(.mark svg) { width:34px; height:34px; }.side-brand :deep(.leaf) { width:22px; height:28px; }
.side-nav { flex:1; padding:15px 0; overflow-y:auto; scrollbar-width:none; }
.side-nav>button { position:relative; width:calc(100% - 16px); height:50px; display:flex; align-items:center; gap:20px; margin:5px 8px; padding:0 22px; color:#b8d2c8; background:transparent; border-radius:0 26px 26px 0; cursor:pointer; text-align:left; transition:.2s; }
.side-nav>button span { flex:1; white-space:nowrap; font-size:15px; }.side-nav>button:hover { color:#fff; background:rgba(255,255,255,.07); }
.side-nav>button.active { color:#fff; background:linear-gradient(90deg,rgba(37,142,92,.78),rgba(53,163,116,.58)); }.side-nav>button.active::before { content:""; position:absolute; left:-8px; top:0; width:5px; height:100%; background:#91d434; border-radius:0 4px 4px 0; }.side-nav>button.active svg { color:#8ed441; }
.arrow { margin-left:auto; transform:rotate(90deg); transition:.2s; }.arrow.open { transform:rotate(-90deg); }
.sub-menu { margin:0 22px 0 38px; padding:1px 0 3px 26px; border-left:1px solid rgba(255,255,255,.14); }
.sub-menu button { width:100%; display:flex; align-items:center; justify-content:space-between; padding:10px 0; color:#cae0d7; background:none; text-align:left; cursor:pointer; font-size:14px; }.sub-menu button:hover,.sub-menu .activeSub { color:#9bdc70; }.library-toggle svg { transform:rotate(90deg); }.library-toggle svg.open { transform:rotate(-90deg); }.library-list { padding-left:8px; }
.side-user { display:flex; align-items:center; gap:13px; min-height:90px; padding:15px 25px; background:rgba(0,45,30,.18); }.avatar { flex:0 0 auto; width:43px; height:43px; display:grid; place-items:center; overflow:hidden; color:#929997; background:#f0f1f0; border-radius:50%; }.avatar img { width:100%; height:100%; object-fit:cover; }.side-user div { min-width:0; }.side-user strong,.side-user small { display:block; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }.side-user strong { color:#fff; font-size:14px; }.side-user small { margin-top:5px; color:#a8c4b9; font-size:12px; }
.collapsed .side-brand { padding:0 22px; }.collapsed .side-nav>button { width:58px; padding:0; justify-content:center; border-radius:0 25px 25px 0; }.collapsed .side-nav>button span,.collapsed .side-nav .arrow,.collapsed .side-user div { display:none; }.collapsed .side-user { padding:18px 20px; }
.workspace { grid-column:2; min-width:0; min-height:100vh; }.topbar { height:79px; display:flex; align-items:center; justify-content:space-between; padding:0 31px; background:#fff; border-bottom:1px solid #e7eae8; }.page-title,.top-actions,.profile-btn { display:flex; align-items:center; }.page-title { gap:25px; }.page-title button,.notification { display:grid; place-items:center; color:#101713; background:none; cursor:pointer; }.page-title h1 { margin:0; font-size:21px; letter-spacing:1px; }
.top-actions { gap:28px; }.search { width:220px; height:38px; display:flex; align-items:center; padding:0 15px; border:1px solid #dde1df; border-radius:22px; }.search input { flex:1; min-width:0; border:0; outline:0; background:transparent; font-size:13px; }.search svg { color:#555d59; }.notification { position:relative; }.notification i { position:absolute; top:-7px; right:-8px; min-width:17px; height:17px; display:grid; place-items:center; color:white; background:#62b52e; border:2px solid white; border-radius:10px; font-size:10px; font-style:normal; }
.profile { position:relative; }.profile-btn { gap:10px; padding:0; background:none; cursor:pointer; }.profile-btn .avatar { width:36px; height:36px; }.profile-btn strong { font-size:14px; white-space:nowrap; }.profile-btn>svg { transform:rotate(90deg); transition:.2s; }.profile-btn>svg.open { transform:rotate(-90deg); }.logout { position:absolute; right:0; top:49px; width:130px; height:42px; display:flex; align-items:center; justify-content:center; gap:8px; color:#39433e; background:white; border:1px solid #e2e5e3; border-radius:8px; box-shadow:0 8px 25px rgba(0,50,30,.12); cursor:pointer; }.content-area { min-height:calc(100vh - 79px); background:linear-gradient(135deg,#fbfdfc,#fff); }
.reminder-overlay{position:fixed;z-index:80;inset:0;display:grid;place-items:start end;padding:86px 28px 20px;background:rgba(8,28,18,.22);backdrop-filter:blur(2px)}
.reminder-dialog{width:min(720px,calc(100vw - 40px));max-height:calc(100vh - 112px);display:flex;flex-direction:column;overflow:hidden;background:#fff;border:1px solid #e3e9e6;border-radius:14px;box-shadow:0 18px 60px rgba(0,35,20,.22)}
.reminder-dialog>header{height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;border-bottom:1px solid #edf1ef}.reminder-dialog h2{margin:0;font-size:18px}.reminder-dialog header button{font-size:25px;background:none;cursor:pointer}
.reminder-filters{display:grid;grid-template-columns:1.2fr 110px 1fr auto;gap:10px;padding:14px;border-bottom:1px solid #edf1ef}.reminder-filters select,.reminder-filters input{height:38px;min-width:0;padding:0 11px;border:1px solid #dce2de;border-radius:8px;background:#fff}.reminder-filters button,.reminder-pager button{height:38px;padding:0 15px;border:1px solid #dce2de;border-radius:8px;background:#fff;cursor:pointer}
.reminder-list{min-height:240px;overflow:auto;padding:12px 14px}.reminder-state{height:220px;display:grid;place-items:center;color:#89938e}.reminder-item{padding:13px 14px;border:1px solid #e7eeea;border-radius:10px}.reminder-item+article{margin-top:10px}.reminder-item>div{display:flex;align-items:center;justify-content:space-between;gap:12px}.reminder-item strong{color:#202a25}.reminder-item small,.reminder-item span{color:#7b8580;font-weight:400}.reminder-item p{margin:10px 0;color:#3f4944;line-height:1.65;white-space:pre-wrap}.reminder-item footer{display:flex;justify-content:space-between;gap:12px;color:#6b756f;font-size:12px}
.reminder-pager{height:54px;display:flex;align-items:center;justify-content:flex-end;gap:12px;padding:0 16px;border-top:1px solid #edf1ef}.reminder-pager span{margin-right:auto;color:#65706a}.reminder-pager button:disabled{opacity:.45;cursor:not-allowed}
@media(max-width:760px){ .dashboard { --sidebar:0px; }.dashboard:not(.collapsed) { --sidebar:230px; }.dashboard.collapsed .sidebar { transform:translateX(-100%); }.workspace { grid-column:2; width:calc(100vw - var(--sidebar)); }.dashboard:not(.collapsed) .workspace::after { content:""; position:fixed; z-index:3; inset:79px 0 0 230px; background:rgba(0,0,0,.15); }.topbar { padding:0 16px; }.page-title { gap:12px; }.page-title h1 { font-size:18px; }.search { display:none; }.top-actions { gap:18px; }.profile-btn strong,.profile-btn>svg { display:none; }.sidebar { width:230px; }.collapsed .side-nav>button span,.collapsed .side-user div { display:block; }.collapsed .side-nav>button { width:calc(100% - 16px); padding:0 22px; justify-content:flex-start; }.collapsed .side-user { padding:15px 25px; } }
</style>
