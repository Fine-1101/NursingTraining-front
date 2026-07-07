<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import BrandLogo from '@/components/BrandLogo.vue'
import { login } from '@/services/api'
import { forgetUsername, getRememberedUsername, rememberUsername, setStoredUser, setToken } from '@/services/auth'

const router = useRouter()
const route = useRoute()
const username = ref('')
const password = ref('')
const remember = ref(false)
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')

onMounted(() => {
  const saved = getRememberedUsername()
  if (saved) { username.value = saved; remember.value = true }
})

async function submit() {
  error.value = ''
  if (!username.value.trim()) { error.value = '请输入管理员账号'; return }
  if (!password.value) { error.value = '请输入登录密码'; return }
  if (loading.value) return
  loading.value = true
  try {
    const response = await login({ username: username.value.trim(), password: password.value })
    const data = response?.data
    if (!data?.accessToken) throw new Error('登录响应中缺少 Token')
    setToken(data.accessToken)
    if (data.user) setStoredUser(data.user)
    remember.value ? rememberUsername(username.value.trim()) : forgetUsername()
    const target = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    await router.replace(target)
  } catch (err) {
    error.value = err.message || '登录失败，请检查账号和密码'
  } finally { loading.value = false }
}
</script>

<template>
  <main class="login-page">
    <section class="hero-panel">
      <div class="hero-dots"></div>
      <div class="hero-copy">
        <BrandLogo />
        <div class="subtitle"><i></i><span>护理培训系统后台管理平台</span></div>
      </div>
      <img class="hero-art" src="/images/nurse-hero.svg" alt="护士查看护理培训资料的插画" />
      <div class="hero-wave"></div>
      <p class="copyright">© 2024 护理培训系统&nbsp; 版权所有</p>
    </section>

    <section class="form-panel">
      <nav class="utility-nav" aria-label="辅助导航">
        <button type="button"><AppIcon name="globe" />简体中文⌄</button>
        <span></span>
        <button type="button"><AppIcon name="help" />帮助中心</button>
      </nav>

      <div class="login-wrap">
        <form class="login-card" @submit.prevent="submit" novalidate>
          <header><h1>管理员登录</h1><p>护理培训系统&nbsp; · &nbsp;管理员后台</p></header>

          <label for="username">管理员账号</label>
          <div class="input-box" :class="{ invalid: error && !username.trim() }">
            <AppIcon name="user" :size="22" />
            <input id="username" v-model="username" autocomplete="username" placeholder="请输入管理员账号" @input="error = ''" />
          </div>

          <label for="password">登录密码</label>
          <div class="input-box" :class="{ invalid: error && !password }">
            <AppIcon name="lock" :size="21" />
            <input id="password" v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" placeholder="请输入登录密码" @input="error = ''" />
            <button class="eye" type="button" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click="showPassword = !showPassword"><AppIcon :name="showPassword ? 'eye' : 'eyeOff'" /></button>
          </div>

          <div class="form-meta">
            <label class="check"><input v-model="remember" type="checkbox" /><span></span>记住我</label>
            <button type="button" class="link-btn">忘记密码?</button>
          </div>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <button class="submit-btn" type="submit" :disabled="loading"><span v-if="loading" class="spinner"></span>{{ loading ? '正在登录...' : '进入管理后台' }}</button>

          <div class="divider"><span></span><em>其他方式</em><span></span></div>
          <button class="contact-btn" type="button"><AppIcon name="headset" />联系系统管理员</button>
        </form>
        <p class="help-note"><AppIcon name="shield" :size="22" />如需申请账号或获取更多帮助，请联系系统管理员</p>
      </div>
      <div class="form-dots"></div>
    </section>
  </main>
</template>

<style scoped>
.login-page { min-height: 100vh; display: grid; grid-template-columns: 43.7% 56.3%; background: #fff; overflow: hidden; }
.hero-panel { position: relative; min-height: 100vh; overflow: hidden; background: radial-gradient(circle at 25% 20%,#08643f 0,#00482f 44%,#003c29 100%); border-radius: 0 0 0 32px; color: white; }
.hero-panel::after { content:""; position:absolute; inset:0; background:linear-gradient(180deg,transparent 55%,rgba(0,47,31,.2)); pointer-events:none; }
.hero-copy { position: relative; z-index: 2; margin: 20.5vh 0 0 12%; }
.subtitle { display:flex; align-items:center; gap:20px; margin-top:30px; color:#d8ede4; font-size:22px; letter-spacing:1px; }
.subtitle i { width:55px; height:7px; border-radius:5px; background:#8ed42c; }
.hero-art { position:absolute; z-index:1; width:100%; height:63%; left:0; bottom:3%; object-fit:cover; object-position:center bottom; mix-blend-mode:screen; opacity:.76; }
.hero-wave { position:absolute; z-index:2; bottom:-5%; left:-5%; width:110%; height:18%; border-radius:50% 55% 0 0; background:rgba(0,54,37,.78); transform:rotate(2deg); }
.copyright { position:absolute; z-index:3; bottom:5%; left:7%; margin:0; color:#d1e1da; font-size:14px; }
.hero-dots,.form-dots { position:absolute; width:150px; height:100px; background-image:radial-gradient(circle,rgba(94,187,104,.22) 3px,transparent 3.5px); background-size:18px 18px; }
.hero-dots { top:8%; right:3%; }
.form-panel { position:relative; min-height:100vh; display:flex; justify-content:center; align-items:center; background:radial-gradient(circle at 45% 48%,#fff 0,#fff 53%,#f9faf9 100%); }
.utility-nav { position:absolute; top:38px; right:5%; display:flex; align-items:center; gap:24px; }
.utility-nav button { display:flex; align-items:center; gap:10px; background:none; color:#353a38; cursor:pointer; font-size:16px; }
.utility-nav span { width:1px; height:22px; background:#d7d9d8; }
.login-wrap { width:min(535px,78%); margin-top:34px; }
.login-card { padding:43px 46px 33px; background:rgba(255,255,255,.9); border:1px solid #e2e5e3; border-radius:18px; box-shadow:0 14px 35px rgba(22,54,40,.07); }
header { text-align:center; margin-bottom:39px; }
h1 { margin:0; font-size:32px; letter-spacing:2px; }
header p { color:#8c918f; margin:13px 0 0; font-size:16px; }
form>label { display:block; margin:0 0 10px; font-size:16px; font-weight:600; }
.input-box { height:54px; display:flex; align-items:center; gap:13px; margin-bottom:27px; padding:0 16px; color:#747b78; border:1px solid #d5d9d7; border-radius:8px; transition:.2s; }
.input-box:focus-within { border-color:#16804f; box-shadow:0 0 0 3px rgba(22,128,79,.09); }
.input-box.invalid { border-color:#d65b5b; }
.input-box input { flex:1; min-width:0; height:100%; border:0; outline:0; color:#252b28; background:transparent; font-size:15px; }
.input-box input::placeholder { color:#a5aaa8; }
.eye { display:grid; place-items:center; padding:4px; color:#777d7a; background:none; cursor:pointer; }
.form-meta { display:flex; align-items:center; justify-content:space-between; margin-top:-7px; }
.check { display:flex; align-items:center; gap:9px; cursor:pointer; font-weight:400; }
.check input { position:absolute; opacity:0; }
.check span { width:18px; height:18px; display:grid; place-items:center; border:1px solid #c7cdca; border-radius:4px; }
.check input:checked+span { background:#087344; border-color:#087344; }
.check input:checked+span::after { content:"✓"; color:white; font-size:13px; }
.link-btn { color:#087344; font-weight:600; background:none; cursor:pointer; }
.error { margin:14px 0 -4px; color:#c84242; font-size:13px; }
.submit-btn { width:100%; height:56px; display:flex; align-items:center; justify-content:center; gap:10px; margin-top:28px; color:#fff; background:linear-gradient(90deg,#00613a,#007943,#006037); border-radius:8px; font-size:18px; font-weight:600; letter-spacing:1px; cursor:pointer; box-shadow:0 7px 16px rgba(0,100,59,.16); }
.submit-btn:hover { filter:brightness(1.08); }.submit-btn:disabled { cursor:not-allowed; opacity:.75; }
.spinner { width:18px; height:18px; border:2px solid rgba(255,255,255,.35); border-top-color:#fff; border-radius:50%; animation:spin .7s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
.divider { display:flex; align-items:center; gap:16px; margin:27px 0 20px; }.divider span { flex:1; height:1px; background:#e0e2e1; }.divider em { color:#949997; font-style:normal; font-size:14px; }
.contact-btn { width:100%; height:55px; display:flex; justify-content:center; align-items:center; gap:10px; color:#f26a1b; border:1px solid #d8dcda; border-radius:8px; background:#fff; font-weight:600; cursor:pointer; }
.help-note { display:flex; justify-content:center; align-items:center; gap:9px; margin:27px 0 0; color:#8e9491; font-size:14px; }.help-note svg { color:#159557; }
.form-dots { right:1%; bottom:3%; opacity:.45; }
@media (max-width: 1000px) { .login-page { grid-template-columns:38% 62%; }.hero-copy { margin-left:9%; }.brand :deep(.brand-name) { font-size:25px; }.subtitle { font-size:16px; }.login-wrap { width:min(520px,88%); } }
@media (max-width: 720px) { .login-page { display:block; background:#f6faf7; }.hero-panel { min-height:210px; border-radius:0 0 28px 28px; }.hero-copy { margin:0; padding:38px 28px; }.subtitle { margin-top:18px; }.hero-art { width:50%; height:95%; left:auto; right:0; opacity:.35; }.copyright { display:none; }.form-panel { min-height:calc(100vh - 210px); padding:58px 16px 30px; align-items:flex-start; }.utility-nav { top:20px; right:18px; }.utility-nav button { font-size:0; gap:0; }.utility-nav button svg { width:22px; height:22px; }.login-wrap { width:100%; margin:0; }.login-card { padding:30px 23px 25px; } h1 { font-size:27px; }.help-note { text-align:center; }.form-dots { display:none; } }
</style>
