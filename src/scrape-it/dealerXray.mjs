const clamp=(value,min=0,max=1)=>Math.min(max,Math.max(min,Number.isFinite(Number(value))?Number(value):0))
const num=value=>Number.isFinite(Number(value))?Number(value):0
const round1=value=>Math.round(num(value)*10)/10
const ratio=(a,b)=>num(b)>0?num(a)/num(b):0
const key=(make,model)=>`${String(make||'').trim().toUpperCase()}|${String(model||'').trim().toUpperCase()}`

function modelPressure(model){
  const inventory=Math.max(0,num(model.inventory_count))
  if(!inventory)return 0
  const aged30=clamp(ratio(model.aged_30_count,inventory))
  const aged60=clamp(ratio(model.aged_60_count,inventory))
  const priceCuts=clamp(ratio(model.price_drops_7d,inventory)*4)
  const concentration=clamp(num(model.dealer_inventory_share))
  return round1(100*(0.34*aged30+0.26*aged60+0.20*priceCuts+0.20*concentration))
}

function modelAbsorption(model){
  const inventory=Math.max(0,num(model.inventory_count))
  const removals=Math.max(0,num(model.removals_7d))
  const additions=Math.max(0,num(model.additions_7d))
  if(!inventory&&!removals)return 0
  const turnover=clamp(ratio(removals,Math.max(1,inventory+removals))*3)
  const netOutflow=clamp(ratio(Math.max(removals-additions,0),Math.max(1,inventory))*3)
  return round1(100*(0.70*turnover+0.30*netOutflow))
}

function panelFlow(panel){
  if(!panel)return 0
  const inventory=Math.max(0,num(panel.inventory_count))
  const removals=Math.max(0,num(panel.removals_7d))
  const additions=Math.max(0,num(panel.additions_7d))
  if(!inventory&&!removals)return 0
  const turnover=clamp(ratio(removals,Math.max(1,inventory+removals))*3)
  const netOutflow=clamp(ratio(Math.max(removals-additions,0),Math.max(1,inventory))*3)
  return round1(100*(0.65*turnover+0.35*netOutflow))
}

function bestModel(models,scorer,panelByModel){
  return models.map(model=>{
    const score=scorer(model)
    const panel=panelByModel.get(key(model.make,model.model))
    return {...model,xray_score:score,panel_flow:panelFlow(panel)}
  }).sort((a,b)=>b.xray_score-a.xray_score||num(b.inventory_count)-num(a.inventory_count))[0]||null
}

export function scoreDealerXray(scoreRow,dealerModels=[],panelModels=[]){
  const status=scoreRow?.status||'INSUFFICIENT_DATA'
  const sellerPressure=clamp(num(scoreRow?.seller_score),0,100)
  const buyerPressure=clamp(num(scoreRow?.buyer_score),0,100)
  const confidence=clamp(scoreRow?.confidence)
  const coverage=clamp(scoreRow?.data_coverage)
  const factorCoverage=clamp(scoreRow?.factor_scores?.attribute_coverage)
  const panelByModel=new Map(panelModels.map(model=>[key(model.make,model.model),model]))
  const models=dealerModels.filter(model=>String(model.dealer_id)===String(scoreRow?.dealer_id))
  const pressureModel=bestModel(models,modelPressure,panelByModel)
  const absorptionModel=bestModel(models,modelAbsorption,panelByModel)
  const pressureModelScore=num(pressureModel?.xray_score)
  const absorptionModelScore=num(absorptionModel?.xray_score)

  // Keep the existing deterministic Dealer Pulse scores intact. X-Ray adds action layers around them.
  const sellerOpportunity=round1(0.72*sellerPressure+0.28*pressureModelScore)
  const observedAbsorption=round1(0.60*buyerPressure+0.40*absorptionModelScore)

  const distinctModels=new Set(models.map(model=>key(model.make,model.model)).filter(x=>x!=='|')).size
  const twoSidedEvidence=sellerOpportunity>=18&&observedAbsorption>=18&&distinctModels>=2
  const packageLeverage=twoSidedEvidence
    ?round1(Math.sqrt(sellerOpportunity*observedAbsorption)*(0.80+0.20*clamp(Math.max(num(pressureModel?.panel_flow),num(absorptionModel?.panel_flow))/100)))
    :0

  // Contactability is not currently available in Dealer Pulse's evidence feed, so readiness is capped.
  const rawReadiness=100*(0.50*confidence+0.35*coverage+0.15*factorCoverage)
  const executionReadiness=round1(Math.min(65,rawReadiness))
  const opportunity=Math.max(sellerOpportunity,observedAbsorption)
  const priority=round1(0.45*opportunity+0.25*packageLeverage+0.30*executionReadiness)

  let bucket='WATCH'
  if(status==='INSUFFICIENT_DATA')bucket='LEARNING'
  else if(priority>=65)bucket='NOW'
  else if(priority>=45)bucket='NEXT'
  else if(priority>=25)bucket='VERIFY'

  const reasons=[]
  if(pressureModel&&pressureModelScore>=20)reasons.push(`${pressureModel.make} ${pressureModel.model}: strongest observed relief-pressure model`)
  if(absorptionModel&&absorptionModelScore>=20)reasons.push(`${absorptionModel.make} ${absorptionModel.model}: strongest observed absorption proxy`)
  if(packageLeverage>=25)reasons.push('slow/fast model mix creates a package-building hypothesis')
  if(confidence>=0.7)reasons.push('strong trusted-history confidence')
  if(!reasons.length)reasons.push('not enough differentiated evidence yet')

  return {
    dealer_id:scoreRow?.dealer_id,
    dealer:scoreRow?.dealer||null,
    version:'dealer_xray_v0.3',
    source_score_version:scoreRow?.score_version||null,
    status,
    bucket,
    priority,
    seller_opportunity:sellerOpportunity,
    observed_absorption:observedAbsorption,
    package_leverage:packageLeverage,
    execution_readiness:executionReadiness,
    confidence:round1(confidence*100),
    coverage:round1(coverage*100),
    contactability:'UNKNOWN',
    package_status:packageLeverage>=25?'CANDIDATE':'NEEDS_MATCH',
    top_pressure_model:pressureModel,
    top_absorption_model:absorptionModel,
    reasons,
    unknowns:['dealer willingness','current Access inventory','price acceptance','freight economics','verified cell/text reachability'],
    evidence_class:'INFERENCE'
  }
}

export function buildDealerXrays(scores=[],dealerModels=[],panelModels=[]){
  return scores.map(score=>scoreDealerXray(score,dealerModels,panelModels))
    .sort((a,b)=>b.priority-a.priority||b.seller_opportunity-a.seller_opportunity||String(a.dealer?.dealer_name||'').localeCompare(String(b.dealer?.dealer_name||'')))
}

export const __test={modelPressure,modelAbsorption,panelFlow}
