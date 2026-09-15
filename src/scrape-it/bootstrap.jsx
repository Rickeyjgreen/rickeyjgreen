import React from 'react'
import {createRoot} from 'react-dom/client'
import ScrapeItApp from './ScrapeItApp.jsx'
import './scrape-it.css'
import './dealer-intel.css'
import './control-center.css'
import './mobile-browser.css'
import './responsive-fixes.css'
import './xray-nav.css'

class AppBoundary extends React.Component{
  constructor(props){super(props);this.state={error:null}}
  static getDerivedStateFromError(error){return{error}}
  componentDidCatch(error,info){console.error('Dealer Pulse render failure',error,info)}
  render(){if(!this.state.error)return this.props.children;return <main style={{minHeight:'100vh',padding:'28px',fontFamily:'Inter,Arial,sans-serif',background:'#f4f5f6',color:'#111318'}}><section style={{maxWidth:560,margin:'10vh auto',background:'#fff',border:'1px solid #e5e7ea',borderRadius:24,padding:24}}><p style={{fontSize:11,fontWeight:800,letterSpacing:'.12em',color:'#007BFF'}}>BYBO / DEALER PULSE</p><h1 style={{fontSize:28,margin:'8px 0'}}>The app hit a display error.</h1><p style={{color:'#70767e',lineHeight:1.5}}>Reload once. If it repeats, send this screen and I can trace the exact client failure instead of leaving you on a blank page.</p><button onClick={()=>window.location.reload()} style={{marginTop:12,border:0,borderRadius:999,padding:'12px 18px',background:'#111318',color:'#fff',fontWeight:700}}>Reload app</button><details style={{marginTop:18,color:'#8b9198',fontSize:11}}><summary>Technical detail</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{String(this.state.error?.message||this.state.error)}</pre></details></section></main>}
}

createRoot(document.getElementById('root')).render(<AppBoundary><ScrapeItApp/></AppBoundary>)
