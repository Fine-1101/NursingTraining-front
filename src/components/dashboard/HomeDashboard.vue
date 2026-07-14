<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import { GraphicComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import AppIcon from '@/components/AppIcon.vue'
import { getAdminDashboard, getDashboardCourseLearningTrend, getDashboardCourseOptions } from '@/services/dashboard'

echarts.use([BarChart, LineChart, PieChart, ScatterChart, TooltipComponent, LegendComponent, GridComponent, GraphicComponent, CanvasRenderer])

const emit = defineEmits(['navigate'])

const ranges = [
  { label:'近一周', value:'LAST_1_WEEKS' },
  { label:'近一月', value:'LAST_1_MONTHS' },
  { label:'近六月', value:'LAST_6_MONTHS' },
]

const range = ref('LAST_1_MONTHS')
const selectedCourse = ref('')
const loading = ref(false)
const initializing = ref(true)
const message = ref('')
const dashboard = ref(null)
const courseTrendData = ref(null)
const allCourses = ref([])
const statusChartRef = ref(null)
const overviewChartRef = ref(null)
const courseScatterRef = ref(null)
const deptBarRef = ref(null)
const charts = new Map()

const summary = computed(() => dashboard.value?.summaryCards || {})
const statusData = computed(() => dashboard.value?.learningStatusDistribution || { totalLearners:0, items:[] })
const learningTrend = computed(() => dashboard.value?.learningTrend || { points:[] })
const baseCourseTrend = computed(() => courseTrendData.value || dashboard.value?.courseLearningTrend || { courseTitle:'某门课程的学习人数 vs 完成率', points:[] })
const courseOptions = computed(() => {
  const trend = baseCourseTrend.value || {}
  const candidates = [
    ...allCourses.value,
    ...(Array.isArray(trend.courseOptions) ? trend.courseOptions : []),
    ...(Array.isArray(trend.courses) ? trend.courses : []),
    ...(Array.isArray(dashboard.value?.courseOptions) ? dashboard.value.courseOptions : []),
    ...(Array.isArray(dashboard.value?.courses) ? dashboard.value.courses : []),
  ]
  const normalized = candidates.map((item, index) => {
    const title = item.courseTitle || item.title || item.name || item.label
    const id = item.courseId || item.id || item.value || `course-${index}`
    return title ? { id:String(id), title, points:item.points } : null
  }).filter(Boolean)
  if (normalized.length) return normalized
  const title = trend.courseTitle || '某门课程'
  const id = trend.courseId || ''
  return [{ id:String(id), title, points:trend.points || [] }]
})
const courseTrend = computed(() => {
  const trend = baseCourseTrend.value || {}
  const selected = String(selectedCourse.value || '')
  const option = courseOptions.value.find(item => item.id === selected)
  if (option?.points?.length) return { courseTitle:option.title, points:option.points }
  return {
    ...trend,
    courseTitle:option?.title || trend.courseTitle || '某门课程',
    points:trend.points || [],
  }
})
const departments = computed(() => dashboard.value?.departmentCompletionRanking || [])
const quickEntries = computed(() => dashboard.value?.quickEntries?.length ? dashboard.value.quickEntries : [
  { code:'CREATE_COURSE', title:'新建课程' },
  { code:'CREATE_TAG', title:'新建标签' },
  { code:'CREATE_CATEGORY', title:'新建类别' },
  { code:'USER_MANAGEMENT', title:'学员管理' },
])

function number(value) { return Number(value || 0).toLocaleString('zh-CN') }
function trendGranularity() {
  if (range.value === 'LAST_1_WEEKS' || range.value === 'LAST_6_WEEKS') return 'DAY'
  if (range.value === 'LAST_1_MONTHS' || range.value === 'LAST_12_MONTHS') return 'WEEK'
  return 'MONTH'
}
function trendPointLabel(item) {
  if (item.label) return item.label
  if (item.date) return String(item.date).slice(5)
  if (item.weekLabel) return item.weekLabel
  if (item.weekStart && item.weekEnd) return `${String(item.weekStart).slice(5)}~${String(item.weekEnd).slice(5)}`
  if (item.weekStart) return String(item.weekStart).slice(5)
  if (item.month) return item.month
  if (item.period) return item.period
  return ''
}
function rateText(item) {
  if (!item || item.changeRate === null || item.changeRate === undefined) return ''
  const down = item.changeDirection === 'DOWN' || Number(item.changeRate) < 0
  return `${down ? '↓' : '↑'} ${Math.abs(Number(item.changeRate))}%`
}
function entryIcon(code) {
  return { CREATE_COURSE:'course', CREATE_TAG:'tag', CREATE_CATEGORY:'category', USER_MANAGEMENT:'user' }[code] || 'home'
}
function navigate(entry) {
  const target = {
    CREATE_COURSE:'新建课程',
    CREATE_TAG:'标签管理',
    CREATE_CATEGORY:'类别管理',
    USER_MANAGEMENT:'学员管理',
  }[entry.code]
  emit('navigate', target || entry.title)
}
function syncSelectedCourse() {
  const options = courseOptions.value
  if (!options.length) {
    selectedCourse.value = ''
    return
  }
  if (!options.some(item => item.id === selectedCourse.value)) {
    selectedCourse.value = options[0].id
  }
}

function chartOf(refEl) {
  if (!refEl.value) return null
  if (!charts.has(refEl.value)) charts.set(refEl.value, echarts.init(refEl.value))
  return charts.get(refEl.value)
}
function commonGrid(extra = {}) {
  return { left:44, right:32, top:56, bottom:34, containLabel:true, ...extra }
}
function renderStatusChart() {
  const chart = chartOf(statusChartRef)
  if (!chart) return
  const items = statusData.value.items || []
  chart.setOption({
    color:['#006b43', '#73c72c', '#ff8a18'],
    tooltip:{ trigger:'item', formatter:'{b}<br/>{c} 人 ({d}%)' },
    legend:{ orient:'vertical', right:6, top:'middle', icon:'roundRect', itemWidth:12, itemHeight:12 },
    series:[{
      name:'学习进度分布',
      type:'pie',
      radius:['40%', '64%'],
      center:['35%', '46%'],
      avoidLabelOverlap:false,
      padAngle:4,
      itemStyle:{ borderRadius:8, borderColor:'#fff', borderWidth:4 },
      label:{ formatter:'{d}%', color:'#2f3833', fontSize:12 },
      data:items.map(item => ({ name:item.statusName, value:item.count })),
    }],
    graphic:[{
      type:'text',
      left:'28%',
      top:'36%',
      bounding:'raw',
      style:{ text:`${number(statusData.value.totalLearners)}\n总学员`, textAlign:'center', textVerticalAlign:'middle', fill:'#1d2722', fontSize:20, fontWeight:700, lineHeight:24 },
    }],
  }, true)
}
function renderOverviewChart() {
  const chart = chartOf(overviewChartRef)
  if (!chart) return
  const points = learningTrend.value.points || []
  chart.setOption({
    graphic:[],
    color:['#006b43', '#73c72c'],
    tooltip:{ trigger:'axis' },
    legend:{ top:8, data:['学员人数', '课程完成数'] },
    grid:commonGrid({ top:46 }),
    xAxis:{ type:'category', boundaryGap:false, data:points.map(item => item.label), axisTick:{ show:false } },
    yAxis:{ type:'value', splitLine:{ lineStyle:{ color:'#e8ece9' } } },
    series:[
      { name:'学员人数', type:'line', smooth:true, symbol:'circle', symbolSize:8, data:points.map(item => item.learnerCount), lineStyle:{ width:3 }, areaStyle:{ opacity:.06 } },
      { name:'课程完成数', type:'line', smooth:true, symbol:'circle', symbolSize:8, data:points.map(item => item.completedCourseCount), lineStyle:{ width:3 }, areaStyle:{ opacity:.06 } },
    ],
  }, true)
}
function renderCourseScatter() {
  const chart = chartOf(courseScatterRef)
  if (!chart) return
  const points = courseTrend.value.points || []
  if (!points.length) {
    chart.setOption({
      graphic:[{ type:'text', left:'center', top:'middle', style:{ text:'暂无课程学习趋势数据', fill:'#8b9690', fontSize:14 } }],
      xAxis:[], yAxis:[], series:[],
    }, true)
    return
  }
  chart.setOption({
    graphic:[],
    color:['#006b43', '#ff8a18'],
    tooltip:{
      trigger:'axis',
      axisPointer:{ type:'cross', crossStyle:{ color:'#8b9690' } },
      formatter:items => {
        const title = items?.[0]?.axisValue || ''
        const lines = (items || []).map(item => {
          const suffix = item.seriesName === '完成率' ? '%' : '人'
          const value = item.seriesName === '完成率' ? Number(item.value || 0).toFixed(1) : number(item.value)
          return `${item.marker}${item.seriesName}：${value}${suffix}`
        })
        return [title, ...lines].join('<br/>')
      },
    },
    legend:{ top:8, data:['学习人数', '完成率'] },
    grid:commonGrid({ top:52, right:54, bottom:38 }),
    xAxis:[{
      type:'category',
      data:points.map(trendPointLabel),
      axisTick:{ alignWithLabel:true },
      axisLabel:{ color:'#5f6964', interval:0 },
    }],
    yAxis:[
      {
        type:'value',
        name:'学习人数',
        axisLabel:{ color:'#5f6964' },
        splitLine:{ lineStyle:{ color:'#e8ece9' } },
      },
      {
        type:'value',
        name:'完成率',
        min:0,
        max:100,
        axisLabel:{ formatter:'{value}%', color:'#5f6964' },
        splitLine:{ show:false },
      },
    ],
    series:[
      {
        name:'学习人数',
        type:'bar',
        data:points.map(item => Number(item.learnerCount || 0)),
        barWidth:18,
        itemStyle:{ color:'#006b43', borderRadius:[6,6,0,0] },
        emphasis:{ focus:'series' },
        animationDelay:idx => idx * 45,
      },
      {
        name:'完成率',
        type:'line',
        yAxisIndex:1,
        smooth:true,
        symbol:'circle',
        symbolSize:8,
        data:points.map(item => Number(item.completionRate || 0)),
        lineStyle:{ width:3, color:'#ff8a18' },
        itemStyle:{ color:'#ff8a18' },
        areaStyle:{ color:'rgba(255,138,24,.08)' },
        animationDelay:idx => idx * 45 + 120,
      },
    ],
  }, true)
}
function renderDeptBar() {
  const chart = chartOf(deptBarRef)
  if (!chart) return
  const rows = departments.value || []
  chart.setOption({
    color:['#5470c6', '#91cc75'],
    tooltip:{
      trigger:'axis',
      axisPointer:{ type:'shadow' },
      formatter:items => {
        const name = items?.[0]?.axisValue || ''
        const lines = (items || []).map(item => `${item.marker}${item.seriesName}：${number(item.value)}`)
        return [name, ...lines].join('<br/>')
      },
    },
    legend:{ top:8, right:8, data:['应学人数', '已完成人数'] },
    grid:commonGrid({ top:58, left:64, right:24, bottom:28 }),
    xAxis:{
      type:'value',
      axisLabel:{ color:'#5f6964' },
      splitLine:{ lineStyle:{ color:'#e8ece9' } },
    },
    yAxis:{
      type:'category',
      inverse:true,
      data:rows.map(item => item.departmentName),
      axisTick:{ show:false },
      axisLabel:{ color:'#5f6964' },
    },
    series:[
      {
        name:'应学人数',
        type:'bar',
        data:rows.map(item => Number(item.learnerCount || 0)),
        barWidth:10,
        barGap:'35%',
        itemStyle:{ borderRadius:[0,6,6,0] },
        emphasis:{ focus:'series' },
        animationDelay:idx => idx * 10,
        animationDelayUpdate:idx => idx * 5,
      },
      {
        name:'已完成人数',
        type:'bar',
        data:rows.map(item => Number(item.completedLearnerCount || 0)),
        barWidth:10,
        itemStyle:{ borderRadius:[0,6,6,0] },
        emphasis:{ focus:'series' },
        animationDelay:idx => idx * 10 + 100,
        animationDelayUpdate:idx => idx * 5 + 100,
      },
    ],
    animationEasing:'elasticOut',
    animationEasingUpdate:'elasticOut',
  }, true)
}
function renderCharts() {
  nextTick(() => {
    renderStatusChart()
    renderOverviewChart()
    renderCourseScatter()
    renderDeptBar()
  })
}
async function loadDashboard() {
  loading.value = true
  message.value = ''
  try {
    dashboard.value = await getAdminDashboard({ range:range.value, granularity:trendGranularity(), departmentLimit:10 })
    if (!courseTrendData.value && dashboard.value?.courseLearningTrend) courseTrendData.value = dashboard.value.courseLearningTrend
    syncSelectedCourse()
    renderStatusChart()
    renderOverviewChart()
    renderDeptBar()
  } catch (error) {
    message.value = error.message
  } finally {
    loading.value = false
  }
}
async function loadCourseTrend() {
  if (!selectedCourse.value) {
    courseTrendData.value = null
    renderCourseScatter()
    return
  }
  try {
    courseTrendData.value = await getDashboardCourseLearningTrend({ range:range.value, granularity:trendGranularity(), courseId:selectedCourse.value })
  } catch (error) {
    message.value = error.message
    courseTrendData.value = null
  } finally {
    renderCourseScatter()
  }
}
async function loadCourseOptions() {
  try {
    const data = await getDashboardCourseOptions()
    const records = Array.isArray(data)
      ? data
      : (Array.isArray(data?.records)
        ? data.records
        : (data && typeof data === 'object'
          ? Object.entries(data).map(([id, title]) => ({ id, title }))
          : []))
    allCourses.value = records
      .map(item => ({ id:item.id || item.courseId, title:item.title || item.courseTitle || item.name }))
      .filter(item => item.id && item.title)
    syncSelectedCourse()
  } catch (error) {
    message.value = error.message
  }
}
function resizeCharts() { charts.forEach(chart => chart.resize()) }

watch(range, async () => {
  await loadDashboard()
  await loadCourseTrend()
})
watch(courseOptions, () => {
  syncSelectedCourse()
  renderCourseScatter()
})
watch(selectedCourse, (value, oldValue) => {
  if (value === oldValue) return
  if (initializing.value) {
    renderCourseScatter()
    return
  }
  loadCourseTrend()
})
onMounted(async () => {
  await loadCourseOptions()
  await loadDashboard()
  await loadCourseTrend()
  initializing.value = false
  window.addEventListener('resize', resizeCharts)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCharts)
  charts.forEach(chart => chart.dispose())
  charts.clear()
})
</script>

<template>
  <section class="home-dashboard">
    <div class="dashboard-shell">
      <div v-if="message" class="error">{{ message }}</div>
      <div class="summary-band panel">
        <article>
          <span class="summary-icon"><AppIcon name="course" :size="32" /></span>
          <div><small>课程总数</small><strong>{{ number(summary.courseTotal?.value) }}</strong></div>
        </article>
        <article>
          <span class="summary-icon"><AppIcon name="user" :size="32" /></span>
          <div><small>学员总数</small><strong>{{ number(summary.learnerTotal?.value) }}</strong></div>
        </article>
        <label class="range-select">统计范围
          <select v-model="range" :disabled="loading">
            <option v-for="item in ranges" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </label>
      </div>

      <section class="status-panel panel">
      <header>
        
          <h3>学习进度分布</h3></header>
          <div ref="statusChartRef" class="chart"></div>
        
      </section>

      <section class="trend-panel panel">
        <header>
          <div><h2>学习数据趋势</h2><p>{{ courseTrend.courseTitle }}</p></div>
          <label class="course-select">课程
            <select v-model="selectedCourse">
              <option v-for="item in courseOptions" :key="item.id" :value="item.id">{{ item.title }}</option>
            </select>
          </label>
        </header>
        <div ref="courseScatterRef" class="chart large"></div>
      </section>

      <section class="dept-panel panel">
        <header><div><h2>各科室学习人数 vs 已完成人数</h2><p>各科室应学人数与已完成人数对比</p></div></header>
        <div ref="deptBarRef" class="chart tall"></div>
      </section>

      <section class="overview-panel panel">
        <header><h2>学习数据概览</h2></header>
        <div ref="overviewChartRef" class="chart"></div>
      </section>

      <section class="quick-panel panel">
      
        <div class="quick-grid">
          <button v-for="entry in quickEntries" :key="entry.code" @click="navigate(entry)">
            <AppIcon :name="entryIcon(entry.code)" :size="30" />
            <span>{{ entry.title }}</span>
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.home-dashboard{min-height:calc(100vh - 79px);padding:20px;background:#f7f9f8;color:#17231d}.dashboard-shell{position:relative;display:grid;grid-template-columns:1fr 1.05fr 390px;grid-template-rows:128px 370px 288px 126px;gap:16px;max-width:1500px;margin:0 auto}.panel{background:#fff;border:1px solid #e6ebe8;border-radius:12px;box-shadow:0 4px 14px rgba(17,62,42,.045)}.summary-band{grid-column:1 / 3;display:grid;grid-template-columns:1fr 1fr auto;align-items:center;padding:22px 30px}.summary-band article{display:flex;align-items:center;gap:22px;min-width:0}.summary-band article+article{padding-left:35px;border-left:1px solid #e6ebe8}.summary-icon{width:66px;height:66px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#109456,#00653f);border-radius:50%}.summary-band small,.summary-band strong,.summary-band em{display:block}.summary-band small{color:#343f39;font-size:15px}.summary-band strong{margin:8px 0 6px;font-size:30px}.summary-band em{color:#10834e;font-style:normal}.summary-band em.down{color:#d84d4d}.range-select{display:flex;align-items:center;gap:10px;color:#6d7772;font-size:13px}.panel select{height:34px;padding:0 12px;border:1px solid #dbe2df;border-radius:18px;background:#fff;outline:none}.status-panel{grid-column:1;grid-row:2 / 4;padding:18px 18px}.status-panel>h2,.quick-panel h2{margin:0 0 14px;font-size:19px}.chart-card{height:calc(100% - 34px);padding:16px;border:1px solid #edf1ef;border-radius:10px}.chart-card header,.trend-panel header,.dept-panel header,.overview-panel header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.chart-card h3,.trend-panel h2,.dept-panel h2,.overview-panel h2{margin:0;font-size:17px}.trend-panel p,.dept-panel p{margin:8px 0 0;color:#5c6761}.trend-panel{grid-column:2;grid-row:2;padding:22px}.dept-panel{grid-column:3;grid-row:1 / 4;padding:22px}.overview-panel{grid-column:1;grid-row:4;padding:18px}.quick-panel{grid-column:2 / 4;grid-row:4;padding:18px 22px}.chart{width:100%;height:calc(100% - 36px);min-height:220px}.chart.large{height:285px}.chart.tall{height:590px}.quick-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.quick-grid button{height:68px;display:flex;align-items:center;justify-content:center;gap:16px;color:#213128;background:#fff;border:1px solid #e4ebe7;border-radius:10px;cursor:pointer;font-weight:700}.quick-grid button:hover{color:#0b7a48;border-color:#b9ddc7;background:#f5fbf7}.quick-grid svg{color:#45a829}.error{position:absolute;z-index:5;left:50%;top:10px;transform:translateX(-50%);padding:10px 18px;color:#fff;background:#c94f4f;border-radius:8px}
@media(max-width:1350px){.dashboard-shell{grid-template-columns:1fr 1fr;grid-template-rows:auto}.summary-band,.status-panel,.trend-panel,.dept-panel,.overview-panel,.quick-panel{grid-column:auto;grid-row:auto}.summary-band{grid-column:1 / -1}.dept-panel{grid-column:1 / -1}.chart.tall{height:360px}.quick-panel{grid-column:1 / -1}}@media(max-width:760px){.home-dashboard{padding:10px}.dashboard-shell{display:flex;flex-direction:column}.summary-band{grid-template-columns:1fr;gap:18px}.summary-band article+article{padding-left:0;border-left:0}.quick-grid{grid-template-columns:1fr 1fr}.chart,.chart.large,.chart.tall{height:280px}}
.dashboard-shell{grid-template-rows:96px 260px 260px 96px}
.summary-band{padding:16px 28px}
.summary-icon{width:58px;height:58px}
.summary-band strong{margin:5px 0 0;font-size:28px}
.status-panel{grid-row:2;padding:16px}
.overview-panel{grid-column:1;grid-row:3 / 5;padding:16px}
.trend-panel{grid-column:2;grid-row:2 / 4;padding:18px 20px}
.dept-panel{grid-column:3;grid-row:1 / 4;padding:18px 20px}
.quick-panel{grid-column:2 / 4;grid-row:4;padding:15px 20px}
.chart-card{height:calc(100% - 31px);padding:14px}
.chart-card header,.trend-panel header,.dept-panel header,.overview-panel header{min-height:34px}
.chart{min-height:0;height:calc(100% - 34px)}
.chart.large{height:calc(100% - 62px)}
.chart.tall{height:calc(100% - 60px)}
.course-select{display:flex;align-items:center;gap:8px;color:#67716d;font-size:13px;white-space:nowrap}
.course-select select{max-width:180px}
.quick-grid button{height:58px}
@media(max-width:1350px){.dashboard-shell{grid-template-rows:auto}.status-panel,.overview-panel,.trend-panel,.dept-panel,.quick-panel{grid-column:auto;grid-row:auto}.trend-panel,.dept-panel{grid-column:1 / -1}.chart.large,.chart.tall{height:330px}}
@media(max-width:760px){.chart,.chart.large,.chart.tall{height:260px}.course-select select{max-width:150px}.quick-grid button{height:60px}}
</style>
