import React,{useEffect,useMemo,useState} from 'react'
import {ChevronDown,ChevronUp,Eye,EyeOff,RefreshCw,XCircle} from 'lucide-react'
import {cancelControlJob,loadControlState} from './backendClient.mjs'

function pct(job){if(!job?.total_items)return 0;const done=(job.complete_count||0)+(job.incomplete_count||0)+(job.error_count||0)+(job.cancelled_count||0);return Math.round(done/job.total_items*100)}

export default function ScanHUD({jobId,onState}){
  const [state,setState]=useState({jobs:[]})
  const [collapsed,setCollapsed]=useState(false)
  const [hidden,setHidden]=useState(false)
  const [error,setError]=useState(null)
  const active=useMemo(()=>jobId?state.jobs?.find(j=>j.job_id===jobId):state.active_job||state.jobs?.[0],[jobId,state])

  useEffect(()=>{
    let live=true,timer
    async function tick(){
      try{const next=await loadControlState(jobId);if(!live)return;setState(next);setError(null);onState?.(next);const j=jobId?next.jobs?.[0]:next.active_job;if(j&&(j.status==='QUEUED'||j.status==='RUNNING'))timer=setTimeout(tick,1500)}
      catch(e){if(live){setError(e.message);timer=setTimeout(tick,3500)}}
    }
    tick();return()=>{live=false;if(timer)clearTimeout(timer)}
  },[jobId])

  useEffect(()=>{if(active&&(active.status==='QUEUED'||active.status==='RUNNING'))setHidden(false)},[active?.job_id,active?.status])
  if(!active)return null
  const progress=pct(active),items=active.items||[]
  if(hidden)return <button className="si-hud-reopen" onClick={()=>setHidden(false)}><Eye size={15}/><span>{active.job_type} {progress}%</span></button>
  return <aside className={`si-hud ${collapsed?'si-hud-collapsed':''}`}>
    <div className="si-hud-head">
      <div><strong>{active.job_type==='CONTACTS'?'Decision-maker scan':'Inventory scan'}</strong><span>{active.status} · {progress}% · {active.total_items} dealer{active.total_items===1?'':'s'}</span></div>
      <div className="si-hud-actions"><button onClick={()=>setCollapsed(v=>!v)}>{collapsed?<ChevronUp/>:<ChevronDown/>}</button><button onClick={()=>setHidden(true)}><EyeOff/></button></div>
    </div>
    <div className="si-hud-bar"><span style={{width:`${progress}%`}}/></div>
    {!collapsed&&<>
      <div className="si-hud-counts"><div><span>Complete</span><strong>{active.complete_count||0}</strong></div><div><span>Observed</span><strong>{active.incomplete_count||0}</strong></div><div><span>Errors</span><strong>{active.error_count||0}</strong></div><div><span>Running</span><strong>{active.running_count||0}</strong></div></div>
      <div className="si-hud-items">{items.slice(0,12).map(item=><div key={item.item_id} className={`si-hud-item si-hud-${item.status?.toLowerCase()}`}><span>{item.dealer_accounts?.dealer_name||`Dealer ${item.dealer_id}`}</span><strong>{item.stage}</strong><small>{item.message||item.error_message||''}</small></div>)}</div>
      {error&&<div className="si-hud-error">{error}</div>}
      {(active.status==='QUEUED'||active.status==='RUNNING')&&<button className="si-hud-cancel" onClick={()=>cancelControlJob(active.job_id).then(setState).catch(e=>setError(e.message))}><XCircle size={15}/>Cancel queued</button>}
      {active.status==='COMPLETE'&&<div className="si-hud-done"><RefreshCw size={14}/>Job finished. HUD can be hidden; results remain stored.</div>}
    </>}
  </aside>
}
