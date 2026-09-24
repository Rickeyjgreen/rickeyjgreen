import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import browser from '../api/dealer-browser.js'
import contacts from '../api/dealer-contacts.js'
import investigate from '../api/investigate-dealer.js'

for (const [name, handler] of [
  ['browser', browser],
  ['contacts', contacts],
  ['investigate', investigate],
]) {
  test(`donor-era ${name} API cannot write or scrape`, () => {
    let status
    let body
    const headers = {}
    const response = {
      setHeader(key, value) { headers[key] = value },
      status(value) { status = value; return this },
      json(value) { body = value; return this },
    }
    handler({ method: 'POST', body: { dealerId: '163' } }, response)
    assert.equal(status, 410)
    assert.equal(headers['Cache-Control'], 'no-store')
    assert.equal(body.research_url, 'https://elite-market-intelligence.vercel.app/research')
  })
}

test('active Scrape It catalog has no donor project reference', async () => {
  for (const file of [
    '../src/scrape-it/backendClient.mjs',
    '../src/scrape-it/DealerPulsePanel.jsx',
    '../src/scrape-it/MarketExplorer.jsx',
  ]) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /eyngapizkxsernywdyfv/)
    assert.match(source, /ioqdvdsjtzwyjtdkywcu/)
  }
})

test('all donor writer workflows and scripts fail closed', async () => {
  for (const stem of [
    'scrape-it-29-way',
    'scrape-it-vin-enrichment',
    'scrape-it-contacts-weekly',
    'scrape-it-browser-scan',
    'scrape-it-browser-scan-fast',
    'scrape-it-contact-smoke',
  ]) {
    const workflow = await readFile(new URL(`../.github/workflows/${stem}.yml`, import.meta.url), 'utf8')
    assert.doesNotMatch(workflow, /\bschedule\s*:/)
    assert.match(workflow, /Retired donor job/)
  }
  for (const stem of [
    'enrich-current-vins',
    'dealer-contact-http',
    'dealer-http-edge',
    'dealer-eprocess-http',
    'dealer-eprocess-http-v2',
    'dealer-inspire-browser',
  ]) {
    const script = await readFile(new URL(`../scripts/${stem}.mjs`, import.meta.url), 'utf8')
    assert.doesNotMatch(script, /eyngapizkxsernywdyfv/)
    assert.match(script, /throw new Error\('Legacy donor writer retired/)
  }
})
