import { useState, useCallback } from "react"
import { AreaChart, Area, BarChart, Bar, ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts"

// ── Dark palette ─────────────────────────────────────────
const C = { bg:'#131722',card:'#1e222d',card2:'#252932',border:'#2a2e39',text:'#d1d4dc',muted:'#787b86',green:'#26a69a',red:'#ef5350',blue:'#2962ff',amber:'#ffb74d',purple:'#ab47bc' }

// ── Utils ─────────────────────────────────────────────────
const n = v => { const f=parseFloat(String(v||'').replace(/,/g,'')); return isNaN(f)?null:f }
const fmtCr = v => { if(!v)return'N/A'; const num=typeof v==='string'?parseFloat(v.replace(/,/g,'')):v; if(isNaN(num))return String(v); if(num>=1e5)return'₹'+(num/1e5).toFixed(2)+'L Cr'; if(num>=1000)return'₹'+(num/1000).toFixed(1)+'K Cr'; return'₹'+Math.round(num).toLocaleString('en-IN')+' Cr' }
const clr = v => { const num=parseFloat(String(v||'').replace(/[^-0-9.]/g,'')); return isNaN(num)?C.text:num>=0?C.green:C.red }
const pct = v => { if(!v&&v!==0)return''; const num=parseFloat(String(v).replace(/,/g,'')); return isNaN(num)?'':(num>=0?'+':'')+num.toFixed(1)+'%' }
const sentiment = t => { const s=t.toLowerCase(); const pos=['profit','growth','record','beats','raises','strong','surge','rally','upgrade','buy','wins','rises','jumps','gains','expands','launches','dividend','bonus','buyback']; const neg=['loss','decline','falls','drops','miss','weak','cut','concern','risk','sell','downgrade','slump','crash','debt','fraud','penalty','probe','default','warning']; return pos.filter(w=>s.includes(w)).length>neg.filter(w=>s.includes(w)).length?'positive':neg.filter(w=>s.includes(w)).length>pos.filter(w=>s.includes(w)).length?'negative':'neutral' }

// ── Technical ─────────────────────────────────────────────
function calcRSI(c,p=14){if(c.length<p+1)return null;let g=0,l=0;for(let i=1;i<=p;i++){const d=c[i]-c[i-1];d>0?g+=d:l-=d}let ag=g/p,al=l/p;for(let i=p+1;i<c.length;i++){const d=c[i]-c[i-1];ag=(ag*(p-1)+Math.max(d,0))/p;al=(al*(p-1)+Math.max(-d,0))/p}return al===0?100:Math.round(100-100/(1+ag/al))}
function calcEMA(d,p){const k=2/(p+1);let e=d[0];const r=[e];for(let i=1;i<d.length;i++){e=d[i]*k+e*(1-k);r.push(e)}return r}
function calcSMA(d,p){if(d.length<p)return null;return d.slice(-p).reduce((a,b)=>a+b,0)/p}

// ── Ratings (with clear methodology) ─────────────────────
const FUND_CRITERIA = [
  { key:'ROE',label:'Return on Equity (ROE)',good:20,ok:12,max:30,unit:'%',desc:'Higher ROE = company earns more profit per ₹ of shareholder equity. Above 20% is excellent.' },
  { key:'ROCE',label:'Return on Capital Employed',good:20,ok:12,max:30,unit:'%',desc:'Shows how efficiently company uses its total capital. Above 20% = very good business.' },
  { key:'DE',label:'Debt to Equity (D/E)',good:0.3,ok:0.8,max:2,unit:'x',inverse:true,desc:'Lower is better. Below 0.5 = very safe. Above 2 = high debt risk.' },
  { key:'MARGIN',label:'Net Profit Margin',good:15,ok:8,max:30,unit:'%',desc:'What % of revenue becomes profit. Above 15% is excellent.' },
  { key:'SALES_G',label:'Revenue Growth (multi-year)',good:15,ok:8,max:30,unit:'%',desc:'Consistent revenue growth shows strong business momentum.' },
  { key:'PROFIT_G',label:'Profit Growth (multi-year)',good:15,ok:8,max:30,unit:'%',desc:'Profit growing faster than sales = improving efficiency.' },
]

function calcFundScore(ratios, annual) {
  const roe=n(ratios['ROE']), roce=n(ratios['ROCE']), de=n(ratios['Debt to equity'])
  const salesRow=annual?.rows?.find(r=>r.label.toLowerCase().includes('sales'))
  const profRow=annual?.rows?.find(r=>r.label==='Net Profit')
  const opmRow=annual?.rows?.find(r=>r.label.includes('OPM'))
  const salesG=n(salesRow?.growth), profG=n(profRow?.growth)
  const opmVals=opmRow?.values?.map(v=>n(v)).filter(x=>x!==null)
  const avgOPM=opmVals?.length?(opmVals.reduce((a,b)=>a+b,0)/opmVals.length):null

  let score=0,total=0
  const add=(val,good,ok,max,inverse=false)=>{
    if(val===null)return; total+=25
    const pctVal=inverse?Math.max(0,100-Math.min(100,(val/max)*100)):Math.min(100,(val/good)*100)
    score+=val>=good?(25):val>=ok?(18):(Math.max(5,Math.round(pctVal/4)))
  }
  add(roe,20,12,40); add(roce,20,12,40); add(de,0.3,0.8,3,true)
  add(salesG,15,8,30); add(profG,15,8,30)
  if(avgOPM!==null){total+=25;score+=avgOPM>=20?25:avgOPM>=12?18:avgOPM>=8?12:6}
  return total>0?Math.min(100,Math.round((score/total)*100)):50
}

function calcValScore(ratios){
  const pe=n(ratios['Stock P/E']||ratios['P/E'])
  if(pe===null)return 50
  if(pe<8)return 92;if(pe<12)return 82;if(pe<18)return 68;if(pe<25)return 54;if(pe<35)return 40;if(pe<50)return 26;return 14
}

function calcTechScore(tech){
  if(!tech)return 50;let s=0
  if(tech.rsi<70&&tech.rsi>30)s+=15
  if(tech.cur>tech.sma20)s+=20;if(tech.cur>tech.sma50)s+=20;if(tech.cur>tech.sma200)s+=25
  if(tech.macdBull)s+=15;if(tech.mom)s+=5
  return Math.min(100,s)
}

function calcGrowthScore(annual){
  const sr=annual?.rows?.find(r=>r.label.toLowerCase().includes('sales'))
  const g=n(sr?.growth)
  if(g===null)return 50
  if(g>25)return 92;if(g>20)return 80;if(g>15)return 68;if(g>10)return 56;if(g>5)return 44;if(g>0)return 32;return 18
}

const scoreLabel=s=>s>=75?['Strong',C.green]:s>=55?['Good','#64b5f6']:s>=40?['Neutral',C.amber]:['Weak',C.red]

// ── UI ────────────────────────────────────────────────────
const Chip=({type,children,sm})=>{const m={positive:[C.green+'22',C.green],negative:[C.red+'22',C.red],neutral:[C.amber+'22',C.amber],buy:[C.green+'22',C.green],sell:[C.red+'22',C.red],hold:[C.amber+'22',C.amber],info:[C.blue+'22',C.blue]};const[bg,fg]=m[type]||[C.card2,C.muted];return<span style={{background:bg,color:fg,padding:sm?'1px 6px':'2px 9px',borderRadius:4,fontSize:sm?10:11,fontWeight:600}}>{children}</span>}

const Gauge=({label,score})=>{const[lbl,gc]=scoreLabel(score);const r=36,circ=2*Math.PI*r,filled=(score/100)*circ;return(<div style={{textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',gap:6}}><svg width="88" height="88" viewBox="0 0 90 90"><circle cx="45" cy="45" r={r} fill="none" stroke={C.border} strokeWidth="7"/><circle cx="45" cy="45" r={r} fill="none" stroke={gc} strokeWidth="7" strokeDasharray={`${filled} ${circ}`} strokeLinecap="round" transform="rotate(-90 45 45)"/><text x="45" y="51" textAnchor="middle" fill={C.text} fontSize="18" fontWeight="700">{score}</text></svg><div style={{fontSize:12,color:C.muted}}>{label}</div><Chip type={lbl.toLowerCase()}>{lbl}</Chip></div>)}

const RBar=({label,value,max=100,sub})=>{const p=Math.min(100,Math.max(0,(value/max)*100)),gc=p>=65?C.green:p>=40?C.amber:C.red;return(<div style={{marginBottom:10}}><div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:C.muted,marginBottom:3}}><span>{label}</span><span style={{color:gc,fontWeight:600}}>{value.toFixed(1)}{sub||''}</span></div><div style={{height:5,background:C.border,borderRadius:3}}><div style={{height:'100%',width:p+'%',background:gc,borderRadius:3,transition:'width 0.6s'}}/></div></div>)}

const Card=({children,style={}})=><div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:'16px',marginBottom:14,...style}}>{children}</div>
const SL=({children})=><div style={{fontSize:11,fontWeight:600,color:C.muted,textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:12}}>{children}</div>

const TABS=['Overview','P & L','Balance Sheet','Cash Flow','Peers','Technical','News']
const POPULAR=['RELIANCE','TCS','HDFCBANK','INFY','WIPRO','TATAMOTORS','ITC','BAJFINANCE','SBIN','ADANIENT','ICICIBANK','AXISBANK','KOTAKBANK','LT','SUNPHARMA','MARUTI','HINDUNILVR','ASIANPAINT','ULTRACEMCO','TITAN']

export default function App(){
  const[query,setQuery]=useState('')
  const[tab,setTab]=useState(0)
  const[loading,setLoading]=useState(false)
  const[msg,setMsg]=useState('')
  const[error,setError]=useState('')
  const[scr,setScr]=useState(null)
  const[nseData,setNseData]=useState(null)
  const[yah,setYah]=useState(null)
  const[chartData,setChartData]=useState(null)
  const[news,setNews]=useState([])
  const[tech,setTech]=useState(null)
  const[sym,setSym]=useState('')
  const[finPeriod,setFinPeriod]=useState('quarterly')
  const[showRatingDetail,setShowRatingDetail]=useState(false)
  const[watchlist,setWatchlist]=useState(()=>{try{return JSON.parse(localStorage.getItem('wl')||'[]')}catch{return[]}})

  const saveWL=wl=>{setWatchlist(wl);try{localStorage.setItem('wl',JSON.stringify(wl))}catch{}}
  const toggleWatch=s=>{const wl=watchlist.includes(s)?watchlist.filter(x=>x!==s):[...watchlist,s];saveWL(wl)}

  const doFetch=useCallback(async symbol=>{
    setLoading(true);setError('');setScr(null);setNseData(null);setYah(null);setChartData(null);setNews([]);setTech(null);setTab(0)
    try{
      setMsg('Fetching Screener.in fundamentals...')
      const[sRes,yRes,cRes]=await Promise.all([
        fetch(`/api/screener?symbol=${symbol}`),
        fetch(`/api/stock?symbol=${symbol}.NS`),
        fetch(`/api/stock?symbol=${symbol}.NS&type=chart`),
      ])
      setMsg('Fetching NSE company data & news...')
      const[sJ,yJ,cJ]=await Promise.all([sRes.json(),yRes.json(),cRes.json()])
      if(sJ.error)throw new Error(sJ.error)
      setScr(sJ)
      if(!yJ.error)setYah(yJ.quoteSummary?.result?.[0])

      // Fetch NSE data + India news in parallel
      const companyName=sJ.name||symbol
      const[nseRes,newsRes]=await Promise.all([
        fetch(`/api/nse?symbol=${symbol}`).catch(()=>({json:()=>({})})),
        fetch(`/api/news?symbol=${symbol}&company=${encodeURIComponent(companyName)}`).catch(()=>({json:()=>({news:[]})})),
      ])
      const[nseJ,newsJ]=await Promise.all([nseRes.json().catch(()=>({})),newsRes.json().catch(()=>({news:[]}))])
      setNseData(nseJ)
      setNews(newsJ.news||[])

      // Chart + technicals
      const cr=cJ.chart?.result?.[0]
      if(cr){
        const closes=cr.indicators.quote[0].close,ts=cr.timestamp,vols=cr.indicators.quote[0].volume
        const valid=ts.map((t,i)=>({t,c:closes[i],v:vols[i]})).filter(d=>d.c!=null)
        const step=Math.max(1,Math.floor(valid.length/80))
        setChartData(valid.filter((_,i)=>i%step===0).map(d=>({
          date:new Date(d.t*1000).toLocaleDateString('en-IN',{month:'short',day:'numeric'}),
          price:Math.round(d.c*100)/100,vol:d.v||0
        })))
        const cl=valid.map(d=>d.c)
        const sma20=calcSMA(cl,20),sma50=calcSMA(cl,50),sma200=calcSMA(cl,200)
        const e12=calcEMA(cl,12),e26=calcEMA(cl,26)
        const macd=e12.map((v,i)=>v-e26[i]),sig=calcEMA(macd,9)
        const cur=cl[cl.length-1]
        const per=20,smaArr=cl.slice(-per),mean=smaArr.reduce((a,b)=>a+b,0)/per
        const std=Math.sqrt(smaArr.map(x=>(x-mean)**2).reduce((a,b)=>a+b,0)/per)
        setTech({rsi:calcRSI(cl),cur:Math.round(cur),sma20:Math.round(sma20||0),sma50:Math.round(sma50||0),sma200:Math.round(sma200||0),macdBull:macd[macd.length-1]>sig[sig.length-1],macdV:macd[macd.length-1]?.toFixed(2),sigV:sig[sig.length-1]?.toFixed(2),bbUpper:Math.round(mean+2*std),bbLower:Math.round(mean-2*std),mom:cl[cl.length-1]>cl[cl.length-2],chg1M:((cur-cl[Math.max(0,cl.length-22)])/cl[Math.max(0,cl.length-22)]*100).toFixed(1),chg3M:((cur-cl[Math.max(0,cl.length-65)])/cl[Math.max(0,cl.length-65)]*100).toFixed(1),chg1Y:((cur-cl[0])/cl[0]*100).toFixed(1)})
      }
    }catch(e){setError(e.message)}finally{setLoading(false);setMsg('')}
  },[])

  const search=s=>{const symbol=(s||query).trim().toUpperCase().replace(/\.(NS|BO)$/,'');if(!symbol)return;setSym(symbol);doFetch(symbol)}

  const price=yah?.price
  const ratios=scr?.ratios||{}
  const changePos=(price?.regularMarketChange?.raw||0)>=0
  const curPrice=price?.regularMarketPrice?.raw||n(ratios['Current Price'])||0
  const hi52=n(ratios['High / Low']?.split(' / ')?.[0])||0
  const lo52=n(ratios['High / Low']?.split(' / ')?.[1])||0
  const rangePct=hi52>lo52?((curPrice-lo52)/(hi52-lo52)*100):50

  const fScore=scr?calcFundScore(ratios,scr.annual):0
  const vScore=calcValScore(ratios)
  const tScore=calcTechScore(tech)
  const gScore=growthScore(scr?.annual)

  function growthScore(annual){const sr=annual?.rows?.find(r=>r.label.toLowerCase().includes('sales'));const g=n(sr?.growth);if(g===null)return 50;if(g>25)return 92;if(g>20)return 80;if(g>15)return 68;if(g>10)return 56;if(g>5)return 44;return 32}

  // Annual chart data
  const annualChart=()=>{
    if(!scr?.annual?.rows?.length)return[]
    const sales=scr.annual.rows.find(r=>r.label.toLowerCase().includes('sales'))
    const profit=scr.annual.rows.find(r=>r.label==='Net Profit')
    const opm=scr.annual.rows.find(r=>r.label.includes('OPM'))
    if(!sales)return[]
    return scr.annual.headers.slice(-8).map((h,i)=>({
      year:h,
      Sales:Math.round(n(sales.values[sales.values.length-8+i])||0),
      Profit:Math.round(n(profit?.values[profit?.values.length-8+i])||0),
      OPM:n(opm?.values[opm?.values.length-8+i])||0,
    })).filter(d=>d.Sales>0)
  }
  const aChart=annualChart()

  // Company info from NSE
  const compInfo=nseData?.info||nseData?.metadata||{}
  const nseQuote=nseData?.priceInfo||nseData?.currentMarketPrice||{}
  const industry=nseData?.industryInfo||{}

  return(
    <div style={{fontFamily:"'Inter',-apple-system,sans-serif",background:C.bg,minHeight:'100vh',color:C.text}}>

      {/* Topbar */}
      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:'10px 20px',display:'flex',gap:10,alignItems:'center',position:'sticky',top:0,zIndex:100}}>
        <span style={{fontWeight:700,fontSize:16,color:C.blue,marginRight:4,whiteSpace:'nowrap'}}>NSE Pro</span>
        <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&search()}
          placeholder="Search — RELIANCE, TCS, INFY, HDFCBANK..."
          style={{flex:1,padding:'8px 14px',fontSize:13,borderRadius:6,border:`1px solid ${C.border}`,background:C.bg,color:C.text,outline:'none',maxWidth:380}}/>
        <button onClick={()=>search()} style={{padding:'8px 18px',fontSize:13,borderRadius:6,border:'none',background:C.blue,color:'#fff',cursor:'pointer',fontWeight:600}}>Search</button>
        {sym&&<button onClick={()=>toggleWatch(sym)} style={{padding:'8px 12px',fontSize:13,borderRadius:6,border:`1px solid ${C.border}`,background:watchlist.includes(sym)?C.amber+'22':'transparent',color:watchlist.includes(sym)?C.amber:C.muted,cursor:'pointer'}}>{watchlist.includes(sym)?'★':'☆'}</button>}
      </div>

      <div style={{maxWidth:1120,margin:'0 auto',padding:'16px 16px 60px'}}>

        {/* Watchlist */}
        {watchlist.length>0&&!scr&&!loading&&(
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:8,textTransform:'uppercase',letterSpacing:1}}>Watchlist</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{watchlist.map(s=><button key={s} onClick={()=>{setQuery(s);search(s)}} style={{padding:'5px 14px',fontSize:12,borderRadius:20,border:`1px solid ${C.amber}44`,background:C.amber+'11',cursor:'pointer',color:C.amber,fontWeight:600}}>{s}</button>)}</div>
          </div>
        )}

        {/* Popular */}
        {!scr&&!loading&&(
          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:8,textTransform:'uppercase',letterSpacing:1}}>Popular stocks</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{POPULAR.map(s=><button key={s} onClick={()=>{setQuery(s);search(s)}} style={{padding:'5px 14px',fontSize:12,borderRadius:20,border:`1px solid ${C.border}`,background:C.card,cursor:'pointer',color:C.muted}}>{s}</button>)}</div>
            <div style={{marginTop:12,padding:14,background:C.card,borderRadius:8,border:`1px solid ${C.border}`,fontSize:12,color:C.muted}}>💡 Data: <b style={{color:C.text}}>Screener.in</b> (fundamentals) + <b style={{color:C.text}}>NSE India</b> (company info) + <b style={{color:C.text}}>Google News India</b> (stock news)</div>
          </div>
        )}

        {loading&&<div style={{textAlign:'center',padding:'4rem',color:C.muted}}><div style={{fontSize:28,marginBottom:12}}>⏳</div><div style={{fontSize:14,color:C.text}}>{msg}</div></div>}

        {error&&<div style={{padding:16,background:C.red+'18',border:`1px solid ${C.red}44`,borderRadius:8,color:C.red,fontSize:13,marginBottom:16,lineHeight:1.6}}><b>⚠ {error}</b><div style={{marginTop:6,fontSize:12,color:C.muted}}>Use exact Screener.in symbol · RELIANCE · HDFCBANK · TATAMOTORS</div><button onClick={()=>doFetch(sym)} style={{marginTop:10,padding:'6px 14px',fontSize:12,borderRadius:6,border:`1px solid ${C.red}`,background:'transparent',color:C.red,cursor:'pointer'}}>Retry ↺</button></div>}

        {scr&&!loading&&(<>

          {/* Header */}
          <Card>
            <div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:12,marginBottom:12}}>
              <div>
                <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                  <span style={{fontSize:22,fontWeight:700}}>{scr.name||sym}</span>
                  <span style={{fontSize:11,padding:'2px 8px',border:`1px solid ${C.border}`,borderRadius:4,color:C.muted}}>NSE: {sym}</span>
                  {scr.isConsolidated&&<Chip type="info">Consolidated</Chip>}
                </div>
                {/* Company info from NSE */}
                <div style={{fontSize:12,color:C.muted,marginTop:4}}>
                  {industry.industry&&<span>{industry.industry}</span>}
                  {compInfo.isin&&<span style={{marginLeft:8}}>ISIN: {compInfo.isin}</span>}
                </div>
                <div style={{fontSize:12,color:C.muted,marginTop:2}}>
                  {ratios['Market Cap']&&`Mkt Cap: ${ratios['Market Cap']}`}
                  {ratios['ROCE']&&` · ROCE: ${ratios['ROCE']}`}
                  {ratios['ROE']&&` · ROE: ${ratios['ROE']}`}
                </div>
              </div>
              <div style={{textAlign:'right'}}>
                {curPrice>0&&<div style={{fontSize:28,fontWeight:700}}>₹{curPrice.toLocaleString('en-IN',{maximumFractionDigits:2})}</div>}
                {price&&<div style={{fontSize:13,color:changePos?C.green:C.red}}>{changePos?'▲':'▼'} {Math.abs(price.regularMarketChange?.raw||0).toFixed(2)} ({Math.abs((price.regularMarketChangePercent?.raw||0)*100).toFixed(2)}%)</div>}
              </div>
            </div>

            {/* 52W range */}
            {hi52>0&&lo52>0&&(
              <div style={{marginBottom:14}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:C.muted,marginBottom:5}}>
                  <span>52W Low ₹{lo52.toLocaleString('en-IN')}</span>
                  <span style={{fontWeight:600,color:C.text}}>Current ₹{curPrice.toLocaleString('en-IN')}</span>
                  <span>52W High ₹{hi52.toLocaleString('en-IN')}</span>
                </div>
                <div style={{position:'relative',height:8,background:C.border,borderRadius:4}}>
                  <div style={{position:'absolute',left:0,height:'100%',width:Math.max(2,Math.min(100,rangePct))+'%',background:`linear-gradient(90deg,${C.red},${C.amber},${C.green})`,borderRadius:4}}/>
                  <div style={{position:'absolute',left:`calc(${Math.max(1,Math.min(97,rangePct))}% - 7px)`,top:-5,width:18,height:18,borderRadius:'50%',background:C.blue,border:`2px solid #fff`}}/>
                </div>
                <div style={{fontSize:11,color:C.muted,marginTop:4,textAlign:'center'}}>At {rangePct.toFixed(0)}% of 52-week range</div>
              </div>
            )}

            {/* Ratio pills */}
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {[['P/E',ratios['Stock P/E']],['Book Value',ratios['Book Value']],['Div Yield',ratios['Dividend Yield']],['Face Value',ratios['Face Value']],['ROCE',ratios['ROCE']],['ROE',ratios['ROE']]].filter(([,v])=>v).map(([l,v])=>(
                <div key={l} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,padding:'6px 12px'}}>
                  <div style={{fontSize:10,color:C.muted}}>{l}</div>
                  <div style={{fontSize:13,fontWeight:600}}>{v}</div>
                </div>
              ))}
            </div>

            {/* Company description from NSE */}
            {scr.about&&(
              <div style={{marginTop:14,padding:12,background:C.bg,borderRadius:8,fontSize:13,color:C.muted,lineHeight:1.7,borderLeft:`3px solid ${C.blue}`}}>
                {scr.about.slice(0,400)}{scr.about.length>400?'...':''}
              </div>
            )}
          </Card>

          {/* Tabs */}
          <div style={{display:'flex',borderBottom:`1px solid ${C.border}`,marginBottom:14,overflowX:'auto',scrollbarWidth:'none'}}>
            {TABS.map((t,i)=><button key={t} onClick={()=>setTab(i)} style={{padding:'10px 18px',fontSize:13,border:'none',background:'none',cursor:'pointer',color:tab===i?C.blue:C.muted,borderBottom:tab===i?`2px solid ${C.blue}`:'2px solid transparent',fontWeight:tab===i?600:400,whiteSpace:'nowrap',flexShrink:0}}>{t}</button>)}
          </div>

          {/* ══ OVERVIEW ══ */}
          {tab===0&&(
            <div>
              {/* Ratings with methodology toggle */}
              <Card>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                  <SL>Stock ratings</SL>
                  <button onClick={()=>setShowRatingDetail(!showRatingDetail)} style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',color:C.muted,cursor:'pointer'}}>
                    {showRatingDetail?'Hide':'How is this calculated?'}
                  </button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,marginBottom:showRatingDetail?20:0}}>
                  <Gauge label="Fundamental" score={fScore}/>
                  <Gauge label="Valuation" score={vScore}/>
                  <Gauge label="Technical" score={tScore}/>
                  <Gauge label="Growth" score={gScore}/>
                </div>

                {showRatingDetail&&(
                  <div style={{borderTop:`1px solid ${C.border}`,paddingTop:16,marginTop:4}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:600,color:C.blue,marginBottom:10}}>Fundamental score — based on:</div>
                        {FUND_CRITERIA.map(c=>(
                          <div key={c.key} style={{marginBottom:8,padding:'8px 10px',background:C.bg,borderRadius:6}}>
                            <div style={{fontSize:12,fontWeight:500}}>{c.label}</div>
                            <div style={{fontSize:11,color:C.muted,marginTop:2}}>{c.desc}</div>
                            <div style={{fontSize:11,color:C.amber,marginTop:2}}>Good: {c.good}{c.unit} · Threshold: {c.ok}{c.unit}</div>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{fontSize:12,fontWeight:600,color:C.blue,marginBottom:10}}>Other scores:</div>
                        {[['Valuation score','Based on P/E ratio vs standard benchmarks. P/E < 12 = cheap (high score), P/E > 50 = very expensive (low score). Compares stock\'s price to its earnings.'],['Technical score','Based on 6 indicators: RSI position (30-70 zone), price vs SMA 20, SMA 50, SMA 200, MACD signal, day momentum. Each indicator contributes points.'],['Growth score','Based on multi-year compounded revenue (Sales) growth from Screener.in P&L data. > 25% CAGR = excellent, > 10% = good, < 0% = poor.']].map(([l,d])=>(
                          <div key={l} style={{marginBottom:8,padding:'8px 10px',background:C.bg,borderRadius:6}}>
                            <div style={{fontSize:12,fontWeight:500}}>{l}</div>
                            <div style={{fontSize:11,color:C.muted,marginTop:2,lineHeight:1.5}}>{d}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </Card>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                <Card>
                  <SL>Fundamental breakdown</SL>
                  <RBar label="Return on Equity (ROE)" value={Math.min(30,n(ratios['ROE'])||0)} max={30} sub="%"/>
                  <RBar label="Return on Capital (ROCE)" value={Math.min(30,n(ratios['ROCE'])||0)} max={30} sub="%"/>
                  <RBar label="Debt safety (lower = better)" value={Math.max(0,2-(n(ratios['Debt to equity'])||2))} max={2}/>
                  {scr.annual?.rows?.find(r=>r.label.toLowerCase().includes('sales'))?.growth&&(
                    <RBar label={`Revenue growth (${scr.annual.headers[0]}–${scr.annual.headers[scr.annual.headers.length-1]})`} value={Math.min(30,Math.max(0,n(scr.annual.rows.find(r=>r.label.toLowerCase().includes('sales')).growth)||0))} max={30} sub="%"/>
                  )}
                  {scr.annual?.rows?.find(r=>r.label==='Net Profit')?.growth&&(
                    <RBar label="Net profit growth (multi-year)" value={Math.min(30,Math.max(0,n(scr.annual.rows.find(r=>r.label==='Net Profit').growth)||0))} max={30} sub="%"/>
                  )}
                </Card>
                <Card>
                  <SL>All key ratios</SL>
                  {Object.entries(ratios).map(([k,v])=>(
                    <div key={k} style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'6px 0',borderBottom:`1px solid ${C.border}22`}}>
                      <span style={{color:C.muted}}>{k}</span><span style={{fontWeight:500}}>{v}</span>
                    </div>
                  ))}
                </Card>
              </div>

              {/* Revenue + Profit chart */}
              {aChart.length>1&&(
                <Card>
                  <SL>Revenue & profit trend</SL>
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={aChart}>
                      <XAxis dataKey="year" tick={{fontSize:11,fill:C.muted}} tickLine={false} axisLine={false}/>
                      <YAxis yAxisId="l" tick={{fontSize:10,fill:C.muted}} tickLine={false} axisLine={false} width={60} tickFormatter={v=>v>=1000?(v/1000).toFixed(0)+'K':v}/>
                      <YAxis yAxisId="r" orientation="right" tick={{fontSize:10,fill:C.muted}} tickLine={false} axisLine={false} width={36} tickFormatter={v=>v+'%'}/>
                      <Tooltip contentStyle={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:6,fontSize:12}} labelStyle={{color:C.muted}}/>
                      <Bar yAxisId="l" dataKey="Sales" fill={C.blue+'99'} radius={[3,3,0,0]} name="Sales (Cr)"/>
                      <Bar yAxisId="l" dataKey="Profit" fill={C.green+'99'} radius={[3,3,0,0]} name="Profit (Cr)"/>
                      <Line yAxisId="r" type="monotone" dataKey="OPM" stroke={C.amber} strokeWidth={2} dot={{fill:C.amber,r:3}} name="OPM %"/>
                    </ComposedChart>
                  </ResponsiveContainer>
                  <div style={{display:'flex',gap:20,marginTop:8,fontSize:11,color:C.muted}}>
                    {[['Sales',C.blue+'99'],['Profit',C.green+'99'],['OPM %',C.amber]].map(([l,gc])=><span key={l} style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:10,height:10,background:gc,borderRadius:2,display:'inline-block'}}/>{l}</span>)}
                  </div>
                </Card>
              )}

              {/* Price chart */}
              {chartData&&(
                <Card>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                    <SL>Price chart — 1 year</SL>
                    {tech&&<div style={{display:'flex',gap:16,fontSize:12}}>
                      {[['1M',tech.chg1M],['3M',tech.chg3M],['1Y',tech.chg1Y]].map(([l,v])=><span key={l}><span style={{color:C.muted}}>{l}: </span><span style={{color:clr(v),fontWeight:600}}>{pct(v)}</span></span>)}
                    </div>}
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={chartData}>
                      <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.blue} stopOpacity={0.25}/><stop offset="95%" stopColor={C.blue} stopOpacity={0}/></linearGradient></defs>
                      <XAxis dataKey="date" tick={{fontSize:10,fill:C.muted}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
                      <YAxis tick={{fontSize:10,fill:C.muted}} tickLine={false} axisLine={false} width={72} domain={['auto','auto']} tickFormatter={v=>'₹'+v.toLocaleString('en-IN')}/>
                      <Tooltip contentStyle={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:6,fontSize:12}} formatter={v=>['₹'+v.toLocaleString('en-IN'),'Price']} labelStyle={{color:C.muted}}/>
                      {tech&&<ReferenceLine y={tech.sma200} stroke={C.amber} strokeDasharray="4 4" strokeWidth={1}/>}
                      <Area type="monotone" dataKey="price" stroke={C.blue} strokeWidth={2} fill="url(#pg)" dot={false}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Shareholding */}
              {scr.shareholding&&Object.keys(scr.shareholding).length>0&&(
                <Card>
                  <SL>Shareholding (latest quarter)</SL>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:14}}>
                    {Object.entries(scr.shareholding).slice(0,6).map(([k,v])=>{
                      const num=parseFloat(v)||0
                      return(
                        <div key={k} style={{background:C.bg,borderRadius:8,padding:'12px',border:`1px solid ${C.border}`}}>
                          <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{k}</div>
                          <div style={{fontSize:20,fontWeight:700}}>{v}</div>
                          <div style={{height:4,background:C.border,borderRadius:2,marginTop:6}}><div style={{height:'100%',width:Math.min(100,num)+'%',background:k.toLowerCase().includes('promoter')?C.blue:k.toLowerCase().includes('fii')?C.green:C.amber,borderRadius:2}}/></div>
                        </div>
                      )
                    })}
                  </div>
                  {scr.shareholdingTrend?.rows?.length>0&&(
                    <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',minWidth:400,fontSize:12}}>
                        <thead><tr>{['Category',...(scr.shareholdingTrend.headers.slice(-6))].map((h,i)=><th key={i} style={{padding:'6px 10px',color:C.muted,fontWeight:500,textAlign:i===0?'left':'right',borderBottom:`1px solid ${C.border}`}}>{h}</th>)}</tr></thead>
                        <tbody>{scr.shareholdingTrend.rows.map((row,i)=>(
                          <tr key={i}>
                            <td style={{padding:'6px 10px',color:C.text,fontWeight:500,borderBottom:`1px solid ${C.border}22`}}>{row.label}</td>
                            {row.values.slice(-6).map((v,j)=><td key={j} style={{padding:'6px 10px',textAlign:'right',color:C.text,borderBottom:`1px solid ${C.border}22`}}>{v}</td>)}
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </Card>
              )}
            </div>
          )}

          {/* ══ P & L ══ */}
          {tab===1&&(
            <div>
              <div style={{display:'flex',gap:0,marginBottom:14,border:`1px solid ${C.border}`,borderRadius:6,overflow:'hidden',width:'fit-content'}}>
                {['quarterly','annual'].map(m=><button key={m} onClick={()=>setFinPeriod(m)} style={{padding:'8px 20px',fontSize:13,border:'none',background:finPeriod===m?C.blue:'transparent',color:finPeriod===m?'#fff':C.muted,cursor:'pointer',fontWeight:finPeriod===m?600:400,textTransform:'capitalize'}}>{m==='quarterly'?'Quarterly Results':'Annual P & L'}</button>)}
              </div>

              {(()=>{
                const data=finPeriod==='quarterly'?scr.quarterly:scr.annual
                if(!data?.rows?.length)return<div style={{color:C.muted,fontSize:13}}>No data available</div>
                const keyRows=['Sales','Revenue','Expenses','Operating Profit','OPM %','Other Income','Interest','Depreciation','Profit before tax','Tax %','Net Profit','EPS in Rs','EPS']
                const rows=data.rows.filter(r=>keyRows.some(k=>r.label.toLowerCase().includes(k.toLowerCase())))
                const showRows=rows.length>0?rows:data.rows.slice(0,14)
                const hdrs=data.headers.slice(-8)
                const isSales=r=>r.label.toLowerCase().includes('sales')||r.label.toLowerCase().includes('revenue')
                const isEPS=r=>r.label.toLowerCase().includes('eps')
                const isProfit=r=>r.label==='Net Profit'

                return(
                  <Card style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',minWidth:680}}>
                      <thead>
                        <tr>
                          <th style={{padding:'8px 10px',fontSize:11,color:C.muted,textAlign:'left',borderBottom:`1px solid ${C.border}`,width:150}}>₹ Cr</th>
                          {hdrs.map((h,i)=><th key={i} style={{padding:'8px 10px',fontSize:11,color:C.muted,textAlign:'right',borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap',minWidth:80}}>{h}</th>)}
                          {finPeriod==='annual'&&<th style={{padding:'8px 10px',fontSize:11,color:C.amber,textAlign:'right',borderBottom:`1px solid ${C.border}`}}>Growth</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {showRows.map((row,i)=>{
                          const showGrowth=finPeriod==='quarterly'&&(isSales(row)||isEPS(row))
                          const vals=row.values.slice(-8)
                          return(
                            <tr key={i} style={{background:isProfit(row)?C.green+'0f':i%2===0?'transparent':C.bg+'44'}}>
                              <td style={{padding:'7px 10px',fontSize:12,color:C.text,fontWeight:isProfit(row)?600:500,borderBottom:`1px solid ${C.border}11`,whiteSpace:'nowrap'}}>{row.label}</td>
                              {vals.map((v,j)=>{
                                const num=parseFloat(String(v).replace(/,/g,''))
                                const isNeg=!isNaN(num)&&num<0
                                const qoqVal=showGrowth&&row.qoq?row.qoq[row.values.length-8+j]:null
                                const yoyVal=showGrowth&&row.yoy?row.yoy[row.values.length-8+j]:null
                                return(
                                  <td key={j} style={{padding:'7px 10px',fontSize:12,textAlign:'right',color:isNeg?C.red:C.text,fontWeight:isProfit(row)?600:400,borderBottom:`1px solid ${C.border}11`,whiteSpace:'nowrap',verticalAlign:'top'}}>
                                    <div>{v}</div>
                                    {qoqVal!=null&&<div style={{fontSize:9,color:clr(qoqVal),marginTop:1}}>QoQ {pct(qoqVal)}</div>}
                                    {yoyVal!=null&&<div style={{fontSize:9,color:clr(yoyVal)}}>YoY {pct(yoyVal)}</div>}
                                  </td>
                                )
                              })}
                              {finPeriod==='annual'&&<td style={{padding:'7px 10px',fontSize:12,textAlign:'right',color:clr(row.growth),fontWeight:600,borderBottom:`1px solid ${C.border}11`}}>{row.growth?pct(row.growth):'—'}</td>}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    <div style={{fontSize:11,color:C.muted,marginTop:10}}>
                      Values in ₹ Crores · QoQ = Quarter on Quarter · YoY = Year on Year · Source: Screener.in
                      {finPeriod==='quarterly'&&<span> · QoQ/YoY shown for Sales & EPS only</span>}
                    </div>
                  </Card>
                )
              })()}

              {aChart.length>1&&finPeriod==='annual'&&(
                <Card>
                  <SL>Revenue vs Profit (Annual)</SL>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={aChart}>
                      <XAxis dataKey="year" tick={{fontSize:11,fill:C.muted}} tickLine={false} axisLine={false}/>
                      <YAxis tick={{fontSize:10,fill:C.muted}} tickLine={false} axisLine={false} width={60} tickFormatter={v=>v>=1000?(v/1000).toFixed(0)+'K':v}/>
                      <Tooltip contentStyle={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:6,fontSize:12}} labelStyle={{color:C.muted}}/>
                      <Bar dataKey="Sales" fill={C.blue+'aa'} radius={[3,3,0,0]} name="Sales (Cr)"/>
                      <Bar dataKey="Profit" fill={C.green+'aa'} radius={[3,3,0,0]} name="Profit (Cr)"/>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}
            </div>
          )}

          {/* ══ BALANCE SHEET ══ */}
          {tab===2&&(
            <div>
              {scr.balanceSheet?.rows?.length>0?(
                <>
                  <Card style={{overflowX:'auto'}}>
                    <SL>Balance sheet</SL>
                    <table style={{width:'100%',borderCollapse:'collapse',minWidth:500}}>
                      <thead><tr><th style={{padding:'8px 10px',fontSize:11,color:C.muted,textAlign:'left',borderBottom:`1px solid ${C.border}`}}>₹ Crores</th>{scr.balanceSheet.headers.slice(-6).map((h,i)=><th key={i} style={{padding:'8px 10px',fontSize:11,color:C.muted,textAlign:'right',borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
                      <tbody>{scr.balanceSheet.rows.map((row,i)=>{const isTot=row.label.toLowerCase().includes('total');return(<tr key={i} style={{background:isTot?C.blue+'0f':'transparent'}}><td style={{padding:'7px 10px',fontSize:12,color:C.text,fontWeight:isTot?600:500,borderBottom:`1px solid ${C.border}11`}}>{row.label}</td>{row.values.slice(-6).map((v,j)=><td key={j} style={{padding:'7px 10px',fontSize:12,textAlign:'right',color:C.text,fontWeight:isTot?600:400,borderBottom:`1px solid ${C.border}11`,whiteSpace:'nowrap'}}>{v}</td>)}</tr>)})}</tbody>
                    </table>
                  </Card>
                  {scr.ratiosTable?.rows?.length>0&&(
                    <Card style={{overflowX:'auto'}}>
                      <SL>Key financial ratios (yearly)</SL>
                      <table style={{width:'100%',borderCollapse:'collapse',minWidth:400}}>
                        <thead><tr><th style={{padding:'8px 10px',fontSize:11,color:C.muted,textAlign:'left',borderBottom:`1px solid ${C.border}`}}>Ratio</th>{scr.ratiosTable.headers.slice(-6).map((h,i)=><th key={i} style={{padding:'8px 10px',fontSize:11,color:C.muted,textAlign:'right',borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
                        <tbody>{scr.ratiosTable.rows.map((row,i)=><tr key={i}><td style={{padding:'7px 10px',fontSize:12,color:C.text,fontWeight:500,borderBottom:`1px solid ${C.border}11`}}>{row.label}</td>{row.values.slice(-6).map((v,j)=><td key={j} style={{padding:'7px 10px',fontSize:12,textAlign:'right',color:C.text,borderBottom:`1px solid ${C.border}11`,whiteSpace:'nowrap'}}>{v}</td>)}</tr>)}</tbody>
                      </table>
                    </Card>
                  )}
                </>
              ):<div style={{color:C.muted,fontSize:13,padding:20}}>Balance sheet not available</div>}
            </div>
          )}

          {/* ══ CASH FLOW ══ */}
          {tab===3&&(
            <div>
              {scr.cashFlow?.rows?.length>0?(
                <>
                  <Card style={{overflowX:'auto'}}>
                    <SL>Cash flow statement</SL>
                    <table style={{width:'100%',borderCollapse:'collapse',minWidth:500}}>
                      <thead><tr><th style={{padding:'8px 10px',fontSize:11,color:C.muted,textAlign:'left',borderBottom:`1px solid ${C.border}`}}>₹ Crores</th>{scr.cashFlow.headers.slice(-6).map((h,i)=><th key={i} style={{padding:'8px 10px',fontSize:11,color:C.muted,textAlign:'right',borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
                      <tbody>{scr.cashFlow.rows.map((row,i)=>{const isTot=row.label.toLowerCase().includes('net cash')||row.label.toLowerCase().includes('free cash');return(<tr key={i} style={{background:isTot?C.green+'0f':'transparent'}}><td style={{padding:'7px 10px',fontSize:12,color:C.text,fontWeight:isTot?600:500,borderBottom:`1px solid ${C.border}11`}}>{row.label}</td>{row.values.slice(-6).map((v,j)=>{const num=parseFloat(String(v).replace(/,/g,''));return(<td key={j} style={{padding:'7px 10px',fontSize:12,textAlign:'right',color:!isNaN(num)&&num<0?C.red:C.text,fontWeight:isTot?600:400,borderBottom:`1px solid ${C.border}11`,whiteSpace:'nowrap'}}>{v}</td>)})}  </tr>)})}</tbody>
                    </table>
                    <div style={{fontSize:11,color:C.muted,marginTop:10}}>Red = cash outflow · Source: Screener.in</div>
                  </Card>
                  <Card>
                    <SL>What each line means</SL>
                    {[['Operating Cash Flow','Cash from core business. Must be consistently positive. Most important line.'],['Investing Cash Flow','Cash spent on capex, acquisitions. Usually negative for growing companies.'],['Financing Cash Flow','Cash from debt raised or dividends/buybacks paid out.'],['Free Cash Flow (FCF)','Operating CF minus Capex. The #1 metric for long-term investors. Higher = better business quality.']].map(([l,d])=>(
                      <div key={l} style={{padding:'9px 0',borderBottom:`1px solid ${C.border}22`}}><div style={{fontSize:13,fontWeight:500}}>{l}</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>{d}</div></div>
                    ))}
                  </Card>
                </>
              ):<div style={{color:C.muted,fontSize:13,padding:20}}>Cash flow data not available</div>}
            </div>
          )}

          {/* ══ PEERS ══ */}
          {tab===4&&(
            <div>
              {scr.peers?.length>0?(
                <>
                  <Card style={{overflowX:'auto'}}>
                    <SL>Peer comparison · {scr.peers.length} companies</SL>
                    <table style={{width:'100%',borderCollapse:'collapse',minWidth:700}}>
                      <thead><tr>{scr.peerHeaders.map((h,i)=><th key={i} style={{padding:'8px 10px',fontSize:11,color:C.muted,textAlign:i===0?'left':'right',borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
                      <tbody>{scr.peers.map((peer,i)=>{
                        const name=(peer[scr.peerHeaders[0]]||'').toUpperCase()
                        const isCurr=name.includes(sym)||(scr.name&&name.includes(scr.name.split(' ')[0].toUpperCase().slice(0,5)))
                        return(<tr key={i} style={{background:isCurr?C.blue+'22':'transparent'}}>{scr.peerHeaders.map((h,j)=>{const v=peer[h]||'—';const num=j>0?parseFloat(String(v).replace(/,/g,'').replace('%','')):null;const isNeg=num!==null&&!isNaN(num)&&num<0;return(<td key={j} style={{padding:'8px 10px',fontSize:12,color:isNeg?C.red:C.text,fontWeight:isCurr&&j===0?700:400,textAlign:j===0?'left':'right',borderBottom:`1px solid ${C.border}22`,whiteSpace:'nowrap'}}>{v}</td>)})}</tr>)
                      })}</tbody>
                    </table>
                    <div style={{fontSize:11,color:C.muted,marginTop:10}}>Highlighted = {scr.name||sym} · Source: Screener.in</div>
                  </Card>
                  {/* P/E bar chart */}
                  {scr.peerHeaders.some(h=>h.includes('P/E'))&&(()=>{
                    const peKey=scr.peerHeaders.find(h=>h.includes('P/E'))
                    const peData=scr.peers.slice(0,12).map(p=>({name:(p[scr.peerHeaders[0]]||'').slice(0,14),pe:parseFloat(p[peKey])||0})).filter(d=>d.pe>0)
                    if(!peData.length)return null
                    return(
                      <Card>
                        <SL>P/E ratio comparison</SL>
                        <ResponsiveContainer width="100%" height={Math.max(200,peData.length*36+60)}>
                          <BarChart data={peData} layout="vertical" margin={{left:10}}>
                            <XAxis type="number" tick={{fontSize:10,fill:C.muted}} tickLine={false} axisLine={false}/>
                            <YAxis type="category" dataKey="name" tick={{fontSize:11,fill:C.muted}} tickLine={false} axisLine={false} width={110}/>
                            <Tooltip contentStyle={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:6,fontSize:12}} formatter={v=>[v+'x','P/E']}/>
                            <Bar dataKey="pe" radius={[0,3,3,0]} name="P/E">
                              {peData.map((d,i)=><Cell key={i} fill={d.name.toUpperCase().includes(sym.slice(0,5))?C.blue:C.muted+'88'}/>)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </Card>
                    )
                  })()}
                </>
              ):(
                <Card>
                  <div style={{fontSize:13,color:C.muted,lineHeight:1.8}}>
                    <p>No peer data found for <b style={{color:C.text}}>{sym}</b>.</p>
                    <p style={{marginTop:8}}>Screener.in may not list peers for this company. Check directly at: <a href={`https://www.screener.in/company/${sym}/`} target="_blank" rel="noreferrer" style={{color:C.blue}}>screener.in/company/{sym}/</a></p>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* ══ TECHNICAL ══ */}
          {tab===5&&(
            <div>
              {tech?(
                <>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:14}}>
                    {[
                      ['RSI (14)',tech.rsi,tech.rsi>70?'Overbought — consider caution':tech.rsi<30?'Oversold — potential bounce':tech.rsi>55?'Mildly bullish':'Neutral zone',tech.rsi>70?C.red:tech.rsi<30?C.green:C.amber],
                      ['MACD',tech.macdBull?'Bullish':'Bearish',`Line: ${tech.macdV} · Signal: ${tech.sigV}`,tech.macdBull?C.green:C.red],
                      ['Bollinger Bands',`₹${tech.bbLower.toLocaleString('en-IN')}–₹${tech.bbUpper.toLocaleString('en-IN')}`,tech.cur<tech.bbLower?'Below lower (oversold)':tech.cur>tech.bbUpper?'Above upper (overbought)':'Inside band',tech.cur<tech.bbLower?C.green:tech.cur>tech.bbUpper?C.red:C.amber],
                      ['SMA 20 (Short)',`₹${tech.sma20.toLocaleString('en-IN')}`,tech.cur>tech.sma20?'Price above — bullish short term':'Price below — caution',tech.cur>tech.sma20?C.green:C.red],
                      ['SMA 50 (Medium)',`₹${tech.sma50.toLocaleString('en-IN')}`,tech.cur>tech.sma50?'Price above — bullish medium term':'Price below — caution',tech.cur>tech.sma50?C.green:C.red],
                      ['SMA 200 (Long)',`₹${tech.sma200.toLocaleString('en-IN')}`,tech.cur>tech.sma200?'Price above — long-term uptrend':'Price below — long-term downtrend',tech.cur>tech.sma200?C.green:C.red],
                    ].map(([l,v,s,gc])=>(
                      <div key={l} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'14px'}}>
                        <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:'uppercase',letterSpacing:.4}}>{l}</div>
                        <div style={{fontSize:17,fontWeight:700,color:gc}}>{v}</div>
                        <div style={{fontSize:11,color:C.muted,marginTop:4,lineHeight:1.4}}>{s}</div>
                      </div>
                    ))}
                  </div>

                  <Card style={{marginBottom:14}}>
                    <SL>Signal summary</SL>
                    {[
                      ['RSI in healthy zone (30–70) — not overbought or oversold',tech.rsi>=30&&tech.rsi<=70],
                      ['Price above SMA 20 — positive short-term trend',tech.cur>tech.sma20],
                      ['Price above SMA 50 — positive medium-term trend',tech.cur>tech.sma50],
                      ['Price above SMA 200 — long-term uptrend (golden zone)',tech.cur>tech.sma200],
                      ['MACD line above signal line — bullish momentum',tech.macdBull],
                      ['Price inside Bollinger Bands — not stretched',tech.cur>=tech.bbLower&&tech.cur<=tech.bbUpper],
                      ['Day momentum positive',tech.mom],
                    ].map(([l,v])=>(
                      <div key={l} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${C.border}22`}}>
                        <span style={{fontSize:13,color:C.muted}}>{l}</span>
                        <Chip type={v?'buy':'sell'}>{v?'✓ Bullish':'✗ Caution'}</Chip>
                      </div>
                    ))}
                    <div style={{marginTop:14,padding:'12px 14px',background:C.bg,borderRadius:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div><div style={{fontSize:13,color:C.muted}}>Technical score</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>Based on RSI + 3 SMAs + MACD + Bollinger + momentum</div></div>
                      <div style={{display:'flex',alignItems:'center',gap:10}}><span style={{fontSize:22,fontWeight:700,color:scoreLabel(tScore)[1]}}>{tScore}/100</span><Chip type={tScore>=60?'buy':tScore>=40?'hold':'sell'}>{scoreLabel(tScore)[0]}</Chip></div>
                    </div>
                  </Card>

                  {chartData&&(
                    <Card style={{marginBottom:14}}>
                      <SL>Price with moving averages</SL>
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={chartData}>
                          <defs><linearGradient id="pg2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.text} stopOpacity={0.15}/><stop offset="95%" stopColor={C.text} stopOpacity={0}/></linearGradient></defs>
                          <XAxis dataKey="date" tick={{fontSize:10,fill:C.muted}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
                          <YAxis tick={{fontSize:10,fill:C.muted}} tickLine={false} axisLine={false} width={72} domain={['auto','auto']} tickFormatter={v=>'₹'+v.toLocaleString('en-IN')}/>
                          <Tooltip contentStyle={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:6,fontSize:12}} formatter={v=>['₹'+v.toLocaleString('en-IN'),'Price']} labelStyle={{color:C.muted}}/>
                          {tech&&<ReferenceLine y={tech.sma20} stroke={C.green} strokeDasharray="3 3" strokeWidth={1}/>}
                          {tech&&<ReferenceLine y={tech.sma50} stroke={C.blue} strokeDasharray="3 3" strokeWidth={1}/>}
                          {tech&&<ReferenceLine y={tech.sma200} stroke={C.amber} strokeDasharray="4 4" strokeWidth={1.5}/>}
                          {tech&&<ReferenceLine y={tech.bbUpper} stroke={C.muted} strokeDasharray="2 4" strokeWidth={1}/>}
                          {tech&&<ReferenceLine y={tech.bbLower} stroke={C.muted} strokeDasharray="2 4" strokeWidth={1}/>}
                          <Area type="monotone" dataKey="price" stroke={C.text} strokeWidth={2} fill="url(#pg2)" dot={false}/>
                        </AreaChart>
                      </ResponsiveContainer>
                      <div style={{display:'flex',gap:20,marginTop:8,fontSize:11,flexWrap:'wrap'}}>
                        {[['Price',C.text],['SMA 20',C.green],['SMA 50',C.blue],['SMA 200',C.amber],['Bollinger',C.muted]].map(([l,gc])=><span key={l} style={{color:gc}}>── {l}</span>)}
                      </div>
                    </Card>
                  )}

                  <Card>
                    <SL>Price returns</SL>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
                      {[['1 Month',tech.chg1M],['3 Months',tech.chg3M],['1 Year',tech.chg1Y]].map(([l,v])=>(
                        <div key={l} style={{background:C.bg,borderRadius:8,padding:14,border:`1px solid ${C.border}`}}>
                          <div style={{fontSize:11,color:C.muted,marginBottom:6}}>{l}</div>
                          <div style={{fontSize:24,fontWeight:700,color:clr(v)}}>{pct(v)}</div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </>
              ):<div style={{color:C.muted,fontSize:13,padding:20}}>Technical data not available</div>}
            </div>
          )}

          {/* ══ NEWS ══ */}
          {tab===6&&(
            <Card>
              <SL>Latest news — {scr.name||sym} · India</SL>
              <div style={{fontSize:11,color:C.muted,marginBottom:14,padding:'6px 10px',background:C.bg,borderRadius:6}}>
                📡 Source: Google News India · Filtered for {scr.name||sym} · Sentiment: AI keyword analysis
              </div>
              {news.length===0?(
                <div style={{color:C.muted,fontSize:13,textAlign:'center',padding:'2rem'}}>No India-specific news found. Try again in a moment.</div>
              ):news.map((item,i)=>{
                const s=sentiment(item.title)
                const timeAgo=item.pubDate?Math.round((Date.now()-new Date(item.pubDate).getTime())/3600000):null
                return(
                  <div key={i} style={{padding:'14px 0',borderBottom:i<news.length-1?`1px solid ${C.border}22`:'none'}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,flexWrap:'wrap'}}>
                      <span style={{fontSize:11,color:C.muted,fontWeight:500}}>{item.source||item.publisher}</span>
                      <Chip type={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</Chip>
                      {timeAgo!==null&&<span style={{fontSize:11,color:C.muted}}>{timeAgo<1?'Just now':timeAgo<24?timeAgo+'h ago':Math.round(timeAgo/24)+'d ago'}</span>}
                    </div>
                    <a href={item.link} target="_blank" rel="noreferrer" style={{fontSize:14,lineHeight:1.6,color:C.text,textDecoration:'none',display:'block',fontWeight:500}}>{item.title}</a>
                    {item.description&&<div style={{fontSize:12,color:C.muted,marginTop:5,lineHeight:1.5}}>{item.description.slice(0,150)}...</div>}
                  </div>
                )
              })}
            </Card>
          )}

        </>)}
      </div>
    </div>
  )
}
