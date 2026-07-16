import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './assets/main.css'

const app = createApp(App)

app.use(router)

app.mount('#app')

const dateInputSelector = 'input[type="date"],input[type="datetime-local"],input[type="month"],input[type="time"]'

function syncDateInputValueClass(input) {
  input.classList.toggle('has-value', Boolean(input.value))
}

function syncAllDateInputValueClasses(root = document) {
  root.querySelectorAll?.(dateInputSelector).forEach(syncDateInputValueClass)
}

syncAllDateInputValueClasses()

document.addEventListener('input', (event) => {
  if (event.target?.matches?.(dateInputSelector)) syncDateInputValueClass(event.target)
})

document.addEventListener('change', (event) => {
  if (event.target?.matches?.(dateInputSelector)) syncDateInputValueClass(event.target)
})

new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return
      if (node.matches?.(dateInputSelector)) syncDateInputValueClass(node)
      syncAllDateInputValueClasses(node)
    })
  })
}).observe(document.body, { childList: true, subtree: true })
