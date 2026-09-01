import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { db } from './firebase';
import { ref, onValue, set } from 'firebase/database';
import SEED_DATA from './seedData';

const USERS = [
  { id: 'cindy', nombre: 'Cindy Arrieta', usuario: 'cindy', clave: 'Hannen-123', rol: 'admin' },
  { id: 'junior', nombre: 'Junior', usuario: 'junior', clave: '123', rol: 'cobrador', ruta: 'A' },
  { id: 'jhon', nombre: 'Jhon', usuario: 'jhon', clave: '1234', rol: 'cobrador', rutas: ['B','C'] },
];

const RUTAS = {
  A: { cobrador: 'Junior', dia: 'Lunes', c: '#1A5C8C', bg: '#E3EEF7' },
  B: { cobrador: 'Jhon', dia: 'Lunes', c: '#6B3A8C', bg: '#F0E8F7' },
  C: { cobrador: 'Jhon', dia: 'Jueves', c: '#8C5A1A', bg: '#F7EFE3' },
};

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MESES_L = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DIAS = ['Dom','Lun','Mar','Mie','Jue','Vie','Sab'];
const CATS = ['Pago cobrador','Transporte','Retiro personal','Otro gasto'];

const G='#1A6B3A',GB='#E5F3EC',OK='#157A3D',OKB='#E3F5EC',WN='#7A4A08',WNB='#FDF1DC',DN='#8C1A1A',DNB='#F7E3E3';
const SF='#FFFFFF',S2='#F6F8F6',BD='rgba(20,40,20,.09)',BDS='rgba(20,40,20,.18)',TX='#1A221A',MT='#5A6A5A',FT='#90A090';

function parseD(s){const p=String(s).split('-').map(Number);const d=new Date(p[0],p[1]-1,p[2]);d.setHours(0,0,0,0);return d;}
function toDS(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function todayDS(){return toDS(HOY());}
function HOY(){const d=new Date();d.setHours(0,0,0,0);return d;}
function fmt(n){const v=Math.round(n);return(v<0?'-$':'$')+Math.abs(v).toLocaleString('es-CO');}
function fmtF(d){return DIAS[d.getDay()]+' '+d.getDate()+' '+MESES[d.getMonth()];}
function fmtFL(d){return d.getDate()+' de '+MESES_L[d.getMonth()]+' de '+d.getFullYear();}
function fechasCuotas(p){const ini=parseD(p.fechaPrestamo);return Array.from({length:10},(_,k)=>{const d=new Date(ini);d.setDate(d.getDate()+7*(k+1));return d;});}
function getAbonos(p){const ab=p.abonos||[];if(Array.isArray(ab))return ab;return Object.values(ab);}
function totalAbonado(p){return getAbonos(p).reduce((s,a)=>s+((a&&a.monto)||0),0);}
function totalDeuda(p){return p.monto*1.4;}
function saldoTotal(p){return Math.max(0,totalDeuda(p)-totalAbonado(p));}
function isTerminado(p){return totalAbonado(p)>=totalDeuda(p)-0.5;}
function saldoCuota(p,i){const a=getAbonos(p)[i];const m=a?a.monto:null;return m==null?p.cuota:Math.max(0,p.cuota-m);}
function cuotasVencidas(p){const h=HOY();return fechasCuotas(p).map((f,i)=>({f,i})).filter(x=>x.f<=h);}
function saldoAtrasado(p){const c=fechasCuotas(p);const h=HOY();if(c[9]<h&&saldoTotal(p)>0.5)return saldoTotal(p);return cuotasVencidas(p).reduce((s,x)=>s+saldoCuota(p,x.i),0);}
function tieneSaldoAtrasado(p){return saldoAtrasado(p)>0.5;}
function enRango(f,l,d){return f>=l&&f<=d;}
function semRango(off){const h=HOY();const dw=h.getDay()===0?6:h.getDay()-1;const lun=new Date(h);lun.setDate(h.getDate()-dw+off*7);lun.setHours(0,0,0,0);const dom=new Date(lun);dom.setDate(lun.getDate()+6);return{lun,dom};}
function calcCuota(m){return m*1.4/10;}
function todosLosRecaudos(prestamos){const o=[];(prestamos||[]).forEach(p=>{const fs=fechasCuotas(p);getAbonos(p).forEach((a,i)=>{if(a&&a.monto>0&&a.fecha){o.push({p,i,monto:a.monto,fecha:parseD(a.fecha),fCuota:i<fs.length?fs[i]:parseD(a.fecha)});}});});return o.sort((a,b)=>b.fecha-a.fecha);}
function estadoCuota(p,i,hoy){const h=hoy||HOY();const fs=fechasCuotas(p);const a=getAbonos(p)[i];const m=a?a.monto:null;if(m==null){if(!fs[i]||fs[i]>h)return 'futuro';return 'sinpago';}if(m===0)return 'sinpago';if(m>=p.cuota-0.5)return 'completa';return 'parcial';}
function cuotasSinPago(p){return cuotasVencidas(p).filter(x=>{const e=estadoCuota(p,x.i);return e==='sinpago';}).length;}
function capitalRecuperado(p){const ab=totalAbonado(p);const d=totalDeuda(p);if(d<=0)return 0;return Math.min(p.monto,ab*(p.monto/d));}
function interesCobrado(p){return Math.max(0,totalAbonado(p)-capitalRecuperado(p));}

function RTag({r}){return <span style={{display:'inline-block',padding:'2px 7px',borderRadius:5,background:RUTAS[r]?RUTAS[r].bg:S2,color:RUTAS[r]?RUTAS[r].c:MT,fontSize:11,fontWeight:700}}>Ruta {r}</span>;}
function CTag({r}){const isJ=RUTAS[r]&&RUTAS[r].cobrador==='Junior';return <span style={{display:'inline-block',padding:'1px 6px',borderRadius:5,background:isJ?'#E3EEF7':'#F0E8F7',color:isJ?'#1A5C8C':'#6B3A8C',fontSize:10,fontWeight:700,marginLeft:4}}>{RUTAS[r]&&RUTAS[r].cobrador}</span>;}
function KPI({label,value,sub,vc,onClick}){return <div onClick={onClick} style={{background:SF,border:'1px solid '+BD,borderRadius:10,padding:'13px 15px',cursor:onClick?'pointer':'default',transition:'box-shadow .15s'}} onMouseEnter={e=>{if(onClick)e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,.12)';}} onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}><div style={{fontSize:11,color:MT,marginBottom:3}}>{label}{onClick&&<span style={{float:'right',color:G,fontSize:10}}> ver -&gt;</span>}</div><div style={{fontSize:19,fontWeight:700,color:vc||TX,lineHeight:1.1}}>{value}</div>{sub&&<div style={{fontSize:11,color:FT,marginTop:2}}>{sub}</div>}</div>;}
function MBar({pct,color}){return <div style={{height:4,borderRadius:2,background:S2,overflow:'hidden',marginTop:3}}><div style={{height:'100%',borderRadius:2,background:color||G,width:Math.min(100,Math.max(0,pct))+'%'}}/></div>;}
function Toast({toasts,onDismiss}){return <div style={{position:'fixed',top:14,right:14,zIndex:300,display:'flex',flexDirection:'column',gap:7}}>{toasts.map(t=><div key={t.id} onClick={()=>onDismiss(t.id)} style={{background:t.err?DNB:OKB,color:t.err?DN:OK,padding:'9px 14px',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer'}}>{t.msg}</div>)}</div>;}
function Inp({label,style:s,...p}){return <div style={{display:'flex',flexDirection:'column',gap:3,...s}}>{label&&<label style={{fontSize:12,color:MT,fontWeight:600}}>{label}</label>}<input style={{padding:'8px 10px',border:'1px solid '+BDS,borderRadius:7,background:SF,color:TX,fontSize:13,fontFamily:'inherit',width:'100%',boxSizing:'border-box'}} {...p}/></div>;}
function Sel({label,children,style:s,...p}){return <div style={{display:'flex',flexDirection:'column',gap:3,...s}}>{label&&<label style={{fontSize:12,color:MT,fontWeight:600}}>{label}</label>}<select style={{padding:'8px 10px',border:'1px solid '+BDS,borderRadius:7,background:SF,color:TX,fontSize:13,fontFamily:'inherit',width:'100%'}} {...p}>{children}</select></div>;}
function Btn({children,v='ghost',sm,style:s,...p}){const base={display:'inline-flex',alignItems:'center',gap:5,padding:sm?'4px 9px':'8px 13px',borderRadius:7,fontSize:sm?12:13,cursor:'pointer',border:'1px solid '+BDS,fontFamily:'inherit',fontWeight:500,...s};const vs={ghost:{...base,background:SF,color:TX},primary:{...base,background:G,color:'#fff',border:'1px solid '+G},danger:{...base,color:DN,borderColor:DNB}};return <button style={vs[v]||vs.ghost} {...p}>{children}</button>;}
function Panel({title,children,tr}){return <div style={{background:SF,border:'1px solid '+BD,borderRadius:11,padding:'16px 18px',marginBottom:12}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:title?12:0,flexWrap:'wrap',gap:8}}>{title&&<div style={{fontSize:14,fontWeight:700,color:TX}}>{title}</div>}{tr}</div>{children}</div>;}
function Empty({msg}){return <div style={{textAlign:'center',padding:'2rem 1rem',color:FT,fontSize:13}}>{msg||'Sin datos'}</div>;}

function Overlay({onClose,children}){return <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,padding:12}}><div onClick={e=>e.stopPropagation()} style={{background:SF,borderRadius:14,width:'100%',maxWidth:680,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 24px 48px rgba(0,0,0,.28)'}}>{children}</div></div>;}

function ModalCliente({p,onClose}){
  if(!p)return null;
  const h=HOY(),fs=fechasCuotas(p),ab=totalAbonado(p),de=totalDeuda(p),sl=saldoTotal(p),at=saldoAtrasado(p),pct=Math.round(ab/de*100);
  const nS=Math.max(10,getAbonos(p).length);
  const absHist=getAbonos(p).filter(a=>a&&a.monto>0&&a.fecha).sort((a,b)=>parseD(b.fecha)-parseD(a.fecha));
  return <Overlay onClose={onClose}>
    <div style={{padding:'16px 20px',background:GB,borderRadius:'14px 14px 0 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div><div style={{fontSize:18,fontWeight:700,color:G}}>{p.nombre}</div><div style={{fontSize:13,color:MT,marginTop:3,display:'flex',alignItems:'center',gap:6}}><RTag r={p.ruta}/><CTag r={p.ruta}/></div></div>
      <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:MT}}>X</button>
    </div>
    <div style={{padding:'16px 20px'}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:9,marginBottom:14}}>
        <KPI label="Capital" value={fmt(p.monto)} sub={fmtFL(parseD(p.fechaPrestamo))}/>
        <KPI label="Total a recibir" value={fmt(de)}/>
        <KPI label="Abonado" value={fmt(ab)} vc={OK} sub={pct+'%'}/>
        <KPI label="Saldo" value={fmt(sl)} vc={sl<0.5?OK:DN}/>
        {at>0.5&&<KPI label="Atrasado" value={fmt(at)} vc={DN}/>}
      </div>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:12,color:MT,marginBottom:4,fontWeight:600}}>Progreso: {pct}%</div>
        <div style={{height:8,borderRadius:4,background:S2,overflow:'hidden'}}><div style={{height:'100%',borderRadius:4,background:pct>=100?OK:G,width:Math.min(100,pct)+'%'}}/></div>
      </div>
      <div style={{fontSize:13,fontWeight:700,color:TX,marginBottom:9}}>Trazabilidad de cuotas</div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:460}}>
          <thead><tr>{['Cuota','Vence','Pactado','Abonado','Fecha abono','Estado','Saldo'].map((t,i)=><th key={i} style={{textAlign:'left',padding:'5px 7px',fontSize:10,color:MT,fontWeight:700,borderBottom:'2px solid '+BD}}>{t}</th>)}</tr></thead>
          <tbody>{Array.from({length:nS},(_,i)=>{
            const f=i<fs.length?fs[i]:null;const a=getAbonos(p)[i];const m=a?a.monto:null;const fa=a&&a.fecha?a.fecha:null;
            const e=estadoCuota(p,i,h);const s=saldoCuota(p,i);
            let bg='transparent',ec=FT,el='Pendiente';
            if(e==='completa'){bg=OKB+'66';ec=OK;el='OK Completa';}
            else if(e==='parcial'){bg=WNB+'66';ec=WN;el='Parcial';}
            else if(e==='sinpago'){bg=DNB+'66';ec=DN;el='Sin pago';}
            return <tr key={i} style={{borderBottom:'1px solid '+BD,background:bg}}>
              <td style={{padding:'6px 7px',fontWeight:600}}>{i>=10?'Ext':'C'+(i+1)}</td>
              <td style={{padding:'6px 7px',fontSize:11,color:MT}}>{f?fmtF(f):'-'}</td>
              <td style={{padding:'6px 7px',color:MT}}>{fmt(p.cuota)}</td>
              <td style={{padding:'6px 7px',fontWeight:600,color:m&&m>0?OK:FT}}>{m!=null?fmt(m):'-'}</td>
              <td style={{padding:'6px 7px',fontSize:11,color:MT}}>{fa?fmtF(parseD(fa)):'-'}</td>
              <td style={{padding:'6px 7px'}}><span style={{color:ec,fontWeight:600,fontSize:11}}>{el}</span></td>
              <td style={{padding:'6px 7px',fontWeight:600,color:s<0.5?OK:DN}}>{s<0.5?'Pagado':fmt(s)}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {absHist.length>0&&<div style={{marginTop:14}}>
        <div style={{fontSize:13,fontWeight:700,color:TX,marginBottom:8}}>Historial de abonos</div>
        {absHist.map((a,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',padding:'7px 11px',background:S2,borderRadius:7,fontSize:13,marginBottom:4}}><span style={{color:MT}}>{fmtFL(parseD(a.fecha))}</span><span style={{fontWeight:700,color:OK}}>{fmt(a.monto)}</span></div>)}
      </div>}
    </div>
  </Overlay>;
}

function ModalSemana({lun,dom,prestamos,onClose}){
  if(!lun)return null;
  const recs=todosLosRecaudos(prestamos).filter(x=>enRango(x.fecha,lun,dom));
  const nuevos=prestamos.filter(p=>enRango(parseD(p.fechaPrestamo),lun,dom));
  const tR=recs.reduce((s,x)=>s+x.monto,0),tP=nuevos.reduce((s,p)=>s+p.monto,0);
  return <Overlay onClose={onClose}>
    <div style={{padding:'14px 20px',background:GB,borderRadius:'14px 14px 0 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div style={{fontSize:15,fontWeight:700,color:G}}>{fmtF(lun)} - {fmtF(dom)} {dom.getFullYear()}</div>
      <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:MT}}>X</button>
    </div>
    <div style={{padding:'14px 20px'}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:14}}>
        <KPI label="Recaudado" value={fmt(tR)} vc={OK} sub={recs.length+' abonos'}/>
        <KPI label="Prestado nuevo" value={fmt(tP)} sub={nuevos.length+' prestamos'}/>
        <KPI label="Flujo neto" value={(tR-tP>=0?'+':'')+fmt(tR-tP)} vc={tR-tP>=0?OK:DN}/>
      </div>
      {recs.length>0&&<div style={{marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>Abonos recibidos ({recs.length})</div>
        <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr>{['Cliente','Ruta','Cuota','Monto'].map((t,i)=><th key={i} style={{textAlign:'left',padding:'4px 7px',fontSize:10,color:MT,fontWeight:700,borderBottom:'2px solid '+BD}}>{t}</th>)}</tr></thead>
          <tbody>{recs.map((x,i)=><tr key={i} style={{borderBottom:'1px solid '+BD}}><td style={{padding:'6px 7px',fontWeight:600}}>{x.p.nombre}</td><td style={{padding:'6px 4px'}}><RTag r={x.p.ruta}/></td><td style={{padding:'6px 7px'}}>C{x.i+1}</td><td style={{padding:'6px 7px',fontWeight:600,color:OK}}>{fmt(x.monto)}</td></tr>)}</tbody>
        </table></div>
      </div>}
      {nuevos.length>0&&<div>
        <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>Prestamos nuevos ({nuevos.length})</div>
        <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr>{['Cliente','Ruta','Monto','Cuota'].map((t,i)=><th key={i} style={{textAlign:'left',padding:'4px 7px',fontSize:10,color:MT,fontWeight:700,borderBottom:'2px solid '+BD}}>{t}</th>)}</tr></thead>
          <tbody>{nuevos.map((p,i)=><tr key={i} style={{borderBottom:'1px solid '+BD}}><td style={{padding:'6px 7px',fontWeight:600}}>{p.nombre}</td><td style={{padding:'6px 4px'}}><RTag r={p.ruta}/></td><td style={{padding:'6px 7px',fontWeight:600}}>{fmt(p.monto)}</td><td style={{padding:'6px 7px',color:MT}}>{fmt(p.cuota)}</td></tr>)}</tbody>
        </table></div>
      </div>}
      {recs.length===0&&nuevos.length===0&&<Empty msg="Sin movimiento esta semana"/>}
    </div>
  </Overlay>;
}

function ModalLista({titulo,lista,campo,onSelectCliente,onClose}){
  if(!lista)return null;
  const h=HOY();
  return <Overlay onClose={onClose}>
    <div style={{padding:'14px 20px',background:GB,borderRadius:'14px 14px 0 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div style={{fontSize:15,fontWeight:700,color:G}}>{titulo}</div>
      <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:MT}}>X</button>
    </div>
    <div style={{padding:'10px 18px'}}>
      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:8,fontWeight:700,fontSize:10,color:MT,borderBottom:'2px solid '+BD,paddingBottom:7,marginBottom:4}}>
        <span>CLIENTE</span><span>RUTA</span><span style={{textAlign:'right'}}>{campo==='at'?'ATRASADO':'SALDO'}</span>
      </div>
      {lista.map((p,i)=>{
        const fs=fechasCuotas(p);
        const cuotasCaidas=campo==='at'?cuotasVencidas(p).filter(x=>{const s=saldoCuota(p,x.i);return s>0.5;}).map(x=>({idx:x.i,f:fs[x.i],saldo:saldoCuota(p,x.i),abonado:getAbonos(p)[x.i]?getAbonos(p)[x.i].monto:0})):[];
        return <div key={i} onClick={()=>{onClose();onSelectCliente(p);}} style={{padding:'10px 4px',borderBottom:'1px solid '+BD,cursor:'pointer',borderRadius:6}} onMouseEnter={e=>e.currentTarget.style.background=S2} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:8,marginBottom:cuotasCaidas.length?6:0}}>
            <span style={{fontWeight:600}}>{p.nombre}</span>
            <span><RTag r={p.ruta}/><CTag r={p.ruta}/></span>
            <span style={{textAlign:'right',fontWeight:700,color:campo==='at'?DN:G}}>{fmt(campo==='at'?saldoAtrasado(p):saldoTotal(p))}</span>
          </div>
          {cuotasCaidas.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:4,paddingLeft:4}}>
            {cuotasCaidas.map((c,j)=><span key={j} style={{display:'inline-flex',alignItems:'center',gap:4,background:DNB,color:DN,borderRadius:5,padding:'2px 7px',fontSize:11,fontWeight:600}}>
              C{c.idx+1}: {c.abonado>0?'parcial '+fmt(c.abonado)+' / ':''}{fmt(c.saldo)} pendiente
            </span>)}
          </div>}
        </div>;
      })}
    </div>
  </Overlay>;
}

function LoginScreen({onLogin}){
  const [usuario,setUsuario]=useState('');
  const [clave,setClave]=useState('');
  const [error,setError]=useState('');
  const intentar=()=>{const u=USERS.find(x=>x.usuario.toLowerCase()===usuario.trim().toLowerCase()&&x.clave===clave);if(!u){setError('Usuario o contrasena incorrectos');return;}setError('');onLogin(u);};
  return <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'linear-gradient(135deg,'+G+' 0%,#0d4a26 100%)',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif'}}>
    <div style={{background:SF,borderRadius:16,padding:'40px 36px',width:'100%',maxWidth:380,boxShadow:'0 24px 48px rgba(0,0,0,.25)'}}>
      <div style={{textAlign:'center',marginBottom:28}}>
        <div style={{fontSize:32,marginBottom:8}}>$</div>
        <div style={{fontSize:24,fontWeight:700,color:G}}>Mi Cartera</div>
        <div style={{fontSize:13,color:MT,marginTop:4}}>Sistema de gestion de prestamos</div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <Inp label="Usuario" value={usuario} onChange={e=>setUsuario(e.target.value)} placeholder="cindy / junior / jhon" onKeyDown={e=>e.key==='Enter'&&intentar()} autoFocus/>
        <Inp label="Contrasena" type="password" value={clave} onChange={e=>setClave(e.target.value)} placeholder="*******" onKeyDown={e=>e.key==='Enter'&&intentar()}/>
        {error&&<div style={{background:DNB,color:DN,padding:'8px 12px',borderRadius:7,fontSize:13}}>{error}</div>}
        <Btn v="primary" style={{width:'100%',justifyContent:'center',padding:'11px'}} onClick={intentar}>Ingresar</Btn>
      </div>
    </div>
  </div>;
}

function Dashboard({prestamos,flujoOff,setFlujoOff,onVerCliente}){
  const [mSemana,setMSemana]=useState(null);
  const [mLista,setMLista]=useState(null);
  const activos=useMemo(()=>prestamos.filter(p=>!isTerminado(p)),[prestamos]);
  const recs=useMemo(()=>todosLosRecaudos(prestamos),[prestamos]);
  const {lun:lh,dom:dh}=semRango(0);
  const {lun:fL,dom:fD}=semRango(flujoOff);
  const recSem=recs.filter(x=>enRango(x.fecha,lh,dh)).reduce((s,x)=>s+x.monto,0);
  const coEsta=[];activos.forEach(p=>fechasCuotas(p).forEach((f,i)=>{if(enRango(f,lh,dh))coEsta.push({p,i});}));
  const esp=coEsta.reduce((s,x)=>s+x.p.cuota,0);
  const totSl=activos.reduce((s,p)=>s+saldoTotal(p),0);
  const totAt=activos.reduce((s,p)=>s+saldoAtrasado(p),0);
  const conAt=activos.filter(tieneSaldoAtrasado).length;
  const flujo=useMemo(()=>{const o={};['A','B','C'].forEach(r=>{o[r]={rec:0,nAb:0,cap:0,nPr:0,nNuevos:0};});recs.forEach(rc=>{if(enRango(rc.fecha,fL,fD)){o[rc.p.ruta].rec+=rc.monto;o[rc.p.ruta].nAb++;}});prestamos.forEach(p=>{if(enRango(parseD(p.fechaPrestamo),fL,fD)){o[p.ruta].cap+=p.monto;o[p.ruta].nPr++;}});return o;},[prestamos,flujoOff]);
  const HIST=12;
  const hist=useMemo(()=>Array.from({length:HIST},(_,k)=>{const r=semRango(-(HIST-1-k));const f={};['A','B','C'].forEach(rt=>{f[rt]={rec:0,cap:0,nPr:0};});recs.forEach(rc=>{if(enRango(rc.fecha,r.lun,r.dom))f[rc.p.ruta].rec+=rc.monto;});prestamos.forEach(p=>{if(enRango(parseD(p.fechaPrestamo),r.lun,r.dom)){f[p.ruta].cap+=p.monto;f[p.ruta].nPr++;}});return{lun:r.lun,dom:r.dom,f};}),[prestamos]);

  return <div>
    {mSemana&&<ModalSemana lun={mSemana.lun} dom={mSemana.dom} prestamos={prestamos} onClose={()=>setMSemana(null)}/>}
    {mLista&&<ModalLista {...mLista} onSelectCliente={p=>{setMLista(null);onVerCliente(p);}} onClose={()=>setMLista(null)}/>}
    <div style={{fontSize:20,fontWeight:700,marginBottom:14}}>Dashboard</div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10,marginBottom:14}}>
      <KPI label="Clientes activos" value={String(activos.length)} sub="prestamos vigentes" vc={G} onClick={()=>setMLista({titulo:'Clientes activos',lista:[...activos].sort((a,b)=>saldoTotal(b)-saldoTotal(a)),campo:'saldo'})}/>
      <KPI label="Total por cobrar" value={fmt(totSl)} sub="saldo activos" vc={G} onClick={()=>setMLista({titulo:'Donde esta tu plata',lista:[...activos].sort((a,b)=>saldoTotal(b)-saldoTotal(a)),campo:'saldo'})}/>
      <KPI label="Recaudado esta semana" value={fmt(recSem)} sub={'de '+fmt(esp)+' esperado'} vc={OK}/>
      <KPI label="Saldo atrasado" value={fmt(totAt)} sub={conAt+' clientes'} vc={DN} onClick={()=>setMLista({titulo:'Con saldo atrasado',lista:activos.filter(tieneSaldoAtrasado).sort((a,b)=>saldoAtrasado(b)-saldoAtrasado(a)),campo:'at'})}/>
      <KPI label="Capital entregado" value={fmt(activos.reduce((s,p)=>s+p.monto,0))} sub="sin interes" onClick={()=>setMLista({titulo:'Capital por cliente',lista:[...activos].sort((a,b)=>b.monto-a.monto),campo:'saldo'})}/>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:14}}>
      {['A','B','C'].map(k=>{
        const ps=activos.filter(p=>p.ruta===k);
        const sl=ps.reduce((s,p)=>s+saldoTotal(p),0);
        const at=ps.reduce((s,p)=>s+saldoAtrasado(p),0);
        const conAtR=ps.filter(tieneSaldoAtrasado).length;
        return <div key={k} style={{background:SF,border:'1px solid '+RUTAS[k].c+'44',borderRadius:10,padding:'12px 14px',cursor:'pointer'}} onClick={()=>setMLista({titulo:'Ruta '+k+' - '+RUTAS[k].cobrador,lista:[...ps].sort((a,b)=>saldoTotal(b)-saldoTotal(a)),campo:'saldo'})} onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,.10)'} onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}><span style={{display:'inline-block',padding:'2px 7px',borderRadius:5,background:RUTAS[k].bg,color:RUTAS[k].c,fontSize:11,fontWeight:700}}>Ruta {k}</span><span style={{fontSize:11,color:MT}}>{RUTAS[k].cobrador} - {RUTAS[k].dia}</span></div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
            <div><div style={{fontSize:10,color:MT,marginBottom:2}}>Clientes</div><div style={{fontSize:16,fontWeight:700,color:RUTAS[k].c}}>{ps.length}</div></div>
            <div><div style={{fontSize:10,color:MT,marginBottom:2}}>Por cobrar</div><div style={{fontSize:14,fontWeight:700,color:G}}>{fmt(sl)}</div></div>
            <div><div style={{fontSize:10,color:MT,marginBottom:2}}>Atrasado</div><div style={{fontSize:14,fontWeight:700,color:at>0?DN:FT}}>{at>0?fmt(at):'-'}</div><div style={{fontSize:10,color:FT}}>{conAtR} cli.</div></div>
          </div>
        </div>;
      })}
    </div>
    <Panel title="Flujo por ruta" tr={<div style={{display:'flex',alignItems:'center',gap:6}}><Btn sm onClick={()=>setFlujoOff(f=>f-1)}>{'<'}</Btn><span style={{fontSize:12,fontWeight:600,minWidth:200,textAlign:'center'}}>{fmtF(fL)} - {fmtF(fD)}</span><Btn sm onClick={()=>setFlujoOff(f=>f+1)}>{'>'}</Btn><Btn sm v="primary" onClick={()=>setFlujoOff(0)}>Esta semana</Btn></div>}>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:520}}>
        <thead><tr>{['Ruta','Clientes','Recogido','Prestado','Flujo neto'].map((t,i)=><th key={i} style={{textAlign:'left',padding:'7px 9px',fontSize:11,color:MT,fontWeight:700,borderBottom:'2px solid '+BD}}>{t}</th>)}</tr></thead>
        <tbody>
          {['A','B','C'].map(k=>{const d=flujo[k];const n=d.rec-d.cap;return <tr key={k} style={{borderBottom:'1px solid '+BD}}>
            <td style={{padding:'9px'}}><RTag r={k}/><CTag r={k}/><div style={{fontSize:11,color:FT,marginTop:2}}>{RUTAS[k].dia}</div></td>
            <td style={{padding:'9px'}}><div style={{fontSize:16,fontWeight:700,color:d.nPr?G:FT}}>{d.nPr||'-'}</div></td>
            <td style={{padding:'9px',fontWeight:700,color:OK}}>{fmt(d.rec)}<div style={{fontSize:11,color:FT,fontWeight:400}}>{d.nAb} abonos</div></td>
            <td style={{padding:'9px',fontWeight:600}}>{fmt(d.cap)}</td>
            <td style={{padding:'9px',fontWeight:700,fontSize:14,color:n>0?OK:n<0?DN:FT}}>{(n>0?'+':'')+fmt(n)}</td>
          </tr>;})}
          {(()=>{const tR=['A','B','C'].reduce((s,k)=>s+flujo[k].rec,0);const tC=['A','B','C'].reduce((s,k)=>s+flujo[k].cap,0);const n=tR-tC;return <tr style={{borderTop:'2px solid '+BDS,background:S2}}><td style={{padding:'9px',fontWeight:700}}>Total</td><td style={{padding:'9px',fontWeight:700}}>{['A','B','C'].reduce((s,k)=>s+flujo[k].nPr,0)}</td><td style={{padding:'9px',fontWeight:700,color:OK}}>{fmt(tR)}</td><td style={{padding:'9px',fontWeight:700}}>{fmt(tC)}</td><td style={{padding:'9px',fontWeight:700,fontSize:14,color:n>0?OK:n<0?DN:FT}}>{(n>0?'+':'')+fmt(n)}</td></tr>;})()}
        </tbody>
      </table></div>
    </Panel>
    <Panel title={'Historial - ultimas '+HIST+' semanas'} tr={<span style={{fontSize:11,color:G,fontWeight:600}}>Clic en una fila para ver detalle</span>}>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:680}}>
        <thead><tr>
          <th style={{textAlign:'left',padding:'5px 7px',fontSize:10,color:MT,fontWeight:700,borderBottom:'2px solid '+BD}}>Semana</th>
          {['A','B','C'].flatMap(k=>[<th key={k+'r'} style={{padding:'5px 7px',fontSize:10,color:RUTAS[k].c,fontWeight:700,borderBottom:'2px solid '+BD}}>{k} Recogido</th>,<th key={k+'p'} style={{padding:'5px 7px',fontSize:10,color:MT,fontWeight:700,borderBottom:'2px solid '+BD}}>Prestado</th>])}
          <th style={{padding:'5px 7px',fontSize:10,color:MT,fontWeight:700,borderBottom:'2px solid '+BD}}>Total</th>
          <th style={{padding:'5px 7px',fontSize:10,color:MT,fontWeight:700,borderBottom:'2px solid '+BD}}>Neto</th>
        </tr></thead>
        <tbody>{hist.map((x,idx)=>{
          const esA=x.lun.getTime()===semRango(0).lun.getTime();
          const tR=['A','B','C'].reduce((s,k)=>s+x.f[k].rec,0);
          const tP=['A','B','C'].reduce((s,k)=>s+x.f[k].cap,0);
          const n=tR-tP;
          return <tr key={idx} onClick={()=>setMSemana({lun:x.lun,dom:x.dom})} style={{borderBottom:'1px solid '+BD,background:esA?GB:'transparent',cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background=esA?GB:S2} onMouseLeave={e=>e.currentTarget.style.background=esA?GB:'transparent'}>
            <td style={{padding:'7px',fontSize:11,color:esA?G:MT,fontWeight:esA?700:400}}>{x.lun.getDate()+' '+MESES[x.lun.getMonth()]+' - '+x.dom.getDate()+' '+MESES[x.dom.getMonth()]}{esA&&<div style={{fontSize:10,color:G}}>esta semana</div>}</td>
            {['A','B','C'].flatMap(k=>[<td key={k+'r'} style={{padding:'7px 5px',fontWeight:600,color:x.f[k].rec?OK:FT}}>{x.f[k].rec?fmt(x.f[k].rec):'-'}</td>,<td key={k+'p'} style={{padding:'7px 5px',color:x.f[k].cap?TX:FT}}>{x.f[k].cap?fmt(x.f[k].cap):'-'}</td>])}
            <td style={{padding:'7px 5px',fontWeight:700,color:tR?OK:FT}}>{tR?fmt(tR):'-'}</td>
            <td style={{padding:'7px 5px',fontWeight:700,color:n>0?OK:n<0?DN:FT}}>{(tR||tP)?(n>0?'+':'')+fmt(n):'-'}</td>
          </tr>;
        })}</tbody>
      </table></div>
    </Panel>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
      <Panel title="Cobros esta semana">
        {['A','B','C'].map(k=>{const xs=coEsta.filter(x=>x.p.ruta===k);if(!xs.length)return null;const e2=xs.reduce((s,x)=>s+x.p.cuota,0);const rc=xs.reduce((s,x)=>s+(getAbonos(x.p)[x.i]?(getAbonos(x.p)[x.i].monto||0):0),0);return <div key={k} style={{marginBottom:11}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}><span><RTag r={k}/><CTag r={k}/></span><span style={{fontSize:12}}><b style={{color:OK}}>{fmt(rc)}</b> / {fmt(e2)}</span></div>{xs.slice(0,4).map((x,i)=><div key={i} onClick={()=>onVerCliente(x.p)} style={{fontSize:12,color:MT,padding:'3px 4px',cursor:'pointer',borderRadius:4}} onMouseEnter={e=>e.currentTarget.style.background=S2} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>{x.p.nombre} - C{x.i+1}</div>)}{xs.length>4&&<div style={{fontSize:11,color:FT}}>+{xs.length-4} mas</div>}</div>;})}
        {coEsta.length===0&&<Empty msg="Sin cobros esta semana"/>}
      </Panel>
      <Panel title="Resumen por ruta">
        {['A','B','C'].map(k=>{const ps=activos.filter(p=>p.ruta===k);const tot=ps.reduce((s,p)=>s+saldoTotal(p),0);const at=ps.reduce((s,p)=>s+saldoAtrasado(p),0);return <div key={k} onClick={()=>setMLista({titulo:'Ruta '+k+' - '+RUTAS[k].cobrador,lista:[...ps].sort((a,b)=>saldoTotal(b)-saldoTotal(a)),campo:'saldo'})} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 4px',borderBottom:'1px solid '+BD,cursor:'pointer',borderRadius:6}} onMouseEnter={e=>e.currentTarget.style.background=S2} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><div><RTag r={k}/><CTag r={k}/><div style={{fontSize:11,color:FT,marginTop:2}}>{RUTAS[k].dia} - {ps.length} clientes{at>0.5?<span style={{color:DN}}> - {fmt(at)} atras.</span>:null}</div></div><span style={{fontSize:14,fontWeight:700}}>{fmt(tot)}</span></div>;})}
      </Panel>
    </div>
  </div>;
}

function CobrosView({prestamos,onSave,semOff,setSemOff,currentUser,onVerCliente}){
  const [fr,setFr]=useState(currentUser.rol==='cobrador'?(currentUser.ruta||currentUser.rutas?.[0]||''):'');
  const {lun,dom}=semRango(semOff);
  const h=HOY();
  const rutasCob=currentUser.rol==='cobrador'?(currentUser.rutas||[currentUser.ruta]):['A','B','C'];
  const cobros=useMemo(()=>{const out=[];prestamos.filter(p=>!isTerminado(p)).forEach(p=>{if(fr&&p.ruta!==fr)return;if(!rutasCob.includes(p.ruta))return;const cuotas=fechasCuotas(p);let tiene=false;cuotas.forEach((f,i)=>{if(enRango(f,lun,dom)){out.push({p,i,f,ext:false});tiene=true;}});if(!tiene&&saldoTotal(p)>0.5&&lun>cuotas[cuotas.length-1])out.push({p,i:getAbonos(p).length,f:lun,ext:true});});return out;},[prestamos,semOff,fr,currentUser]);
  const porRuta={A:[],B:[],C:[]};cobros.forEach(x=>porRuta[x.p.ruta].push(x));
  return <div>
    <div style={{fontSize:20,fontWeight:700,marginBottom:12}}>Cobros por semana</div>
    <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:12,flexWrap:'wrap'}}>
      <Btn sm onClick={()=>setSemOff(s=>s-1)}>{'<'}</Btn>
      <span style={{fontSize:13,fontWeight:600,minWidth:220,textAlign:'center'}}>{fmtF(lun)} - {fmtF(dom)} {dom.getFullYear()}</span>
      <Btn sm onClick={()=>setSemOff(s=>s+1)}>{'>'}</Btn>
      <Btn sm v="primary" onClick={()=>setSemOff(0)}>Esta semana</Btn>
    </div>
    {currentUser.rol==='admin'&&<div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap'}}>{[{v:'',l:'Todas'},{v:'A',l:'A - Junior'},{v:'B',l:'B - Jhon'},{v:'C',l:'C - Jhon'}].map(x=><Btn key={x.v} sm v={fr===x.v?'primary':'ghost'} onClick={()=>setFr(x.v)}>{x.l}</Btn>)}</div>}
    {cobros.length===0?<Empty msg="Sin cobros esta semana."/>:(fr?[fr]:rutasCob).map(k=>{
      const xs=porRuta[k].sort((a,b)=>a.f-b.f||a.p.nombre.localeCompare(b.p.nombre));
      if(!xs.length)return null;
      const espK=xs.reduce((s,x)=>s+x.p.cuota,0);const recK=xs.reduce((s,x)=>s+(getAbonos(x.p)[x.i]?(getAbonos(x.p)[x.i].monto||0):0),0);
      return <Panel key={k} title={<span><RTag r={k}/><CTag r={k}/><span style={{fontSize:12,color:MT,marginLeft:7}}>{RUTAS[k].dia} - {xs.length} cobros</span></span>} tr={<span style={{fontSize:12,color:MT}}>Recogido <b style={{color:OK}}>{fmt(recK)}</b> de {fmt(espK)}</span>}>
        <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:620}}>
          <thead><tr>{['Cliente','Cuota','Vence','Pactado','Abono','Saldo','Rapido'].map((t,i)=><th key={i} style={{textAlign:'left',padding:'6px 8px',fontSize:11,color:MT,fontWeight:700,borderBottom:'2px solid '+BD}}>{t}</th>)}</tr></thead>
          <tbody>{xs.map((x,idx)=>{
            const m=(x.p.abonos||[])[x.i]?((x.p.abonos||[])[x.i].monto||null):null;
            const fa=(x.p.abonos||[])[x.i]?((x.p.abonos||[])[x.i].fecha||null):null;
            const saldo=x.ext?saldoTotal(x.p):saldoCuota(x.p,x.i);
            const rowBg=x.ext?DNB+'44':m===0||m===null&&x.f<h?DNB+'44':undefined;
            return <tr key={idx} style={{borderBottom:'1px solid '+BD,background:rowBg}}>
              <td style={{padding:'8px'}}><div style={{fontWeight:600,cursor:'pointer',color:G}} onClick={()=>onVerCliente(x.p)}>{x.p.nombre}</div>{x.ext&&<div style={{fontSize:10,color:WN}}>plan vencido</div>}</td>
              <td style={{padding:'8px'}}><b>{x.ext?'Ext':'C'+(x.i+1)}</b></td>
              <td style={{padding:'8px',fontSize:12,color:MT}}>{fmtF(x.f)}</td>
              <td style={{padding:'8px',color:MT}}>{fmt(x.ext?saldoTotal(x.p):x.p.cuota)}</td>
              <td style={{padding:'8px'}}>
                <input type="number" defaultValue={m==null?'':Math.round(m)} placeholder="monto" min="0" key={x.p.id+'-'+x.i+'-'+m} style={{width:86,padding:'4px 6px',fontSize:12,border:'1px solid '+BDS,borderRadius:6,background:SF,color:TX,fontFamily:'inherit'}} onChange={ev=>onSave(x.p.id,x.i,ev.target.value,toDS(x.f))}/>
                {m!=null&&<input type="date" defaultValue={fa||toDS(x.f)} key={'d'+x.p.id+'-'+x.i} style={{width:118,padding:'3px 5px',fontSize:11,border:'1px solid '+BDS,borderRadius:6,background:SF,color:TX,fontFamily:'inherit',marginTop:3,display:'block'}} onChange={ev=>onSave(x.p.id,x.i,null,null,ev.target.value)}/>}
                {m!=null&&m>0&&<MBar pct={Math.min(100,Math.round(m/(x.ext?saldoTotal(x.p):x.p.cuota)*100))} color={m>=(x.ext?saldoTotal(x.p):x.p.cuota)-0.5?OK:WN}/>}
              </td>
              <td style={{padding:'8px',fontWeight:700,color:saldo<0.5?OK:DN}}>{saldo<0.5?'OK':fmt(saldo)}</td>
              <td style={{padding:'8px'}}><div style={{display:'flex',gap:3}}><Btn sm v="primary" onClick={()=>onSave(x.p.id,x.i,'completo',toDS(x.f),null,x.ext)}>OK</Btn>{!x.ext&&<Btn sm style={{color:WN,borderColor:WN+'44'}} onClick={()=>onSave(x.p.id,x.i,0,toDS(x.f))}>X</Btn>}{m!=null&&<Btn sm onClick={()=>onSave(x.p.id,x.i,'limpiar')}>Borrar</Btn>}</div></td>
            </tr>;
          })}</tbody>
        </table></div>
      </Panel>;
    })}
  </div>;
}

function ConsolidadoView({prestamos,onEdit,onDelete,currentUser,onVerCliente}){
  const [rf,setRf]=useState('');const [estado,setEstado]=useState('activo');const [nombre,setNombre]=useState('');
  const rutasCob=currentUser.rol==='cobrador'?(currentUser.rutas||[currentUser.ruta]):null;
  const lista=useMemo(()=>{let l=prestamos.slice();if(rf)l=l.filter(p=>p.ruta===rf);if(estado==='activo')l=l.filter(p=>!isTerminado(p));else if(estado==='saldo')l=l.filter(p=>!isTerminado(p)&&tieneSaldoAtrasado(p));else if(estado==='terminado')l=l.filter(isTerminado);if(nombre)l=l.filter(p=>p.nombre.toLowerCase().includes(nombre.toLowerCase()));if(rutasCob)l=l.filter(p=>rutasCob.includes(p.ruta));return l.sort((a,b)=>parseD(b.fechaPrestamo)-parseD(a.fechaPrestamo));},[prestamos,rf,estado,nombre,currentUser]);
  const tots={cap:lista.reduce((s,p)=>s+p.monto,0),abon:lista.reduce((s,p)=>s+totalAbonado(p),0),saldo:lista.reduce((s,p)=>s+saldoTotal(p),0),atras:lista.reduce((s,p)=>s+saldoAtrasado(p),0)};
  return <div>
    <div style={{fontSize:20,fontWeight:700,marginBottom:14}}>Consolidado de prestamos</div>
    <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'flex-end'}}>
      {currentUser.rol==='admin'&&<Sel value={rf} onChange={e=>setRf(e.target.value)} style={{maxWidth:160}}><option value="">Todas las rutas</option>{['A','B','C'].map(r=><option key={r} value={r}>Ruta {r} - {RUTAS[r].cobrador}</option>)}</Sel>}
      <Sel value={estado} onChange={e=>setEstado(e.target.value)} style={{maxWidth:200}}><option value="">Todos</option><option value="activo">Activos</option><option value="saldo">Con saldo atrasado</option><option value="terminado">Terminados</option></Sel>
      <Inp placeholder="Buscar cliente..." value={nombre} onChange={e=>setNombre(e.target.value)} style={{maxWidth:180}}/>
      <span style={{fontSize:12,color:FT}}>{lista.length} prestamo{lista.length!==1?'s':''}</span>
    </div>
    {lista.length===0?<Empty msg="Sin resultados."/>:<div style={{background:SF,border:'1px solid '+BD,borderRadius:10,overflowX:'auto',marginBottom:12}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:780}}>
        <thead><tr>{['Cliente','Ruta','Fecha','Capital','Abonado','Saldo','Atrasado','Cuotas',''].map((t,i)=><th key={i} style={{textAlign:'left',padding:'7px 9px',fontSize:11,color:MT,fontWeight:700,borderBottom:'2px solid '+BD,whiteSpace:'nowrap'}}>{t}</th>)}</tr></thead>
        <tbody>{lista.map(p=>{const d=totalDeuda(p),ab=totalAbonado(p),sl=saldoTotal(p),at=saldoAtrasado(p);const pct=Math.round(ab/d*100);const term=isTerminado(p);return <tr key={p.id} style={{borderBottom:'1px solid '+BD,background:!term&&at>0.5?DNB+'44':undefined}}>
          <td style={{padding:'8px 9px'}}><div style={{fontWeight:600,cursor:'pointer',color:G}} onClick={()=>onVerCliente(p)}>{p.nombre}</div>{term&&<span style={{display:'inline-block',padding:'2px 7px',borderRadius:5,background:OKB,color:OK,fontSize:11,fontWeight:700}}>Terminado</span>}</td>
          <td style={{padding:'8px 4px'}}><RTag r={p.ruta}/><CTag r={p.ruta}/></td>
          <td style={{padding:'8px 9px',fontSize:12,color:MT}}>{fmtF(parseD(p.fechaPrestamo))}</td>
          <td style={{padding:'8px 9px'}}>{fmt(p.monto)}</td>
          <td style={{padding:'8px 9px',color:OK,fontWeight:600}}>{fmt(ab)}<MBar pct={pct}/><div style={{fontSize:10,color:FT}}>{pct}%</div></td>
          <td style={{padding:'8px 9px',fontWeight:600,color:sl<0.5?FT:DN}}>{fmt(sl)}</td>
          <td style={{padding:'8px 9px',fontWeight:600,color:at>0.5?DN:FT}}>{at>0.5?fmt(at):'-'}</td>
          <td style={{padding:'8px 9px'}}><div style={{display:'flex',gap:2,flexWrap:'wrap'}}>{Array.from({length:10},(_,i)=>{const e=estadoCuota(p,i);let bg=S2,c=FT;if(e==='completa'){bg=OK;c='#fff';}else if(e==='parcial'){bg=WNB;c=WN;}else if(e==='sinpago'){bg=DNB;c=DN;}return <span key={i} style={{width:14,height:14,borderRadius:2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,background:bg,color:c}}>{i+1}</span>;})}</div></td>
          {currentUser.rol==='admin'&&<td style={{padding:'8px 5px'}}><div style={{display:'flex',gap:3}}><Btn sm onClick={()=>onEdit(p)}>Editar</Btn><Btn sm v="danger" onClick={()=>onDelete(p)}>Borrar</Btn></div></td>}
        </tr>;})}
        </tbody>
      </table>
    </div>}
    <Panel title="Totales">
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(118px,1fr))',gap:9}}>
        <KPI label="Capital" value={fmt(tots.cap)} sub={lista.length+' prestamos'}/>
        <KPI label="Abonado" value={fmt(tots.abon)} vc={OK}/>
        <KPI label="Por cobrar" value={fmt(tots.saldo)} vc={tots.saldo?DN:TX}/>
        <KPI label="Atrasado" value={fmt(tots.atras)} vc={tots.atras?WN:TX}/>
      </div>
    </Panel>
  </div>;
}

function RiesgoView({prestamos,currentUser,onVerCliente}){
  const rutasCob=currentUser.rol==='cobrador'?(currentUser.rutas||[currentUser.ruta]):null;
  const lista=useMemo(()=>{let l=prestamos.filter(p=>!isTerminado(p));if(rutasCob)l=l.filter(p=>rutasCob.includes(p.ruta));return l;},[prestamos,currentUser]);
  const alerta=useMemo(()=>lista.map(p=>({p,cc:cuotasSinPago(p)})).filter(x=>x.cc>=3).sort((a,b)=>b.cc-a.cc),[lista]);
  const conSaldo=lista.filter(tieneSaldoAtrasado).sort((a,b)=>saldoAtrasado(b)-saldoAtrasado(a));
  return <div>
    <div style={{fontSize:20,fontWeight:700,marginBottom:14}}>Riesgo y moras</div>
    <Panel title="Resumen por ruta">
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:500}}>
        <thead><tr>{['Ruta','Activos','En mora','Alerta (3+)','Atrasado'].map((t,i)=><th key={i} style={{textAlign:'left',padding:'6px 8px',fontSize:11,color:MT,fontWeight:700,borderBottom:'2px solid '+BD}}>{t}</th>)}</tr></thead>
        <tbody>{['A','B','C'].map(r=>{const ps=lista.filter(p=>p.ruta===r);const mora=ps.filter(p=>cuotasSinPago(p)>=1);const alr=ps.filter(p=>cuotasSinPago(p)>=3);const at=ps.reduce((s,p)=>s+saldoAtrasado(p),0);return <tr key={r} style={{borderBottom:'1px solid '+BD,background:alr.length?DNB+'44':undefined}}><td style={{padding:'8px'}}><RTag r={r}/><CTag r={r}/></td><td style={{padding:'8px',fontWeight:600}}>{ps.length}</td><td style={{padding:'8px',fontWeight:600,color:mora.length?WN:FT}}>{mora.length}</td><td style={{padding:'8px',fontWeight:600,color:alr.length?DN:FT}}>{alr.length}</td><td style={{padding:'8px',fontWeight:600,color:at?DN:FT}}>{at?fmt(at):'-'}</td></tr>;})}
        </tbody>
      </table></div>
    </Panel>
    {alerta.length>0&&<Panel title={'Alerta: '+alerta.length+' cliente'+(alerta.length!==1?'s':'')+' con 3+ cuotas sin pagar'}>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:460}}>
        <thead><tr>{['Cliente','Ruta','Cuotas sin pago','Atrasado'].map((t,i)=><th key={i} style={{textAlign:'left',padding:'5px 8px',fontSize:11,color:MT,fontWeight:700,borderBottom:'2px solid '+BD}}>{t}</th>)}</tr></thead>
        <tbody>{alerta.map(x=><tr key={x.p.id} style={{borderBottom:'1px solid '+BD,background:DNB+'44'}}><td style={{padding:'7px 9px',fontWeight:600,cursor:'pointer',color:G}} onClick={()=>onVerCliente(x.p)}>{x.p.nombre}</td><td style={{padding:'7px 4px'}}><RTag r={x.p.ruta}/></td><td style={{padding:'7px 9px',fontWeight:700,color:DN,fontSize:15}}>{x.cc}</td><td style={{padding:'7px 9px',fontWeight:700,color:DN}}>{fmt(saldoAtrasado(x.p))}</td></tr>)}</tbody>
      </table></div>
    </Panel>}
    <Panel title="Con saldo atrasado">
      {conSaldo.length===0?<Empty msg="Nadie tiene saldo atrasado."/>:<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:560}}>
        <thead><tr>{['Cliente','Ruta','Atrasado','Ultimo abono','Saldo total'].map((t,i)=><th key={i} style={{textAlign:'left',padding:'5px 8px',fontSize:11,color:MT,fontWeight:700,borderBottom:'2px solid '+BD}}>{t}</th>)}</tr></thead>
        <tbody>{conSaldo.map(p=>{const abs=(p.abonos||[]).filter(a=>a&&a.monto>0&&a.fecha).sort((a,b)=>parseD(b.fecha)-parseD(a.fecha));const ult=abs[0];return <tr key={p.id} style={{borderBottom:'1px solid '+BD}}><td style={{padding:'8px 9px',fontWeight:600,cursor:'pointer',color:G}} onClick={()=>onVerCliente(p)}>{p.nombre}</td><td style={{padding:'8px 4px'}}><RTag r={p.ruta}/><CTag r={p.ruta}/></td><td style={{padding:'8px 9px',fontWeight:700,color:DN}}>{fmt(saldoAtrasado(p))}</td><td style={{padding:'8px 9px',fontSize:12,color:MT}}>{ult?fmt(ult.monto)+' - '+fmtF(parseD(ult.fecha)):'nunca'}</td><td style={{padding:'8px 9px',fontWeight:700}}>{fmt(saldoTotal(p))}</td></tr>;})}
        </tbody>
      </table></div>}
    </Panel>
  </div>;
}

function FinanzasView({prestamos,salidas,onSaveSalida,onDeleteSalida}){
  const [sf,setSf]=useState(todayDS());const [sc,setSc]=useState(CATS[0]);const [sm,setSm]=useState('');const [sq,setSq]=useState('');
  const rr=useMemo(()=>{const sal=salidas.reduce((s,x)=>s+x.monto,0);const r={cap:0,capRec:0,intCob:0,capCalle:0,intPend:0,sal};prestamos.forEach(p=>{r.cap+=p.monto;r.capRec+=capitalRecuperado(p);r.intCob+=interesCobrado(p);if(!isTerminado(p)){r.capCalle+=Math.max(0,p.monto-capitalRecuperado(p));r.intPend+=Math.max(0,(p.monto*0.4)-interesCobrado(p));}});r.ganancia=r.intCob-r.sal;return r;},[prestamos,salidas]);
  const guardar=()=>{if(!sm||parseFloat(sm)<=0)return;onSaveSalida({id:Date.now(),fecha:sf,cat:sc,monto:parseFloat(sm),quien:sq});setSm('');setSq('');};
  return <div>
    <div style={{fontSize:20,fontWeight:700,marginBottom:14}}>Finanzas</div>
    <Panel title="Rentabilidad">
      <div style={{background:GB,border:'1px solid '+G+'22',borderRadius:8,padding:14,marginBottom:14}}>
        {[{l:'Interes cobrado (ganancia bruta)',v:rr.intCob,c:OK},{l:'- Salidas de caja',v:rr.sal,c:DN},{l:'= Ganancia neta',v:rr.ganancia,c:rr.ganancia>0?OK:DN,big:true},{l:'Capital en la calle',v:rr.capCalle,c:WN},{l:'+ Interes por cobrar',v:rr.intPend,c:MT},{l:'= Total si todos pagan',v:rr.capCalle+rr.intPend,c:TX,big:true}].map((row,i)=><div key={i} style={{marginBottom:10}}><div style={{fontSize:12,color:MT}}>{row.l}</div><div style={{fontSize:row.big?22:18,fontWeight:700,color:row.c}}>{fmt(row.v)}</div></div>)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(128px,1fr))',gap:9}}>
        <KPI label="Capital colocado" value={fmt(rr.cap)}/>
        <KPI label="Capital recuperado" value={fmt(rr.capRec)} vc={OK}/>
        <KPI label="Salidas de caja" value={fmt(rr.sal)} vc={DN}/>
      </div>
    </Panel>
    <Panel title="Registrar salida">
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12,maxWidth:640}}>
        <Inp label="Fecha" type="date" value={sf} onChange={e=>setSf(e.target.value)}/>
        <Sel label="Categoria" value={sc} onChange={e=>setSc(e.target.value)}>{CATS.map(c=><option key={c} value={c}>{c}</option>)}</Sel>
        <Inp label="Monto ($)" type="number" value={sm} onChange={e=>setSm(e.target.value)} placeholder="150000"/>
        <Inp label="Concepto" value={sq} onChange={e=>setSq(e.target.value)} placeholder="descripcion"/>
      </div>
      <Btn v="primary" style={{marginTop:12}} onClick={guardar}>Registrar salida</Btn>
    </Panel>
    <Panel title={'Salidas - '+fmt(salidas.reduce((s,x)=>s+x.monto,0))}>
      {salidas.length===0?<Empty msg="Sin salidas registradas."/>:<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:440}}>
        <thead><tr>{['Fecha','Categoria','Concepto','Monto',''].map((t,i)=><th key={i} style={{textAlign:'left',padding:'5px 8px',fontSize:11,color:MT,fontWeight:700,borderBottom:'2px solid '+BD}}>{t}</th>)}</tr></thead>
        <tbody>{salidas.slice().sort((a,b)=>parseD(b.fecha)-parseD(a.fecha)).map(x=><tr key={x.id} style={{borderBottom:'1px solid '+BD}}><td style={{padding:'7px 9px',fontSize:12,color:MT}}>{fmtF(parseD(x.fecha))}</td><td style={{padding:'7px 9px'}}>{x.cat}</td><td style={{padding:'7px 9px',fontSize:12}}>{x.quien||'-'}</td><td style={{padding:'7px 9px',fontWeight:600,color:DN}}>{fmt(x.monto)}</td><td style={{padding:'7px 5px'}}><Btn sm v="danger" onClick={()=>onDeleteSalida(x.id)}>Borrar</Btn></td></tr>)}</tbody>
      </table></div>}
    </Panel>
  </div>;
}

function NuevoView({editando,onGuardar,onCancelar}){
  const [nombre,setNombre]=useState(editando?.nombre||'');
  const [tel,setTel]=useState(editando?.tel||'');
  const [fecha,setFecha]=useState(editando?.fechaPrestamo||todayDS());
  const [ruta,setRuta]=useState(editando?.ruta||'');
  const [monto,setMonto]=useState(editando?.monto||'');
  const cuota=monto?calcCuota(parseFloat(monto)):0;
  const guardar=()=>{if(!nombre.trim()||!ruta||!fecha||!monto||parseFloat(monto)<=0)return;onGuardar({nombre:nombre.trim(),tel,fechaPrestamo:fecha,ruta,monto:parseFloat(monto),cuota:calcCuota(parseFloat(monto))});};
  return <div>
    <div style={{fontSize:20,fontWeight:700,marginBottom:14}}>{editando?'Editar prestamo':'Registrar prestamo'}</div>
    {editando&&<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,background:GB,border:'1px solid '+G+'44',borderRadius:8,padding:'10px 14px',marginBottom:14,fontSize:13,color:G,flexWrap:'wrap'}}><span>Editando: {editando.nombre}</span><Btn sm onClick={onCancelar}>Cancelar</Btn></div>}
    <Panel title="">
      <div style={{maxWidth:520}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
          <Inp label="Nombre del cliente" value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="Juan Perez" autoFocus/>
          <Inp label="Telefono (opcional)" value={tel} onChange={e=>setTel(e.target.value)} placeholder="300 000 0000"/>
          <Inp label="Fecha del prestamo" type="date" value={fecha} onChange={e=>setFecha(e.target.value)}/>
          <Sel label="Ruta" value={ruta} onChange={e=>setRuta(e.target.value)}><option value="">Seleccionar...</option><option value="A">Ruta A - Junior, lunes</option><option value="B">Ruta B - Jhon, lunes</option><option value="C">Ruta C - Jhon, jueves</option></Sel>
          <Inp label="Monto prestado ($)" type="number" value={monto} onChange={e=>setMonto(e.target.value)} placeholder="200000" min="1"/>
          <Inp label="Cuota semanal" value={cuota?fmt(cuota):''} readOnly style={{background:S2}}/>
        </div>
        {monto&&<div style={{padding:'10px 13px',background:S2,borderRadius:8,fontSize:13,color:MT,marginBottom:12}}>Capital: <b>{fmt(parseFloat(monto))}</b> - Interes 40%: <b>{fmt(parseFloat(monto)*0.4)}</b> - Total: <b style={{color:G}}>{fmt(parseFloat(monto)*1.4)}</b></div>}
        <div style={{display:'flex',gap:8}}><Btn v="primary" onClick={guardar}>{editando?'Guardar cambios':'Guardar prestamo'}</Btn>{editando&&<Btn onClick={onCancelar}>Cancelar</Btn>}</div>
      </div>
    </Panel>
  </div>;
}

function RespaldoView({prestamos,salidas,onRestaurar}){
  const fileRef=useRef(null);
  const exportar=()=>{const data={app:'Mi Cartera',version:8,exportado:new Date().toISOString(),prestamos,salidas};const b=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download='cartera-'+todayDS()+'.json';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);};
  const importar=e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=ev=>{try{const d=JSON.parse(String(ev.target?.result));if(!d.prestamos||!Array.isArray(d.prestamos))return alert('Archivo invalido');if(!window.confirm('Cargar '+d.prestamos.length+' prestamos? Esto reemplaza todo.'))return;onRestaurar(d);}catch{alert('No se pudo leer el archivo.');}};r.readAsText(f);e.target.value='';};
  return <div>
    <div style={{fontSize:20,fontWeight:700,marginBottom:14}}>Respaldo de datos</div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(128px,1fr))',gap:9,marginBottom:14}}>
      <KPI label="Prestamos" value={prestamos.length} sub={prestamos.filter(p=>!isTerminado(p)).length+' activos'}/>
      <KPI label="Total abonado" value={fmt(prestamos.reduce((s,p)=>s+totalAbonado(p),0))} vc={OK}/>
      <KPI label="Por cobrar" value={fmt(prestamos.filter(p=>!isTerminado(p)).reduce((s,p)=>s+saldoTotal(p),0))}/>
    </div>
    <Panel title="Guardar copia"><p style={{fontSize:13,color:MT,marginBottom:12,lineHeight:1.6}}>Descarga un JSON con todos tus datos.</p><Btn v="primary" onClick={exportar}>Descargar respaldo (JSON)</Btn></Panel>
    <Panel title="Restaurar desde archivo"><p style={{fontSize:13,color:MT,marginBottom:12,lineHeight:1.6}}>Carga un JSON descargado antes. Reemplaza todo.</p><Btn onClick={()=>fileRef.current?.click()}>Cargar archivo</Btn><input ref={fileRef} type="file" accept=".json" onChange={importar} style={{display:'none'}}/></Panel>
  </div>;
}

export default function App(){
  const [currentUser,setCurrentUser]=useState(null);
  const [prestamos,setPrestamos]=useState([]);
  const [salidas,setSalidas]=useState([]);
  const [loading,setLoading]=useState(true);
  const [view,setView]=useState('dashboard');
  const [editando,setEditando]=useState(null);
  const [clienteModal,setClienteModal]=useState(null);
  const [semOff,setSemOff]=useState(0);
  const [flujoOff,setFlujoOff]=useState(0);
  const [toasts,setToasts]=useState([]);
  const [syncOk,setSyncOk]=useState(true);

  const notify=useCallback((msg,err=false)=>{const id=Date.now()+Math.random();setToasts(t=>[...t,{id,msg,err}].slice(-3));setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3200);},[]);

  useEffect(()=>{
    const presRef=ref(db,'prestamos');
    const salRef=ref(db,'salidas');
    let first=true;
    const unsubP=onValue(presRef,snap=>{
      const val=snap.val();
      const arr=val&&Array.isArray(val)?val:val?Object.values(val):[];
      if(first&&arr.length===0){set(presRef,SEED_DATA.prestamos);set(salRef,SEED_DATA.salidas);first=false;}
      else{setPrestamos(arr);setLoading(false);first=false;}
    },()=>setSyncOk(false));
    const unsubS=onValue(salRef,snap=>{const val=snap.val();setSalidas(val&&Array.isArray(val)?val:val?Object.values(val):[]);});
    return()=>{unsubP();unsubS();};
  },[]);

  const saveP=useCallback(async next=>{setPrestamos(next);try{await set(ref(db,'prestamos'),next);}catch{notify('Error al guardar.',true);}},[]);
  const saveS=useCallback(async next=>{setSalidas(next);try{await set(ref(db,'salidas'),next);}catch{notify('Error al guardar.',true);}},[]);

  const handleGuardar=useCallback(data=>{
    if(editando){saveP(prestamos.map(p=>p.id===editando.id?{...p,...data}:p));notify('Prestamo actualizado.');}
    else{saveP([{...data,id:Date.now(),abonos:new Array(10).fill(null)},...prestamos]);notify('Prestamo guardado.');}
    setEditando(null);setView('consolidado');
  },[prestamos,editando]);

  const handleDelete=useCallback(p=>{if(!window.confirm('Eliminar el prestamo de '+p.nombre+'?'))return;saveP(prestamos.filter(x=>x.id!==p.id));notify('Prestamo eliminado.');},[prestamos]);

  const handleSave=useCallback((id,idx,val,fSem,fOverride,esExt)=>{
    const next=prestamos.map(p=>{
      if(p.id!==id)return p;
      const rawAb=p.abonos?( Array.isArray(p.abonos)?p.abonos:Object.values(p.abonos)):[]; const abs=[...rawAb];while(abs.length<=idx)abs.push(null);
      const fDef=idx<10?toDS(fechasCuotas(p)[idx]):(fSem||todayDS());
      if(val==='limpiar'){abs[idx]=null;}
      else if(val==='completo'){const aSnSlot=(abs||[]).reduce((s,a,i2)=>i2===idx?s:s+((a&&a.monto)||0),0);const sA=Math.max(0,totalDeuda(p)-aSnSlot);abs[idx]={monto:esExt?Math.round(sA):p.cuota,fecha:(abs[idx]&&abs[idx].fecha)||fDef};}
      else if(val===0||val==='0'){abs[idx]={monto:0,fecha:fDef};}
      else if(fOverride!=null&&val===null){if(abs[idx])abs[idx]={...abs[idx],fecha:fOverride};}
      else{const n=Math.max(0,parseFloat(val)||0);const pv=abs[idx];abs[idx]={monto:n,fecha:(pv&&pv.fecha)||fDef};}
      return{...p,abonos:abs};
    });
    saveP(next);
  },[prestamos]);

  const handleSaveSalida=useCallback(sal=>{saveS([...salidas,sal]);notify('Salida registrada.');},[salidas]);
  const handleDeleteSalida=useCallback(id=>{if(!window.confirm('Eliminar esta salida?'))return;saveS(salidas.filter(x=>x.id!==id));notify('Salida eliminada.');},[salidas]);
  const handleRestaurar=useCallback(data=>{saveP(data.prestamos||[]);saveS(data.salidas||[]);notify('Datos restaurados.');},[]);
  const totalCS=useMemo(()=>prestamos.filter(p=>!isTerminado(p)).filter(tieneSaldoAtrasado).length,[prestamos]);

  if(!currentUser)return <LoginScreen onLogin={u=>{setCurrentUser(u);setView('dashboard');}}/>;
  if(loading)return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#F0F2F0',flexDirection:'column',gap:14,fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif'}}><div style={{fontSize:22,fontWeight:700,color:G}}>Mi Cartera</div><div style={{fontSize:13,color:MT}}>Conectando...</div></div>;

  const NAV=[
    {k:'dashboard',l:'Dashboard',i:'D'},
    ...(currentUser.rol==='admin'?[{k:'nuevo',l:'Nuevo prestamo',i:'+'}]:[]),
    {k:'semana',l:'Cobros por semana',i:'C'},
    {k:'consolidado',l:'Consolidado',i:'L'},
    {k:'riesgo',l:'Riesgo y moras',i:'R',b:totalCS},
    ...(currentUser.rol==='admin'?[{k:'finanzas',l:'Finanzas',i:'$'},{k:'respaldo',l:'Respaldo',i:'B',bot:true}]:[]),
  ];

  return <div style={{display:'flex',height:'100vh',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',color:TX,background:'#F0F2F0',WebkitFontSmoothing:'antialiased'}}>
    {clienteModal&&<ModalCliente p={clienteModal} onClose={()=>setClienteModal(null)}/>}
    <nav style={{width:204,minWidth:204,background:SF,borderRight:'1px solid '+BD,display:'flex',flexDirection:'column',padding:'10px 0',height:'100vh',overflowY:'auto'}}>
      <div style={{padding:'0 13px 12px',borderBottom:'1px solid '+BD,marginBottom:5}}>
        <div style={{fontSize:16,fontWeight:700,color:G}}>Mi Cartera</div>
        <div style={{fontSize:11,color:FT,marginTop:2}}>{currentUser.nombre}</div>
      </div>
      {NAV.filter(n=>!n.bot).map(n=><button key={n.k} onClick={()=>setView(n.k)} style={{display:'flex',alignItems:'center',gap:7,padding:'8px 13px',background:view===n.k?GB:'transparent',color:view===n.k?G:MT,border:'none',cursor:'pointer',fontSize:13,fontWeight:view===n.k?700:400,textAlign:'left',width:'100%',fontFamily:'inherit',borderLeft:view===n.k?'3px solid '+G:'3px solid transparent'}}><span>{n.i}</span><span style={{flex:1}}>{n.l}</span>{n.b>0&&<span style={{background:DNB,color:DN,borderRadius:9,padding:'1px 6px',fontSize:11,fontWeight:700}}>{n.b}</span>}</button>)}
      <div style={{flex:1}}/>
      {NAV.filter(n=>n.bot).map(n=><button key={n.k} onClick={()=>setView(n.k)} style={{display:'flex',alignItems:'center',gap:7,padding:'8px 13px',background:view===n.k?GB:'transparent',color:view===n.k?G:MT,border:'none',cursor:'pointer',fontSize:13,fontWeight:view===n.k?700:400,textAlign:'left',width:'100%',fontFamily:'inherit',borderLeft:view===n.k?'3px solid '+G:'3px solid transparent'}}><span>{n.i}</span><span>{n.l}</span></button>)}
      <button onClick={()=>setCurrentUser(null)} style={{display:'flex',alignItems:'center',gap:7,padding:'10px 13px',background:'transparent',color:DN,border:'none',cursor:'pointer',fontSize:13,textAlign:'left',width:'100%',fontFamily:'inherit',borderTop:'1px solid '+BD,marginTop:4}}>Cerrar sesion</button>
      {!syncOk&&<div style={{padding:'8px 13px',fontSize:11,color:WN,background:WNB}}>Sin conexion a BD</div>}
    </nav>
    <main style={{flex:1,overflowY:'auto',padding:'18px 24px 60px'}}>
      {view==='dashboard'&&<Dashboard prestamos={prestamos} flujoOff={flujoOff} setFlujoOff={setFlujoOff} onVerCliente={setClienteModal}/>}
      {view==='nuevo'&&currentUser.rol==='admin'&&<NuevoView editando={editando} onGuardar={handleGuardar} onCancelar={()=>{setEditando(null);setView('consolidado');}}/>}
      {view==='semana'&&<CobrosView prestamos={prestamos} onSave={handleSave} semOff={semOff} setSemOff={setSemOff} currentUser={currentUser} onVerCliente={setClienteModal}/>}
      {view==='consolidado'&&<ConsolidadoView prestamos={prestamos} onEdit={p=>{setEditando(p);setView('nuevo');}} onDelete={handleDelete} currentUser={currentUser} onVerCliente={setClienteModal}/>}
      {view==='riesgo'&&<RiesgoView prestamos={prestamos} currentUser={currentUser} onVerCliente={setClienteModal}/>}
      {view==='finanzas'&&currentUser.rol==='admin'&&<FinanzasView prestamos={prestamos} salidas={salidas} onSaveSalida={handleSaveSalida} onDeleteSalida={handleDeleteSalida}/>}
      {view==='respaldo'&&currentUser.rol==='admin'&&<RespaldoView prestamos={prestamos} salidas={salidas} onRestaurar={handleRestaurar}/>}
    </main>
    <Toast toasts={toasts} onDismiss={id=>setToasts(t=>t.filter(x=>x.id!==id))}/>
  </div>;
}
