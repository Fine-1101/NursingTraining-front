<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import {
  createCategory, deleteCategories, deleteCategory, getCategory, getCategoryOverview,
  getCategoryTree, updateCategory, updateCategoryStatus,
} from '@/services/category'

const roots = ref([])
const total = ref(0)
const overview = ref(null)
const loading = ref(true)
const overviewLoading = ref(true)
const busyIds = ref(new Set())
const selected = ref(new Set())
const expanded = ref(new Set())
const message = ref(null)
const filters = reactive({ keyword: '', status: '', parentId: '0' })
const modal = reactive({ open: false, mode: 'create', loading: false, id: null, name: '', parentId: 0, icon: 'folder', status: 1 })
const confirmBox = reactive({ open: false, title: '', content: '', action: null, danger: true, loading: false })

function flatten(nodes, depth = 0, result = [], force = false) {
  nodes.forEach(node => {
    result.push({ ...node, depth })
    if (node.children?.length && (force || expanded.value.has(node.id))) flatten(node.children, depth + 1, result, force)
  })
  return result
}
const allNodes = computed(() => flatten(roots.value, 0, [], true))
const visibleRows = computed(() => flatten(roots.value))
const allVisibleSelected = computed(() => visibleRows.value.length > 0 && visibleRows.value.every(row => selected.value.has(row.id)))
const parentOptions = computed(() => allNodes.value.filter(node => node.level < 3 && node.id !== modal.id && !isDescendant(node.id, modal.id)))
const summary = computed(() => overview.value?.summary || {})

function isDescendant(candidateId, parentId) {
  if (!parentId) return false
  let current = allNodes.value.find(node => node.id === candidateId)
  while (current?.parentId) {
    if (current.parentId === parentId) return true
    current = allNodes.value.find(node => node.id === current.parentId)
  }
  return false
}

function toast(text, type = 'success') {
  message.value = { text, type }
  window.setTimeout(() => { message.value = null }, 2600)
}

async function loadTree() {
  loading.value = true
  try {
    const data = await getCategoryTree({ keyword: filters.keyword.trim(), status: filters.status, parentId: filters.parentId })
    roots.value = data?.categories || []
    total.value = data?.total || 0
    if (filters.keyword || filters.status !== '') expanded.value = new Set(allNodes.value.map(item => item.id))
  } catch (error) { toast(error.message, 'error') }
  finally { loading.value = false }
}

async function loadOverview() {
  overviewLoading.value = true
  try { overview.value = await getCategoryOverview() }
  catch (error) { toast(error.message, 'error') }
  finally { overviewLoading.value = false }
}

async function refresh() { selected.value = new Set(); await Promise.all([loadTree(), loadOverview()]) }
function applyFilters() { selected.value = new Set(); loadTree() }
function resetFilters() { filters.keyword = ''; filters.status = ''; filters.parentId = '0'; applyFilters() }
function toggleExpand(id) { const next = new Set(expanded.value); next.has(id) ? next.delete(id) : next.add(id); expanded.value = next }
function toggleOne(id) { const next = new Set(selected.value); next.has(id) ? next.delete(id) : next.add(id); selected.value = next }
function toggleAll() { selected.value = allVisibleSelected.value ? new Set() : new Set(visibleRows.value.map(row => row.id)) }

function openCreate() {
  Object.assign(modal, { open: true, mode: 'create', loading: false, id: null, name: '', parentId: 0, icon: 'folder', status: 1 })
}
async function openEdit(row) {
  Object.assign(modal, { open: true, mode: 'edit', loading: true, id: row.id, name: row.name, parentId: row.parentId, icon: row.icon || 'folder', status: row.status })
  try { const detail = await getCategory(row.id); Object.assign(modal, { ...detail, loading: false }) }
  catch (error) { modal.open = false; toast(error.message, 'error') }
}
async function saveCategory() {
  const name = modal.name.trim()
  if (!name) { toast('请输入类别名称', 'error'); return }
  if (name.length > 100) { toast('类别名称不能超过 100 个字符', 'error'); return }
  modal.loading = true
  const payload = { name, parentId: Number(modal.parentId), icon: modal.icon || null, status: Number(modal.status) }
  try {
    if (modal.mode === 'edit') await updateCategory(modal.id, { ...payload, cascade: true })
    else await createCategory(payload)
    modal.open = false
    toast(modal.mode === 'edit' ? '类别已更新' : '类别已创建')
    await refresh()
  } catch (error) { toast(error.message, 'error') }
  finally { modal.loading = false }
}

async function changeStatus(row) {
  if (busyIds.value.has(row.id)) return
  const target = row.status === 1 ? 0 : 1
  if (target === 0 && row.hasChildren) {
    askConfirm('停用类别', `停用“${row.name}”将同时停用其全部后代类别，确定继续吗？`, () => performStatus(row, target))
  } else await performStatus(row, target)
}
async function performStatus(row, target) {
  const next = new Set(busyIds.value); next.add(row.id); busyIds.value = next
  try { await updateCategoryStatus(row.id, target); toast(target ? '类别已启用' : '类别已停用'); await refresh() }
  catch (error) { toast(error.message, 'error') }
  finally { const done = new Set(busyIds.value); done.delete(row.id); busyIds.value = done }
}

function askConfirm(title, content, action) { Object.assign(confirmBox, { open: true, title, content, action, danger: true, loading: false }) }
async function runConfirm() {
  confirmBox.loading = true
  try { await confirmBox.action?.(); confirmBox.open = false }
  catch { /* action already reports the API error and keeps the dialog open */ }
  finally { confirmBox.loading = false }
}
function removeOne(row) {
  askConfirm('删除类别', `确定删除“${row.name}”吗？存在子类别或已关联课程时，后端将拒绝删除。`, async () => {
    try { await deleteCategory(row.id); toast('类别已删除'); await refresh() }
    catch (error) { toast(error.message, 'error'); throw error }
  })
}
function removeBatch() {
  const ids = [...selected.value]
  if (!ids.length) { toast('请先选择需要删除的类别', 'error'); return }
  askConfirm('批量删除', `确定删除选中的 ${ids.length} 个类别吗？该操作按整批事务执行，任一类别不满足条件时将全部回滚。`, async () => {
    try { const result = await deleteCategories(ids); toast(`已删除 ${result?.deletedCount ?? ids.length} 个类别`); await refresh() }
    catch (error) { toast(error.message, 'error'); throw error }
  })
}
function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false }).format(date).replaceAll('/', '-')
}
function number(value) { return Number(value || 0).toLocaleString('zh-CN') }

onMounted(refresh)
</script>

<template>
  <section class="category-page">
    <div v-if="message" class="toast" :class="message.type">{{ message.text }}</div>
    <div class="toolbar card">
      <label class="keyword"><input v-model="filters.keyword" maxlength="100" placeholder="搜索类别名称..." @keyup.enter="applyFilters" /><AppIcon name="search" :size="18" /></label>
      <label class="filter"><span>状态</span><select v-model="filters.status" @change="applyFilters"><option value="">全部状态</option><option value="1">已启用</option><option value="0">已停用</option></select></label>
      <label class="filter parent"><span>上级类别</span><select v-model="filters.parentId" @change="applyFilters"><option value="0">全部</option><option v-for="item in allNodes" :key="item.id" :value="item.id">{{ '　'.repeat(item.level - 1) }}{{ item.name }}</option></select></label>
      <button v-if="filters.keyword || filters.status !== '' || filters.parentId !== '0'" class="text-button" @click="resetFilters">重置</button>
      <div class="toolbar-actions"><button class="batch" :disabled="!selected.size" @click="removeBatch">批量删除<span v-if="selected.size"> ({{ selected.size }})</span></button><button class="create" @click="openCreate">＋ 新建类别</button></div>
    </div>

    <div class="main-grid">
      <div class="table-card card">
        <div class="table-scroll">
          <table>
            <thead><tr><th class="check-col"><input type="checkbox" :checked="allVisibleSelected" @change="toggleAll" /></th><th>类别名称</th><th>上级类别</th><th>课程数量</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead>
            <tbody v-if="!loading && visibleRows.length">
              <tr v-for="row in visibleRows" :key="row.id">
                <td><input type="checkbox" :checked="selected.has(row.id)" @change="toggleOne(row.id)" /></td>
                <td><div class="category-name" :style="{ paddingLeft: `${row.depth * 25}px` }"><button v-if="row.hasChildren" class="expand" :class="{ open: expanded.has(row.id) }" @click="toggleExpand(row.id)">›</button><span v-else class="expand-spacer"></span><span class="folder">▰</span><strong>{{ row.name }}</strong></div></td>
                <td>{{ row.parentName || '—' }}</td><td>{{ number(row.courseCount) }}</td>
                <td><button class="switch" :class="{ on: row.status === 1, busy: busyIds.has(row.id) }" :disabled="busyIds.has(row.id)" :aria-label="row.status === 1 ? '停用类别' : '启用类别'" @click="changeStatus(row)"><i></i></button></td>
                <td>{{ formatDate(row.updatedAt) }}</td><td><div class="row-actions"><button title="编辑" @click="openEdit(row)">✎</button><button class="delete" title="删除" @click="removeOne(row)">♲</button></div></td>
              </tr>
            </tbody>
          </table>
          <div v-if="loading" class="state"><span class="loader"></span>正在加载类别...</div>
          <div v-else-if="!visibleRows.length" class="state">暂无符合条件的类别</div>
        </div>
        <footer><span>共 <b>{{ total }}</b> 个类别</span><button @click="refresh">↻ 刷新</button></footer>
      </div>

      <aside class="overview">
        <div class="card summary-card"><h3>类别概览</h3><div v-if="overviewLoading" class="mini-loading">加载中...</div><div v-else class="summary-grid">
          <div><i class="green">▣</i><span>类别总数<strong>{{ number(summary.totalCategories) }}</strong></span></div><div><i class="teal">✓</i><span>已启用<strong>{{ number(summary.enabledCategories) }}</strong></span></div><div><i class="orange">●</i><span>停用<strong>{{ number(summary.disabledCategories) }}</strong></span></div><div><i class="lime">▥</i><span>课程总数<strong>{{ number(summary.totalCourses) }}</strong></span></div>
        </div></div>
        <div class="card ranking"><h3>热门类别 TOP5</h3><p v-if="!overview?.topCategories?.length" class="empty">暂无数据</p><ol><li v-for="item in overview?.topCategories" :key="item.categoryId"><b>{{ item.rank }}</b><span>{{ item.categoryName }}</span><em>{{ number(item.courseCount) }}门课程</em></li></ol></div>
        <div class="card recent"><h3>最近更新</h3><p v-if="!overview?.recentUpdates?.length" class="empty">暂无数据</p><ul><li v-for="item in overview?.recentUpdates" :key="item.categoryId"><span>{{ item.categoryPath }}</span><time>{{ formatDate(item.updatedAt) }}</time></li></ul></div>
      </aside>
    </div>

    <div v-if="modal.open" class="overlay" @mousedown.self="modal.open = false"><form class="dialog" @submit.prevent="saveCategory"><header><h2>{{ modal.mode === 'create' ? '新建类别' : '编辑类别' }}</h2><button type="button" @click="modal.open = false">×</button></header><div class="form-body">
      <label>类别名称 <em>*</em><input v-model="modal.name" maxlength="100" placeholder="请输入类别名称" autofocus /></label>
      <label>上级类别<select v-model="modal.parentId"><option :value="0">顶级类别</option><option v-for="item in parentOptions" :key="item.id" :value="item.id">{{ '　'.repeat(item.level - 1) }}{{ item.name }}</option></select></label>
      <label>图标标识<input v-model="modal.icon" maxlength="200" placeholder="例如：folder" /></label>
      <label>状态<select v-model="modal.status"><option :value="1">启用</option><option :value="0">停用</option></select></label>
    </div><footer><button type="button" class="cancel" @click="modal.open = false">取消</button><button class="save" :disabled="modal.loading">{{ modal.loading ? '保存中...' : '保存' }}</button></footer></form></div>
    <div v-if="confirmBox.open" class="overlay"><div class="dialog confirm"><header><h2>{{ confirmBox.title }}</h2><button @click="confirmBox.open = false">×</button></header><div class="confirm-content"><i>!</i><p>{{ confirmBox.content }}</p></div><footer><button class="cancel" @click="confirmBox.open = false">取消</button><button class="danger" :disabled="confirmBox.loading" @click="runConfirm">{{ confirmBox.loading ? '处理中...' : '确定' }}</button></footer></div></div>
  </section>
</template>

<style scoped>
.category-page{min-height:calc(100vh - 79px);padding:22px;background:#f7f9f8;color:#29312d}.card{background:#fff;border:1px solid #e7ebe8;border-radius:14px;box-shadow:0 4px 14px rgba(17,62,42,.045)}.toolbar{min-height:78px;display:flex;align-items:center;gap:20px;padding:15px 20px}.keyword{width:245px;height:40px;display:flex;align-items:center;padding:0 13px;border:1px solid #dce2de;border-radius:8px}.keyword input{flex:1;min-width:0;border:0;outline:0}.filter{display:flex;align-items:center;gap:12px;white-space:nowrap;font-size:14px}.filter select{width:150px;height:40px;padding:0 12px;border:1px solid #dce2de;border-radius:8px;background:#fff;color:#343b37}.filter.parent select{width:160px}.text-button{color:#168653;background:none;cursor:pointer}.toolbar-actions{margin-left:auto;display:flex;gap:16px}.batch,.create{height:40px;padding:0 20px;border-radius:8px;font-weight:600;cursor:pointer}.batch{color:#c43e3e;border:1px solid #e0a2a2;background:#fff}.batch:disabled{color:#aaa;border-color:#ddd;cursor:not-allowed}.create{color:#fff;background:linear-gradient(90deg,#328d34,#54a431);box-shadow:0 5px 12px rgba(52,143,50,.2)}.main-grid{display:grid;grid-template-columns:minmax(650px,1fr) 320px;gap:16px;margin-top:14px}.table-card{min-width:0;overflow:hidden}.table-scroll{overflow:auto}table{width:100%;min-width:870px;border-collapse:collapse;font-size:13px}th{height:51px;color:#303733;background:#fbfcfb;font-weight:600;text-align:left}td{height:51px;border-top:1px solid #edf0ee;color:#515954}th:first-child,td:first-child{padding-left:20px;width:50px}th:nth-child(2){width:260px}th:nth-child(3){width:150px}th:nth-child(4){width:100px}th:nth-child(5){width:90px}th:nth-child(6){width:165px}input[type=checkbox]{width:17px;height:17px;accent-color:#3c963c}.category-name{height:100%;display:flex;align-items:center;gap:9px;position:relative}.category-name strong{font-weight:500;color:#242a27}.expand{width:18px;padding:0;background:none;font-size:22px;color:#68716c;transform:rotate(0);cursor:pointer;transition:.15s}.expand.open{transform:rotate(90deg)}.expand-spacer{width:18px}.folder{color:#ffae16;font-size:19px;transform:scaleY(.75)}.switch{width:34px;height:19px;padding:2px;border-radius:11px;background:#c9cecb;cursor:pointer;transition:.2s}.switch i{display:block;width:15px;height:15px;border-radius:50%;background:#fff;box-shadow:0 1px 3px #777;transition:.2s}.switch.on{background:#43963e}.switch.on i{transform:translateX(15px)}.switch.busy{opacity:.55}.row-actions{display:flex;gap:14px}.row-actions button{font-size:18px;color:#58615d;background:none;cursor:pointer}.row-actions .delete{color:#ff5151;transform:rotate(45deg)}.state{height:250px;display:flex;align-items:center;justify-content:center;gap:10px;color:#8b938f}.loader{width:22px;height:22px;border:2px solid #d9e4dd;border-top-color:#26905a;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.table-card>footer{height:58px;display:flex;align-items:center;justify-content:flex-end;gap:26px;padding:0 22px;border-top:1px solid #edf0ee;font-size:13px}.table-card>footer button{color:#288b57;background:none;cursor:pointer}.overview{display:flex;flex-direction:column;gap:14px}.overview .card{padding:17px}.overview h3{margin:0 0 16px;font-size:15px}.summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.summary-grid>div{min-height:86px;display:flex;align-items:center;gap:10px;padding:12px;border:1px solid #e5e9e6;border-radius:10px}.summary-grid i{width:32px;height:32px;display:grid;place-items:center;color:#fff;border-radius:50%;font-style:normal}.summary-grid .green{background:#61af31}.summary-grid .teal{background:#23945f}.summary-grid .orange{background:#fb8b0b}.summary-grid .lime{background:#70b641}.summary-grid span{font-size:12px;color:#626a66}.summary-grid strong{display:block;margin-top:5px;color:#151a17;font-size:20px}.mini-loading,.empty{padding:20px 0;text-align:center;color:#999;font-size:13px}.ranking ol,.recent ul{margin:0;padding:0;list-style:none}.ranking li{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #edf0ee;font-size:12px}.ranking li:last-child,.recent li:last-child{border:0}.ranking li b{width:20px;height:20px;display:grid;place-items:center;color:#fff;background:#f2a718;border-radius:4px}.ranking li:nth-child(2) b{background:#f59a33}.ranking li:nth-child(n+4) b{color:#666;background:#eef0ef}.ranking li span{flex:1}.ranking li em{color:#6d746f;font-style:normal}.recent li{display:flex;justify-content:space-between;gap:10px;padding:11px 0;border-bottom:1px solid #edf0ee;font-size:12px}.recent li span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.recent time{flex:0 0 auto;color:#7c837f}.toast{position:fixed;z-index:50;top:92px;left:50%;transform:translateX(-50%);padding:11px 20px;color:#fff;background:#238b57;border-radius:8px;box-shadow:0 8px 25px rgba(0,0,0,.15);font-size:14px}.toast.error{background:#ce4e4e}.overlay{position:fixed;z-index:40;inset:0;display:grid;place-items:center;padding:20px;background:rgba(11,31,21,.38);backdrop-filter:blur(2px)}.dialog{width:min(500px,100%);overflow:hidden;background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,35,20,.22)}.dialog>header{height:63px;display:flex;align-items:center;justify-content:space-between;padding:0 23px;border-bottom:1px solid #eaeeeb}.dialog h2{margin:0;font-size:19px}.dialog header button{font-size:25px;color:#727a76;background:none;cursor:pointer}.form-body{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:24px}.form-body label{display:flex;flex-direction:column;gap:9px;font-size:13px;font-weight:600}.form-body label:first-child{grid-column:1/-1}.form-body em{color:#e34848;font-style:normal}.form-body input,.form-body select{height:42px;padding:0 12px;border:1px solid #dbe0dd;border-radius:7px;outline:none;background:#fff}.form-body input:focus,.form-body select:focus{border-color:#30935f;box-shadow:0 0 0 3px rgba(48,147,95,.1)}.dialog>footer{height:65px;display:flex;align-items:center;justify-content:flex-end;gap:12px;padding:0 23px;background:#fafbfa}.dialog>footer button{height:38px;padding:0 22px;border-radius:7px;cursor:pointer}.cancel{color:#565e5a;border:1px solid #d7dcda;background:#fff}.save{color:#fff;background:#248b55}.danger{color:#fff;background:#d84b4b}.confirm{width:min(450px,100%)}.confirm-content{display:flex;align-items:flex-start;gap:15px;padding:27px 24px}.confirm-content i{flex:0 0 auto;width:30px;height:30px;display:grid;place-items:center;color:#fff;background:#ee9c24;border-radius:50%;font-style:normal;font-weight:700}.confirm-content p{margin:4px 0 0;line-height:1.7;color:#555d59;font-size:14px}
@media(max-width:1200px){.category-page{padding:15px}.toolbar{flex-wrap:wrap}.toolbar-actions{margin-left:0}.main-grid{grid-template-columns:1fr}.overview{display:grid;grid-template-columns:1.2fr 1fr 1fr}.summary-grid{grid-template-columns:1fr 1fr}}
@media(max-width:760px){.category-page{padding:10px}.toolbar{align-items:stretch;gap:12px}.keyword{width:100%}.filter{flex:1}.filter select,.filter.parent select{width:100%}.toolbar-actions{width:100%}.toolbar-actions button{flex:1}.overview{display:block}.overview .card{margin-bottom:10px}.form-body{grid-template-columns:1fr}.form-body label:first-child{grid-column:auto}}
</style>
