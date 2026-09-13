import React,{useEffect,useMemo,useState} from 'react'
import {ContactRound,ExternalLink,KeyRound,Search,ShieldCheck,UserPlus,Users} from 'lucide-react'
import {exportCsv,loadAdminContactWorkspace,loadContactCandidates,reviewContact,runDealerJob} from './backendClient.mjs'

function Badge({children,tone='idle'}){return <span className={`di-badge di-${tone}`}>{children}</span>}
function tone(status){return status==='ADDED'||status==='UPDATED'||status==='MATCHED'?'good':status==='REJECTED'?'bad':status==='IGNORED'?'idle':'warn'}
const ROLES=[['ANY','Any decision maker'],['PRINCIPAL','Owner / Dealer Principal'],['GM','General Manager'],['GSM','General Sales Manager / GSM'],['NEW_CAR','New Car Manager'],['USED_CAR','Used Car Manager'],['INVENTORY','Inventory Manager'],['FLEET','Fleet / Commercial Manager'],['SALES_MANAGER','Sales Manager'],['BDC','Internet / BDC Manager']]
const roleMatch=(title,key)=>{const t=String(title||'');if(key==='ANY')return true;const map={PRINCIPAL:/(dealer principal|dealer operator|owner|president)/i,GM:/\bgeneral manager\b/i,GSM:/(general sales manager|\bgsm\b)/i,NEW_CAR:/(new car manager|new vehicle manager)/i,USED_CAR:/(used car manager|used vehicle manager)/i,INVENTORY:/inventory manager/i,FLEET:/(fleet manager|commercial manager)/i,SALES_MANAGER:/\bsales manager\b/i,BDC:/(internet manager|bdc manager|business development manager)/i};return map[key]?.test(t)??true}

export default function ContactsPanel({dealers=[],selectedIds,onJob}){
  const [candidates,setCandidates]=useState([])
  const [query,setQuery]=useState('')
  const [role,setRole]=useState('ANY')
  const [busy,setBusy]=useState(false)
  const [adminKey,setAdminKey]=useState(()=>sessionStorage.getItem('scrape-it-admin')||'')
  const [unlocked,setUnlocked]=useState(false)
  const [workspace,setWorkspace]=useState(null)
  const [message,setMessage]=useState(null)
  const [targets,setTargets]=useState({})

  async function refresh(){const r=await loadContactCandidates(selectedIds);setCandidates(r.candidates||[])}
  useEffect(()=>{refresh().catch(()=>{})},[selectedIds.join(',')])

  const visible=useMemo(()=>candidates.filter(c=>{
    const d=dealers.find(x=>x.dealer_id===c.dealer_id),hay=`${c.person_name} ${c.title} ${c.email||''} ${c.phone||''} ${d?.dealer_name||''}`.toLowerCase();return roleMatch(c.title,role)&&(!query||hay.includes(query.toLowerCase()))
  }),[candidates,dealers,query,role])

  async function reveal(){if(!selectedIds.length)return setMessage({type:'warning',text:'Select at least one dealer first.'});setBusy(true);setMessage(null);try{const created=await runDealerJob('CONTACTS',selectedIds,{concurrency:2,role,onProgress:x=>onJob?.(x.jobId)});onJob?.(created.jobs?.[0]?.job_id);await refresh();setMessage({type:'success',text:`Contact discovery finished for ${selectedIds.length} dealer${selectedIds.length===1?'':'s'} · ${ROLES.find(x=>x[0]===role)?.[1]||role}.`})}catch(e){setMessage({type:'error',text:e.message})}finally{setBusy(false)}}

  async function unlock(){try{sessionStorage.setItem('scrape-it-admin',adminKey);const w=await loadAdminContactWorkspace(selectedIds,adminKey);setWorkspace(w);setUnlocked(true);setCandidates(w.candidates||[]);setMessage({type:'success',text:'Private contact review workspace unlocked for this browser session.'})}catch(e){setUnlocked(false);setMessage({type:'error',text:e.message})}}

  async function act(c,action){try{const target=targets[c.candidate_id]||'';await reviewContact(c.candidate_id,action,target,adminKey);const w=await loadAdminContactWorkspace(selectedIds,adminKey);setWorkspace(w);setCandidates(w.candidates||[]);setMessage({type:'success',text:`${c.person_name}: ${action.toLowerCase()} recorded.`})}catch(e){setMessage({type:'error',text:e.message})}}

  function exportRows(){exportCsv('scrape-it-contact-candidates.csv',visible.map(c=>({dealer_id:c.dealer_id,dealer_name:dealers.find(d=>d.dealer_id===c.dealer_id)?.dealer_name||'',person_name:c.person_name,title:c.title,email:c.email,phone:c.phone,source_url:c.source_url,observed_at:c.last_observed_at,review_status:c.review_status,evidence_class:c.evidence_class,confidence:c.confidence})))}

  return <section className="si-panel si-contact-panel">
    <div className="si-section-head"><div><p className="si-kicker">Decision makers</p><h2>Find the role you need, then review before CRM changes</h2><p className="di-sub">Public staff evidence stays separate from Rickey's private book. Contact discovery now tries direct HTTP first and uses the browser only when necessary.</p></div><Badge tone="good"><ShieldCheck size={13}/>REVIEW GATED</Badge></div>
    <div className="si-contact-actions">
      <select value={role} onChange={e=>setRole(e.target.value)}>{ROLES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
      <button className="si-primary" onClick={reveal} disabled={busy||!selectedIds.length}><Users size={16}/>{busy?'Searching…':`Find contacts (${selectedIds.length})`}</button>
      <label><Search size={15}/><input placeholder="Search name, title, email, dealer" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <button className="si-secondary" onClick={exportRows} disabled={!visible.length}>Export CSV</button>
    </div>
    {message&&<div className={`di-message di-message-${message.type}`}>{message.text}</div>}
    <div className="si-admin-row"><KeyRound size={16}/><input type="password" placeholder="Admin unlock code" value={adminKey} onChange={e=>setAdminKey(e.target.value)}/><button onClick={unlock}>{unlocked?'Refresh private matches':'Unlock review'}</button><span>{unlocked?'Private match suggestions visible':'Public candidates only'}</span></div>
    <div className="si-contact-list">{visible.map(c=>{
      const dealer=dealers.find(d=>d.dealer_id===c.dealer_id),suggestions=c.suggestions||[]
      return <article className="si-contact-card" key={c.candidate_id}>
        <div className="si-contact-main"><ContactRound/><div><strong>{c.person_name}</strong><span>{c.title}</span><small>{dealer?.dealer_name||`Dealer ${c.dealer_id}`}</small></div></div>
        <div className="si-contact-evidence"><Badge tone={tone(c.review_status)}>{c.review_status}</Badge><span>{c.email||'No public email'}</span><span>{c.phone||'No public phone'}</span><a href={c.source_url} target="_blank" rel="noreferrer">Source <ExternalLink size={13}/></a></div>
        {unlocked&&<div className="si-contact-review">
          <select value={targets[c.candidate_id]||''} onChange={e=>setTargets({...targets,[c.candidate_id]:e.target.value})}><option value="">Choose existing contact for match/update</option>{suggestions.map((s,i)=><option key={i} value={s.contact?.text||s.contact}>{Math.round((s.score||0)*100)}% · {s.contact?.text||s.contact}</option>)}</select>
          <div><button onClick={()=>act(c,'MATCH')} disabled={!targets[c.candidate_id]}>Match</button><button onClick={()=>act(c,'UPDATE')} disabled={!targets[c.candidate_id]}>Update</button><button onClick={()=>act(c,'ADD')}><UserPlus size={13}/>Add</button><button onClick={()=>act(c,'IGNORE')}>Ignore</button><button className="danger" onClick={()=>act(c,'REJECT')}>Not this person</button></div>
        </div>}
      </article>
    })}</div>
    {!visible.length&&<div className="si-empty"><Users/><h3>No matching public decision-maker candidates yet</h3><p>Select dealer(s), choose a role, then run Find contacts.</p></div>}
    <div className="di-foot"><strong>Truth rule:</strong> A public staff page proves only that the page represented the person/title when observed. Absence on a later page does not prove employment ended.</div>
  </section>
}
