import test from 'node:test'
import assert from 'node:assert/strict'
import {scoreDealerXray,buildDealerXrays,__test} from '../src/scrape-it/dealerXray.mjs'

const baseScore={dealer_id:'1',dealer:{dealer_name:'Example GMC'},score_version:'dealer_pulse_v0.2',status:'TWO_SIDED_ACTIVE',seller_score:54,buyer_score:41,confidence:.8,data_coverage:.9,factor_scores:{attribute_coverage:.95}}
const models=[
  {dealer_id:'1',make:'Chevrolet',model:'Blazer EV',inventory_count:12,dealer_inventory_share:.4,aged_30_count:9,aged_60_count:6,price_drops_7d:3,additions_7d:1,removals_7d:0},
  {dealer_id:'1',make:'Chevrolet',model:'Traverse',inventory_count:8,dealer_inventory_share:.25,aged_30_count:1,aged_60_count:0,price_drops_7d:0,additions_7d:1,removals_7d:5},
]
const panel=[
  {make:'Chevrolet',model:'Blazer EV',inventory_count:80,additions_7d:8,removals_7d:3},
  {make:'Chevrolet',model:'Traverse',inventory_count:30,additions_7d:4,removals_7d:18},
]

test('pressure model rewards aged concentrated inventory with price cuts',()=>{
  assert.ok(__test.modelPressure(models[0])>__test.modelPressure(models[1]))
})

test('absorption proxy rewards trusted removals without calling them sales',()=>{
  assert.ok(__test.modelAbsorption(models[1])>__test.modelAbsorption(models[0]))
})

test('xray preserves inference boundary and explicit unknowns',()=>{
  const x=scoreDealerXray(baseScore,models,panel)
  assert.equal(x.evidence_class,'INFERENCE')
  assert.equal(x.contactability,'UNKNOWN')
  assert.ok(x.unknowns.includes('dealer willingness'))
  assert.ok(x.unknowns.includes('freight economics'))
})

test('package leverage requires two-sided evidence instead of inventing a fit',()=>{
  const x=scoreDealerXray(baseScore,models,panel)
  assert.ok(x.package_leverage>0)
  const weak=scoreDealerXray({...baseScore,buyer_score:0},[models[0]],panel)
  assert.equal(weak.package_leverage,0)
  assert.equal(weak.package_status,'NEEDS_MATCH')
})

test('execution readiness stays capped until verified contactability enters the evidence feed',()=>{
  const x=scoreDealerXray({...baseScore,confidence:1,data_coverage:1,factor_scores:{attribute_coverage:1}},models,panel)
  assert.equal(x.execution_readiness,65)
})

test('ranked output is deterministic by priority',()=>{
  const rows=buildDealerXrays([
    baseScore,
    {...baseScore,dealer_id:'2',dealer:{dealer_name:'Lower Signal'},seller_score:5,buyer_score:3},
  ],models,panel)
  assert.equal(rows[0].dealer_id,'1')
})
