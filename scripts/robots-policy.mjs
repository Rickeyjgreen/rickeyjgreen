const USER_AGENT = 'BYBOInventoryBot'

function rulePattern(path) {
  const escaped = path.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp('^' + (path.endsWith('$') ? escaped.slice(0, -2) + '$' : escaped))
}

export function parseRobots(text, agent = USER_AGENT) {
  const groups = []
  let agents = []
  let rules = []
  let delay = null
  let hasDirectives = false
  const flush = () => {
    if (agents.length) groups.push({ agents, rules, delay })
    agents = []
    rules = []
    delay = null
    hasDirectives = false
  }
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) {
      if (hasDirectives) flush()
      continue
    }
    const pos = line.indexOf(':')
    if (pos < 0) continue
    const field = line.slice(0, pos).trim().toLowerCase()
    const value = line.slice(pos + 1).trim()
    if (field === 'user-agent') {
      if (hasDirectives) flush()
      agents.push(value.toLowerCase())
    } else if (agents.length && (field === 'allow' || field === 'disallow')) {
      hasDirectives = true
      if (value) rules.push({ field, path: value })
    } else if (agents.length && field === 'crawl-delay') {
      hasDirectives = true
      const seconds = Number(value)
      if (Number.isFinite(seconds) && seconds >= 0) delay = Math.max(delay || 0, seconds)
    }
  }
  flush()
  const a = agent.toLowerCase()
  const matching = groups.filter(g => g.agents.some(x => x !== '*' && a.includes(x)))
  const selected = matching.length ? matching : groups.filter(g => g.agents.includes('*'))
  return {
    delayMs: Math.ceil(Math.max(0, ...selected.map(g => g.delay || 0)) * 1000),
    allows(url) {
      const u = new URL(url)
      const path = u.pathname + u.search
      const hits = selected.flatMap(g => g.rules).filter(r => rulePattern(r.path).test(path))
      if (!hits.length) return true
      hits.sort((x, y) => y.path.length - x.path.length || (x.field === 'allow' ? -1 : 1))
      return hits[0].field === 'allow'
    },
  }
}

export async function loadRobotsPolicy(website, fetcher = fetch) {
  const origin = new URL(website).origin
  const response = await fetcher(new URL('/robots.txt', origin), {
    redirect: 'follow',
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(8000),
  })
  if (new URL(response.url).origin !== origin) throw Error('Robots policy redirected off dealer origin')
  if (response.status === 404 || response.status === 410) return { delayMs: 0, allows: () => true }
  if (!response.ok) throw Error('Robots policy unavailable (HTTP ' + response.status + ')')
  return parseRobots(await response.text())
}
