// The site's few moving parts: the looks bar drives the live demo, tabs swap screenshots,
// and sections fade in as they scroll into view.

/* ---- A refresh starts at the top ---- */

// In-page links scroll without leaving #section in the address bar, so a refresh doesn't
// jump back down. A shared link to a section still lands there once, then the hash goes.
history.scrollRestoration = 'manual'
if (location.hash) {
  const target = document.getElementById(location.hash.slice(1))
  history.replaceState(null, '', location.pathname + location.search)
  if (target) requestAnimationFrame(() => target.scrollIntoView())
} else {
  scrollTo(0, 0)
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]')
  const target = a && document.getElementById(a.getAttribute('href').slice(1))
  if (!target) return
  e.preventDefault()
  target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  if (target.id === 'main') target.focus({ preventScroll: true })
})

/* ---- The live demo (src/demo/index.ts) ---- */

const frame = document.querySelector('.demo-frame')
const lookBtns = [...document.querySelectorAll('.looks-bar [data-look]')]

const pressLook = (id) => {
  for (const b of lookBtns) b.setAttribute('aria-pressed', String(b.dataset.look === id))
}

for (const b of lookBtns) {
  b.addEventListener('click', () => {
    pressLook(b.dataset.look)
    frame?.contentWindow?.postMessage({ type: 'dumbify:demo-set', look: b.dataset.look }, location.origin)
  })
}

// The demo reports its state back, so the bar follows clicks made inside it too.
addEventListener('message', (e) => {
  if (e.source !== frame?.contentWindow || e.origin !== location.origin || e.data?.type !== 'dumbify:demo') return
  pressLook(e.data.look)
})

/* ---- Tabs that swap a window's screenshot ---- */

for (const tabs of document.querySelectorAll('.tabs')) {
  const shots = tabs.closest('.feature').querySelector('.shots')
  const buttons = [...tabs.querySelectorAll('[data-shot]')]
  const show = (id) => {
    for (const b of buttons) b.setAttribute('aria-selected', String(b.dataset.shot === id))
    for (const img of shots.querySelectorAll('img')) img.classList.toggle('on', img.dataset.shot === id)
  }
  for (const b of buttons) b.addEventListener('click', () => show(b.dataset.shot))
  show(buttons[0].dataset.shot)
}

/* ---- Reveal on scroll ---- */

const reveal = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue
    entry.target.classList.add('in')
    reveal.unobserve(entry.target)
  }
}, { rootMargin: '0px 0px -8% 0px' })

document.querySelectorAll('[data-reveal]').forEach((el) => reveal.observe(el))
