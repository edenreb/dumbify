// A small line-icon set, drawn for Dumbify on a 24px grid with round caps and joins.
//
// Built with createElementNS rather than innerHTML: youtube.com enforces Trusted Types,
// and building nodes directly keeps these usable in the content script, the settings
// page and the popup alike.

const PATHS = {
  home: ['M3.5 10.5 12 3.5l8.5 7', 'M5.5 9v10.5a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9'],
  subscriptions: ['M7 3.5h10', 'M5 7h14', 'M4.5 10.5h15a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z', 'M10.5 13v5l4-2.5z'],
  history: ['M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5', 'M3.5 3.5v5h5', 'M12 7.5V12l3 2'],
  clock: ['M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z', 'M12 7.5V12l3 2'],
  thumb: ['M7.5 10.5v10', 'M7.5 10.5l3.6-6.3a1.9 1.9 0 0 1 3.4 1.6l-1 3.7h5.2a2 2 0 0 1 2 2.4l-1.3 6.5a2 2 0 0 1-2 1.6H7.5', 'M3.5 10.5h4v10h-4z'],
  playlists: ['M3.5 6.5h12', 'M3.5 11.5h12', 'M3.5 16.5h7', 'M15.5 14v6l5-3z'],
  search: ['M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20.5 20.5 15.5 15.5'],
  sliders: ['M4 7h9', 'M17 7h3', 'M15 9.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z', 'M4 17h3', 'M11 17h9', 'M9 19.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z'],
  sun: ['M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M12 2.5v2', 'M12 19.5v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2.5 12h2', 'M19.5 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'],
  moon: ['M20 14.2A8 8 0 0 1 9.8 4a8 8 0 1 0 10.2 10.2z'],
  monitor: ['M3.5 4.5h17v11h-17z', 'M8.5 20h7', 'M12 15.5V20'],
  collapse: ['M11 17l-5-5 5-5', 'M18 17l-5-5 5-5'],
  expand: ['M13 17l5-5-5-5', 'M6 17l5-5-5-5'],
  menu: ['M4 6.5h16', 'M4 12h16', 'M4 17.5h16'],
  more: ['M5.5 12h.01', 'M12 12h.01', 'M18.5 12h.01'],
  list: ['M8.5 6.5h12', 'M8.5 12h12', 'M8.5 17.5h12', 'M3.5 6.5h.01', 'M3.5 12h.01', 'M3.5 17.5h.01'],
  cards: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  table: ['M3.5 4.5h17v15h-17z', 'M3.5 9.5h17', 'M3.5 14.5h17', 'M9.5 9.5v10'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  close: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
  chevron: ['M9.5 6l6 6-6 6'],
  chevronDown: ['M6 9.5l6 6 6-6'],
  bookmark: ['M6.5 3.5h11v17l-5.5-3.8-5.5 3.8z'],
  comment: ['M4.5 5h15a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H10l-5.5 4v-4h0a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'],
  image: ['M3.5 5h17v14h-17z', 'M3.5 16l5-5 4.5 4.5 3-3 4.5 4.5', 'M15.5 9.5h.01'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4.5 20.5a7.5 7.5 0 0 1 15 0'],
  verified: ['M12 2.8l2.3 1.7 2.8-.1.9 2.7 2.3 1.6-.9 2.7.9 2.7-2.3 1.6-.9 2.7-2.8-.1L12 21.2l-2.3-1.7-2.8.1-.9-2.7-2.3-1.6.9-2.7-.9-2.7 2.3-1.6.9-2.7 2.8.1z', 'M8.5 12l2.4 2.4 4.6-4.8'],
  play: ['M7 4.5v15l12.5-7.5z'],
  pause: ['M7.5 5v14', 'M16.5 5v14'],
  sparkles: ['M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9z', 'M18.5 15.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z'],
  palette: ['M12 20.5a8.5 8.5 0 1 1 8.5-8.5c0 2-1.4 3-3 3h-2.2a2 2 0 0 0-1.3 3.5 1.2 1.2 0 0 1-.8 2z', 'M7.5 11.5h.01', 'M10 7.5h.01', 'M14.5 7.5h.01', 'M17 11h.01'],
  type: ['M5 7V5h14v2', 'M12 5v14', 'M9 19h6'],
  // A large and a small letter: text size, where type is the face.
  textSize: ['M3.5 8V6h10v2', 'M8.5 6v12', 'M13.5 13v-1.5h7V13', 'M17 11.5V18'],
  layout: ['M3.5 4.5h17v15h-17z', 'M9.5 4.5v15'],
  film: ['M3.5 4.5h17v15h-17z', 'M8 4.5v15', 'M16 4.5v15', 'M3.5 9.5H8', 'M3.5 14.5H8', 'M16 9.5h4.5', 'M16 14.5h4.5'],
  keyboard: ['M3 6.5h18v11H3z', 'M6.5 10h.01', 'M10 10h.01', 'M13.5 10h.01', 'M17 10h.01', 'M7.5 14h9'],
  upload: ['M12 15.5V4', 'M7 8.5l5-5 5 5', 'M4.5 15v4.5h15V15'],
  download: ['M12 4v11.5', 'M7 10.5l5 5 5-5', 'M4.5 15v4.5h15V15'],
  trash: ['M4.5 7h15', 'M9.5 7V4.5h5V7', 'M6.5 7l1 13h9l1-13'],
  reset: ['M20 12a8 8 0 1 1-2.3-5.6', 'M20 4.5V9h-4.5'],
  star: ['M12 3.8l2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z'],
  code: ['M8.5 7l-5 5 5 5', 'M15.5 7l5 5-5 5'],
  shield: ['M12 3.5l7.5 3v5.5c0 4.5-3.2 7.7-7.5 9-4.3-1.3-7.5-4.5-7.5-9V6.5z'],
  eye: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', 'M12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6z'],
  info: ['M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z', 'M12 11v5', 'M12 7.8h.01'],
  power: ['M12 3.5v8', 'M6.6 6.6a7.5 7.5 0 1 0 10.8 0'],
  drop: ['M12 3.5s6.5 7 6.5 11a6.5 6.5 0 0 1-13 0c0-4 6.5-11 6.5-11z'],
  focus: ['M4 8.5V4h4.5', 'M15.5 4H20v4.5', 'M20 15.5V20h-4.5', 'M8.5 20H4v-4.5', 'M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z'],
  width: ['M3.5 12h17', 'M7 8.5 3.5 12 7 15.5', 'M17 8.5l3.5 3.5-3.5 3.5'],
  glass: ['M4.5 4.5h15v15h-15z', 'M8 16l8-8', 'M12 17l5-5'],
} as const

export type IconName = keyof typeof PATHS

const NS = 'http://www.w3.org/2000/svg'

export function icon(name: IconName, className = 'df-icon'): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('class', className)
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.75')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  for (const d of PATHS[name]) {
    const path = document.createElementNS(NS, 'path')
    path.setAttribute('d', d)
    svg.appendChild(path)
  }
  return svg
}

/**
 * The Dumbify mark: the switch that dots the "i" in the logo, drawn in the reader's
 * accent so the brand follows their theme.
 */
export function brandMark(className = 'df-brand-mark'): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('class', className)
  svg.setAttribute('viewBox', '0 0 28 16')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  const track = document.createElementNS(NS, 'rect')
  track.setAttribute('x', '0.5')
  track.setAttribute('y', '0.5')
  track.setAttribute('width', '27')
  track.setAttribute('height', '15')
  track.setAttribute('rx', '7.5')
  track.setAttribute('class', 'df-brand-track')
  const knob = document.createElementNS(NS, 'circle')
  knob.setAttribute('cx', '20')
  knob.setAttribute('cy', '8')
  knob.setAttribute('r', '5')
  knob.setAttribute('class', 'df-brand-knob')
  svg.append(track, knob)
  return svg
}

export const ICON_NAMES = Object.keys(PATHS) as IconName[]
