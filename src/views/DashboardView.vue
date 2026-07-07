<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import BrandLogo from '@/components/BrandLogo.vue'
import CategoryManagement from '@/components/category/CategoryManagement.vue'
import TagManagement from '@/components/tag/TagManagement.vue'
import ArticleManagement from '@/components/article/ArticleManagement.vue'
import PptManagement from '@/components/ppt/PptManagement.vue'
import { fetchCurrentUser } from '@/services/api'
import { clearSession, getStoredUser, setStoredUser } from '@/services/auth'

const router = useRouter()
const collapsed = ref(false)
const coursesOpen = ref(true)
const libraryOpen = ref(true)
const active = ref('首页面板')
const user = ref(getStoredUser() || {})
const profileOpen = ref(false)

const displayName = computed(() => user.value?.name || user.value?.username || '护理管理员')
const displayEmail = computed(() => user.value?.email || 'admin@nursing.com')
const avatar = computed(() => user.value?.avatar || '')

const mainItems = [
  { label: '首页面板', icon: 'home' },
  { label: '系统设置', icon: 'settings' },
  { label: '培训学习', icon: 'book' },
  { label: '类别管理', icon: 'category' },
  { label: '标签管理', icon: 'tag' },
]

onMounted(async () => {
  try { const response = await fetchCurrentUser(); user.value = response?.data?.user || {}; setStoredUser(user.value) }
  catch { /* request layer handles authentication failures */ }
})

function select(label) { active.value = label }
function logout() { clearSession(); router.replace('/login') }
</script>

<template>
  <main class="dashboard" :class="{ collapsed }">
    <aside class="sidebar">
      <div class="side-brand"><BrandLogo :compact="collapsed" /></div>
      <nav class="side-nav" aria-label="后台菜单">
        <button v-for="item in mainItems" :key="item.label" :class="{ active: active === item.label }" :title="collapsed ? item.label : ''" @click="select(item.label)">
          <AppIcon :name="item.icon" :size="24" /><span>{{ item.label }}</span>
        </button>
        <button :class="{ active: active === '课程管理' }" title="课程管理" @click="coursesOpen = !coursesOpen; select('课程管理')">
          <AppIcon name="course" :size="24" /><span>课程管理</span><AppIcon class="arrow" name="chevron" :class="{ open: coursesOpen }" :size="17" />
        </button>
        <div v-show="coursesOpen && !collapsed" class="sub-menu">
          <button :class="{ activeSub: active === '新建课程' }" @click="select('新建课程')">新建课程</button>
          <button :class="{ activeSub: active === '课程列表' }" @click="select('课程列表')">课程列表</button>
          <button class="library-toggle" @click="libraryOpen = !libraryOpen"><span>课件库</span><AppIcon name="chevron" :class="{ open: libraryOpen }" :size="15" /></button>
          <div v-show="libraryOpen" class="library-list">
            <button @click="select('文章管理')">文章管理</button><button @click="select('视频管理')">视频管理</button><button @click="select('PPT管理')">PPT管理</button>
          </div>
        </div>
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
          <button class="notification" aria-label="通知"><AppIcon name="bell" :size="24" /><i>5</i></button>
          <div class="profile">
            <button class="profile-btn" @click="profileOpen = !profileOpen"><span class="avatar"><img v-if="avatar" :src="avatar" alt="" /><AppIcon v-else name="user" /></span><strong>{{ displayName }}</strong><AppIcon name="chevron" :class="{ open: profileOpen }" :size="15" /></button>
            <button v-if="profileOpen" class="logout" @click="logout"><AppIcon name="logout" :size="18" />退出登录</button>
          </div>
        </div>
      </header>
      <div class="content-area">
        <CategoryManagement v-if="active === '类别管理'" />
        <TagManagement v-else-if="active === '标签管理'" />
        <ArticleManagement v-else-if="active === '文章管理'" />
        <PptManagement v-else-if="active === 'PPT管理'" />
        <div v-else class="empty-module"></div>
      </div>
    </section>
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
@media(max-width:760px){ .dashboard { --sidebar:0px; }.dashboard:not(.collapsed) { --sidebar:230px; }.dashboard.collapsed .sidebar { transform:translateX(-100%); }.workspace { grid-column:2; width:calc(100vw - var(--sidebar)); }.dashboard:not(.collapsed) .workspace::after { content:""; position:fixed; z-index:3; inset:79px 0 0 230px; background:rgba(0,0,0,.15); }.topbar { padding:0 16px; }.page-title { gap:12px; }.page-title h1 { font-size:18px; }.search { display:none; }.top-actions { gap:18px; }.profile-btn strong,.profile-btn>svg { display:none; }.sidebar { width:230px; }.collapsed .side-nav>button span,.collapsed .side-user div { display:block; }.collapsed .side-nav>button { width:calc(100% - 16px); padding:0 22px; justify-content:flex-start; }.collapsed .side-user { padding:15px 25px; } }
</style>
