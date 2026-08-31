import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { db } from './firebase';
import { ref, onValue, set, get } from 'firebase/database';
import SEED_DATA from './seedData';

/* ── USUARIOS ─────────────────────────────────────────────── */
const USERS = [
  { id: 'cindy', nombre: 'Cindy Arrieta', usuario: 'cindy', clave: 'Hannen-123', rol: 'admin' },
  { id: 'junior', nombre: 'Junior', usuario: 'junior', clave: '123', rol: 'cobrador', ruta: 'A' },
  { id: 'jhon', nombre: 'Jhon', usuario: 'jhon', clave: '1234', rol: 'cobrador', rutas: ['B','C'] },
];

/* ── COLORES ──────────────────────────────────────────────── */
const C = {
  bg:'#F0F2F0', surface:'#FFFFFF', s2:'#F6F8F6',
  border:'rgba(20,40,20,.09)', borderS:'rgba(20,40,20,.18)',
  text:'#1A221A', muted:'#5A6A5A', faint:'#90A090',
  green:'#1A6B3A', greenBg:'#E5F3EC',
  ok:'#157A3D', okBg:'#E3F5EC',
  warn:'#7A4A08', warnBg:'#FDF1DC',
  danger:'#8C1A1A', dangerBg:'#F7E3E3',
  rutaA:'#1A5C8C', rutaABg:'#E3EEF7',
  rutaB:'#6B3A8C', rutaBBg:'#F0E8F7',
  rutaC:'#8C5A1A', rutaCBg:'#F7EFE3',
};

/* ── CONSTANTES ───────────────────────────────────────────── */
const RUTAS = {
  A:{ cobrador:'Junior', dia:'Lunes' },
  B:{ cobrador:'Jhon', dia:'Lunes' },
  C:{ cobrador:'Jhon', dia:'Jueves' },
};
const CATS = ['Pago cobrador','Transporte','Retiro personal','Otro gasto'];
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MESES_L = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

/* ── LÓGICA CORE ──────────────────────────────────────────── */
function HOY(){ const d=new Date(); d.setHours(0,0,0,0); return d; }
function parseD(s){ const p=String(s).split('-').map(Number); const d=new Date(p[0],p[1]-1,p[2]); d.setHours(0,0,0,0); return d; }
function toDS(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function todayDS(){ return toDS(HOY()); }
function fmtF(d){ return DIAS[d.getDay()]+' '+d.getDate()+' '+MESES[d.getMonth()]; }
function fmtFL(d){ return d.getDate()+' de '+MESES_L[d.getMonth()]+' de '+d.getFullYear(); }
function fmt(n){ const v=Math.round(n); return (v<0?'-$':'$')+Math.abs(v).toLocaleString('es-CO'); }
function calcCuota(m){ return m*1.4/10; }
function totalDeuda(p){ return p.monto*1.4; }
function semRango(off){
  const h=HOY(); const dw=h.getDay()===0?6:h.getDay()-1;
  const lun=new Date(h); lun.setDate(h.getDate()-dw+off*7); lun.setHours(0,0,0,0);
  const dom=new Date(lun); dom.setDate(lun.getDate()+6);
  return {lun,dom};
}
function enRango(f,l,d){ return f>=l&&f<=d; }
function fechasCuotas(p){
  const ini=parseD(p.fechaPrestamo);
  return Array.from({length:10},(_,k)=>{ const d=new Date(ini); d.setDate(d.getDate()+7*(k+1)); return d; });
}
function abonoMonto(p,i){ const a=p.abonos?.[i]; return a?a.monto:null; }
function abonoFecha(p,i){ const a=p.abonos?.[i]; return (a&&a.fecha)?a.fecha:null; }
function totalAbonado(p){ return (p.abonos||[]).reduce((s,a)=>s+((a&&a.monto)||0),0); }
function saldoTotal(p){ return Math.max(0,totalDeuda(p)-totalAbonado(p)); }
function isTerminado(p){ return totalAbonado(p)>=totalDeuda(p)-0.5; }
function estadoCuota(p,i,hoy){
  const h=hoy||HOY(); const f=fechasCuotas(p); const m=abonoMonto(p,i);
  if(i>=10){ if(m==null||m===0)return m===0?'nopago':'sinregistro'; const prev=(p.abonos||[]).slice(0,i).reduce((s,a)=>s+((a&&a.monto)||0),0); return m>=Math.max(0,totalDeuda(p)-prev)-0.5?'completa':'parcial'; }
  if(m==null){ if(f[i]<h)return 'sinregistro'; if(f[i].getTime()===h.getTime())return 'hoy'; return 'futuro'; }
  if(m===0)return 'nopago'; if(m>=p.cuota-0.5)return 'completa'; return 'parcial';
}
function saldoCuota(p,i){ const m=abonoMonto(p,i); return m==null?p.cuota:Math.max(0,p.cuota-m); }
function cuotasVencidas(p){ const h=HOY(); return fechasCuotas(p).map((f,i)=>({f,i})).filter(x=>x.f<=h); }
function saldoAtrasado(p){
  const c10=fechasCuotas(p); const h=HOY();
  if(c10[9]<h&&saldoTotal(p)>0.5)return saldoTotal(p);
  return cuotasVencidas(p).reduce((s,x)=>s+saldoCuota(p,x.i),0);
}
function tieneSaldoAtrasado(p){ return saldoAtrasado(p)>0.5; }
function cuotasSinPago(p){ return cuotasVencidas(p).filter(x=>{ const e=estadoCuota(p,x.i); return e==='nopago'||e==='sinregistro'; }).length; }
function todosLosRecaudos(prestamos){
  const o=[];
  (prestamos||[]).forEach(p=>{
    const fechas=fechasCuotas(p);
    (p.abonos||[]).forEach((a,i)=>{ if(a&&a.monto>0&&a.fecha){ const fC=i<fechas.length?fechas[i]:parseD(a.fecha); o.push({p,i,monto:a.monto,fecha:parseD(a.fecha),fechaCuota:fC,ext:i>=10}); } });
  });
  return o.sort((a,b)=>b.fecha-a.fecha);
}
function capitalRecuperado(p){ const ab=totalAbonado(p); const d=totalDeuda(p); if(d<=0)return 0; return Math.min(p.monto,ab*(p.monto/d)); }
function interesCobrado(p){ return Math.max(0,totalAbonado(p)-capitalRecuperado(p)); }
function esDudoso(p){
  const h=HOY(); const fechas=fechasCuotas(p);
  const abs=(p.abonos||[]).map((a)=>(a&&a.monto>0&&a.fecha)?parseD(a.fecha):null).filter(Boolean);
  const ultimo=abs.length?new Date(Math.max.apply(null,abs)):parseD(p.fechaPrestamo);
  return !isTerminado(p)&&fechas.filter(f=>f<=h&&f>ultimo).length>=4;
}
function deficitSistematico(p){
  const pagos=(p.abonos||[]).filter(a=>a&&a.monto>0).map(a=>a.monto);
  if(pagos.length<2)return null;
  const montos=[...new Set(pagos.map(m=>Math.round(m/100)*100))];
  if(montos.length!==1)return null;
  const habitual=pagos[0]; const diff=p.cuota-habitual;
  if(diff<=100)return null;
  return{habitual,diferencia:diff,veces:pagos.length,acumulado:diff*pagos.length};
}
function esPrimerPrestamo(p,prestamos){
  const k=String(p.nombre||'').trim().toLowerCase(); let primero=null;
  prestamos.forEach(o=>{ if(String(o.nombre||'').trim().toLowerCase()!==k)return; if(!primero)primero=o; else{ const fo=parseD(o.fechaPrestamo),fp=parseD(primero.fechaPrestamo); if(fo<fp||(fo.getTime()===fp.getTime()&&o.id<primero.id))primero=o; } });
  return primero&&primero.id===p.id;
}

/* ── UI BÁSICA ────────────────────────────────────────────── */
function RTag({r}){ const cols={A:[C.rutaA,C.rutaABg],B:[C.rutaB,C.rutaBBg],C:[C.rutaC,C.rutaCBg]}; const [c,bg]=cols[r]||[C.muted,C.s2]; return <span style={{display:'inline-block',padding:'2px 7px',borderRadius:5,background:bg,color:c,fontSize:11,fontWeight:700}}>Ruta {r}</span>; }
function CobTag({r}){ const isJ=RUTAS[r]?.cobrador==='Junior'; return <span style={{display:'inline-block',padding:'1px 6px',borderRadius:5,background:isJ?C.rutaABg:C.rutaBBg,color:isJ?C.rutaA:C.rutaB,fontSize:10,fontWeight:700,marginLeft:4}}>{RUTAS[r]?.cobrador}</span>; }
function Bdg({children,type='n'}){ const s={ok:[C.ok,C.okBg],warn:[C.warn,C.warnBg],danger:[C.danger,C.dangerBg],n:[C.muted,C.s2],accent:[C.green,C.greenBg]}; const[c,bg]=s[type]||s.n; return <span style={{display:'inline-block',padding:'2px 7px',borderRadius:5,background:bg,color:c,fontSize:11,fontWeight:700}}>{children}</span>; }
function KPI({label,value,sub,vc}){ return <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'13px 15px',minWidth:110}}><div style={{fontSize:11,color:C.muted,marginBottom:3}}>{label}</div><div style={{fontSize:20,fontWeight:700,color:vc||C.text,lineHeight:1.1}}>{value}</div>{sub&&<div style={{fontSize:11,color:C.faint,marginTop:2}}>{sub}</div>}</div>; }
function MBar({pct,color}){ return <div style={{height:4,borderRadius:2,background:C.s2,overflow:'hidden',marginTop:3}}><div style={{height:'100%',borderRadius:2,background:color||C.green,width:Math.min(100,Math.max(0,pct))+'%'}}/></div>; }
function DotsRow({p}){ const h=HOY(); const n=Math.max(10,(p.abonos||[]).length); return <div style={{display:'flex',gap:2,flexWrap:'wrap',marginTop:3}}>{Array.from({length:n},(_,i)=>{ const e=estadoCuota(p,i,h); const m=abonoMonto(p,i); let bg=C.s2,co=C.faint,bo=C.border; if(e==='completa'){bg=C.ok;co='#fff';bo=C.ok;}else if(e==='parcial'){bg=C.warnBg;co=C.warn;bo=C.warn;}else if(e==='nopago'||e==='sinregistro'){bg=C.dangerBg;co=C.danger;bo=C.danger;} return <span key={i} title={`C${i+1}${m!=null?` — ${fmt(m)}`:''}`} style={{width:15,height:15,borderRadius:3,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,border:`1px solid ${bo}`,background:bg,color:co}}>{i+1}</span>; })}</div>; }
function Empty({msg}){ return <div style={{textAlign:'center',padding:'2rem 1rem',color:C.faint,fontSize:13}}>{msg||'Sin datos'}</div>; }
function Inp({label,style:s,...p}){ return <div style={{display:'flex',flexDirection:'column',gap:3,...s}}>{label&&<label style={{fontSize:12,color:C.muted,fontWeight:600}}>{label}</label>}<input style={{padding:'8px 10px',border:`1px solid ${C.borderS}`,borderRadius:7,background:C.surface,color:C.text,fontSize:13,fontFamily:'inherit',width:'100%',boxSizing:'border-box'}} {...p}/></div>; }
function Sel({label,children,style:s,...p}){ return <div style={{display:'flex',flexDirection:'column',gap:3,...s}}>{label&&<label style={{fontSize:12,color:C.muted,fontWeight:600}}>{label}</label>}<select style={{padding:'8px 10px',border:`1px solid ${C.borderS}`,borderRadius:7,background:C.surface,color:C.text,fontSize:13,fontFamily:'inherit',width:'100%'}} {...p}>{children}</select></div>; }
function Btn({children,v='ghost',sm,style:s,...p}){ const base={display:'inline-flex',alignItems:'center',gap:5,padding:sm?'4px 9px':'8px 13px',borderRadius:7,fontSize:sm?12:13,cursor:'pointer',border:`1px solid ${C.borderS}`,fontFamily:'inherit',fontWeight:500,...s}; const vs={ghost:{...base,background:C.surface,color:C.text},primary:{...base,background:C.green,color:'#fff',border:`1px solid ${C.green}`},danger:{...base,color:C.danger,borderColor:C.dangerBg}}; return <button style={vs[v]||vs.ghost} {...p}>{children}</button>; }
function Panel({title,children,tr}){ return <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:11,padding:'16px 18px',marginBottom:12}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:title?12:0,flexWrap:'wrap',gap:8}}>{title&&<div style={{fontSize:14,fontWeight:700,color:C.text}}>{title}</div>}{tr}</div>{children}</div>; }
function Toast({toasts,onDismiss}){ return <div style={{position:'fixed',top:14,right:14,zIndex:300,display:'flex',flexDirection:'column',gap:7}}>{toasts.map(t=><div key={t.id} onClick={()=>onDismiss(t.id)} style={{background:t.err?C.dangerBg:C.okBg,color:t.err?C.danger:C.ok,padding:'9px 14px',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',boxShadow:'0 4px 14px rgba(0,0,0,.1)'}}>{t.msg}</div>)}</div>; }

/* ── LOGIN ────────────────────────────────────────────────── */
function LoginScreen({onLogin}){
  const [usuario,setUsuario]=useState('');
  const [clave,setClave]=useState('');
  const [error,setError]=useState('');
  const intentar=()=>{
    const u=USERS.find(x=>x.usuario.toLowerCase()===usuario.trim().toLowerCase()&&x.clave===clave);
    if(!u){setError('Usuario o contraseña incorrectos');return;}
    setError(''); onLogin(u);
  };
  return(
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:`linear-gradient(135deg,${C.green} 0%,#0d4a26 100%)`,fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif'}}>
      <div style={{background:C.surface,borderRadius:16,padding:'40px 36px',width:'100%',maxWidth:380,boxShadow:'0 24px 48px rgba(0,0,0,.25)'}}>
        <div style={{textAlign:'center',marginBottom:28}}>
          <div style={{fontSize:32,marginBottom:8}}>💵</div>
          <div style={{fontSize:24,fontWeight:700,color:C.green}}>Mi Cartera</div>
          <div style={{fontSize:13,color:C.muted,marginTop:4}}>Sistema de gestión de préstamos</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <Inp label="Usuario" value={usuario} onChange={e=>setUsuario(e.target.value)} placeholder="Ej: cindy" onKeyDown={e=>e.key==='Enter'&&intentar()} autoFocus/>
          <Inp label="Contraseña" type="password" value={clave} onChange={e=>setClave(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==='Enter'&&intentar()}/>
          {error&&<div style={{background:C.dangerBg,color:C.danger,padding:'8px 12px',borderRadius:7,fontSize:13}}>{error}</div>}
          <Btn v="primary" style={{width:'100%',justifyContent:'center',padding:'11px'}} onClick={intentar}>Ingresar</Btn>
        </div>
      </div>
    </div>
  );
}

/* ── DASHBOARD ────────────────────────────────────────────── */
function Dashboard({prestamos,flujoOff,setFlujoOff,currentUser}){
  const activos=useMemo(()=>prestamos.filter(p=>!isTerminado(p)),[prestamos]);
  const recs=useMemo(()=>todosLosRecaudos(prestamos),[prestamos]);
  const {lun,dom}=semRango(0);
  const {lun:fL,dom:fD}=semRango(flujoOff);
  const recSem=recs.filter(x=>enRango(x.fecha,lun,dom)).reduce((s,x)=>s+x.monto,0);
  const coEsta=[]; activos.forEach(p=>fechasCuotas(p).forEach((f,i)=>{if(enRango(f,lun,dom))coEsta.push({p,i});}));
  const esp=coEsta.reduce((s,x)=>s+x.p.cuota,0);
  const valPrestado=activos.reduce((s,p)=>s+saldoTotal(p),0);
  const totalAtras=activos.reduce((s,p)=>s+saldoAtrasado(p),0);
  const conSaldo=activos.filter(tieneSaldoAtrasado).length;
  const flujo=useMemo(()=>{
    const out={}; ['A','B','C'].forEach(r=>{out[r]={recogido:0,nAbonos:0,capital:0,nPrestamos:0,nNuevos:0,nRepiten:0};});
    recs.forEach(rc=>{if(enRango(rc.fecha,fL,fD)){out[rc.p.ruta].recogido+=rc.monto;out[rc.p.ruta].nAbonos++;}});
    prestamos.forEach(p=>{const fp=parseD(p.fechaPrestamo);if(enRango(fp,fL,fD)){out[p.ruta].capital+=p.monto;out[p.ruta].nPrestamos++;if(esPrimerPrestamo(p,prestamos))out[p.ruta].nNuevos++;else out[p.ruta].nRepiten++;}});
    return out;
  },[prestamos,flujoOff]);
  const HIST=8; const hist=useMemo(()=>Array.from({length:HIST},(_,k)=>{ const r=semRango(flujoOff-(HIST-1-k)); const f={}; ['A','B','C'].forEach(rt=>{f[rt]={recogido:0,nPrestamos:0,capital:0};}); recs.forEach(rc=>{if(enRango(rc.fecha,r.lun,r.dom))f[rc.p.ruta].recogido+=rc.monto;}); prestamos.forEach(p=>{if(enRango(parseD(p.fechaPrestamo),r.lun,r.dom)){f[p.ruta].capital+=p.monto;f[p.ruta].nPrestamos++;}}); return{lun:r.lun,dom:r.dom,f}; }),[prestamos,flujoOff]);
  return(
    <div>
      <div style={{fontSize:20,fontWeight:700,marginBottom:14}}>Dashboard</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(128px,1fr))',gap:9,marginBottom:14}}>
        <KPI label="Clientes activos" value={activos.length} sub="préstamos vigentes"/>
        <KPI label="Total por cobrar" value={fmt(valPrestado)} vc={C.green}/>
        <KPI label="Recaudado esta semana" value={fmt(recSem)} sub={`de ${fmt(esp)} esperado`} vc={C.ok}/>
        <KPI label="Saldo atrasado" value={fmt(totalAtras)} sub={`${conSaldo} clientes`} vc={C.danger}/>
        <KPI label="Capital entregado" value={fmt(activos.reduce((s,p)=>s+p.monto,0))} sub="sin interés"/>
      </div>
      <Panel title="Flujo por ruta" tr={
        <div style={{display:'flex',alignItems:'center',gap:7,flexWrap:'wrap'}}>
          <Btn sm onClick={()=>setFlujoOff(f=>f-1)}>‹</Btn>
          <span style={{fontSize:12,fontWeight:600,minWidth:200,textAlign:'center'}}>{fmtF(fL)} — {fmtF(fD)}</span>
          <Btn sm onClick={()=>setFlujoOff(f=>f+1)}>›</Btn>
          <Btn sm v="primary" onClick={()=>setFlujoOff(0)}>Esta semana</Btn>
        </div>
      }>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:600}}>
            <thead><tr>{['Ruta','Clientes','Recogido','Prestado','Flujo neto'].map((h,i)=><th key={i} style={{textAlign:'left',padding:'7px 9px',fontSize:11,color:C.muted,fontWeight:700,borderBottom:`2px solid ${C.border}`}}>{h}</th>)}</tr></thead>
            <tbody>
              {['A','B','C'].map(k=>{const d=flujo[k];const neto=d.recogido-d.capital;return(
                <tr key={k} style={{borderBottom:`1px solid ${C.border}`}}>
                  <td style={{padding:'9px'}}><RTag r={k}/><CobTag r={k}/><div style={{fontSize:11,color:C.faint,marginTop:2}}>{RUTAS[k].dia}</div></td>
                  <td style={{padding:'9px'}}><div style={{fontSize:17,fontWeight:700,color:d.nPrestamos?C.green:C.faint}}>{d.nPrestamos||'—'}</div>{d.nPrestamos>0&&<div style={{fontSize:11,color:C.muted}}>{d.nNuevos} nuevo{d.nNuevos!==1?'s':''}{d.nRepiten?` · ${d.nRepiten} repite${d.nRepiten!==1?'n':''}`:''}</div>}</td>
                  <td style={{padding:'9px',fontWeight:700,color:C.ok}}>{fmt(d.recogido)}<div style={{fontSize:11,color:C.faint,fontWeight:400}}>{d.nAbonos} abono{d.nAbonos!==1?'s':''}</div></td>
                  <td style={{padding:'9px',fontWeight:600}}>{fmt(d.capital)}</td>
                  <td style={{padding:'9px',fontWeight:700,fontSize:14,color:neto>0?C.ok:neto<0?C.danger:C.muted}}>{neto>0?'+':''}{fmt(neto)}</td>
                </tr>);})}
              {(()=>{const tR=['A','B','C'].reduce((s,k)=>s+flujo[k].recogido,0);const tC=['A','B','C'].reduce((s,k)=>s+flujo[k].capital,0);const n=tR-tC;return<tr style={{borderTop:`2px solid ${C.borderS}`,background:C.s2}}><td style={{padding:'9px',fontWeight:700}}>Total</td><td style={{padding:'9px',fontWeight:700}}>{['A','B','C'].reduce((s,k)=>s+flujo[k].nPrestamos,0)}</td><td style={{padding:'9px',fontWeight:700,color:C.ok}}>{fmt(tR)}</td><td style={{padding:'9px',fontWeight:700}}>{fmt(tC)}</td><td style={{padding:'9px',fontWeight:700,fontSize:14,color:n>0?C.ok:n<0?C.danger:C.muted}}>{n>0?'+':''}{fmt(n)}</td></tr>;})()}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title={`Historial — últimas ${HIST} semanas`}>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:680}}>
            <thead><tr><th style={{textAlign:'left',padding:'5px 8px',fontSize:10,color:C.muted,fontWeight:700,borderBottom:`2px solid ${C.border}`}}>Semana</th>{['A','B','C'].map(k=>[<th key={k+'r'} style={{padding:'5px 7px',fontSize:10,color:C.muted,fontWeight:700,borderBottom:`2px solid ${C.border}`}}><RTag r={k}/> Recogido</th>,<th key={k+'p'} style={{padding:'5px 7px',fontSize:10,color:C.muted,fontWeight:700,borderBottom:`2px solid ${C.border}`}}>Prestado</th>])}</tr></thead>
            <tbody>{hist.map((x,idx)=>{ const esA=x.lun.getTime()===semRango(flujoOff).lun.getTime(); return <tr key={idx} style={{borderBottom:`1px solid ${C.border}`,background:esA?C.greenBg:undefined}}><td style={{padding:'6px 8px',fontSize:11,color:esA?C.green:C.muted,fontWeight:esA?700:400}}>{x.lun.getDate()} {MESES[x.lun.getMonth()]} — {x.dom.getDate()} {MESES[x.dom.getMonth()]}</td>{['A','B','C'].map(k=>[<td key={k+'r'} style={{padding:'6px 7px',fontWeight:600,color:x.f[k].recogido?C.ok:C.faint}}>{x.f[k].recogido?fmt(x.f[k].recogido):'—'}</td>,<td key={k+'p'} style={{padding:'6px 7px',color:x.f[k].capital?C.text:C.faint}}>{x.f[k].capital?fmt(x.f[k].capital):'—'}</td>])}</tr>; })}</tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/* ── COBROS POR SEMANA ────────────────────────────────────── */
function CobrosView({prestamos,onSave,semOff,setSemOff,currentUser}){
  const [fr,setFr]=useState(currentUser.rol==='cobrador'?(currentUser.ruta||currentUser.rutas?.[0]||''):'');
  const {lun,dom}=semRango(semOff);
  const h=HOY();
  const cobros=useMemo(()=>{
    const out=[];
    prestamos.filter(p=>!isTerminado(p)).forEach(p=>{
      if(fr&&p.ruta!==fr)return;
      if(currentUser.rol==='cobrador'){
        const misRutas=currentUser.rutas||[currentUser.ruta];
        if(!misRutas.includes(p.ruta))return;
      }
      const cuotas=fechasCuotas(p); let tiene=false;
      cuotas.forEach((f,i)=>{if(enRango(f,lun,dom)){out.push({p,i,f,ext:false});tiene=true;}});
      if(!tiene&&saldoTotal(p)>0.5&&lun>cuotas[cuotas.length-1]) out.push({p,i:(p.abonos||[]).length,f:lun,ext:true});
    });
    return out;
  },[prestamos,semOff,fr,currentUser]);
  const porRuta={A:[],B:[],C:[]}; cobros.forEach(x=>porRuta[x.p.ruta].push(x));
  const rutasMostrar=currentUser.rol==='cobrador'?(currentUser.rutas||[currentUser.ruta]):['A','B','C'];
  return(
    <div>
      <div style={{fontSize:20,fontWeight:700,marginBottom:12}}>Cobros por semana</div>
      <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:12,flexWrap:'wrap'}}>
        <Btn sm onClick={()=>setSemOff(s=>s-1)}>‹</Btn>
        <span style={{fontSize:13,fontWeight:600,minWidth:220,textAlign:'center'}}>{fmtF(lun)} — {fmtF(dom)} {dom.getFullYear()}</span>
        <Btn sm onClick={()=>setSemOff(s=>s+1)}>›</Btn>
        <Btn sm v="primary" onClick={()=>setSemOff(0)}>Esta semana</Btn>
      </div>
      {currentUser.rol==='admin'&&<div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap'}}>
        {[{v:'',l:'Todas'},{v:'A',l:'A · Junior'},{v:'B',l:'B · Jhon'},{v:'C',l:'C · Jhon'}].map(x=><Btn key={x.v} sm v={fr===x.v?'primary':'ghost'} onClick={()=>setFr(x.v)}>{x.l}</Btn>)}
      </div>}
      {cobros.length===0?<Empty msg="Sin cobros esta semana."/>:(fr?[fr]:rutasMostrar).map(k=>{
        const xs=porRuta[k].sort((a,b)=>a.f-b.f||a.p.nombre.localeCompare(b.p.nombre));
        if(!xs.length)return null;
        const esp=xs.reduce((s,x)=>s+x.p.cuota,0); const rec=xs.reduce((s,x)=>s+(abonoMonto(x.p,x.i)||0),0);
        return <Panel key={k} title={<span><RTag r={k}/><CobTag r={k}/><span style={{fontSize:12,color:C.muted,marginLeft:7}}>{RUTAS[k].dia} · {xs.length} cobros</span></span>} tr={<span style={{fontSize:12,color:C.muted}}>Recogido <b style={{color:C.ok}}>{fmt(rec)}</b> de {fmt(esp)} · falta <b style={{color:C.danger}}>{fmt(esp-rec)}</b></span>}>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:660}}>
              <thead><tr>{['Cliente','Cuota','Vence','Pactado','Abonó','Saldo','Rápido'].map((h,i)=><th key={i} style={{textAlign:'left',padding:'6px 8px',fontSize:11,color:C.muted,fontWeight:700,borderBottom:`2px solid ${C.border}`}}>{h}</th>)}</tr></thead>
              <tbody>{xs.map((x,idx)=>{
                const e=estadoCuota(x.p,x.i,h); const m=abonoMonto(x.p,x.i); const fa=abonoFecha(x.p,x.i);
                const saldo=x.ext?saldoTotal(x.p):saldoCuota(x.p,x.i);
                const rowBg=x.ext||e==='nopago'||e==='sinregistro'?`${C.dangerBg}44`:e==='parcial'?`${C.warnBg}55`:undefined;
                return <tr key={idx} style={{borderBottom:`1px solid ${C.border}`,background:rowBg}}>
                  <td style={{padding:'8px'}}><div style={{fontWeight:600}}>{x.p.nombre}</div>{x.ext&&<div style={{fontSize:10,color:C.warn}}>plan vencido</div>}</td>
                  <td style={{padding:'8px'}}><b>{x.ext?'Ext':'C'+(x.i+1)}</b></td>
                  <td style={{padding:'8px',fontSize:12,color:C.muted}}>{fmtF(x.f)}</td>
                  <td style={{padding:'8px',color:C.muted}}>{fmt(x.ext?saldoTotal(x.p):x.p.cuota)}</td>
                  <td style={{padding:'8px'}}>
                    <input type="number" defaultValue={m==null?'':Math.round(m)} placeholder="monto" min="0" key={x.p.id+'-'+x.i+'-'+m}
                      style={{width:86,padding:'4px 6px',fontSize:12,border:`1px solid ${C.borderS}`,borderRadius:6,background:C.surface,color:C.text,fontFamily:'inherit'}}
                      onChange={ev=>onSave(x.p.id,x.i,ev.target.value,toDS(x.f))}/>
                    {m!=null&&<input type="date" defaultValue={fa||toDS(x.f)} key={'d'+x.p.id+'-'+x.i}
                      style={{width:118,padding:'3px 5px',fontSize:11,border:`1px solid ${C.borderS}`,borderRadius:6,background:C.surface,color:C.text,fontFamily:'inherit',marginTop:3,display:'block'}}
                      onChange={ev=>onSave(x.p.id,x.i,null,null,ev.target.value)}/>}
                    {m!=null&&m>0&&<MBar pct={Math.min(100,Math.round(m/(x.ext?saldoTotal(x.p):x.p.cuota)*100))} color={m>=(x.ext?saldoTotal(x.p):x.p.cuota)-0.5?C.ok:C.warn}/>}
                  </td>
                  <td style={{padding:'8px',fontWeight:700,color:saldo<0.5?C.ok:C.danger}}>{saldo<0.5?'✓':fmt(saldo)}</td>
                  <td style={{padding:'8px'}}>
                    <div style={{display:'flex',gap:3}}>
                      <Btn sm v="primary" onClick={()=>onSave(x.p.id,x.i,'completo',toDS(x.f),null,x.ext)}>✓</Btn>
                      {!x.ext&&<Btn sm style={{color:C.warn,borderColor:C.warnBg}} onClick={()=>onSave(x.p.id,x.i,0,toDS(x.f))}>✗</Btn>}
                      {m!=null&&<Btn sm onClick={()=>onSave(x.p.id,x.i,'limpiar')}>↩</Btn>}
                    </div>
                  </td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </Panel>;
      })}
    </div>
  );
}

/* ── CONSOLIDADO ──────────────────────────────────────────── */
function ConsolidadoView({prestamos,onEdit,onDelete,currentUser}){
  const [rf,setRf]=useState(''); const [estado,setEstado]=useState('activo'); const [nombre,setNombre]=useState('');
  const lista=useMemo(()=>{
    let l=prestamos.slice();
    if(rf)l=l.filter(p=>p.ruta===rf);
    if(estado==='activo')l=l.filter(p=>!isTerminado(p));
    else if(estado==='saldo')l=l.filter(p=>!isTerminado(p)&&tieneSaldoAtrasado(p));
    else if(estado==='terminado')l=l.filter(isTerminado);
    if(nombre)l=l.filter(p=>p.nombre.toLowerCase().includes(nombre.toLowerCase()));
    if(currentUser.rol==='cobrador'){const misRutas=currentUser.rutas||[currentUser.ruta];l=l.filter(p=>misRutas.includes(p.ruta));}
    return l.sort((a,b)=>parseD(b.fechaPrestamo)-parseD(a.fechaPrestamo));
  },[prestamos,rf,estado,nombre,currentUser]);
  const tots={cap:lista.reduce((s,p)=>s+p.monto,0),abon:lista.reduce((s,p)=>s+totalAbonado(p),0),saldo:lista.reduce((s,p)=>s+saldoTotal(p),0),atras:lista.reduce((s,p)=>s+saldoAtrasado(p),0)};
  return(
    <div>
      <div style={{fontSize:20,fontWeight:700,marginBottom:14}}>Consolidado de préstamos</div>
      <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'flex-end'}}>
        {currentUser.rol==='admin'&&<Sel value={rf} onChange={e=>setRf(e.target.value)} style={{maxWidth:160}}><option value="">Todas las rutas</option>{['A','B','C'].map(r=><option key={r} value={r}>Ruta {r} · {RUTAS[r].cobrador}</option>)}</Sel>}
        <Sel value={estado} onChange={e=>setEstado(e.target.value)} style={{maxWidth:200}}><option value="">Todos</option><option value="activo">Activos</option><option value="saldo">Con saldo atrasado</option><option value="terminado">Terminados</option></Sel>
        <Inp placeholder="Buscar cliente..." value={nombre} onChange={e=>setNombre(e.target.value)} style={{maxWidth:180}}/>
        <span style={{fontSize:12,color:C.faint}}>{lista.length} préstamo{lista.length!==1?'s':''}</span>
      </div>
      {lista.length===0?<Empty msg="Sin resultados."/>:
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflowX:'auto',marginBottom:12}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:880}}>
            <thead><tr>{['Cliente','Ruta','Fecha','Capital','Abonado','Saldo','Atrasado','Cuotas',...(currentUser.rol==='admin'?['']:[''])].map((h,i)=><th key={i} style={{textAlign:'left',padding:'7px 9px',fontSize:11,color:C.muted,fontWeight:700,borderBottom:`2px solid ${C.border}`,whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
            <tbody>{lista.map(p=>{const d=totalDeuda(p),ab=totalAbonado(p),sl=saldoTotal(p),at=saldoAtrasado(p);const pct=Math.round(ab/d*100);const term=isTerminado(p);return(
              <tr key={p.id} style={{borderBottom:`1px solid ${C.border}`,background:!term&&at>0.5?`${C.dangerBg}44`:undefined}}>
                <td style={{padding:'8px 9px'}}><div style={{fontWeight:600}}>{p.nombre}</div>{term&&<Bdg type="ok">Terminado</Bdg>}</td>
                <td style={{padding:'8px 4px'}}><RTag r={p.ruta}/><CobTag r={p.ruta}/></td>
                <td style={{padding:'8px 9px',fontSize:12,color:C.muted}}>{fmtF(parseD(p.fechaPrestamo))}</td>
                <td style={{padding:'8px 9px'}}>{fmt(p.monto)}</td>
                <td style={{padding:'8px 9px',color:C.ok,fontWeight:600}}>{fmt(ab)}<MBar pct={pct}/><div style={{fontSize:10,color:C.faint}}>{pct}%</div></td>
                <td style={{padding:'8px 9px',fontWeight:600,color:sl<0.5?C.faint:C.danger}}>{fmt(sl)}</td>
                <td style={{padding:'8px 9px',fontWeight:600,color:at>0.5?C.danger:C.faint}}>{at>0.5?fmt(at):'—'}</td>
                <td style={{padding:'8px 9px'}}><DotsRow p={p}/></td>
                {currentUser.rol==='admin'&&<td style={{padding:'8px 5px'}}><div style={{display:'flex',gap:3}}><Btn sm onClick={()=>onEdit(p)}>✎</Btn><Btn sm v="danger" onClick={()=>onDelete(p)}>✕</Btn></div></td>}
              </tr>);})}
            </tbody>
          </table>
        </div>}
      <Panel title="Totales">
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(118px,1fr))',gap:9}}>
          <KPI label="Capital" value={fmt(tots.cap)} sub={`${lista.length} préstamos`}/>
          <KPI label="Abonado" value={fmt(tots.abon)} vc={C.ok}/>
          <KPI label="Por cobrar" value={fmt(tots.saldo)} vc={tots.saldo?C.danger:C.text}/>
          <KPI label="Atrasado" value={fmt(tots.atras)} vc={tots.atras?C.warn:C.text}/>
        </div>
      </Panel>
    </div>
  );
}

/* ── RIESGO ───────────────────────────────────────────────── */
function RiesgoView({prestamos,currentUser}){
  const lista=useMemo(()=>{
    let l=prestamos.filter(p=>!isTerminado(p));
    if(currentUser.rol==='cobrador'){const misRutas=currentUser.rutas||[currentUser.ruta];l=l.filter(p=>misRutas.includes(p.ruta));}
    return l;
  },[prestamos,currentUser]);
  const alerta=useMemo(()=>lista.map(p=>({p,cc:cuotasSinPago(p)})).filter(x=>x.cc>=3).sort((a,b)=>b.cc-a.cc),[lista]);
  const conDeficit=useMemo(()=>lista.map(p=>({p,d:deficitSistematico(p)})).filter(x=>x.d).sort((a,b)=>b.d.acumulado-a.d.acumulado),[lista]);
  const conSaldo=lista.filter(tieneSaldoAtrasado).sort((a,b)=>saldoAtrasado(b)-saldoAtrasado(a));
  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:8}}>
        <div style={{fontSize:20,fontWeight:700}}>Riesgo y moras</div>
        <Bdg type={conSaldo.length?'danger':'ok'}>{conSaldo.length} con saldo atrasado</Bdg>
      </div>
      <Panel title="Resumen por ruta">
        <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:560}}><thead><tr>{['Ruta','Activos','En mora','Alerta (3+)','Con déficit','Atrasado'].map((h,i)=><th key={i} style={{textAlign:'left',padding:'6px 8px',fontSize:11,color:C.muted,fontWeight:700,borderBottom:`2px solid ${C.border}`}}>{h}</th>)}</tr></thead>
          <tbody>{['A','B','C'].map(r=>{const ps=lista.filter(p=>p.ruta===r);const enMora=ps.filter(p=>cuotasSinPago(p)>=1);const alr=ps.filter(p=>cuotasSinPago(p)>=3);const def=ps.filter(p=>deficitSistematico(p));const at=ps.reduce((s,p)=>s+saldoAtrasado(p),0);return<tr key={r} style={{borderBottom:`1px solid ${C.border}`,background:alr.length?`${C.dangerBg}44`:undefined}}><td style={{padding:'8px'}}><RTag r={r}/><CobTag r={r}/></td><td style={{padding:'8px',fontWeight:600}}>{ps.length}</td><td style={{padding:'8px',fontWeight:600,color:enMora.length?C.warn:C.faint}}>{enMora.length}</td><td style={{padding:'8px',fontWeight:600,color:alr.length?C.danger:C.faint}}>{alr.length}</td><td style={{padding:'8px',fontWeight:600,color:def.length?C.green:C.faint}}>{def.length}</td><td style={{padding:'8px',fontWeight:600,color:at?C.danger:C.faint}}>{at?fmt(at):'—'}</td></tr>;})}
          </tbody></table></div>
      </Panel>
      {alerta.length>0&&<Panel title={`⚠ ${alerta.length} cliente${alerta.length!==1?'s':''} con 3+ cuotas sin pagar`}>
        <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:500}}><thead><tr>{['Cliente','Ruta','Cuotas sin pago','Atrasado'].map((h,i)=><th key={i} style={{textAlign:'left',padding:'5px 8px',fontSize:11,color:C.muted,fontWeight:700,borderBottom:`2px solid ${C.border}`}}>{h}</th>)}</tr></thead>
          <tbody>{alerta.map(x=><tr key={x.p.id} style={{borderBottom:`1px solid ${C.border}`,background:`${C.dangerBg}44`}}><td style={{padding:'7px 9px',fontWeight:600}}>{x.p.nombre}</td><td style={{padding:'7px 4px'}}><RTag r={x.p.ruta}/></td><td style={{padding:'7px 9px',fontWeight:700,color:C.danger,fontSize:15}}>{x.cc}</td><td style={{padding:'7px 9px',fontWeight:700,color:C.danger}}>{fmt(saldoAtrasado(x.p))}</td></tr>)}
          </tbody></table></div>
      </Panel>}
      <Panel title="Clientes con saldo atrasado">
        {conSaldo.length===0?<Empty msg="Nadie tiene saldo atrasado."/>:
          <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:600}}><thead><tr>{['Cliente','Ruta','Cuotas con saldo','Atrasado','Último abono','Saldo total'].map((h,i)=><th key={i} style={{textAlign:'left',padding:'5px 8px',fontSize:11,color:C.muted,fontWeight:700,borderBottom:`2px solid ${C.border}`}}>{h}</th>)}</tr></thead>
            <tbody>{conSaldo.map(p=>{const abs=(p.abonos||[]).filter(a=>a&&a.monto>0&&a.fecha).sort((a,b)=>parseD(b.fecha)-parseD(a.fecha));const ult=abs[0];const det=cuotasVencidas(p).filter(x=>saldoCuota(p,x.i)>0.5).map(x=>{const m=abonoMonto(p,x.i);const s=saldoCuota(p,x.i);const parc=m!=null&&m>0;return<span key={x.i} style={{display:'inline-block',background:parc?C.warnBg:C.dangerBg,color:parc?C.warn:C.danger,borderRadius:5,padding:'1px 5px',fontSize:11,margin:1}}>C{x.i+1}: debe {fmt(s)}</span>;});
              return<tr key={p.id} style={{borderBottom:`1px solid ${C.border}`}}><td style={{padding:'8px 9px',fontWeight:600}}>{p.nombre}</td><td style={{padding:'8px 4px'}}><RTag r={p.ruta}/><CobTag r={p.ruta}/></td><td style={{padding:'8px 9px'}}>{det}</td><td style={{padding:'8px 9px',fontWeight:700,color:C.danger}}>{fmt(saldoAtrasado(p))}</td><td style={{padding:'8px 9px',fontSize:12,color:C.muted}}>{ult?`${fmt(ult.monto)} — ${fmtF(parseD(ult.fecha))}`:'nunca'}</td><td style={{padding:'8px 9px',fontWeight:700}}>{fmt(saldoTotal(p))}</td></tr>;
            })}</tbody></table></div>}
      </Panel>
      {conDeficit.length>0&&<Panel title="Déficit sistemático (pagan siempre menos de lo pactado)">
        <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:560}}><thead><tr>{['Cliente','Ruta','Cuota pactada','Paga siempre','Diferencia','Acumulado'].map((h,i)=><th key={i} style={{textAlign:'left',padding:'5px 8px',fontSize:11,color:C.muted,fontWeight:700,borderBottom:`2px solid ${C.border}`}}>{h}</th>)}</tr></thead>
          <tbody>{conDeficit.map(x=><tr key={x.p.id} style={{borderBottom:`1px solid ${C.border}`}}><td style={{padding:'7px 9px',fontWeight:600}}>{x.p.nombre}</td><td style={{padding:'7px 4px'}}><RTag r={x.p.ruta}/></td><td style={{padding:'7px 9px',color:C.muted}}>{fmt(x.p.cuota)}</td><td style={{padding:'7px 9px'}}>{fmt(x.d.habitual)}</td><td style={{padding:'7px 9px',fontWeight:600,color:C.warn}}>-{fmt(x.d.diferencia)}</td><td style={{padding:'7px 9px',fontWeight:600,color:C.danger}}>{fmt(x.d.acumulado)}</td></tr>)}
          </tbody></table></div>
      </Panel>}
    </div>
  );
}

/* ── NUEVO PRÉSTAMO ───────────────────────────────────────── */
function NuevoView({editando,onGuardar,onCancelar,currentUser}){
  const [nombre,setNombre]=useState(editando?.nombre||'');
  const [tel,setTel]=useState(editando?.tel||'');
  const [fecha,setFecha]=useState(editando?.fechaPrestamo||todayDS());
  const [ruta,setRuta]=useState(editando?.ruta||'');
  const [monto,setMonto]=useState(editando?.monto||'');
  const cuota=monto?calcCuota(parseFloat(monto)):0;
  const fechas=monto&&fecha?Array.from({length:10},(_,i)=>{const d=parseD(fecha);d.setDate(d.getDate()+7*(i+1));return d;}):[];
  const guardar=()=>{if(!nombre.trim()||!ruta||!fecha||!monto||parseFloat(monto)<=0)return;onGuardar({nombre:nombre.trim(),tel,fechaPrestamo:fecha,ruta,monto:parseFloat(monto),cuota:calcCuota(parseFloat(monto))});};
  return(
    <div>
      <div style={{fontSize:20,fontWeight:700,marginBottom:14}}>{editando?'Editar préstamo':'Registrar préstamo'}</div>
      {editando&&<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,background:C.greenBg,border:`1px solid ${C.green}44`,borderRadius:8,padding:'10px 14px',marginBottom:14,fontSize:13,color:C.green,flexWrap:'wrap'}}><span>✎ Editando préstamo de {editando.nombre}</span><Btn sm onClick={onCancelar}>Cancelar edición</Btn></div>}
      <Panel title="">
        <div style={{maxWidth:520}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
            <Inp label="Nombre del cliente" value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="Ej: Juan Pérez" autoFocus/>
            <Inp label="Teléfono (opcional)" value={tel} onChange={e=>setTel(e.target.value)} placeholder="300 000 0000"/>
            <Inp label="Fecha del préstamo" type="date" value={fecha} onChange={e=>setFecha(e.target.value)}/>
            <Sel label="Ruta" value={ruta} onChange={e=>setRuta(e.target.value)}><option value="">Seleccionar...</option><option value="A">Ruta A — Junior, lunes</option><option value="B">Ruta B — Jhon, lunes</option><option value="C">Ruta C — Jhon, jueves</option></Sel>
            <Inp label="Monto prestado ($)" type="number" value={monto} onChange={e=>setMonto(e.target.value)} placeholder="200000" min="1"/>
            <Inp label="Cuota semanal" value={cuota?fmt(cuota):''} readOnly style={{background:C.s2}}/>
          </div>
          {monto&&<div style={{padding:'10px 13px',background:C.s2,borderRadius:8,fontSize:13,color:C.muted,marginBottom:12}}>Capital: <b>{fmt(parseFloat(monto))}</b> · Interés 40%: <b>{fmt(parseFloat(monto)*0.4)}</b> · Total a recibir: <b style={{color:C.green}}>{fmt(parseFloat(monto)*1.4)}</b></div>}
          {fechas.length>0&&<div style={{marginBottom:14}}><div style={{fontSize:12,color:C.muted,fontWeight:600,marginBottom:8}}>Calendario pactado:</div><div style={{display:'flex',flexWrap:'wrap',gap:6}}>{fechas.map((d,i)=><div key={i} style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:7,padding:'5px 8px',fontSize:12,textAlign:'center',minWidth:74}}><div style={{color:C.faint,fontSize:10,marginBottom:1}}>Cuota {i+1}</div><div style={{fontWeight:600}}>{fmtF(d)}</div><div style={{color:C.green,fontSize:11}}>{fmt(cuota)}</div></div>)}</div></div>}
          <div style={{display:'flex',gap:8}}><Btn v="primary" onClick={guardar}>{editando?'Guardar cambios':'Guardar préstamo'}</Btn>{editando&&<Btn onClick={onCancelar}>Cancelar</Btn>}</div>
        </div>
      </Panel>
    </div>
  );
}

/* ── FINANZAS (solo admin) ────────────────────────────────── */
function FinanzasView({prestamos,salidas,onSaveSalida,onDeleteSalida}){
  const [sf,setSf]=useState(todayDS());const [sc,setSc]=useState(CATS[0]);const [sm,setSm]=useState('');const [sq,setSq]=useState('');
  const rr=useMemo(()=>{
    const sal=salidas.reduce((s,x)=>s+x.monto,0);
    const r={cap:0,capRec:0,intCob:0,capCalle:0,intPend:0,nDud:0,sal,dudTotal:0};
    prestamos.forEach(p=>{r.cap+=p.monto;r.capRec+=capitalRecuperado(p);r.intCob+=interesCobrado(p);if(!isTerminado(p)){r.capCalle+=Math.max(0,p.monto-capitalRecuperado(p));r.intPend+=Math.max(0,(p.monto*0.4)-interesCobrado(p));if(esDudoso(p)){r.nDud++;r.dudTotal+=saldoTotal(p);}}});
    r.ganancia=r.intCob-r.sal; return r;
  },[prestamos,salidas]);
  const guardar=()=>{if(!sm||parseFloat(sm)<=0)return;onSaveSalida({id:Date.now(),fecha:sf,cat:sc,monto:parseFloat(sm),quien:sq});setSm('');setSq('');};
  const salidasOrd=salidas.slice().sort((a,b)=>parseD(b.fecha)-parseD(a.fecha));
  return(
    <div>
      <div style={{fontSize:20,fontWeight:700,marginBottom:14}}>Finanzas</div>
      <Panel title="Rentabilidad real">
        <div style={{background:C.greenBg,border:`1px solid ${C.green}22`,borderRadius:8,padding:14,marginBottom:14}}>
          {[{l:'Interés cobrado (ganancia bruta)',v:rr.intCob,c:C.ok},{l:'— Salidas de caja',v:rr.sal,c:C.danger},{l:'= Ganancia neta',v:rr.ganancia,c:rr.ganancia>0?C.ok:C.danger,big:true},{l:`Capital en la calle (activos)`,v:rr.capCalle,c:C.warn},{l:'+ Interés por cobrar',v:rr.intPend,c:C.muted},{l:'= Total si todos pagan',v:rr.capCalle+rr.intPend,c:C.text,big:true}].map((row,i)=>
            <div key={i} style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}><div style={{flex:1}}><div style={{fontSize:12,color:C.muted}}>{row.l}</div><div style={{fontSize:row.big?22:18,fontWeight:700,color:row.c}}>{fmt(row.v)}</div></div></div>)}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(128px,1fr))',gap:9}}>
          <KPI label="Capital colocado" value={fmt(rr.cap)}/>
          <KPI label="Capital recuperado" value={fmt(rr.capRec)} vc={C.ok}/>
          <KPI label="Salidas de caja" value={fmt(rr.sal)} vc={C.danger}/>
          <KPI label="Cartera dudosa" value={fmt(rr.dudTotal)} sub={`${rr.nDud} sin pagar 4+ sem.`} vc={rr.nDud?C.warn:C.text}/>
        </div>
      </Panel>
      <Panel title="Registrar salida de caja">
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12,maxWidth:640}}>
          <Inp label="Fecha" type="date" value={sf} onChange={e=>setSf(e.target.value)}/>
          <Sel label="Categoría" value={sc} onChange={e=>setSc(e.target.value)}>{CATS.map(c=><option key={c} value={c}>{c}</option>)}</Sel>
          <Inp label="Monto ($)" type="number" value={sm} onChange={e=>setSm(e.target.value)} placeholder="150000"/>
          <Inp label="Concepto / a quién" value={sq} onChange={e=>setSq(e.target.value)} placeholder="Jhon, semana del 13"/>
        </div>
        <Btn v="primary" style={{marginTop:12}} onClick={guardar}>Registrar salida</Btn>
      </Panel>
      <Panel title={`Salidas — ${fmt(salidas.reduce((s,x)=>s+x.monto,0))}`}>
        {salidasOrd.length===0?<Empty msg="Sin salidas registradas."/>:
          <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:480}}><thead><tr>{['Fecha','Categoría','Concepto','Monto',''].map((h,i)=><th key={i} style={{textAlign:'left',padding:'5px 8px',fontSize:11,color:C.muted,fontWeight:700,borderBottom:`2px solid ${C.border}`}}>{h}</th>)}</tr></thead>
          <tbody>{salidasOrd.map(x=><tr key={x.id} style={{borderBottom:`1px solid ${C.border}`}}><td style={{padding:'7px 9px',fontSize:12,color:C.muted}}>{fmtF(parseD(x.fecha))}</td><td style={{padding:'7px 9px'}}><Bdg type="warn">{x.cat}</Bdg></td><td style={{padding:'7px 9px',fontSize:12}}>{x.quien||'—'}</td><td style={{padding:'7px 9px',fontWeight:600,color:C.danger}}>{fmt(x.monto)}</td><td style={{padding:'7px 5px'}}><Btn sm v="danger" onClick={()=>onDeleteSalida(x.id)}>✕</Btn></td></tr>)}</tbody></table></div>}
      </Panel>
    </div>
  );
}

/* ── RESPALDO ─────────────────────────────────────────────── */
function RespaldoView({prestamos,salidas,onRestaurar}){
  const fileRef=useRef(null);
  const exportar=()=>{const data={app:'Mi Cartera',version:8,exportado:new Date().toISOString(),prestamos,salidas};const b=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=`cartera-${todayDS()}.json`;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);};
  const importar=e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=ev=>{try{const d=JSON.parse(String(ev.target?.result));if(!d.prestamos||!Array.isArray(d.prestamos))return alert('Archivo inválido');if(!window.confirm(`¿Cargar ${d.prestamos.length} préstamos?`))return;onRestaurar(d);}catch{alert('No se pudo leer el archivo.');}};r.readAsText(f);e.target.value='';};
  return(
    <div>
      <div style={{fontSize:20,fontWeight:700,marginBottom:14}}>Respaldo de datos</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(128px,1fr))',gap:9,marginBottom:14}}>
        <KPI label="Préstamos" value={prestamos.length} sub={`${prestamos.filter(p=>!isTerminado(p)).length} activos`}/>
        <KPI label="Total abonado" value={fmt(prestamos.reduce((s,p)=>s+totalAbonado(p),0))} vc={C.ok}/>
        <KPI label="Por cobrar" value={fmt(prestamos.filter(p=>!isTerminado(p)).reduce((s,p)=>s+saldoTotal(p),0))}/>
      </div>
      <Panel title="Guardar copia"><p style={{fontSize:13,color:C.muted,marginBottom:12,lineHeight:1.6}}>Descarga un JSON con todos tus datos.</p><Btn v="primary" onClick={exportar}>⬇ Descargar respaldo (JSON)</Btn></Panel>
      <Panel title="Restaurar desde archivo"><p style={{fontSize:13,color:C.muted,marginBottom:12,lineHeight:1.6}}>Carga un JSON descargado antes. Reemplaza todo lo actual.</p><Btn onClick={()=>fileRef.current?.click()}>⬆ Cargar archivo</Btn><input ref={fileRef} type="file" accept=".json" onChange={importar} style={{display:'none'}}/></Panel>
    </div>
  );
}

/* ── APP PRINCIPAL ────────────────────────────────────────── */
export default function App(){
  const [currentUser,setCurrentUser]=useState(null);
  const [prestamos,setPrestamos]=useState([]);
  const [salidas,setSalidas]=useState([]);
  const [loading,setLoading]=useState(true);
  const [view,setView]=useState('dashboard');
  const [editando,setEditando]=useState(null);
  const [semOff,setSemOff]=useState(0);
  const [flujoOff,setFlujoOff]=useState(0);
  const [toasts,setToasts]=useState([]);
  const [syncOk,setSyncOk]=useState(true);

  const notify=useCallback((msg,err=false)=>{const id=Date.now()+Math.random();setToasts(t=>[...t,{id,msg,err}].slice(-3));setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3200);},[]);

  // Cargar datos de Firebase
  useEffect(()=>{
    const presRef=ref(db,'prestamos');
    const salRef=ref(db,'salidas');
    // Verificar si hay datos en Firebase, si no cargar seed
    get(presRef).then(snap=>{
      if(!snap.exists()||snap.val()===null){
        // Primera vez: cargar datos del HTML
        set(presRef,SEED_DATA.prestamos).then(()=>console.log('Seed cargado'));
        set(salRef,SEED_DATA.salidas);
      }
    }).catch(()=>setSyncOk(false));
    // Escuchar cambios en tiempo real
    const unsubP=onValue(presRef,snap=>{ const val=snap.val(); setPrestamos(val&&Array.isArray(val)?val:val?Object.values(val):[]); setLoading(false); },()=>setSyncOk(false));
    const unsubS=onValue(salRef,snap=>{ const val=snap.val(); setSalidas(val&&Array.isArray(val)?val:val?Object.values(val):[]); });
    return()=>{ unsubP(); unsubS(); };
  },[]);

  const saveP=useCallback(async next=>{ setPrestamos(next); try{ await set(ref(db,'prestamos'),next); }catch{ notify('Error al guardar. Verifica tu conexión.',true); } },[]);
  const saveS=useCallback(async next=>{ setSalidas(next); try{ await set(ref(db,'salidas'),next); }catch{ notify('Error al guardar.',true); } },[]);

  const handleGuardar=useCallback(data=>{
    if(editando){ saveP(prestamos.map(p=>p.id===editando.id?{...p,...data}:p)); notify('Préstamo actualizado.'); }
    else{ saveP([{...data,id:Date.now(),abonos:new Array(10).fill(null)},...prestamos]); notify('Préstamo guardado.'); }
    setEditando(null); setView('consolidado');
  },[prestamos,editando]);

  const handleDelete=useCallback(p=>{ if(!window.confirm(`¿Eliminar el préstamo de ${p.nombre}?`))return; saveP(prestamos.filter(x=>x.id!==p.id)); notify('Préstamo eliminado.'); },[prestamos]);

  const handleSave=useCallback((id,idx,val,fSem,fOverride,esExt)=>{
    const next=prestamos.map(p=>{
      if(p.id!==id)return p;
      const abs=[...(p.abonos||new Array(10).fill(null))]; while(abs.length<=idx)abs.push(null);
      const fDef=idx<10?toDS(fechasCuotas(p)[idx]):(fSem||todayDS());
      if(val==='limpiar'){abs[idx]=null;}
      else if(val==='completo'){const aSnSlot=(abs||[]).reduce((s,a,i2)=>i2===idx?s:s+((a&&a.monto)||0),0);const sA=Math.max(0,totalDeuda(p)-aSnSlot);abs[idx]={monto:esExt?Math.round(sA):p.cuota,fecha:(abs[idx]&&abs[idx].fecha)||fDef};}
      else if(val===0||val==='0'){abs[idx]={monto:0,fecha:fDef};}
      else if(fOverride!==null&&fOverride!==undefined&&val===null){if(abs[idx])abs[idx]={...abs[idx],fecha:fOverride};}
      else{const n=Math.max(0,parseFloat(val)||0);const pv=abs[idx];abs[idx]={monto:n,fecha:(pv&&pv.fecha)||fDef};}
      return{...p,abonos:abs};
    });
    saveP(next);
  },[prestamos]);

  const handleSaveSalida=useCallback(sal=>{ saveS([...salidas,sal]); notify('Salida registrada.'); },[salidas]);
  const handleDeleteSalida=useCallback(id=>{ if(!window.confirm('¿Eliminar esta salida?'))return; saveS(salidas.filter(x=>x.id!==id)); notify('Salida eliminada.'); },[salidas]);
  const handleRestaurar=useCallback(data=>{ saveP(data.prestamos||[]); saveS(data.salidas||[]); notify('Datos restaurados.'); },[]);

  const totalCS=useMemo(()=>prestamos.filter(p=>!isTerminado(p)).filter(tieneSaldoAtrasado).length,[prestamos]);

  if(!currentUser) return <LoginScreen onLogin={u=>{setCurrentUser(u);setView('dashboard');}}/>;

  if(loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:C.bg,flexDirection:'column',gap:14,fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif'}}><div style={{fontSize:22,fontWeight:700,color:C.green}}>Mi Cartera</div><div style={{fontSize:13,color:C.muted}}>Conectando con la base de datos…</div></div>;

  const NAV=[
    {k:'dashboard',l:'Dashboard',i:'▣'},
    ...(currentUser.rol==='admin'?[{k:'nuevo',l:'Nuevo préstamo',i:'＋'}]:[]),
    {k:'semana',l:'Cobros por semana',i:'📅'},
    {k:'consolidado',l:'Consolidado',i:'▦'},
    {k:'riesgo',l:'Riesgo y moras',i:'⚠',b:totalCS},
    ...(currentUser.rol==='admin'?[{k:'finanzas',l:'Finanzas',i:'$'},{k:'respaldo',l:'Respaldo',i:'💾',bot:true}]:[]),
  ];

  return(
    <div style={{display:'flex',height:'100vh',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',color:C.text,background:C.bg,WebkitFontSmoothing:'antialiased'}}>
      <nav style={{width:204,minWidth:204,background:C.surface,borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',padding:'10px 0',height:'100vh',overflowY:'auto'}}>
        <div style={{padding:'0 13px 12px',borderBottom:`1px solid ${C.border}`,marginBottom:5}}>
          <div style={{fontSize:16,fontWeight:700,color:C.green}}>Mi Cartera</div>
          <div style={{fontSize:11,color:C.faint,marginTop:2}}>{currentUser.nombre}</div>
        </div>
        {NAV.filter(n=>!n.bot).map(n=><button key={n.k} onClick={()=>setView(n.k)} style={{display:'flex',alignItems:'center',gap:7,padding:'8px 13px',background:view===n.k?C.greenBg:'transparent',color:view===n.k?C.green:C.muted,border:'none',cursor:'pointer',fontSize:13,fontWeight:view===n.k?700:400,textAlign:'left',width:'100%',fontFamily:'inherit',borderLeft:view===n.k?`3px solid ${C.green}`:'3px solid transparent'}}><span>{n.i}</span><span style={{flex:1}}>{n.l}</span>{n.b>0&&<span style={{background:C.dangerBg,color:C.danger,borderRadius:9,padding:'1px 6px',fontSize:11,fontWeight:700}}>{n.b}</span>}</button>)}
        <div style={{flex:1}}/>
        {NAV.filter(n=>n.bot).map(n=><button key={n.k} onClick={()=>setView(n.k)} style={{display:'flex',alignItems:'center',gap:7,padding:'8px 13px',background:view===n.k?C.greenBg:'transparent',color:view===n.k?C.green:C.muted,border:'none',cursor:'pointer',fontSize:13,fontWeight:view===n.k?700:400,textAlign:'left',width:'100%',fontFamily:'inherit',borderLeft:view===n.k?`3px solid ${C.green}`:'3px solid transparent'}}><span>{n.i}</span><span>{n.l}</span></button>)}
        <button onClick={()=>setCurrentUser(null)} style={{display:'flex',alignItems:'center',gap:7,padding:'10px 13px',background:'transparent',color:C.danger,border:'none',cursor:'pointer',fontSize:13,textAlign:'left',width:'100%',fontFamily:'inherit',borderTop:`1px solid ${C.border}`,marginTop:4}}>🚪 Cerrar sesión</button>
        {!syncOk&&<div style={{padding:'8px 13px',fontSize:11,color:C.warn,background:C.warnBg}}>⚠ Sin conexión a la base de datos</div>}
      </nav>
      <main style={{flex:1,overflowY:'auto',padding:'18px 24px 60px'}}>
        {view==='dashboard'&&<Dashboard prestamos={prestamos} flujoOff={flujoOff} setFlujoOff={setFlujoOff} currentUser={currentUser}/>}
        {view==='nuevo'&&currentUser.rol==='admin'&&<NuevoView editando={editando} onGuardar={handleGuardar} onCancelar={()=>{setEditando(null);setView('consolidado');}} currentUser={currentUser}/>}
        {view==='semana'&&<CobrosView prestamos={prestamos} onSave={handleSave} semOff={semOff} setSemOff={setSemOff} currentUser={currentUser}/>}
        {view==='consolidado'&&<ConsolidadoView prestamos={prestamos} onEdit={p=>{setEditando(p);setView('nuevo');}} onDelete={handleDelete} currentUser={currentUser}/>}
        {view==='riesgo'&&<RiesgoView prestamos={prestamos} currentUser={currentUser}/>}
        {view==='finanzas'&&currentUser.rol==='admin'&&<FinanzasView prestamos={prestamos} salidas={salidas} onSaveSalida={handleSaveSalida} onDeleteSalida={handleDeleteSalida}/>}
        {view==='respaldo'&&currentUser.rol==='admin'&&<RespaldoView prestamos={prestamos} salidas={salidas} onRestaurar={handleRestaurar}/>}
      </main>
      <Toast toasts={toasts} onDismiss={id=>setToasts(t=>t.filter(x=>x.id!==id))}/>
    </div>
  );
}
