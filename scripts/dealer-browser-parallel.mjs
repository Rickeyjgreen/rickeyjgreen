import { spawn } from 'node:child_process'

const groups = [
  ['110','117','140','155','163'],
  ['164','168','171','188','190'],
  ['192','199','204','206','218'],
  ['237','239','263','282','295'],
  ['304','319','348','358','360'],
  ['362','370','374','403'],
]

const requested = process.env.DEALER_IDS
  ? new Set(process.env.DEALER_IDS.split(',').map((x) => x.trim()).filter(Boolean))
  : null

const activeGroups = groups
  .map((group) => requested ? group.filter((id) => requested.has(id)) : group)
  .filter((group) => group.length)

function run(group, index) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/dealer-browser-scan.mjs'], {
      stdio: 'inherit',
      env: { ...process.env, DEALER_IDS: group.join(',') },
    })
    child.on('exit', (code, signal) => resolve({ index, code: code ?? 1, signal }))
  })
}

console.log(`Launching ${activeGroups.length} browser scan workers in parallel.`)
const results = await Promise.all(activeGroups.map(run))
const failed = results.filter((result) => result.code !== 0)
console.log(JSON.stringify({ workers: results.length, failed }, null, 2))
if (failed.length) process.exit(1)
