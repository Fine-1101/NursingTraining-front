<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { batchTags, createTag, deleteTag, getTag, getTagOverview, getTags, updateTag, updateTagStatus } from '@/services/tag'

const tags = ref([])
const recentTags = ref([])
const overview = ref(null)
const loading = ref(true)
const selected = ref(new Set())
const busyIds = ref(new Set())
const message = ref(null)
const query = reactive({ keyword: '', status: '', sortBy: 'updatedAt', sortOrder: 'desc', page: 1, size: 10 })
const pagination = reactive({ total: 0, pages: 1 })
const modal = reactive({ open: false, mode: 'create', loading: false, id: null, name: '', color: '#52C41A', status: 1 })
const confirmBox = reactive({ open: false, title: '', content: '', action: null, loading: false })
const colors = ['#52C41A','#006D46','#FA8C16','#5B8FF9','#F75979','#8B5CF6','#36B89A','#D89A25','#1890FF','#F5222D']

const allSelected = computed(() => tags.value.length > 0 && tags.value.every(tag => selected.value.has(tag.id)))
const topTags = computed(() => overview.value?.topTags || [])
const cloudTags = computed(() => {
  const seen = new Set()
  return [...topTags.value.map(item => ({ id: item.tagId, name: item.tagName, color: item.color, courseCount: item.courseCount })), ...tags.value]
    .filter(item => item.name && !seen.has(item.id) && seen.add(item.id)).slice(0, 10)
})
const pageNumbers = computed(() => {
  const max = pagination.pages
  if (max <= 7) return Array.from({ length: max }, (_, index) => index + 1)
  const values = new Set([1, max, query.page - 1, query.page, query.page + 1])
  return [...values].filter(value => value > 0 && value <= max).sort((a,b) => a-b)
})

function toast(text, type = 'success') {
  message.value = { text, type }
  window.setTimeout(() => { message.value = null }, 2600)
}
async function loadTags() {
  loading.value = true
  try {
    const data = await getTags(query)
    tags.value = data?.records || []
    Object.assign(pagination, { total: data?.total || 0, pages: data?.pages || 1 })
    if (query.page > pagination.pages) { query.page = pagination.pages; return loadTags() }
  } catch (error) { toast(error.message, 'error') }
  finally { loading.value = false }
}
async function loadSideData() {
  try {
    const [summary, recent] = await Promise.all([
      getTagOverview(),
      getTags({ sortBy: 'createdAt', sortOrder: 'desc', page: 1, size: 5 }),
    ])
    overview.value = summary
    recentTags.value = recent?.records || []
  } catch (error) { toast(error.message, 'error') }
}
async function refresh() { selected.value = new Set(); await Promise.all([loadTags(), loadSideData()]) }
function search() { query.page = 1; selected.value = new Set(); loadTags() }
function reset() { query.keyword = ''; query.status = ''; query.page = 1; loadTags() }
function goPage(page) { if (page < 1 || page > pagination.pages || page === query.page) return; query.page = page; selected.value = new Set(); loadTags() }
function changeSize() { query.page = 1; selected.value = new Set(); loadTags() }
function toggleOne(id) { const next = new Set(selected.value); next.has(id) ? next.delete(id) : next.add(id); selected.value = next }
function toggleAll() { selected.value = allSelected.value ? new Set() : new Set(tags.value.map(tag => tag.id)) }
function tint(color, alpha = '1F') { return /^#[0-9a-f]{6}$/i.test(color || '') ? `${color}${alpha}` : '#1890FF1F' }
function number(value) { return Number(value || 0).toLocaleString('zh-CN') }
function formatDate(value, dateOnly = false) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const options = dateOnly ? { year:'numeric', month:'2-digit', day:'2-digit' } : { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false }
  return new Intl.DateTimeFormat('zh-CN', options).format(date).replaceAll('/', '-')
}

function openCreate() { Object.assign(modal, { open:true, mode:'create', loading:false, id:null, name:'', color:'#52C41A', status:1 }) }
async function openEdit(row) {
  Object.assign(modal, { open:true, mode:'edit', loading:true, id:row.id, name:row.name, color:row.color || '#1890FF', status:row.status })
  try { Object.assign(modal, await getTag(row.id), { loading:false }) }
  catch (error) { modal.open = false; toast(error.message, 'error') }
}
async function save() {
  const name = modal.name.trim()
  if (!name) return toast('请输入标签名称', 'error')
  if (name.length > 50) return toast('标签名称不能超过 50 个字符', 'error')
  if (!/^#[0-9A-Fa-f]{6}$/.test(modal.color)) return toast('标签颜色必须是六位十六进制色值', 'error')
  modal.loading = true
  try {
    const payload = { name, color: modal.color.toUpperCase(), status: Number(modal.status) }
    modal.mode === 'create' ? await createTag(payload) : await updateTag(modal.id, payload)
    modal.open = false; toast(modal.mode === 'create' ? '标签已创建' : '标签已更新'); await refresh()
  } catch (error) { toast(error.message, 'error') }
  finally { modal.loading = false }
}
async function changeStatus(row) {
  if (busyIds.value.has(row.id)) return
  const next = new Set(busyIds.value); next.add(row.id); busyIds.value = next
  try { await updateTagStatus(row.id, row.status === 1 ? 0 : 1); toast(row.status === 1 ? '标签已停用' : '标签已启用'); await refresh() }
  catch (error) { toast(error.message, 'error') }
  finally { const done = new Set(busyIds.value); done.delete(row.id); busyIds.value = done }
}
function askConfirm(title, content, action) { Object.assign(confirmBox, { open:true, title, content, action, loading:false }) }
async function runConfirm() { confirmBox.loading = true; try { await confirmBox.action?.(); confirmBox.open = false } catch {} finally { confirmBox.loading = false } }
function removeOne(row) {
  askConfirm('删除标签', `确定删除“${row.name}”吗？已关联课程的标签无法删除。`, async () => {
    try { await deleteTag(row.id); toast('标签已删除'); await refresh() } catch (error) { toast(error.message, 'error'); throw error }
  })
}
function batchDelete() {
  const ids = [...selected.value]
  if (!ids.length) return toast('请先选择标签', 'error')
  askConfirm('批量删除', `确定删除选中的 ${ids.length} 个标签吗？任一标签已关联课程时，整批操作将失败。`, async () => {
    try { const result = await batchTags(ids, 'DELETE'); toast(`已删除 ${result?.affectedCount ?? ids.length} 个标签`); await refresh() } catch (error) { toast(error.message, 'error'); throw error }
  })
}

onMounted(refresh)
</script>

<template>
  <section class="tag-page">
    <div v-if="message" class="toast" :class="message.type">{{ message.text }}</div>
    <div class="layout">
      <main class="main-column">
        <div class="filter-card card">
          <label class="search-box"><input v-model="query.keyword" maxlength="50" placeholder="请输入标签名称" @keyup.enter="search" /><AppIcon name="search" :size="18" /></label>
          <label class="filter"><span>状态</span><select v-model="query.status"><option value="">全部状态</option><option value="1">已启用</option><option value="0">已停用</option></select></label>
          <button class="reset" @click="reset">重置</button><button class="search-button" @click="search">查询</button>
        </div>

        <div class="cloud card"><h3>标签云 <small title="展示当前高使用率及本页标签">ⓘ</small></h3><div class="cloud-list">
          <button v-for="item in cloudTags" :key="item.id" :style="{ color:item.color, background:tint(item.color), borderColor:tint(item.color,'55') }" @click="query.keyword=item.name;search()">{{ item.name }}（{{ number(item.courseCount) }}）</button>
          <button class="new-cloud" @click="openCreate">＋ 新建标签</button><span v-if="!cloudTags.length && !loading" class="empty">暂无标签</span>
        </div></div>

        <div class="table-card card">
          <header><div><button class="create" @click="openCreate">＋ 新建标签</button><button class="batch" :disabled="!selected.size" @click="batchDelete">♲ 批量删除<span v-if="selected.size">（{{ selected.size }}）</span></button></div><button class="refresh" @click="refresh">↻ 刷新</button></header>
          <div class="table-scroll"><table><thead><tr><th><input type="checkbox" :checked="allSelected" @change="toggleAll" /></th><th>标签名称</th><th>关联课程数</th><th>创建时间</th><th>状态</th><th>操作</th></tr></thead>
            <tbody v-if="!loading && tags.length"><tr v-for="row in tags" :key="row.id"><td><input type="checkbox" :checked="selected.has(row.id)" @change="toggleOne(row.id)" /></td><td><span class="tag-chip" :style="{ color:row.color, background:tint(row.color) }">{{ row.name }}</span></td><td>{{ number(row.courseCount) }}</td><td>{{ formatDate(row.createdAt) }}</td><td><div class="status-cell"><button class="switch" :class="{ on:row.status===1, busy:busyIds.has(row.id) }" :disabled="busyIds.has(row.id)" @click="changeStatus(row)"><i></i></button><span>{{ row.status === 1 ? '启用' : '停用' }}</span></div></td><td><div class="actions"><button @click="openEdit(row)">编辑</button><button class="delete" @click="removeOne(row)">删除</button></div></td></tr></tbody>
          </table><div v-if="loading" class="state"><span class="loader"></span>正在加载标签...</div><div v-else-if="!tags.length" class="state">暂无符合条件的标签</div></div>
          <footer><span>共 {{ number(pagination.total) }} 条</span><select v-model="query.size" @change="changeSize"><option :value="10">10条/页</option><option :value="20">20条/页</option><option :value="50">50条/页</option></select><nav><button :disabled="query.page===1" @click="goPage(query.page-1)">‹</button><template v-for="(page,index) in pageNumbers" :key="page"><i v-if="index && page-pageNumbers[index-1]>1">…</i><button :class="{ active:page===query.page }" @click="goPage(page)">{{ page }}</button></template><button :disabled="query.page===pagination.pages" @click="goPage(query.page+1)">›</button></nav><label>前往 <input v-model.number="query.page" type="number" min="1" :max="pagination.pages" @change="loadTags" /> 页</label></footer>
        </div>
      </main>

      <aside class="side-column">
        <div class="total card"><h3>标签总数</h3><strong>{{ number(overview?.totalTags) }}</strong><p>启用 {{ number(overview?.enabledTags) }} · 停用 {{ number(overview?.disabledTags) }}</p><span class="tag-watermark">◇</span></div>
        <div class="ranking card"><h3>高使用率标签 <small>TOP 5</small></h3><p v-if="!topTags.length" class="empty">暂无数据</p><ol><li v-for="item in topTags" :key="item.tagId"><div><b :style="{background:item.color}">{{ item.rank }}</b><span>{{ item.tagName }}</span><em>{{ number(item.courseCount) }}</em></div><i><span :style="{ width:`${Math.max(8,(item.courseCount/(topTags[0]?.courseCount||1))*100)}%`, background:item.color }"></span></i></li></ol></div>
        <div class="recent card"><h3>最近新增</h3><p v-if="!recentTags.length" class="empty">暂无数据</p><ul><li v-for="item in recentTags" :key="item.id"><span class="tag-chip" :style="{ color:item.color, background:tint(item.color) }">{{ item.name }}</span><time>{{ formatDate(item.createdAt,true) }}</time></li></ul></div>
      </aside>
    </div>

    <div v-if="modal.open" class="overlay" @mousedown.self="modal.open=false"><form class="dialog" @submit.prevent="save"><header><h2>{{ modal.mode==='create'?'新建标签':'编辑标签' }}</h2><button type="button" @click="modal.open=false">×</button></header><div class="form-body"><label>标签名称 <em>*</em><input v-model="modal.name" maxlength="50" placeholder="请输入标签名称" autofocus /></label><label>标签颜色 <em>*</em><div class="color-field"><input v-model="modal.color" maxlength="7" /><input v-model="modal.color" type="color" /></div></label><div class="palette"><button v-for="color in colors" :key="color" type="button" :class="{ active:modal.color.toUpperCase()===color }" :style="{background:color}" @click="modal.color=color"></button></div><label>状态<select v-model="modal.status"><option :value="1">启用</option><option :value="0">停用</option></select></label><div class="preview"><span>预览</span><b :style="{color:modal.color,background:tint(modal.color)}">{{ modal.name || '标签示例' }}</b></div></div><footer><button type="button" class="cancel" @click="modal.open=false">取消</button><button class="save" :disabled="modal.loading">{{ modal.loading?'保存中...':'保存' }}</button></footer></form></div>
    <div v-if="confirmBox.open" class="overlay"><div class="dialog confirm"><header><h2>{{ confirmBox.title }}</h2><button @click="confirmBox.open=false">×</button></header><div class="confirm-content"><i>!</i><p>{{ confirmBox.content }}</p></div><footer><button class="cancel" @click="confirmBox.open=false">取消</button><button class="danger" :disabled="confirmBox.loading" @click="runConfirm">{{ confirmBox.loading?'处理中...':'确定' }}</button></footer></div></div>
  </section>
</template>

<style scoped>
.tag-page{min-height:calc(100vh - 79px);padding:20px;background:#f7f9f8;color:#29312d}.layout{display:grid;grid-template-columns:minmax(680px,1fr) 310px;gap:18px}.main-column,.side-column{display:flex;flex-direction:column;gap:16px}.card{background:#fff;border:1px solid #e7ebe8;border-radius:14px;box-shadow:0 4px 14px rgba(17,62,42,.045)}.filter-card{min-height:70px;display:flex;align-items:center;gap:18px;padding:14px 20px}.search-box{width:310px;height:40px;display:flex;align-items:center;padding:0 13px;border:1px solid #dce2de;border-radius:7px}.search-box input{flex:1;min-width:0;border:0;outline:0}.filter{height:40px;display:flex;align-items:center;border:1px solid #dce2de;border-radius:7px;overflow:hidden}.filter span{padding:0 16px;border-right:1px solid #e4e7e5;font-size:13px;font-weight:600}.filter select{width:130px;height:100%;padding:0 12px;border:0;outline:0;background:#fff}.filter-card>button{height:40px;padding:0 22px;border-radius:7px;cursor:pointer}.reset{margin-left:auto;color:#515a55;border:1px solid #dce2de;background:#fff}.search-button,.create{color:#fff;background:linear-gradient(90deg,#087640,#168b4f);box-shadow:0 4px 10px rgba(8,118,64,.18)}.cloud{padding:20px 22px}.cloud h3,.side-column h3{margin:0 0 17px;font-size:16px}.cloud h3 small{color:#7b847f;font-weight:400}.cloud-list{display:flex;flex-wrap:wrap;gap:14px 18px}.cloud-list button{min-width:126px;height:38px;padding:0 19px;border:1px solid transparent;border-radius:8px;font-weight:600;cursor:pointer}.cloud-list .new-cloud{color:#16834e;border:1px dashed #78b796;background:#fff}.table-card{overflow:hidden}.table-card>header{height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 20px}.table-card>header div{display:flex;gap:12px}.table-card>header button{height:38px;padding:0 18px;border-radius:7px;cursor:pointer}.batch{color:#e24848;border:1px solid #f0caca;background:#fff}.batch:disabled{color:#aaa;border-color:#ddd;cursor:not-allowed}.refresh{color:#555e59;border:1px solid #e0e4e1;background:#fff}.table-scroll{overflow:auto}table{width:100%;min-width:760px;border-collapse:collapse;font-size:13px}th{height:46px;background:#fbfcfb;text-align:left}td{height:53px;border-top:1px solid #edf0ee;color:#565e5a}th:first-child,td:first-child{width:55px;padding-left:20px}th:nth-child(2){width:190px}th:nth-child(3){width:130px}th:nth-child(4){width:200px}th:nth-child(5){width:140px}input[type=checkbox]{width:16px;height:16px;accent-color:#16844e}.tag-chip{display:inline-flex;align-items:center;min-height:28px;padding:4px 11px;border-radius:6px;font-weight:600}.status-cell,.actions{display:flex;align-items:center;gap:10px}.switch{width:34px;height:19px;padding:2px;border-radius:11px;background:#c9cecb;cursor:pointer}.switch i{display:block;width:15px;height:15px;border-radius:50%;background:#fff;box-shadow:0 1px 3px #777;transition:.2s}.switch.on{background:#43963e}.switch.on i{transform:translateX(15px)}.switch.busy{opacity:.55}.actions button{color:#16834e;background:none;cursor:pointer}.actions .delete{color:#ef4444}.state{height:220px;display:flex;align-items:center;justify-content:center;gap:10px;color:#8b938f}.loader{width:22px;height:22px;border:2px solid #d9e4dd;border-top-color:#26905a;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.table-card>footer{min-height:60px;display:flex;align-items:center;gap:22px;padding:10px 20px;border-top:1px solid #edf0ee;font-size:13px}.table-card>footer>select{height:35px;padding:0 10px;border:1px solid #dfe3e1;border-radius:6px;background:#fff}.table-card nav{display:flex;align-items:center;gap:7px;margin-left:auto}.table-card nav button{width:35px;height:35px;border:1px solid #e1e5e2;border-radius:6px;background:#fff;cursor:pointer}.table-card nav button.active{color:#fff;background:#087640;border-color:#087640}.table-card nav button:disabled{opacity:.45}.table-card nav i{font-style:normal}.table-card>footer label{display:flex;align-items:center;gap:7px}.table-card>footer label input{width:48px;height:35px;text-align:center;border:1px solid #dfe3e1;border-radius:6px}.side-column .card{padding:20px}.total{position:relative;min-height:172px;overflow:hidden}.total strong{display:block;margin:25px 0 16px;font-size:36px;color:#101512}.total p{margin:0;color:#348754;font-size:12px}.tag-watermark{position:absolute;right:28px;top:55px;color:#dff2ce;font-size:88px;line-height:1;transform:rotate(-12deg)}.side-column h3 small{margin-left:4px;color:#8b928e;font-size:12px;font-weight:400}.ranking ol,.recent ul{margin:0;padding:0;list-style:none}.ranking li{margin:0 0 15px}.ranking li>div{display:flex;align-items:center;gap:10px;font-size:13px}.ranking li b{width:19px;height:19px;display:grid;place-items:center;color:#fff;border-radius:50%;font-size:11px}.ranking li span{flex:1}.ranking li em{font-style:normal;color:#646b67}.ranking li>i{display:block;height:4px;margin:8px 0 0 29px;background:#edf0ee;border-radius:3px;overflow:hidden}.ranking li>i span{display:block;height:100%;border-radius:3px}.recent li{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0}.recent .tag-chip{max-width:155px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.recent time{color:#606863;font-size:12px}.empty{color:#9aa09d;font-size:13px}.toast{position:fixed;z-index:50;top:92px;left:50%;transform:translateX(-50%);padding:11px 20px;color:#fff;background:#238b57;border-radius:8px;box-shadow:0 8px 25px rgba(0,0,0,.15);font-size:14px}.toast.error{background:#ce4e4e}.overlay{position:fixed;z-index:40;inset:0;display:grid;place-items:center;padding:20px;background:rgba(11,31,21,.38);backdrop-filter:blur(2px)}.dialog{width:min(500px,100%);overflow:hidden;background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,35,20,.22)}.dialog>header{height:63px;display:flex;align-items:center;justify-content:space-between;padding:0 23px;border-bottom:1px solid #eaeeeb}.dialog h2{margin:0;font-size:19px}.dialog header button{font-size:25px;color:#727a76;background:none;cursor:pointer}.form-body{padding:24px}.form-body>label{display:flex;flex-direction:column;gap:9px;margin-bottom:18px;font-size:13px;font-weight:600}.form-body em{color:#e34848;font-style:normal}.form-body input,.form-body select{height:42px;padding:0 12px;border:1px solid #dbe0dd;border-radius:7px;outline:none;background:#fff}.color-field{display:flex;gap:10px}.color-field input:first-child{flex:1}.color-field input[type=color]{width:52px;padding:4px}.palette{display:flex;gap:10px;margin:-6px 0 20px}.palette button{width:25px;height:25px;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 1px #ddd;cursor:pointer}.palette button.active{box-shadow:0 0 0 2px #333}.preview{display:flex;align-items:center;gap:15px;color:#777;font-size:13px}.preview b{padding:6px 12px;border-radius:6px}.dialog>footer{height:65px;display:flex;align-items:center;justify-content:flex-end;gap:12px;padding:0 23px;background:#fafbfa}.dialog>footer button{height:38px;padding:0 22px;border-radius:7px;cursor:pointer}.cancel{color:#565e5a;border:1px solid #d7dcda;background:#fff}.save{color:#fff;background:#248b55}.danger{color:#fff;background:#d84b4b}.confirm{width:min(450px,100%)}.confirm-content{display:flex;align-items:flex-start;gap:15px;padding:27px 24px}.confirm-content i{width:30px;height:30px;display:grid;place-items:center;flex:none;color:#fff;background:#ee9c24;border-radius:50%;font-style:normal}.confirm-content p{margin:4px 0 0;line-height:1.7;color:#555d59;font-size:14px}
@media(max-width:1150px){.layout{grid-template-columns:1fr}.side-column{display:grid;grid-template-columns:1fr 1.2fr 1fr}.filter-card{flex-wrap:wrap}.reset{margin-left:0}}
@media(max-width:760px){.tag-page{padding:10px}.filter-card{gap:10px}.search-box{width:100%}.filter{flex:1}.filter select{width:100%}.filter-card>button{flex:1}.side-column{display:block}.side-column .card{margin-bottom:10px}.table-card>footer{flex-wrap:wrap}.table-card nav{order:4;width:100%;margin:0;justify-content:center}.table-card>footer label{margin-left:auto}}
</style>
