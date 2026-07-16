<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import {
  convertPpt,
  createPpt,
  deletePpt,
  getPpt,
  getPptDownload,
  getPptOverview,
  getPptPreview,
  getPpts,
  updatePpt,
  updatePptStatus,
  uploadPptFile,
} from '@/services/ppt'

const rows = ref([])
const overview = ref(null)
const loading = ref(false)
const busyIds = ref(new Set())
const openMenu = ref(null)
const message = ref(null)

const query = reactive({ keyword: '', status: '', uploadedFrom: '', uploadedTo: '', sortOrder: 'desc', page: 1, size: 10 })
const pager = reactive({ total: 0, pages: 1 })
const form = reactive({
  open: false,
  mode: 'create',
  loading: false,
  uploading: false,
  id: null,
  title: '',
  description: '',
  originalUrl: null,
  originalName: null,
  fileSize: null,
  allowDownload: false,
  status: 'DRAFT',
})
const preview = reactive({ open: false, loading: false, converting: false, id: null, title: '', fileUrl: '', pageCount: null })
const confirmBox = reactive({ open: false, title: '', content: '', action: null, loading: false })

const metrics = computed(() => [
  { label: 'PPT 总数', value: overview.value?.totalPpts, rate: overview.value?.monthOverMonth?.totalPptsRate, icon: 'P', tone: 'green' },
  { label: '已发布', value: overview.value?.publishedPpts, rate: overview.value?.monthOverMonth?.publishedPptsRate, icon: '✓', tone: 'lime' },
  { label: '草稿', value: overview.value?.draftPpts, rate: overview.value?.monthOverMonth?.draftPptsRate, icon: '…', tone: 'orange' },
  { label: '本月新增', value: overview.value?.monthlyAdded, rate: overview.value?.monthOverMonth?.monthlyAddedRate, icon: '+', tone: 'teal' },
])
const pageNumbers = computed(() => {
  if (pager.pages <= 7) return Array.from({ length: pager.pages }, (_, i) => i + 1)
  return [...new Set([1, pager.pages, query.page - 1, query.page, query.page + 1])].filter((value) => value > 0 && value <= pager.pages).sort((a, b) => a - b)
})

function toast(text, type = 'success') {
  message.value = { text, type }
  window.setTimeout(() => {
    if (message.value?.text === text) message.value = null
  }, 2600)
}

function number(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}

function date(value) {
  if (!value) return '-'
  const dateValue = new Date(value)
  if (Number.isNaN(dateValue.getTime())) return String(value).replace('T', ' ')
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(dateValue).replaceAll('/', '-')
}

function size(row) {
  if (row.fileSizeText) return row.fileSizeText
  const bytes = Number(row.fileSize || 0)
  if (!bytes) return '0 B'
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function statusLabel(status) {
  return { DRAFT: '草稿', PUBLISHED: '已发布', OFFLINE: '已下架' }[status] || status || '-'
}

function resolveAssetUrl(url) {
  if (!url) return ''
  if (/^(https?:)?\/\//.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url
  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'
  return url.startsWith('/') ? `${apiBase}${url}` : `${apiBase}/${url}`
}

function pickPreviewUrl(data = {}) {
  return data.fileUrl || data.previewUrl || data.pdfUrl || data.previewFileUrl || data.convertedUrl || data.onlineUrl || ''
}

function pickPageCount(data = {}) {
  return data.pageCount ?? data.pages ?? data.slideCount ?? null
}

function clearPreviewFile() {
  if (preview.fileUrl?.startsWith('blob:')) URL.revokeObjectURL(preview.fileUrl)
  preview.fileUrl = ''
}

async function loadPreviewFile(id) {
  const { blob } = await getPptPreview(id)
  clearPreviewFile()
  preview.fileUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
}

async function loadList() {
  loading.value = true
  try {
    const data = await getPpts(query)
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

async function loadOverview() {
  try {
    overview.value = await getPptOverview()
  } catch (error) {
    toast(error.message, 'error')
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
  Object.assign(query, { keyword: '', status: '', uploadedFrom: '', uploadedTo: '', sortOrder: 'desc', page: 1 })
  loadList()
}

function goPage(page) {
  if (page < 1 || page > pager.pages || page === query.page) return
  query.page = page
  loadList()
}

function clearForm() {
  Object.assign(form, { loading: false, uploading: false, id: null, title: '', description: '', originalUrl: null, originalName: null, fileSize: null, allowDownload: false, status: 'DRAFT' })
}

function openUpload() {
  clearForm()
  form.mode = 'create'
  form.open = true
}

async function openEdit(row) {
  clearForm()
  form.mode = 'edit'
  form.open = true
  form.loading = true
  form.id = row.id
  openMenu.value = null
  try {
    const detail = await getPpt(row.id)
    Object.assign(form, detail, { description: detail.description || '', allowDownload: Boolean(detail.allowDownload) })
  } catch (error) {
    form.open = false
    toast(error.message, 'error')
  } finally {
    form.loading = false
  }
}

async function chooseFile(file) {
  if (!file) return
  if (!/\.(ppt|pptx)$/i.test(file.name)) return toast('仅支持 PPT、PPTX 文件', 'error')
  if (file.size > 100 * 1024 * 1024) return toast('文件大小不能超过 100 MB', 'error')
  form.uploading = true
  try {
    Object.assign(form, await uploadPptFile(file))
    if (!form.title) form.title = file.name.replace(/\.(ppt|pptx)$/i, '')
    toast('PPT 上传成功，保存后系统会自动生成预览')
  } catch (error) {
    toast(error.message, 'error')
  } finally {
    form.uploading = false
  }
}

async function save(targetStatus = null) {
  if (form.loading) return
  const title = form.title.trim()
  if (!title) return toast('请输入 PPT 标题', 'error')
  if (title.length > 200) return toast('标题不能超过 200 个字符', 'error')
  if (form.description.length > 2000) return toast('简介不能超过 2000 个字符', 'error')
  if (form.mode === 'create' && !form.originalUrl) return toast('请先上传 PPT 文件', 'error')

  form.loading = true
  try {
    if (form.mode === 'create') {
      await createPpt({ title, description: form.description.trim() || null, originalUrl: form.originalUrl, originalName: form.originalName, fileSize: form.fileSize, allowDownload: Boolean(form.allowDownload), status: targetStatus || 'DRAFT' })
    } else {
      await updatePpt(form.id, { title, description: form.description.trim() || null, allowDownload: Boolean(form.allowDownload) })
    }
    form.open = false
    toast(form.mode === 'create' ? (targetStatus === 'PUBLISHED' ? 'PPT 已发布' : 'PPT 已保存为草稿') : 'PPT 已更新')
    await refresh()
  } catch (error) {
    toast(error.message, 'error')
  } finally {
    form.loading = false
  }
}

async function download(row) {
  try {
    const data = await getPptDownload(row.id)
    const link = document.createElement('a')
    link.href = data.downloadUrl
    link.download = data.fileName || row.originalName
    link.rel = 'noopener'
    link.click()
  } catch (error) {
    toast(error.message, 'error')
  }
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitForPreviewUrl(id) {
  await sleep(90000)
  return getPpt(id)
}

async function openPreview(row, options = {}) {
  const { autoConvert = true } = options
  openMenu.value = null
  clearPreviewFile()
  Object.assign(preview, { open: true, loading: true, converting: false, id: row.id, title: row.title, fileUrl: '', pageCount: null })
  try {
    let detail = await getPpt(row.id)
    let fileUrl = pickPreviewUrl(detail)
    Object.assign(preview, { title: detail.title || row.title, pageCount: pickPageCount(detail) })
    if (fileUrl) await loadPreviewFile(row.id)

    if (!fileUrl && autoConvert) {
      preview.converting = true
      await convertPpt(row.id)
      toast('PPT 预览正在生成，请稍候')
      detail = await waitForPreviewUrl(row.id)
      fileUrl = pickPreviewUrl(detail)
      Object.assign(preview, { title: detail?.title || row.title, pageCount: pickPageCount(detail) })
      if (fileUrl) await loadPreviewFile(row.id)
    }

    if (!fileUrl) {
      toast('PPT 预览仍在生成，请稍后点击“刷新预览”', 'error')
    }
  } catch (error) {
    preview.open = false
    toast(error.message, 'error')
  } finally {
    preview.loading = false
    preview.converting = false
  }
}

async function reloadPreview() {
  if (!preview.id || preview.loading) return
  await openPreview({ id: preview.id, title: preview.title }, { autoConvert: false })
}

async function reconvertPreview() {
  if (!preview.id || preview.converting) return
  preview.converting = true
  clearPreviewFile()
  try {
    await convertPpt(preview.id)
    toast('已重新发起转换，请稍候')
    const detail = await waitForPreviewUrl(preview.id)
    const ready = pickPreviewUrl(detail)
    preview.pageCount = pickPageCount(detail)
    if (ready) await loadPreviewFile(preview.id)
    if (ready) toast('PPT 预览已生成')
    else toast('PPT 预览仍在生成，请稍后点击“刷新预览”', 'error')
  } catch (error) {
    toast(error.message, 'error')
  } finally {
    preview.converting = false
  }
}

function statuses(current) {
  return current === 'DRAFT' ? ['PUBLISHED'] : current === 'PUBLISHED' ? ['OFFLINE', 'DRAFT'] : ['PUBLISHED']
}

async function changeStatus(row, status) {
  openMenu.value = null
  const next = new Set(busyIds.value)
  next.add(row.id)
  busyIds.value = next
  try {
    await updatePptStatus(row.id, status)
    toast(`PPT 已${statusLabel(status)}`)
    await refresh()
  } catch (error) {
    toast(error.message, 'error')
  } finally {
    const done = new Set(busyIds.value)
    done.delete(row.id)
    busyIds.value = done
  }
}

function ask(title, content, action) {
  Object.assign(confirmBox, { open: true, title, content, action, loading: false })
  openMenu.value = null
}

async function confirmAction() {
  confirmBox.loading = true
  try {
    await confirmBox.action?.()
    confirmBox.open = false
  } catch {
  } finally {
    confirmBox.loading = false
  }
}

function remove(row) {
  ask('删除 PPT', `确定删除“${row.title}”吗？已关联课程的 PPT 无法删除。`, async () => {
    try {
      await deletePpt(row.id)
      toast('PPT 已删除')
      await refresh()
    } catch (error) {
      toast(error.message, 'error')
      throw error
    }
  })
}

function closePreview() {
  preview.open = false
  clearPreviewFile()
}

onMounted(refresh)
onUnmounted(clearPreviewFile)
</script>

<template>
  <section class="ppt-page" @click.self="openMenu = null">
    <div v-if="message" class="toast" :class="message.type">{{ message.text }}</div>

    <div class="metrics">
      <div v-for="item in metrics" :key="item.label" class="metric card">
        <i :class="item.tone">{{ item.icon }}</i>
        <div>
          <span>{{ item.label }}</span>
          <strong>{{ number(item.value) }}</strong>
          <small v-if="item.rate !== null && item.rate !== undefined" :class="{ down: item.rate < 0 }">
            较上月 {{ item.rate >= 0 ? '↑' : '↓' }} {{ Math.abs(item.rate) }}%
          </small>
        </div>
      </div>
    </div>

    <div class="filters card">
      <label class="keyword">
        <input v-model="query.keyword" maxlength="100" placeholder="搜索 PPT 名称、关键词..." @keyup.enter="search" />
        <AppIcon name="search" :size="18" />
      </label>
      <label>状态<select v-model="query.status"><option value="">全部状态</option><option value="DRAFT">草稿</option><option value="PUBLISHED">已发布</option><option value="OFFLINE">已下架</option></select></label>
      <label class="dates">上传日期<input v-model="query.uploadedFrom" type="date" /><span>至</span><input v-model="query.uploadedTo" type="date" /></label>
      <label>排序<select v-model="query.sortOrder"><option value="desc">从新到旧</option><option value="asc">从旧到新</option></select></label>
      <button class="reset" @click="reset">重置</button>
      <button class="search-btn" @click="search">查询</button>
      <button class="upload-btn" @click="openUpload">上传 PPT</button>
    </div>

    <div class="table-card card">
      <div class="table-scroll">
        <table>
          <thead><tr><th>文件名称</th><th>上传者</th><th>上传时间</th><th>状态</th><th>操作</th></tr></thead>
          <tbody v-if="!loading && rows.length">
            <tr v-for="row in rows" :key="row.id">
              <td><div class="file"><i>P</i><div><strong>{{ row.title }}</strong><small>{{ row.originalName }} · {{ size(row) }}</small></div></div></td>
              <td>{{ row.uploaderName || '未知用户' }}</td>
              <td>{{ date(row.uploadedAt) }}</td>
              <td><span class="status" :class="row.status?.toLowerCase()">{{ statusLabel(row.status) }}</span></td>
              <td>
                <div class="actions">
                  <button title="预览" @click="openPreview(row)">预</button>
                  <button title="下载" @click="download(row)">↓</button>
                  <button title="编辑" @click="openEdit(row)">✎</button>
                  <div class="more">
                    <button title="更多" @click.stop="openMenu = openMenu === row.id ? null : row.id">•••</button>
                    <div v-if="openMenu === row.id" class="menu">
                      <button v-for="status in statuses(row.status)" :key="status" @click="changeStatus(row, status)">{{ statusLabel(status) }}</button>
                      <button class="danger-text" @click="remove(row)">删除</button>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="loading" class="state"><span class="loader"></span>正在加载 PPT...</div>
        <div v-else-if="!rows.length" class="state">暂无符合条件的 PPT</div>
      </div>
      <footer>
        <span>共 {{ number(pager.total) }} 条</span>
        <nav>
          <button :disabled="query.page === 1" @click="goPage(query.page - 1)">‹</button>
          <template v-for="(page, index) in pageNumbers" :key="page">
            <i v-if="index && page - pageNumbers[index - 1] > 1">…</i>
            <button :class="{ active: page === query.page }" @click="goPage(page)">{{ page }}</button>
          </template>
          <button :disabled="query.page === pager.pages" @click="goPage(query.page + 1)">›</button>
        </nav>
        <select v-model="query.size" @change="query.page = 1; loadList()"><option :value="10">10条/页</option><option :value="20">20条/页</option><option :value="50">50条/页</option></select>
      </footer>
    </div>

    <div v-if="preview.open" class="overlay">
      <div class="dialog preview-dialog">
        <header><div><h2>{{ preview.title || 'PPT 预览' }}</h2><small v-if="preview.pageCount">共 {{ preview.pageCount }} 页</small></div><button type="button" @click="closePreview">×</button></header>
        <div class="preview-body">
          <div v-if="preview.loading" class="state"><span class="loader"></span>{{ preview.converting ? '正在生成预览...' : '正在加载预览...' }}</div>
          <iframe v-else-if="preview.fileUrl" class="preview-frame" :src="resolveAssetUrl(preview.fileUrl)" :title="preview.title"></iframe>
          <div v-else class="preview-empty"><strong>PPT 预览正在生成</strong><p>系统正在使用 LibreOffice 生成 PDF 预览，转换完成后会自动显示，也可以稍后点击刷新预览。</p></div>
        </div>
        <footer><button type="button" class="cancel" @click="reloadPreview">刷新预览</button><button type="button" class="draft" :disabled="preview.converting" @click="reconvertPreview">{{ preview.converting ? '转换中...' : '重新转换' }}</button></footer>
      </div>
    </div>

    <div v-if="form.open" class="overlay">
      <form class="dialog" @submit.prevent="save()">
        <header><h2>{{ form.mode === 'create' ? '上传 PPT' : '编辑 PPT' }}</h2><button type="button" @click="form.open = false">×</button></header>
        <div class="form-body">
          <label v-if="form.mode === 'create'" class="drop"><input type="file" accept=".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" @change="chooseFile($event.target.files[0])" /><i>P</i><strong>{{ form.uploading ? '上传中...' : form.originalName || '选择 PPT 或 PPTX 文件' }}</strong><small>文件最大 100 MB</small></label>
          <label>PPT 标题 <em>*</em><input v-model="form.title" maxlength="200" placeholder="请输入标题" /></label>
          <label>简介<textarea v-model="form.description" maxlength="2000" placeholder="请输入简介（选填）"></textarea><small>{{ form.description.length }}/2000</small></label>
          <label class="download"><input v-model="form.allowDownload" type="checkbox" />允许课程端下载</label>
        </div>
        <footer><button type="button" class="cancel" @click="form.open = false">取消</button><button v-if="form.mode === 'create'" type="button" class="draft" :disabled="form.loading || form.uploading" @click="save('DRAFT')">保存草稿</button><button class="save" :disabled="form.loading || form.uploading" @click="form.mode === 'create' && save('PUBLISHED')">{{ form.loading ? '保存中...' : form.mode === 'create' ? '直接发布' : '保存修改' }}</button></footer>
      </form>
    </div>

    <div v-if="confirmBox.open" class="overlay">
      <div class="dialog confirm">
        <header><h2>{{ confirmBox.title }}</h2><button @click="confirmBox.open = false">×</button></header>
        <div class="confirm-content"><i>!</i><p>{{ confirmBox.content }}</p></div>
        <footer><button class="cancel" @click="confirmBox.open = false">取消</button><button class="danger" :disabled="confirmBox.loading" @click="confirmAction">{{ confirmBox.loading ? '处理中...' : '确定' }}</button></footer>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ppt-page{min-height:calc(100vh - 79px);padding:20px;background:#f7f9f8;color:#29312d}.card{background:#fff;border:1px solid #e7ebe8;border-radius:14px;box-shadow:0 4px 14px rgba(17,62,42,.05)}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}.metric{min-height:126px;display:flex;align-items:center;gap:20px;padding:22px}.metric>i{width:58px;height:58px;display:grid;place-items:center;flex:none;color:#fff;border-radius:50%;font-size:26px;font-style:normal;font-weight:800}.metric .green,.metric .teal{background:linear-gradient(135deg,#15965b,#00683d)}.metric .lime{background:linear-gradient(135deg,#9bdc30,#5ab50d)}.metric .orange{background:linear-gradient(135deg,#ffab20,#ff7a00)}.metric span,.metric strong,.metric small{display:block}.metric span{font-size:14px}.metric strong{margin:5px 0;font-size:27px}.metric small{color:#359a58;font-size:12px}.metric small.down{color:#e34a4a}.filters{display:flex;align-items:end;gap:14px;margin:18px 0;padding:20px}.filters>label:not(.keyword){display:flex;flex-direction:column;gap:7px;color:#5e6662;font-size:12px}.filters select,.filters input{height:39px;padding:0 10px;border:1px solid #dce2de;border-radius:7px;background:#fff}.keyword{width:235px;height:39px;display:flex;align-items:center;padding:0 12px;border:1px solid #dce2de;border-radius:7px}.keyword input{flex:1;min-width:0;height:auto;padding:0;border:0;outline:0}.dates{flex-direction:row!important;align-items:center}.dates input{width:135px}.filters button{height:39px;padding:0 16px;border-radius:7px;cursor:pointer}.reset{margin-left:auto;border:1px solid #d8ddda;background:#fff}.search-btn,.upload-btn{color:#fff;background:#087b45}.upload-btn{background:linear-gradient(90deg,#309432,#55a831)}.table-card{overflow:hidden}.table-scroll{overflow:auto}table{width:100%;min-width:1000px;border-collapse:collapse;font-size:13px}th{height:47px;background:#fbfcfb;text-align:left}td{height:78px;border-top:1px solid #e9edeb;color:#555d59}th:first-child,td:first-child{width:350px;padding-left:20px}th:nth-child(2){width:90px}th:nth-child(3){width:140px}th:nth-child(4){width:130px}th:nth-child(5){width:210px}.file{display:flex;align-items:center;gap:13px}.file>i{width:43px;height:50px;display:grid;place-items:center;color:#fff;background:#ef8613;border-radius:7px;font-size:23px;font-style:normal;font-weight:700}.file strong,.file small{display:block}.file strong{max-width:270px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#242a27}.file small{margin-top:6px;color:#818984}.status{display:inline-flex;padding:5px 11px;border-radius:6px;font-size:12px}.status.published{color:#4b9b32;background:#edf7e7}.status.draft{color:#e28720;background:#fff3e6}.status.offline{color:#dc4949;background:#ffeded}.actions{display:flex;gap:8px}.actions>button,.more>button{width:32px;height:32px;border:1px solid #dfe4e1;border-radius:6px;background:#fff;cursor:pointer}.more{position:relative}.menu{position:absolute;z-index:5;right:0;top:36px;width:105px;padding:5px;background:#fff;border:1px solid #e0e4e2;border-radius:8px;box-shadow:0 8px 25px rgba(0,40,20,.14)}.menu button{width:100%;padding:8px 10px;text-align:left;background:none;border-radius:5px;cursor:pointer}.menu button:hover{background:#f1f7f3}.menu .danger-text{color:#dd4242}.state{height:250px;display:flex;align-items:center;justify-content:center;gap:10px;color:#8b938f}.loader{width:22px;height:22px;border:2px solid #d9e4dd;border-top-color:#26905a;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.table-card>footer{height:60px;display:flex;align-items:center;gap:22px;padding:0 20px;border-top:1px solid #edf0ee;font-size:13px}.table-card nav{display:flex;align-items:center;gap:7px;margin-left:auto}.table-card nav button{width:35px;height:35px;border:1px solid #e0e4e2;border-radius:6px;background:#fff;cursor:pointer}.table-card nav button.active{color:#fff;background:#168c3a}.table-card nav button:disabled{opacity:.4}.table-card nav i{font-style:normal}.table-card>footer select{height:35px;border:1px solid #dfe3e1;border-radius:6px}.toast{position:fixed;z-index:60;top:92px;left:50%;transform:translateX(-50%);padding:11px 20px;color:#fff;background:#238b57;border-radius:8px}.toast.error{background:#ce4e4e}.overlay{position:fixed;z-index:40;inset:0;display:grid;place-items:center;padding:20px;background:rgba(11,31,21,.42);backdrop-filter:blur(2px)}.dialog{width:min(540px,96vw);overflow:hidden;background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,35,20,.22)}.dialog>header{min-height:62px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 23px;border-bottom:1px solid #eaeeeb}.dialog h2{margin:0;font-size:19px}.dialog header small{display:block;margin-top:4px;color:#7c8782}.dialog header button{font-size:25px;color:#727a76;background:none;cursor:pointer}.form-body{padding:24px}.form-body>label{display:block;margin-bottom:18px;font-size:13px;font-weight:600}.form-body>label>input:not([type=checkbox]),.form-body textarea{width:100%;margin-top:8px;padding:10px 12px;border:1px solid #dce1de;border-radius:7px;outline:none}.form-body textarea{height:90px;resize:vertical}.form-body label>small{float:right;color:#999;font-weight:400}.form-body em{color:#dc4040;font-style:normal}.drop{position:relative;display:flex!important;flex-direction:column;align-items:center;justify-content:center;height:135px;border:1px dashed #9dbdad;border-radius:9px;color:#288353}.drop input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}.drop i{font-size:30px;font-style:normal}.drop strong{margin:8px 0}.drop small{float:none!important}.download{font-weight:400!important}.dialog>footer{min-height:65px;display:flex;align-items:center;justify-content:flex-end;gap:12px;padding:12px 23px;background:#fafbfa}.dialog>footer button{height:38px;padding:0 22px;border-radius:7px;cursor:pointer}.cancel{border:1px solid #d7dcda;background:#fff}.draft{color:#23784b;border:1px solid #94bca5;background:#fff}.save{color:#fff;background:#248b55}.danger{color:#fff;background:#d84b4b}.confirm-content{display:flex;gap:15px;padding:28px}.confirm-content i{width:30px;height:30px;display:grid;place-items:center;flex:none;color:#fff;background:#ee9c24;border-radius:50%;font-style:normal}.confirm-content p{margin:4px 0;line-height:1.7}.preview-dialog{width:min(1100px,96vw);height:min(760px,92vh);display:flex;flex-direction:column}.preview-body{flex:1;min-height:0;background:#f5f7f6}.preview-frame{width:100%;height:100%;border:0;background:#fff}.preview-empty{height:100%;display:grid;place-content:center;padding:28px;text-align:center;color:#68736d}.preview-empty strong{color:#26312d;font-size:18px}.preview-empty p{margin:10px 0 0;line-height:1.7}
@media(max-width:1200px){.metrics{grid-template-columns:1fr 1fr}.filters{flex-wrap:wrap}.reset{margin-left:0}}
@media(max-width:760px){.ppt-page{padding:10px}.metrics{gap:10px}.metric{min-height:105px;padding:14px}.metric>i{width:44px;height:44px}.keyword{width:100%}.dates{width:100%;flex-wrap:wrap}.filters>label:not(.keyword){flex:1}.upload-btn{margin-left:auto}.table-card>footer{flex-wrap:wrap}.table-card nav{order:3;width:100%;margin:0;justify-content:center}.preview-dialog{height:92vh}}
</style>
