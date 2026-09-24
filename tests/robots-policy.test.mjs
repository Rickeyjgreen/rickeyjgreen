import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRobots, loadRobotsPolicy } from '../scripts/robots-policy.mjs'

test('specific agent rules outrank wildcard and longest allow wins', () => {
  const policy = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: BYBOInventoryBot\nDisallow: /private\nAllow: /private/public\nCrawl-delay: 2')
  assert.equal(policy.allows('https://dealer.example/new-inventory/'), true)
  assert.equal(policy.allows('https://dealer.example/private/stock'), false)
  assert.equal(policy.allows('https://dealer.example/private/public/stock'), true)
  assert.equal(policy.delayMs, 2000)
})

test('wildcard restrictions apply when specific agent is absent', () => {
  const policy = parseRobots('User-agent: *\nDisallow: /inventory/*\nAllow: /inventory/public/\nDisallow: /closed$')
  assert.equal(policy.allows('https://dealer.example/inventory/private'), false)
  assert.equal(policy.allows('https://dealer.example/inventory/public/'), true)
  assert.equal(policy.allows('https://dealer.example/closed'), false)
  assert.equal(policy.allows('https://dealer.example/closed-today'), true)
})

test('robots fetch fails closed on errors and permits explicit not-found', async () => {
  const missing = await loadRobotsPolicy('https://dealer.example', async () => ({ url: 'https://dealer.example/robots.txt', status: 404 }))
  assert.equal(missing.allows('https://dealer.example/new'), true)
  await assert.rejects(loadRobotsPolicy('https://dealer.example', async () => ({ url: 'https://dealer.example/robots.txt', status: 403, ok: false })), /unavailable/)
})
