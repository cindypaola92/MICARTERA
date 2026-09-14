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
function cuotasSinPago(p){
  // Cuotas del plan (1-10)
  const delPlan=cuotasVencidas(p).filter(x=>{const e=estadoCuota(p,x.i);return e==='sinpago';}).length;
  // Si pasó cuota 10 con saldo pendiente, cuenta como mora extra
  const h=HOY();const fs=fechasCuotas(p);
  const planVencido=fs[9]<h&&saldoTotal(p)>0.5;
  if(planVencido){const nS=cuotasTotalesReales(p);let extra=0;for(let i=10;i<nS;i++){const a=getAbonos(p)[i];if(!a||!a.monto)extra++;}return delPlan+extra;}
  return delPlan;
}
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
  const intTotal=p.monto*0.4;
  const capRec=capitalRecuperado(p);
  const intCob=interesCobrado(p);
  const capPend=Math.max(0,p.monto-capRec);
  const intPend=Math.max(0,intTotal-intCob);
  const term=isTerminado(p);
  return <Overlay onClose={onClose}>
    <div style={{padding:'16px 20px',background:GB,borderRadius:'14px 14px 0 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div><div style={{fontSize:18,fontWeight:700,color:G}}>{p.nombre}</div><div style={{fontSize:13,color:MT,marginTop:3,display:'flex',alignItems:'center',gap:6}}><RTag r={p.ruta}/><CTag r={p.ruta}/>{term&&<span style={{display:'inline-block',padding:'2px 8px',borderRadius:5,background:OKB,color:OK,fontSize:11,fontWeight:700,marginLeft:4}}>Terminado</span>}</div></div>
      <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:MT}}>X</button>
    </div>
    <div style={{padding:'16px 20px'}}>
      {/* KPIs principales */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:9,marginBottom:12}}>
        <KPI label="Capital prestado" value={fmt(p.monto)} sub={fmtFL(parseD(p.fechaPrestamo))}/>
        <KPI label="Interés (40%)" value={fmt(intTotal)} sub="ganancia esperada" vc={WN}/>
        <KPI label="Total a recibir" value={fmt(de)} sub="capital + interés"/>
        <KPI label="Total abonado" value={fmt(ab)} vc={OK} sub={pct+'%'}/>
        <KPI label="Saldo pendiente" value={fmt(sl)} vc={sl<0.5?OK:DN}/>
        {at>0.5&&<KPI label="Saldo atrasado" value={fmt(at)} vc={DN}/>}
      </div>

      {/* Desglose capital vs interés */}
      <div style={{background:S2,borderRadius:9,padding:'12px 14px',marginBottom:14,display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        <div>
          <div style={{fontSize:11,fontWeight:700,color:MT,marginBottom:8,textTransform:'uppercase',letterSpacing:.5}}>Capital</div>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
            <span style={{fontSize:12,color:MT}}>Prestado</span>
            <span style={{fontSize:13,fontWeight:700}}>{fmt(p.monto)}</span>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
            <span style={{fontSize:12,color:MT}}>Recuperado</span>
            <span style={{fontSize:13,fontWeight:600,color:OK}}>{fmt(capRec)}</span>
          </div>
          <div style={{display:'flex',justifyContent:'space-between'}}>
            <span style={{fontSize:12,color:MT}}>Pendiente</span>
            <span style={{fontSize:13,fontWeight:600,color:capPend>0?WN:OK}}>{capPend>0?fmt(capPend):'Recuperado'}</span>
          </div>
          <MBar pct={Math.round(capRec/p.monto*100)} color={OK}/>
          <div style={{fontSize:10,color:FT,marginTop:2}}>{Math.round(capRec/p.monto*100)}% recuperado</div>
        </div>
        <div>
          <div style={{fontSize:11,fontWeight:700,color:MT,marginBottom:8,textTransform:'uppercase',letterSpacing:.5}}>Interés (ganancia)</div>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
            <span style={{fontSize:12,color:MT}}>Total esperado</span>
            <span style={{fontSize:13,fontWeight:700}}>{fmt(intTotal)}</span>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
            <span style={{fontSize:12,color:MT}}>Ya cobrado</span>
            <span style={{fontSize:13,fontWeight:600,color:OK}}>{fmt(intCob)}</span>
          </div>
          <div style={{display:'flex',justifyContent:'space-between'}}>
            <span style={{fontSize:12,color:MT}}>Por cobrar</span>
            <span style={{fontSize:13,fontWeight:600,color:intPend>0?WN:OK}}>{intPend>0?fmt(intPend):'Cobrado'}</span>
          </div>
          <MBar pct={Math.round(intCob/intTotal*100)} color={WN}/>
          <div style={{fontSize:10,color:FT,marginTop:2}}>{Math.round(intCob/intTotal*100)}% cobrado</div>
        </div>
      </div>

      {/* Barra de progreso */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:12,color:MT,marginBottom:4,fontWeight:600}}>Progreso total: {pct}%</div>
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
            const esExt=i>=10;
            return <tr key={i} style={{borderBottom:'1px solid '+BD,background:esExt&&m==null?'transparent':bg}}>
              <td style={{padding:'6px 7px',fontWeight:700,color:esExt?WN:TX}}>{esExt?'C'+(i+1)+' *':'C'+(i+1)}</td>
              <td style={{padding:'6px 7px',fontSize:11,color:MT}}>{f?fmtF(f):esExt?'fuera del plan':'-'}</td>
              <td style={{padding:'6px 7px',color:MT}}>{fmt(p.cuota)}</td>
              <td style={{padding:'6px 7px',fontWeight:700,color:m&&m>0?OK:m===0?DN:FT,fontSize:13}}>{m!=null&&m>0?fmt(m):m===0?'$0':'-'}</td>
              <td style={{padding:'6px 7px',fontSize:11,color:m&&m>0?G:MT,fontWeight:m&&m>0?600:400}}>{fa?fmtFL(parseD(fa)):m&&m>0?'fecha no registrada':'-'}</td>
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

function ModalSemana({lun,dom,rutaInicial,prestamos,onClose,onVerCliente,verSaldaron}){
  const [rutaTab,setRutaTab]=useState(rutaInicial||'todas');
  const [seccion,setSeccion]=useState(verSaldaron?'saldaron':'cobros');
  if(!lun)return null;
  const todosRecs=todosLosRecaudos(prestamos).filter(x=>enRango(x.fecha,lun,dom));
  const todosNuevos=prestamos.filter(p=>enRango(parseD(p.fechaPrestamo),lun,dom));
  // Clientes que saldaron: terminados cuyo último abono cayó en esta semana
  const todosSaldaron=prestamos.filter(p=>{
    if(!isTerminado(p))return false;
    const abs=getAbonos(p).filter(a=>a&&a.monto>0&&a.fecha);
    if(!abs.length)return false;
    const ult=abs.sort((a,b)=>parseD(b.fecha)-parseD(a.fecha))[0];
    return enRango(parseD(ult.fecha),lun,dom);
  });
  const recs=rutaTab==='todas'?todosRecs:todosRecs.filter(x=>x.p.ruta===rutaTab);
  const nuevos=rutaTab==='todas'?todosNuevos:todosNuevos.filter(p=>p.ruta===rutaTab);
  const saldaron=rutaTab==='todas'?todosSaldaron:todosSaldaron.filter(p=>p.ruta===rutaTab);
  const tR=recs.reduce((s,x)=>s+x.monto,0);
  const tP=nuevos.reduce((s,p)=>s+p.monto,0);
  const tabs=[{v:'todas',l:'Todas'},{v:'A',l:'Ruta A'},{v:'B',l:'Ruta B'},{v:'C',l:'Ruta C'}];
  return <Overlay onClose={onClose}>
    <div style={{padding:'14px 20px',background:GB,borderRadius:'14px 14px 0 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div><div style={{fontSize:15,fontWeight:700,color:G}}>{fmtF(lun)} - {fmtF(dom)} {dom.getFullYear()}</div></div>
      <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:MT}}>X</button>
    </div>
    <div style={{padding:'0 18px',borderBottom:'1px solid '+BD,display:'flex',gap:6,paddingTop:10,paddingBottom:0}}>
      {tabs.map(t=><button key={t.v} onClick={()=>setRutaTab(t.v)} style={{padding:'6px 14px',border:'none',borderBottom:rutaTab===t.v?'2px solid '+G:'2px solid transparent',background:'none',cursor:'pointer',fontSize:13,fontWeight:rutaTab===t.v?700:400,color:rutaTab===t.v?G:MT,fontFamily:'inherit'}}>{t.l}</button>)}
    </div>
    <div style={{padding:'14px 18px'}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:9,marginBottom:14}}>
        <KPI label="Recaudado" value={fmt(tR)} vc={OK} sub={recs.length+' abonos'} onClick={()=>setSeccion('cobros')}/>
        <KPI label="Prestado nuevo" value={fmt(tP)} sub={nuevos.length+' clientes'} onClick={()=>setSeccion('nuevos')}/>
        <KPI label="Saldaron cuenta" value={String(saldaron.length)} vc={saldaron.length?OK:FT} sub="terminaron de pagar" onClick={()=>setSeccion('saldaron')}/>
        <KPI label="Flujo neto" value={(tR-tP>=0?'+':'')+fmt(tR-tP)} vc={tR-tP>=0?OK:DN}/>
      </div>
      {/* Tabs de sección */}
      <div style={{display:'flex',gap:0,marginBottom:14,borderBottom:'2px solid '+BD}}>
        {[{v:'cobros',l:'Cobros ('+recs.length+')'},{v:'saldaron',l:'✓ Saldaron cuenta ('+saldaron.length+')'},{v:'nuevos',l:'Nuevos ('+nuevos.length+')'}].map(t=><button key={t.v} onClick={()=>setSeccion(t.v)} style={{padding:'6px 14px',border:'none',borderBottom:seccion===t.v?'2px solid '+(t.v==='saldaron'?OK:G):'2px solid transparent',background:'none',cursor:'pointer',fontSize:12,fontWeight:seccion===t.v?700:400,color:seccion===t.v?(t.v==='saldaron'?OK:G):MT,fontFamily:'inherit',marginBottom:-2}}>{t.l}</button>)}
      </div>
      {/* Cobros */}
      {seccion==='cobros'&&(recs.length>0?<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:480}}>
        <thead><tr>{['Cliente','Ruta','Fecha pago','Cuota','Monto recibido'].map((t,i)=><th key={i} style={{textAlign:'left',padding:'5px 8px',fontSize:10,color:MT,fontWeight:700,borderBottom:'2px solid '+BD}}>{t}</th>)}</tr></thead>
        <tbody>{recs.map((x,i)=><tr key={i} style={{borderBottom:'1px solid '+BD,cursor:'pointer'}} onClick={()=>{onClose();onVerCliente(x.p);}} onMouseEnter={e=>e.currentTarget.style.background=S2} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          <td style={{padding:'7px 8px',fontWeight:600,color:G}}>{x.p.nombre}</td>
          <td style={{padding:'7px 4px'}}><RTag r={x.p.ruta}/><CTag r={x.p.ruta}/></td>
          <td style={{padding:'7px 8px',fontSize:12,color:MT}}>{fmtFL(x.fecha)}</td>
          <td style={{padding:'7px 8px',fontWeight:600}}>{'C'+(x.i+1)+(x.i>=10?' ★':'')}</td>
          <td style={{padding:'7px 8px',fontWeight:700,color:OK}}>{fmt(x.monto)}</td>
        </tr>)}</tbody>
      </table></div>:<Empty msg="Sin cobros esta semana"/>)}
      {/* Saldaron cuenta */}
      {seccion==='saldaron'&&(saldaron.length>0?<div>
        <div style={{fontSize:12,color:MT,marginBottom:10}}>Clientes que terminaron de pagar su prestamo esta semana 🎉</div>
        <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:500}}>
          <thead><tr>{['Cliente','Ruta','Fecha inicio','Capital','Total pagado','Ultimo abono'].map((t,i)=><th key={i} style={{textAlign:'left',padding:'5px 8px',fontSize:10,color:MT,fontWeight:700,borderBottom:'2px solid '+BD}}>{t}</th>)}</tr></thead>
          <tbody>{saldaron.map((p,i)=>{
            const abs=getAbonos(p).filter(a=>a&&a.monto>0&&a.fecha).sort((a,b)=>parseD(b.fecha)-parseD(a.fecha));
            const ult=abs[0];
            return <tr key={i} style={{borderBottom:'1px solid '+BD,background:OKB,cursor:'pointer'}} onClick={()=>{onClose();onVerCliente(p);}} onMouseEnter={e=>e.currentTarget.style.background=GB} onMouseLeave={e=>e.currentTarget.style.background=OKB}>
              <td style={{padding:'8px 8px'}}><div style={{fontWeight:700,color:G}}>{p.nombre}</div><span style={{display:'inline-block',padding:'1px 7px',borderRadius:5,background:OKB,color:OK,fontSize:10,fontWeight:700,border:'1px solid '+OK+'44'}}>✓ Saldado</span></td>
              <td style={{padding:'8px 4px'}}><RTag r={p.ruta}/><CTag r={p.ruta}/></td>
              <td style={{padding:'8px 8px',fontSize:12,color:MT}}>{fmtFL(parseD(p.fechaPrestamo))}</td>
              <td style={{padding:'8px 8px',fontWeight:600}}>{fmt(p.monto)}</td>
              <td style={{padding:'8px 8px',fontWeight:700,color:OK}}>{fmt(totalAbonado(p))}</td>
              <td style={{padding:'8px 8px',fontSize:12,color:G,fontWeight:600}}>{ult?fmt(ult.monto)+' · '+fmtFL(parseD(ult.fecha)):'-'}</td>
            </tr>;
          })}</tbody>
        </table></div>
      </div>:<Empty msg="Nadie saldo su cuenta esta semana"/>)}
      {/* Nuevos */}
      {seccion==='nuevos'&&(nuevos.length>0?<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:440}}>
        <thead><tr>{['Cliente','Ruta','Fecha','Monto','Cuota semanal'].map((t,i)=><th key={i} style={{textAlign:'left',padding:'5px 8px',fontSize:10,color:MT,fontWeight:700,borderBottom:'2px solid '+BD}}>{t}</th>)}</tr></thead>
        <tbody>{nuevos.map((p,i)=><tr key={i} style={{borderBottom:'1px solid '+BD,cursor:'pointer'}} onClick={()=>{onClose();onVerCliente(p);}} onMouseEnter={e=>e.currentTarget.style.background=S2} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          <td style={{padding:'7px 8px',fontWeight:600,color:G}}>{p.nombre}</td>
          <td style={{padding:'7px 4px'}}><RTag r={p.ruta}/><CTag r={p.ruta}/></td>
          <td style={{padding:'7px 8px',fontSize:12,color:MT}}>{fmtFL(parseD(p.fechaPrestamo))}</td>
          <td style={{padding:'7px 8px',fontWeight:600}}>{fmt(p.monto)}</td>
          <td style={{padding:'7px 8px',color:MT}}>{fmt(p.cuota)}</td>
        </tr>)}</tbody>
      </table></div>:<Empty msg="Sin prestamos nuevos esta semana"/>)}
    </div>
  </Overlay>;
}

function ModalLista({titulo,lista,campo,onSelectCliente,onClose}){
  if(!lista)return null;
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
        const cuotasCaidas=campo==='at'?cuotasVencidas(p).filter(x=>saldoCuota(p,x.i)>0.5).map(x=>{const ab=getAbonos(p)[x.i];const abMonto=ab?ab.monto:0;return{idx:x.i,f:fs[x.i],saldo:saldoCuota(p,x.i),abMonto};}):[]; 
        return <div key={i} onClick={()=>{onClose();onSelectCliente(p);}} style={{padding:'10px 4px',borderBottom:'1px solid '+BD,cursor:'pointer',borderRadius:6}} onMouseEnter={e=>e.currentTarget.style.background=S2} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:8,marginBottom:cuotasCaidas.length?5:0}}>
            <span style={{fontWeight:600}}>{p.nombre}</span>
            <span><RTag r={p.ruta}/><CTag r={p.ruta}/></span>
            <span style={{textAlign:'right',fontWeight:700,color:campo==='at'?DN:G}}>{fmt(campo==='at'?saldoAtrasado(p):saldoTotal(p))}</span>
          </div>
          {cuotasCaidas.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:4,paddingLeft:4,marginBottom:2}}>
            {cuotasCaidas.map((c,j)=><span key={j} style={{display:'inline-flex',gap:3,background:DNB,color:DN,borderRadius:5,padding:'2px 8px',fontSize:11,fontWeight:600}}>
              {c.idx+1>10?'Ext':'C'+(c.idx+1)}{c.abMonto>0?' (abono '+fmt(c.abMonto)+')':''}: {fmt(c.saldo)}
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

function Dashboard({prestamos,salidas,flujoOff,setFlujoOff,onVerCliente}){
  const [mSemana,setMSemana]=useState(null);
  const [mLista,setMLista]=useState(null);
  const [filtroRuta,setFiltroRuta]=useState('todas');
  const todosActivos=useMemo(()=>prestamos.filter(p=>!isTerminado(p)),[prestamos]);
  const activos=useMemo(()=>filtroRuta==='todas'?todosActivos:todosActivos.filter(p=>p.ruta===filtroRuta),[todosActivos,filtroRuta]);
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
    {mSemana&&<ModalSemana lun={mSemana.lun} dom={mSemana.dom} rutaInicial={mSemana.ruta||'todas'} prestamos={prestamos} onClose={()=>setMSemana(null)} onVerCliente={onVerCliente}/>}
    {mLista&&<ModalLista {...mLista} onSelectCliente={p=>{setMLista(null);onVerCliente(p);}} onClose={()=>setMLista(null)}/>}
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:8}}>
      <div style={{fontSize:20,fontWeight:700}}>Dashboard</div>
      <div style={{display:'flex',gap:6}}>
        {[{v:'todas',l:'Todas las rutas'},{v:'A',l:'Ruta A - Junior'},{v:'B',l:'Ruta B - Jhon'},{v:'C',l:'Ruta C - Jhon'}].map(x=><button key={x.v} onClick={()=>setFiltroRuta(x.v)} style={{padding:'5px 12px',border:'1px solid '+(filtroRuta===x.v?G:BDS),borderRadius:7,background:filtroRuta===x.v?G:SF,color:filtroRuta===x.v?'#fff':MT,cursor:'pointer',fontSize:12,fontWeight:filtroRuta===x.v?700:400,fontFamily:'inherit'}}>{x.l}</button>)}
      </div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10,marginBottom:14}}>
      <KPI label={'Clientes activos'+(filtroRuta!=='todas'?' - Ruta '+filtroRuta:'')} value={String(activos.length)} sub="prestamos vigentes" vc={G} onClick={()=>setMLista({titulo:'Clientes activos'+(filtroRuta!=='todas'?' Ruta '+filtroRuta:''),lista:[...activos].sort((a,b)=>saldoTotal(b)-saldoTotal(a)),campo:'saldo'})}/>
      <KPI label={'Total por cobrar'+(filtroRuta!=='todas'?' - Ruta '+filtroRuta:'')} value={fmt(totSl)} sub="saldo activos" vc={G} onClick={()=>setMLista({titulo:'Por cobrar'+(filtroRuta!=='todas'?' Ruta '+filtroRuta:''),lista:[...activos].sort((a,b)=>saldoTotal(b)-saldoTotal(a)),campo:'saldo'})}/>
      <KPI label="Recaudado esta semana" value={fmt(recSem)} sub={'de '+fmt(esp)+' esperado'} vc={OK}/>
      <KPI label={'Saldo atrasado'+(filtroRuta!=='todas'?' - Ruta '+filtroRuta:'')} value={fmt(totAt)} sub={conAt+' clientes'} vc={DN} onClick={()=>setMLista({titulo:'Saldo atrasado'+(filtroRuta!=='todas'?' Ruta '+filtroRuta:''),lista:activos.filter(tieneSaldoAtrasado).sort((a,b)=>saldoAtrasado(b)-saldoAtrasado(a)),campo:'at'})}/>
      <KPI label={'Capital entregado'+(filtroRuta!=='todas'?' - Ruta '+filtroRuta:'')} value={fmt(activos.reduce((s,p)=>s+p.monto,0))} sub="sin interes" onClick={()=>setMLista({titulo:'Capital por cliente'+(filtroRuta!=='todas'?' Ruta '+filtroRuta:''),lista:[...activos].sort((a,b)=>b.monto-a.monto),campo:'saldo'})}/>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:14}}>
      {['A','B','C'].map(k=>{
        const ps=activos.filter(p=>p.ruta===k);
        const sl=ps.reduce((s,p)=>s+saldoTotal(p),0);
        const at=ps.reduce((s,p)=>s+saldoAtrasado(p),0);
        const conAtR=ps.filter(tieneSaldoAtrasado).length;
        return <div key={k} style={{background:SF,border:'1px solid '+RUTAS[k].c+'44',borderRadius:10,padding:'12px 14px'}}>
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}><span style={{display:'inline-block',padding:'2px 7px',borderRadius:5,background:RUTAS[k].bg,color:RUTAS[k].c,fontSize:11,fontWeight:700}}>Ruta {k}</span><span style={{fontSize:11,color:MT}}>{RUTAS[k].cobrador} - {RUTAS[k].dia}</span></div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
            <div style={{cursor:'pointer'}} onClick={()=>setMLista({titulo:'Ruta '+k+' - Clientes activos',lista:[...ps].sort((a,b)=>saldoTotal(b)-saldoTotal(a)),campo:'saldo'})} onMouseEnter={e=>e.currentTarget.style.opacity='0.7'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}><div style={{fontSize:10,color:MT,marginBottom:2}}>Clientes</div><div style={{fontSize:16,fontWeight:700,color:RUTAS[k].c}}>{ps.length}</div></div>
            <div style={{cursor:'pointer'}} onClick={()=>setMLista({titulo:'Ruta '+k+' - Por cobrar',lista:[...ps].sort((a,b)=>saldoTotal(b)-saldoTotal(a)),campo:'saldo'})} onMouseEnter={e=>e.currentTarget.style.opacity='0.7'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}><div style={{fontSize:10,color:MT,marginBottom:2}}>Por cobrar</div><div style={{fontSize:14,fontWeight:700,color:G}}>{fmt(sl)}</div></div>
            <div style={{cursor:'pointer'}} onClick={()=>setMLista({titulo:'Ruta '+k+' - Saldo atrasado',lista:ps.filter(tieneSaldoAtrasado).sort((a,b)=>saldoAtrasado(b)-saldoAtrasado(a)),campo:'at'})} onMouseEnter={e=>e.currentTarget.style.opacity='0.7'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}><div style={{fontSize:10,color:MT,marginBottom:2}}>Atrasado</div><div style={{fontSize:14,fontWeight:700,color:at>0?DN:FT}}>{at>0?fmt(at):'-'}</div><div style={{fontSize:10,color:FT}}>{conAtR} cli.</div></div>
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
    <Panel title={'Historial - ultimas '+HIST+' semanas'} tr={<span style={{fontSize:11,color:G,fontWeight:600}}>Clic en una ruta para ver detalle</span>}>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:900}}>
        <thead>
          <tr>
            <th rowSpan={2} style={{textAlign:'left',padding:'5px 8px',fontSize:10,color:MT,fontWeight:700,borderBottom:'2px solid '+BD,verticalAlign:'bottom'}}>Semana</th>
            {['A','B','C'].map(k=><th key={k} colSpan={3} style={{padding:'4px 7px',fontSize:10,color:RUTAS[k].c,fontWeight:700,borderBottom:'1px solid '+BD,borderLeft:'2px solid '+RUTAS[k].c,textAlign:'center',background:RUTAS[k].bg}}>Ruta {k} - {RUTAS[k].cobrador} ({RUTAS[k].dia})</th>)}
            <th rowSpan={2} style={{padding:'5px 7px',fontSize:10,color:MT,fontWeight:700,borderBottom:'2px solid '+BD,textAlign:'center',borderLeft:'2px solid '+BD}}>Total recogido</th>
            <th rowSpan={2} style={{padding:'5px 7px',fontSize:10,color:MT,fontWeight:700,borderBottom:'2px solid '+BD,textAlign:'center'}}>Total prestado</th>
            <th rowSpan={2} style={{padding:'5px 7px',fontSize:10,color:OK,fontWeight:700,borderBottom:'2px solid '+BD,textAlign:'center'}}>Saldaron cuenta</th>
            <th rowSpan={2} style={{padding:'5px 7px',fontSize:10,color:DN,fontWeight:700,borderBottom:'2px solid '+BD,textAlign:'center'}}>Salida caja</th>
            <th rowSpan={2} style={{padding:'5px 7px',fontSize:10,color:G,fontWeight:700,borderBottom:'2px solid '+BD,textAlign:'center'}}>Neto real</th>
          </tr>
          <tr>
            {['A','B','C'].map(k=>[
              <th key={k+'cli'} style={{padding:'3px 6px',fontSize:9,color:RUTAS[k].c,fontWeight:700,borderBottom:'2px solid '+BD,borderLeft:'2px solid '+RUTAS[k].c,textAlign:'center',background:RUTAS[k].bg}}>Clientes nuevos</th>,
              <th key={k+'rec'} style={{padding:'3px 6px',fontSize:9,color:OK,fontWeight:700,borderBottom:'2px solid '+BD,textAlign:'center',background:RUTAS[k].bg}}>Recogido</th>,
              <th key={k+'pre'} style={{padding:'3px 6px',fontSize:9,color:MT,fontWeight:700,borderBottom:'2px solid '+BD,textAlign:'center',background:RUTAS[k].bg}}>Prestado</th>
            ])}
          </tr>
        </thead>
        <tbody>{hist.map((x,idx)=>{
          const esA=x.lun.getTime()===semRango(0).lun.getTime();
          const tR=['A','B','C'].reduce((s,k)=>s+x.f[k].rec,0);
          const tP=['A','B','C'].reduce((s,k)=>s+x.f[k].cap,0);
          const salSem=salidas.filter(s=>enRango(parseD(s.fecha),x.lun,x.dom)).reduce((s,x2)=>s+x2.monto,0);
          const neto=tR-tP-salSem;
          const saldaron=prestamos.filter(p=>{
            const abs=getAbonos(p).filter(a=>a&&a.monto>0&&a.fecha);
            if(!abs.length)return false;
            const ultAb=abs.sort((a,b)=>parseD(b.fecha)-parseD(a.fecha))[0];
            return isTerminado(p)&&enRango(parseD(ultAb.fecha),x.lun,x.dom);
          });
          return <tr key={idx} style={{borderBottom:'1px solid '+BD,background:esA?GB:'transparent'}}>
            <td style={{padding:'7px 8px',fontSize:11,color:esA?G:MT,fontWeight:esA?700:400,cursor:'pointer',whiteSpace:'nowrap'}} onClick={()=>setMSemana({lun:x.lun,dom:x.dom,ruta:'todas'})}>{x.lun.getDate()+' '+MESES[x.lun.getMonth()]+' - '+x.dom.getDate()+' '+MESES[x.dom.getMonth()]}{esA&&<div style={{fontSize:10,color:G}}>esta semana</div>}</td>
            {['A','B','C'].map(k=>[
              <td key={k+'cli'} style={{padding:'6px',textAlign:'center',borderLeft:'2px solid '+RUTAS[k].c,cursor:'pointer'}} onClick={()=>setMSemana({lun:x.lun,dom:x.dom,ruta:k})} onMouseEnter={e=>e.currentTarget.style.background=RUTAS[k].bg} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <span style={{fontWeight:700,color:x.f[k].nPr?RUTAS[k].c:FT}}>{x.f[k].nPr||'-'}</span>
              </td>,
              <td key={k+'rec'} style={{padding:'6px',textAlign:'center',cursor:'pointer'}} onClick={()=>setMSemana({lun:x.lun,dom:x.dom,ruta:k})} onMouseEnter={e=>e.currentTarget.style.background=RUTAS[k].bg} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <span style={{fontWeight:700,color:x.f[k].rec?OK:FT}}>{x.f[k].rec?fmt(x.f[k].rec):'-'}</span>
              </td>,
              <td key={k+'pre'} style={{padding:'6px',textAlign:'center',cursor:'pointer'}} onClick={()=>setMSemana({lun:x.lun,dom:x.dom,ruta:k})} onMouseEnter={e=>e.currentTarget.style.background=RUTAS[k].bg} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <span style={{color:x.f[k].cap?TX:FT}}>{x.f[k].cap?fmt(x.f[k].cap):'-'}</span>
              </td>
            ])}
            <td style={{padding:'6px',fontWeight:700,color:tR?OK:FT,textAlign:'center',borderLeft:'2px solid '+BD,cursor:'pointer'}} onClick={()=>setMSemana({lun:x.lun,dom:x.dom,ruta:'todas'})}>{tR?fmt(tR):'-'}</td>
            <td style={{padding:'6px',color:tP?TX:FT,textAlign:'center'}}>{tP?fmt(tP):'-'}</td>
            <td style={{padding:'6px',textAlign:'center',cursor:saldaron.length?'pointer':'default'}} onClick={()=>saldaron.length&&setMSemana({lun:x.lun,dom:x.dom,ruta:'todas',verSaldaron:true})}>
              {saldaron.length?<span style={{fontWeight:700,color:OK,background:OKB,padding:'2px 8px',borderRadius:10,fontSize:11}}>✓ {saldaron.length} cliente{saldaron.length!==1?'s':''}</span>:<span style={{color:FT}}>-</span>}
            </td>
            <td style={{padding:'6px',color:salSem?DN:FT,textAlign:'center',fontWeight:salSem?600:400}}>{salSem?fmt(salSem):'-'}</td>
            <td style={{padding:'6px',fontWeight:700,color:neto>0?OK:neto<0?DN:FT,textAlign:'center'}}>{(tR||tP||salSem)?(neto>0?'+':'')+fmt(neto):'-'}</td>
          </tr>;
        })}</tbody>
      </table></div>
    </Panel>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
      <Panel title="Cobros esta semana">
        {['A','B','C'].map(k=>{const xs=coEsta.filter(x=>x.p.ruta===k);if(!xs.length)return null;const e2=xs.reduce((s,x)=>s+x.p.cuota,0);const rc=xs.reduce((s,x)=>s+(getAbonos(x.p)[x.i]?(getAbonos(x.p)[x.i].monto||0):0),0);return <div key={k} style={{marginBottom:11}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}><span><RTag r={k}/><CTag r={k}/></span><span style={{fontSize:12}}><b style={{color:OK}}>{fmt(rc)}</b> / {fmt(e2)}</span></div>{xs.map((x,i)=>{const m=getAbonos(x.p)[x.i]?getAbonos(x.p)[x.i].monto:null;return <div key={i} onClick={()=>onVerCliente(x.p)} style={{fontSize:12,padding:'4px 6px',cursor:'pointer',borderRadius:4,display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid '+BD+'44'}} onMouseEnter={e=>e.currentTarget.style.background=S2} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><span style={{color:TX}}>{x.p.nombre} - {x.ext?'Ext':'C'+(x.i+1)}</span><span style={{fontWeight:700,color:m&&m>0?OK:m===0?DN:FT,fontSize:11,marginLeft:8}}>{m!=null?fmt(m):'sin registrar'}</span></div>;})}</div>;})}
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
  const cobros=useMemo(()=>{
    const out=[];
    prestamos.filter(p=>!isTerminado(p)).forEach(p=>{
      if(fr&&p.ruta!==fr)return;
      if(!rutasCob.includes(p.ruta))return;
      const cuotas=fechasCuotas(p);
      const abs=getAbonos(p);
      let tienePlanEsta=false;
      // Cuotas del plan (1-10)
      cuotas.forEach((f,i)=>{if(enRango(f,lun,dom)){out.push({p,i,f,ext:false});tienePlanEsta=true;}});
      // Cuotas extra (11+): mostrar las que tienen abono en esta semana, o la proxima libre si saldo>0 y ya vencio plan
      const cuotasExtra=abs.slice(10);
      cuotasExtra.forEach((a,k)=>{
        const i=10+k;
        const fAbono=a&&a.fecha?parseD(a.fecha):null;
        if(fAbono&&enRango(fAbono,lun,dom)){out.push({p,i,f:fAbono,ext:true});tienePlanEsta=true;}
      });
      // Si no hay cuota del plan esta semana y el plan vencio con saldo pendiente, mostrar como pendiente ext
      if(!tienePlanEsta&&saldoTotal(p)>0.5&&lun>cuotas[cuotas.length-1]){
        out.push({p,i:abs.length,f:lun,ext:true,pendiente:true});
      }
    });
    return out;
  },[prestamos,semOff,fr,currentUser]);
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
            const nLabel=x.ext?'C'+(x.i+1)+' ★':'C'+(x.i+1);
            return <tr key={idx} style={{borderBottom:'1px solid '+BD,background:rowBg}}>
              <td style={{padding:'8px'}}>
                <div style={{fontWeight:600,cursor:'pointer',color:G}} onClick={()=>onVerCliente(x.p)}>{x.p.nombre}</div>
                {x.ext&&!x.pendiente&&<div style={{fontSize:10,color:WN,fontWeight:600}}>★ cuota extra</div>}
                {x.pendiente&&<div style={{fontSize:10,color:DN,fontWeight:600}}>▲ saldo pendiente</div>}
              </td>
              <td style={{padding:'8px'}}><b style={{color:x.ext?WN:TX}}>{nLabel}</b></td>
              <td style={{padding:'8px',fontSize:12,color:MT}}>
                {m!=null&&fa?<span style={{color:G,fontWeight:600}}>{fmtF(parseD(fa))}</span>:fmtF(x.f)}
              </td>
              <td style={{padding:'8px',color:MT}}>{fmt(x.ext?saldoTotal(x.p):x.p.cuota)}</td>
              <td style={{padding:'8px'}}>
                <input type="number" defaultValue={m==null?'':Math.round(m)} placeholder="monto" min="0" key={x.p.id+'-'+x.i+'-'+m} style={{width:86,padding:'4px 6px',fontSize:12,border:'1px solid '+BDS,borderRadius:6,background:SF,color:TX,fontFamily:'inherit'}} onChange={ev=>onSave(x.p.id,x.i,ev.target.value,toDS(x.f))}/>
                {m!=null&&<input type="date" defaultValue={fa||toDS(x.f)} key={'d'+x.p.id+'-'+x.i} style={{width:118,padding:'3px 5px',fontSize:11,border:'1px solid '+BDS,borderRadius:6,background:SF,color:TX,fontFamily:'inherit',marginTop:3,display:'block'}} onChange={ev=>onSave(x.p.id,x.i,null,null,ev.target.value)}/>}
                {m!=null&&m>0&&<div style={{fontSize:11,color:OK,fontWeight:600,marginTop:2}}>{fmt(m)} pagado</div>}
                {m!=null&&m>0&&<MBar pct={Math.min(100,Math.round(m/(x.ext?saldoTotal(x.p):x.p.cuota)*100))} color={m>=(x.ext?saldoTotal(x.p):x.p.cuota)-0.5?OK:WN}/>}
              </td>
              <td style={{padding:'8px',fontWeight:700,color:saldo<0.5?OK:DN}}>{saldo<0.5?'✓ OK':fmt(saldo)}</td>
              <td style={{padding:'8px'}}><div style={{display:'flex',gap:3}}><Btn sm v="primary" onClick={()=>onSave(x.p.id,x.i,'completo',toDS(x.f),null,x.ext)}>OK</Btn>{!x.ext&&<Btn sm style={{color:WN,borderColor:WN+'44'}} onClick={()=>onSave(x.p.id,x.i,0,toDS(x.f))}>X</Btn>}{m!=null&&<Btn sm onClick={()=>onSave(x.p.id,x.i,'limpiar')}>Borrar</Btn>}</div></td>
            </tr>;
          })}</tbody>
        </table></div>
      </Panel>;
    })}
  </div>;
}

function cuotasTotalesReales(p){return Math.max(10,getAbonos(p).length);}
function cuotasTotalesVencidas(p){
  const h=HOY();
  let count=fechasCuotas(p).filter(f=>f<=h).length;
  const nS=cuotasTotalesReales(p);
  for(let i=10;i<nS;i++){const a=getAbonos(p)[i];if(a&&a.monto!=null)count++;}
  return count;
}
function cuotasPagadasCompletas(p){
  const nS=cuotasTotalesReales(p);
  return Array.from({length:nS},(_,i)=>estadoCuota(p,i)).filter(e=>e==='completa').length;
}

function ConsolidadoView({prestamos,onEdit,onDelete,currentUser,onVerCliente}){
  const [rf,setRf]=useState('');
  const [estado,setEstado]=useState('activo');
  const [nombre,setNombre]=useState('');
  const [filtroCuotasTotal,setFiltroCuotasTotal]=useState('');
  const [filtroCuotasPagas,setFiltroCuotasPagas]=useState('');
  const rutasCob=currentUser.rol==='cobrador'?(currentUser.rutas||[currentUser.ruta]):null;

  const lista=useMemo(()=>{
    let l=prestamos.slice();
    if(rf)l=l.filter(p=>p.ruta===rf);
    if(estado==='activo')l=l.filter(p=>saldoTotal(p)>0.5);
    else if(estado==='saldo')l=l.filter(p=>tieneSaldoAtrasado(p));
    else if(estado==='terminado')l=l.filter(isTerminado);
    if(nombre)l=l.filter(p=>p.nombre.toLowerCase().includes(nombre.toLowerCase()));
    if(rutasCob)l=l.filter(p=>rutasCob.includes(p.ruta));
    if(filtroCuotasTotal!=='')l=l.filter(p=>cuotasTotalesVencidas(p)===parseInt(filtroCuotasTotal));
    if(filtroCuotasPagas!=='')l=l.filter(p=>cuotasPagadasCompletas(p)===parseInt(filtroCuotasPagas));
    return l.sort((a,b)=>parseD(b.fechaPrestamo)-parseD(a.fechaPrestamo));
  },[prestamos,rf,estado,nombre,currentUser,filtroCuotasTotal,filtroCuotasPagas]);

  const tots={cap:lista.reduce((s,p)=>s+p.monto,0),abon:lista.reduce((s,p)=>s+totalAbonado(p),0),saldo:lista.reduce((s,p)=>s+saldoTotal(p),0),atras:lista.reduce((s,p)=>s+saldoAtrasado(p),0)};

  // Opciones dinámicas para los dropdowns de cuotas
  const opcionesCuotasTotal=useMemo(()=>{const vals=new Set(prestamos.map(p=>cuotasTotalesVencidas(p)));return Array.from(vals).sort((a,b)=>a-b);},[prestamos]);
  const opcionesCuotasPagas=useMemo(()=>{const vals=new Set(prestamos.map(p=>cuotasPagadasCompletas(p)));return Array.from(vals).sort((a,b)=>a-b);},[prestamos]);

  return <div>
    <div style={{fontSize:20,fontWeight:700,marginBottom:14}}>Consolidado de prestamos</div>

    {/* Fila 1 de filtros */}
    <div style={{display:'flex',gap:8,marginBottom:8,flexWrap:'wrap',alignItems:'flex-end'}}>
      {currentUser.rol==='admin'&&<Sel value={rf} onChange={e=>setRf(e.target.value)} style={{maxWidth:160}}><option value="">Todas las rutas</option>{['A','B','C'].map(r=><option key={r} value={r}>Ruta {r} - {RUTAS[r].cobrador}</option>)}</Sel>}
      <Sel value={estado} onChange={e=>setEstado(e.target.value)} style={{maxWidth:200}}><option value="">Todos</option><option value="activo">Activos</option><option value="saldo">Con saldo atrasado</option><option value="terminado">Terminados</option></Sel>
      <Inp placeholder="Buscar cliente..." value={nombre} onChange={e=>setNombre(e.target.value)} style={{maxWidth:180}}/>
    </div>

    {/* Fila 2 de filtros - Cuotas */}
    <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'flex-end',background:S2,padding:'10px 12px',borderRadius:8,border:'1px solid '+BD}}>
      <span style={{fontSize:12,fontWeight:700,color:MT,alignSelf:'center'}}>Filtrar por cuotas:</span>
      <Sel value={filtroCuotasTotal} onChange={e=>setFiltroCuotasTotal(e.target.value)} style={{maxWidth:170}}>
        <option value="">Todas las cuotas vencidas</option>
        {opcionesCuotasTotal.map(n=><option key={n} value={n}>{n} cuota{n!==1?'s':''} vencida{n!==1?'s':''}</option>)}
      </Sel>
      <Sel value={filtroCuotasPagas} onChange={e=>setFiltroCuotasPagas(e.target.value)} style={{maxWidth:170}}>
        <option value="">Todas las pagas</option>
        {opcionesCuotasPagas.map(n=><option key={n} value={n}>{n} paga{n!==1?'s':''}</option>)}
      </Sel>
      {(filtroCuotasTotal!==''||filtroCuotasPagas!=='')&&<Btn sm onClick={()=>{setFiltroCuotasTotal('');setFiltroCuotasPagas('');}}>Limpiar filtros</Btn>}
      <span style={{fontSize:12,color:FT,marginLeft:4}}>{lista.length} resultado{lista.length!==1?'s':''}</span>
    </div>

    {lista.length===0?<Empty msg="Sin resultados."/>:<div style={{background:SF,border:'1px solid '+BD,borderRadius:10,overflowX:'auto',marginBottom:12}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:820}}>
        <thead><tr>{['Cliente','Ruta','Fecha','Capital','Interés 40%','Total a cobrar','Abonado','Saldo','Atrasado','Cuotas vencidas / pagas',''].map((t,i)=><th key={i} style={{textAlign:'left',padding:'7px 9px',fontSize:11,color:MT,fontWeight:700,borderBottom:'2px solid '+BD,whiteSpace:'nowrap'}}>{t}</th>)}</tr></thead>
        <tbody>{lista.map(p=>{
          const d=totalDeuda(p),ab=totalAbonado(p),sl=saldoTotal(p),at=saldoAtrasado(p);
          const pct=Math.round(ab/d*100);
          const term=isTerminado(p);
          const cTot=cuotasTotalesVencidas(p);
          const cPag=cuotasPagadasCompletas(p);
          return <tr key={p.id} style={{borderBottom:'1px solid '+BD,background:!term&&at>0.5?DNB+'44':undefined,cursor:'pointer'}} onClick={()=>onVerCliente(p)} onMouseEnter={e=>e.currentTarget.style.background=!term&&at>0.5?DNB+'66':S2} onMouseLeave={e=>e.currentTarget.style.background=!term&&at>0.5?DNB+'44':'transparent'}>
            <td style={{padding:'8px 9px'}}><div style={{fontWeight:600,color:G}}>{p.nombre}</div>{term&&<span style={{display:'inline-block',padding:'2px 7px',borderRadius:5,background:OKB,color:OK,fontSize:11,fontWeight:700}}>Terminado</span>}</td>
            <td style={{padding:'8px 4px'}}><RTag r={p.ruta}/><CTag r={p.ruta}/></td>
            <td style={{padding:'8px 9px',fontSize:12,color:MT}}>{fmtF(parseD(p.fechaPrestamo))}</td>
            <td style={{padding:'8px 9px'}}><div style={{fontWeight:600}}>{fmt(p.monto)}</div><div style={{fontSize:10,color:FT}}>capital</div></td>
            <td style={{padding:'8px 9px',color:WN,fontWeight:600}}><div>{fmt(p.monto*0.4)}</div><div style={{fontSize:10,color:FT}}>{fmt(interesCobrado(p))} cobrado</div></td>
            <td style={{padding:'8px 9px',fontWeight:700,color:G}}>{fmt(d)}</td>
            <td style={{padding:'8px 9px',color:OK,fontWeight:600}}>{fmt(ab)}<MBar pct={pct}/><div style={{fontSize:10,color:FT}}>{pct}%</div></td>
            <td style={{padding:'8px 9px',fontWeight:600,color:sl<0.5?OK:term?FT:DN}}>{sl<0.5?<span style={{color:OK}}>✓ Pagado</span>:fmt(sl)}</td>
            <td style={{padding:'8px 9px',fontWeight:600,color:at>0.5?DN:FT}}>{at>0.5?fmt(at):'-'}</td>
            <td style={{padding:'8px 9px'}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                <span style={{fontSize:12,fontWeight:700,color:TX}}>{cTot} venc.</span>
                <span style={{fontSize:12,color:MT}}>/</span>
                <span style={{fontSize:12,fontWeight:700,color:cPag===cTot&&cTot>0?OK:cPag>0?WN:DN}}>{cPag} pag.</span>
                {cuotasTotalesReales(p)>10&&<span style={{fontSize:10,color:WN,fontWeight:700,background:WNB,padding:'1px 5px',borderRadius:4}}>+{cuotasTotalesReales(p)-10} ext</span>}
              </div>
              <div style={{display:'flex',gap:2,flexWrap:'wrap'}}>{Array.from({length:cuotasTotalesReales(p)},(_,i)=>{const e=estadoCuota(p,i);let bg=S2,c=FT;if(e==='completa'){bg=OK;c='#fff';}else if(e==='parcial'){bg=WNB;c=WN;}else if(e==='sinpago'){bg=DNB;c=DN;}const esExt=i>=10;return <span key={i} title={'C'+(i+1)+(esExt?' extra':'')} style={{width:14,height:14,borderRadius:2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:7,fontWeight:700,background:esExt&&bg===S2?WNB:bg,color:esExt&&c===FT?WN:c,border:esExt?'1px solid '+WN+'66':'none'}}>{i+1}</span>;})}</div>
            </td>
            {currentUser.rol==='admin'&&<td style={{padding:'8px 5px'}} onClick={e=>e.stopPropagation()}><div style={{display:'flex',gap:3}}><Btn sm onClick={()=>onEdit(p)}>Editar</Btn><Btn sm v="danger" onClick={()=>onDelete(p)}>Borrar</Btn></div></td>}
          </tr>;
        })}
        </tbody>
      </table>
    </div>}
    <Panel title="Totales">
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(118px,1fr))',gap:9}}>
        <KPI label="Capital" value={fmt(tots.cap)} sub={lista.length+' prestamos'}/>
        <KPI label="Interés esperado" value={fmt(lista.reduce((s,p)=>s+p.monto*0.4,0))} vc={WN}/>
        <KPI label="Total a cobrar" value={fmt(lista.reduce((s,p)=>s+totalDeuda(p),0))} vc={G}/>
        <KPI label="Abonado" value={fmt(tots.abon)} vc={OK}/>
        <KPI label="Por cobrar" value={fmt(tots.saldo)} vc={tots.saldo?DN:TX}/>
        <KPI label="Atrasado" value={fmt(tots.atras)} vc={tots.atras?WN:TX}/>
      </div>
    </Panel>
  </div>;
}

function CarteraActivaView({prestamos,salidas,onVerCliente}){
  const [tab,setTab]=useState('activos');
  const [rf,setRf]=useState('');
  const activos=useMemo(()=>prestamos.filter(p=>!isTerminado(p)),[prestamos]);
  const terminados=useMemo(()=>prestamos.filter(isTerminado),[prestamos]);
  const activosFiltrados=useMemo(()=>rf?activos.filter(p=>p.ruta===rf):activos,[activos,rf]);
  const terminadosFiltrados=useMemo(()=>rf?terminados.filter(p=>p.ruta===rf):terminados,[terminados,rf]);
  const listaFiltrada=useMemo(()=>rf?prestamos.filter(p=>p.ruta===rf):prestamos,[prestamos,rf]);

  const totA={cap:activos.reduce((s,p)=>s+p.monto,0),saldo:activos.reduce((s,p)=>s+saldoTotal(p),0),atras:activos.reduce((s,p)=>s+saldoAtrasado(p),0),abon:activos.reduce((s,p)=>s+totalAbonado(p),0)};
  const totT={cap:terminados.reduce((s,p)=>s+p.monto,0),cobrado:terminados.reduce((s,p)=>s+totalAbonado(p),0)};
  const totalSalidas=salidas.reduce((s,x)=>s+x.monto,0);
  const gananciaTotal=prestamos.reduce((s,p)=>s+interesCobrado(p),0)-totalSalidas;

  const lista=tab==='activos'?activos:tab==='terminados'?terminados:prestamos;

  return <div>
    <div style={{fontSize:20,fontWeight:700,marginBottom:14}}>Cartera activa</div>

    {/* Filtro por ruta */}
    <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
      <span style={{fontSize:12,color:MT,fontWeight:600}}>Filtrar por ruta:</span>
      {['','A','B','C'].map(r=><button key={r} onClick={()=>setRf(r)} style={{padding:'5px 14px',borderRadius:20,border:'1.5px solid '+(rf===r?G:BD),background:rf===r?GB:'transparent',color:rf===r?G:MT,fontWeight:rf===r?700:400,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>
        {r===''?'Todas las rutas':('Ruta '+r+' · '+RUTAS[r].cobrador)}
      </button>)}
    </div>

    {/* KPIs generales */}
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10,marginBottom:14}}>
      <KPI label="Clientes activos" value={String(activosFiltrados.length)} sub="prestamos vigentes" vc={G} onClick={()=>setTab('activos')}/>
      <KPI label="Capital en la calle" value={fmt(activosFiltrados.reduce((s,p)=>s+p.monto,0))} sub="sin interes" onClick={()=>setTab('activos')}/>
      <KPI label="Por cobrar (con interes)" value={fmt(activosFiltrados.reduce((s,p)=>s+saldoTotal(p),0))} vc={G} onClick={()=>setTab('activos')}/>
      <KPI label="Saldo atrasado" value={fmt(activosFiltrados.reduce((s,p)=>s+saldoAtrasado(p),0))} vc={activosFiltrados.some(tieneSaldoAtrasado)?DN:FT} sub={activosFiltrados.filter(tieneSaldoAtrasado).length+' clientes'} onClick={()=>setTab('activos')}/>
      <KPI label="Terminados" value={String(terminadosFiltrados.length)} sub={fmt(terminadosFiltrados.reduce((s,p)=>s+totalAbonado(p),0))+' cobrado'} vc={OK} onClick={()=>setTab('terminados')}/>
      <KPI label="Ganancia neta" value={fmt(listaFiltrada.reduce((s,p)=>s+interesCobrado(p),0)-salidas.reduce((s,x)=>s+x.monto,0))} vc={listaFiltrada.reduce((s,p)=>s+interesCobrado(p),0)>salidas.reduce((s,x)=>s+x.monto,0)?OK:DN}/>
    </div>

    {/* Resumen por ruta */}
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:14}}>
      {['A','B','C'].map(k=>{
        const ps=activos.filter(p=>p.ruta===k);
        const sl=ps.reduce((s,p)=>s+saldoTotal(p),0);
        const at=ps.reduce((s,p)=>s+saldoAtrasado(p),0);
        const cap=ps.reduce((s,p)=>s+p.monto,0);
        return <div key={k} style={{background:SF,border:'1px solid '+RUTAS[k].c+'44',borderRadius:10,padding:'12px 14px',cursor:'pointer'}} onClick={()=>setTab('activos')}>
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}><span style={{display:'inline-block',padding:'2px 7px',borderRadius:5,background:RUTAS[k].bg,color:RUTAS[k].c,fontSize:11,fontWeight:700}}>Ruta {k}</span><span style={{fontSize:11,color:MT}}>{RUTAS[k].cobrador}</span></div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:6}}>
            <div><div style={{fontSize:10,color:MT,marginBottom:2}}>Clientes</div><div style={{fontSize:16,fontWeight:700,color:RUTAS[k].c}}>{ps.length}</div></div>
            <div><div style={{fontSize:10,color:MT,marginBottom:2}}>Capital</div><div style={{fontSize:13,fontWeight:700,color:TX}}>{fmt(cap)}</div></div>
            <div><div style={{fontSize:10,color:MT,marginBottom:2}}>Por cobrar</div><div style={{fontSize:13,fontWeight:700,color:G}}>{fmt(sl)}</div></div>
            <div><div style={{fontSize:10,color:MT,marginBottom:2}}>Atrasado</div><div style={{fontSize:13,fontWeight:700,color:at>0?DN:FT}}>{at>0?fmt(at):'-'}</div></div>
          </div>
        </div>;
      })}
    </div>

    {/* Tabs */}
    <div style={{display:'flex',gap:0,marginBottom:0,borderBottom:'2px solid '+BD}}>
      {[{v:'activos',l:'Activos ('+activosFiltrados.length+')'},{v:'terminados',l:'Terminados ('+terminadosFiltrados.length+')'},{v:'todos',l:'Todos ('+listaFiltrada.length+')'}].map(t=><button key={t.v} onClick={()=>setTab(t.v)} style={{padding:'8px 18px',border:'none',borderBottom:tab===t.v?'2px solid '+G:'2px solid transparent',background:'none',cursor:'pointer',fontSize:13,fontWeight:tab===t.v?700:400,color:tab===t.v?G:MT,fontFamily:'inherit',marginBottom:-2}}>{t.l}</button>)}
    </div>

    <div style={{background:SF,border:'1px solid '+BD,borderTop:'none',borderRadius:'0 0 10px 10px',overflowX:'auto',marginBottom:12}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:820}}>
        <thead><tr>{['Cliente','Ruta','Fecha','Capital','Interés 40%','Total a cobrar','Abonado','Saldo','Cuotas','Estado'].map((t,i)=><th key={i} style={{textAlign:'left',padding:'8px 9px',fontSize:11,color:MT,fontWeight:700,borderBottom:'2px solid '+BD,whiteSpace:'nowrap'}}>{t}</th>)}</tr></thead>
        <tbody>{(tab==='activos'?activosFiltrados:tab==='terminados'?terminadosFiltrados:listaFiltrada).sort((a,b)=>parseD(b.fechaPrestamo)-parseD(a.fechaPrestamo)).map(p=>{
          const d=totalDeuda(p),ab=totalAbonado(p),sl=saldoTotal(p),at=saldoAtrasado(p);
          const pct=Math.round(ab/d*100);
          const term=isTerminado(p);
          const cTot=cuotasTotalesVencidas(p);
          const cPag=cuotasPagadasCompletas(p);
          return <tr key={p.id} style={{borderBottom:'1px solid '+BD,cursor:'pointer',transition:'background .1s'}} onClick={()=>onVerCliente(p)} onMouseEnter={e=>e.currentTarget.style.background=S2} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <td style={{padding:'8px 9px'}}><div style={{fontWeight:600,color:G}}>{p.nombre}</div>{p.tel&&<div style={{fontSize:10,color:FT}}>{p.tel}</div>}</td>
            <td style={{padding:'8px 4px'}}><RTag r={p.ruta}/><CTag r={p.ruta}/></td>
            <td style={{padding:'8px 9px',fontSize:12,color:MT,whiteSpace:'nowrap'}}>{fmtF(parseD(p.fechaPrestamo))}</td>
            <td style={{padding:'8px 9px',fontWeight:600}}>{fmt(p.monto)}</td>
            <td style={{padding:'8px 9px',color:WN}}>{fmt(p.monto*0.4)}</td>
            <td style={{padding:'8px 9px',fontWeight:700,color:G}}>{fmt(d)}</td>
            <td style={{padding:'8px 9px',color:OK,fontWeight:600}}>{fmt(ab)}<MBar pct={pct}/><div style={{fontSize:10,color:FT}}>{pct}%</div></td>
            <td style={{padding:'8px 9px',fontWeight:600,color:sl<0.5?FT:term?FT:DN}}>{term?<span style={{color:OK}}>✓ Pagado</span>:fmt(sl)}</td>
            <td style={{padding:'8px 9px'}}>
              <span style={{fontSize:12,fontWeight:700,color:cPag===cTot&&cTot>0?OK:cPag<cTot?WN:FT}}>{cPag}/{cTot}</span>
              {cuotasTotalesReales(p)>10&&<span style={{fontSize:10,color:WN,fontWeight:700,marginLeft:4}}>+{cuotasTotalesReales(p)-10}ext</span>}
              <div style={{display:'flex',gap:1,flexWrap:'wrap',marginTop:3}}>{Array.from({length:cuotasTotalesReales(p)},(_,i)=>{const e=estadoCuota(p,i);let bg=S2,c=FT;if(e==='completa'){bg=OK;c='#fff';}else if(e==='parcial'){bg=WNB;c=WN;}else if(e==='sinpago'){bg=DNB;c=DN;}const esExt=i>=10;return <span key={i} title={'C'+(i+1)+(esExt?' extra':'')} style={{width:13,height:13,borderRadius:2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:7,fontWeight:700,background:esExt&&bg===S2?WNB:bg,color:esExt&&c===FT?WN:c,border:esExt?'1px solid '+WN+'66':'none'}}>{i+1}</span>;})}</div>
            </td>
            <td style={{padding:'8px 9px'}}>
              {term?<span style={{display:'inline-block',padding:'2px 8px',borderRadius:5,background:OKB,color:OK,fontSize:11,fontWeight:700}}>Terminado</span>
               :at>0.5?<span style={{display:'inline-block',padding:'2px 8px',borderRadius:5,background:DNB,color:DN,fontSize:11,fontWeight:700}}>En mora {fmt(at)}</span>
               :<span style={{display:'inline-block',padding:'2px 8px',borderRadius:5,background:GB,color:G,fontSize:11,fontWeight:700}}>Al dia</span>}
            </td>
          </tr>;
        })}</tbody>
      </table>
    </div>

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:9}}>
      <KPI label="Capital total" value={fmt(listaFiltrada.reduce((s,p)=>s+p.monto,0))} sub={listaFiltrada.length+' prestamos'}/>
      <KPI label="Total abonado" value={fmt(listaFiltrada.reduce((s,p)=>s+totalAbonado(p),0))} vc={OK}/>
      <KPI label="Por cobrar" value={fmt(activosFiltrados.reduce((s,p)=>s+saldoTotal(p),0))} vc={G}/>
      <KPI label="Salidas de caja" value={fmt(salidas.reduce((s,x)=>s+x.monto,0))} vc={DN}/>
      <KPI label="Ganancia neta" value={fmt(listaFiltrada.reduce((s,p)=>s+interesCobrado(p),0)-salidas.reduce((s,x)=>s+x.monto,0))} vc={listaFiltrada.reduce((s,p)=>s+interesCobrado(p),0)>salidas.reduce((s,x)=>s+x.monto,0)?OK:DN}/>
    </div>
  </div>;
}

function RiesgoView({prestamos,currentUser,onVerCliente}){
  const rutasCob=currentUser.rol==='cobrador'?(currentUser.rutas||[currentUser.ruta]):null;
  const [rf,setRf]=useState('');
  const lista=useMemo(()=>{
    let l=prestamos.filter(p=>!isTerminado(p));
    if(rutasCob)l=l.filter(p=>rutasCob.includes(p.ruta));
    if(rf)l=l.filter(p=>p.ruta===rf);
    return l;
  },[prestamos,currentUser,rf]);
  const alerta=useMemo(()=>lista.map(p=>({p,cc:cuotasSinPago(p)})).filter(x=>x.cc>=1).sort((a,b)=>b.cc-a.cc),[lista]);
  const conSaldo=lista.filter(tieneSaldoAtrasado).sort((a,b)=>saldoAtrasado(b)-saldoAtrasado(a));
  const rutasMostrar=rutasCob?['A','B','C'].filter(r=>rutasCob.includes(r)):['A','B','C'];
  return <div>
    <div style={{fontSize:20,fontWeight:700,marginBottom:14}}>Riesgo y moras</div>
    {/* Filtro por ruta */}
    {currentUser.rol==='admin'&&<div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
      <span style={{fontSize:12,color:MT,fontWeight:600}}>Filtrar por ruta:</span>
      {['','A','B','C'].map(r=><button key={r} onClick={()=>setRf(r)} style={{padding:'5px 14px',borderRadius:20,border:'1.5px solid '+(rf===r?G:BD),background:rf===r?GB:'transparent',color:rf===r?G:MT,fontWeight:rf===r?700:400,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>
        {r===''?'Todas':('Ruta '+r+' - '+RUTAS[r].cobrador)}
      </button>)}
    </div>}
    {/* KPIs rápidos */}
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10,marginBottom:14}}>
      <KPI label="Activos" value={String(lista.length)} sub="préstamos vigentes"/>
      <KPI label="En mora" value={String(lista.filter(p=>cuotasSinPago(p)>=1).length)} vc={WN} sub="al menos 1 cuota"/>
      <KPI label="Alerta roja" value={String(lista.filter(p=>cuotasSinPago(p)>=3).length)} vc={DN} sub="3+ cuotas sin pagar"/>
      <KPI label="Total atrasado" value={fmt(lista.reduce((s,p)=>s+saldoAtrasado(p),0))} vc={DN}/>
    </div>
    <Panel title="Resumen por ruta">
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:500}}>
        <thead><tr>{['Ruta','Activos','En mora','Alerta (3+)','Atrasado'].map((t,i)=><th key={i} style={{textAlign:'left',padding:'6px 8px',fontSize:11,color:MT,fontWeight:700,borderBottom:'2px solid '+BD}}>{t}</th>)}</tr></thead>
        <tbody>{rutasMostrar.map(r=>{const ps=lista.filter(p=>p.ruta===r);const mora=ps.filter(p=>cuotasSinPago(p)>=1);const alr=ps.filter(p=>cuotasSinPago(p)>=3);const at=ps.reduce((s,p)=>s+saldoAtrasado(p),0);return <tr key={r} onClick={()=>setRf(rf===r?'':r)} style={{borderBottom:'1px solid '+BD,background:alr.length?DNB+'44':undefined,cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background=alr.length?DNB+'66':S2} onMouseLeave={e=>e.currentTarget.style.background=alr.length?DNB+'44':'transparent'}><td style={{padding:'8px'}}><RTag r={r}/><CTag r={r}/></td><td style={{padding:'8px',fontWeight:600}}>{ps.length}</td><td style={{padding:'8px',fontWeight:600,color:mora.length?WN:FT}}>{mora.length}</td><td style={{padding:'8px',fontWeight:600,color:alr.length?DN:FT}}>{alr.length}</td><td style={{padding:'8px',fontWeight:600,color:at?DN:FT}}>{at?fmt(at):'-'}</td></tr>;})}
        </tbody>
      </table></div>
    </Panel>
    <Panel title={'Clientes en mora ('+alerta.length+')'+(rf?' - Ruta '+rf:'')}>
      {alerta.length===0?<Empty msg="Sin clientes en mora."/>:<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:500}}>
        <thead><tr>{['Cliente','Ruta','Cuotas sin pago','Atrasado','Ultimo abono'].map((t,i)=><th key={i} style={{textAlign:'left',padding:'5px 8px',fontSize:11,color:MT,fontWeight:700,borderBottom:'2px solid '+BD}}>{t}</th>)}</tr></thead>
        <tbody>{alerta.map(x=>{
          const abs=getAbonos(x.p).filter(a=>a&&a.monto>0&&a.fecha).sort((a,b)=>parseD(b.fecha)-parseD(a.fecha));
          const ult=abs[0];
          const nivel=x.cc>=3?DN:WN;
          return <tr key={x.p.id} style={{borderBottom:'1px solid '+BD,background:x.cc>=3?DNB+'44':WNB+'44',cursor:'pointer'}} onClick={()=>onVerCliente(x.p)} onMouseEnter={e=>e.currentTarget.style.background=x.cc>=3?DNB+'66':WNB+'66'} onMouseLeave={e=>e.currentTarget.style.background=x.cc>=3?DNB+'44':WNB+'44'}>
            <td style={{padding:'7px 9px',fontWeight:600,color:G}}>{x.p.nombre}</td>
            <td style={{padding:'7px 4px'}}><RTag r={x.p.ruta}/></td>
            <td style={{padding:'7px 9px'}}><span style={{fontWeight:700,color:nivel,fontSize:15}}>{x.cc}</span><span style={{fontSize:11,color:FT,marginLeft:4}}>cuota{x.cc!==1?'s':''}</span></td>
            <td style={{padding:'7px 9px',fontWeight:700,color:DN}}>{fmt(saldoAtrasado(x.p))}</td>
            <td style={{padding:'7px 9px',fontSize:12,color:MT}}>{ult?fmt(ult.monto)+' · '+fmtF(parseD(ult.fecha)):'Sin abonos'}</td>
          </tr>;
        })}</tbody>
      </table></div>}
    </Panel>
  </div>;
}

function FinanzasView({prestamos,salidas,onSaveSalida,onDeleteSalida,onVerCliente}){

  const [modalPrestamos,setModalPrestamos]=useState(null);
  const rr=useMemo(()=>{const sal=salidas.reduce((s,x)=>s+x.monto,0);const r={cap:0,capRec:0,intCob:0,capCalle:0,intPend:0,sal};prestamos.forEach(p=>{r.cap+=p.monto;r.capRec+=capitalRecuperado(p);r.intCob+=interesCobrado(p);if(!isTerminado(p)){r.capCalle+=Math.max(0,p.monto-capitalRecuperado(p));r.intPend+=Math.max(0,(p.monto*0.4)-interesCobrado(p));}});r.ganancia=r.intCob-r.sal;return r;},[prestamos,salidas]);


  const porRuta=useMemo(()=>{const o={};['A','B','C'].forEach(r=>{const ps=prestamos.filter(p=>p.ruta===r);o[r]={cap:ps.reduce((s,p)=>s+p.monto,0),capCalle:ps.filter(p=>!isTerminado(p)).reduce((s,p)=>s+Math.max(0,p.monto-capitalRecuperado(p)),0),intCob:ps.reduce((s,p)=>s+interesCobrado(p),0),saldo:ps.filter(p=>!isTerminado(p)).reduce((s,p)=>s+saldoTotal(p),0),activos:ps.filter(p=>!isTerminado(p)).length,prestamos:ps};});return o;},[prestamos]);

  return <div>
    {modalPrestamos&&<Overlay onClose={()=>setModalPrestamos(null)}>
      <div style={{padding:'14px 20px',background:GB,borderRadius:'14px 14px 0 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{fontSize:15,fontWeight:700,color:G}}>{modalPrestamos.titulo}</div>
        <button onClick={()=>setModalPrestamos(null)} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:MT}}>X</button>
      </div>
      <div style={{padding:'10px 18px'}}>
        {modalPrestamos.lista.map((p,i)=><div key={i} onClick={()=>{setModalPrestamos(null);onVerCliente(p);}} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 6px',borderBottom:'1px solid '+BD,cursor:'pointer',borderRadius:6}} onMouseEnter={e=>e.currentTarget.style.background=S2} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          <div><div style={{fontWeight:600,color:G}}>{p.nombre}</div><div style={{fontSize:11,color:MT}}><RTag r={p.ruta}/><CTag r={p.ruta}/> - {fmtF(parseD(p.fechaPrestamo))}</div></div>
          <div style={{textAlign:'right'}}><div style={{fontWeight:700,color:modalPrestamos.campo==='saldo'?G:modalPrestamos.campo==='at'?DN:OK}}>{fmt(modalPrestamos.campo==='saldo'?saldoTotal(p):modalPrestamos.campo==='at'?saldoAtrasado(p):interesCobrado(p))}</div><div style={{fontSize:11,color:FT}}>{modalPrestamos.sublabel}</div></div>
        </div>)}
      </div>
    </Overlay>}

    <div style={{fontSize:20,fontWeight:700,marginBottom:14}}>Finanzas</div>
    <Panel title="Rentabilidad">
      <div style={{background:GB,border:'1px solid '+G+'22',borderRadius:8,padding:14,marginBottom:14}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12}}>
          {[
            {l:'Interes cobrado (ganancia bruta)',v:rr.intCob,c:OK,campo:'int',sub:'ver por cliente'},
            {l:'- Salidas de caja',v:rr.sal,c:DN},
            {l:'= Ganancia neta',v:rr.ganancia,c:rr.ganancia>0?OK:DN,big:true},
            {l:'Capital en la calle',v:rr.capCalle,c:WN,campo:'capCalle',sub:'ver activos'},
            {l:'+ Interes por cobrar',v:rr.intPend,c:MT,campo:'saldo',sub:'ver activos'},
            {l:'= Total si todos pagan',v:rr.capCalle+rr.intPend,c:TX,big:true}
          ].map((row,i)=><div key={i} onClick={row.campo?()=>{
            const activos=prestamos.filter(p=>!isTerminado(p));
            setModalPrestamos({titulo:row.l,lista:[...activos].sort((a,b)=>(row.campo==='saldo'?saldoTotal(b)-saldoTotal(a):row.campo==='int'?interesCobrado(b)-interesCobrado(a):Math.max(0,b.monto-capitalRecuperado(b))-Math.max(0,a.monto-capitalRecuperado(a)))),campo:row.campo==='int'?'int':row.campo,sublabel:row.sub});
          }:undefined} style={{cursor:row.campo?'pointer':'default',padding:'10px 12px',borderRadius:8,background:row.campo?'rgba(255,255,255,.6)':undefined,transition:'box-shadow .15s'}} onMouseEnter={e=>{if(row.campo)e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,.1)';}} onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>
            <div style={{fontSize:12,color:MT}}>{row.l}{row.campo&&<span style={{color:G,fontSize:10,marginLeft:6}}>ver →</span>}</div>
            <div style={{fontSize:row.big?22:18,fontWeight:700,color:row.c}}>{fmt(row.v)}</div>
          </div>)}
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(128px,1fr))',gap:9}}>
        <KPI label="Capital colocado" value={fmt(rr.cap)} onClick={()=>setModalPrestamos({titulo:'Todos los prestamos - Capital',lista:[...prestamos].sort((a,b)=>b.monto-a.monto),campo:'saldo',sublabel:'por cobrar'})}/>
        <KPI label="Capital recuperado" value={fmt(rr.capRec)} vc={OK}/>
        <KPI label="Salidas de caja" value={fmt(rr.sal)} vc={DN}/>
      </div>
    </Panel>

    <Panel title="Rentabilidad por ruta">
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:560}}>
        <thead><tr>{['Ruta','Clientes activos','Capital colocado','Capital en calle','Interes cobrado','Por cobrar'].map((t,i)=><th key={i} style={{textAlign:'left',padding:'6px 9px',fontSize:11,color:MT,fontWeight:700,borderBottom:'2px solid '+BD}}>{t}</th>)}</tr></thead>
        <tbody>{['A','B','C'].map(r=>{const d=porRuta[r];return <tr key={r} style={{borderBottom:'1px solid '+BD,cursor:'pointer'}} onClick={()=>setModalPrestamos({titulo:'Ruta '+r+' - '+RUTAS[r].cobrador,lista:[...d.prestamos].filter(p=>!isTerminado(p)).sort((a,b)=>saldoTotal(b)-saldoTotal(a)),campo:'saldo',sublabel:'saldo'})} onMouseEnter={e=>e.currentTarget.style.background=RUTAS[r].bg} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          <td style={{padding:'9px'}}><RTag r={r}/><CTag r={r}/></td>
          <td style={{padding:'9px',fontWeight:600,color:RUTAS[r].c}}>{d.activos}</td>
          <td style={{padding:'9px',fontWeight:600}}>{fmt(d.cap)}</td>
          <td style={{padding:'9px',color:WN,fontWeight:600}}>{fmt(d.capCalle)}</td>
          <td style={{padding:'9px',color:OK,fontWeight:600}}>{fmt(d.intCob)}</td>
          <td style={{padding:'9px',color:G,fontWeight:700}}>{fmt(d.saldo)}</td>
        </tr>;})}
        <tr style={{borderTop:'2px solid '+BDS,background:S2}}>
          <td style={{padding:'9px',fontWeight:700}}>Total</td>
          <td style={{padding:'9px',fontWeight:700}}>{prestamos.filter(p=>!isTerminado(p)).length}</td>
          <td style={{padding:'9px',fontWeight:700}}>{fmt(rr.cap)}</td>
          <td style={{padding:'9px',fontWeight:700,color:WN}}>{fmt(rr.capCalle)}</td>
          <td style={{padding:'9px',fontWeight:700,color:OK}}>{fmt(rr.intCob)}</td>
          <td style={{padding:'9px',fontWeight:700,color:G}}>{fmt(prestamos.filter(p=>!isTerminado(p)).reduce((s,p)=>s+saldoTotal(p),0))}</td>
        </tr>
        </tbody>
      </table></div>
    </Panel>

    <Panel title="Salidas de caja" tr={<Btn sm onClick={()=>{}}>Ver todas las salidas →</Btn>}>
      <p style={{fontSize:12,color:MT,marginBottom:0}}>Las salidas se gestionan en la sección <b>Salidas de caja</b> del menú lateral.</p>
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

function SalidasView({salidas,onSaveSalida,onDeleteSalida,prestamos}){
  const [sf,setSf]=useState(todayDS());
  const [sc,setSc]=useState(CATS[0]);
  const [sm,setSm]=useState('');
  const [sq,setSq]=useState('');
  const [filtroMes,setFiltroMes]=useState('');
  const [filtroCat,setFiltroCat]=useState('');
  const [confirmDel,setConfirmDel]=useState(null);

  const guardar=()=>{
    if(!sm||parseFloat(sm)<=0)return;
    onSaveSalida({id:Date.now(),fecha:sf,cat:sc,monto:parseFloat(sm),quien:sq});
    setSm('');setSq('');
  };

  const meses=useMemo(()=>{
    const s=new Set(salidas.map(x=>x.fecha.slice(0,7)));
    return Array.from(s).sort((a,b)=>b.localeCompare(a));
  },[salidas]);

  const lista=useMemo(()=>{
    let l=salidas.slice().sort((a,b)=>parseD(b.fecha)-parseD(a.fecha));
    if(filtroMes)l=l.filter(x=>x.fecha.startsWith(filtroMes));
    if(filtroCat)l=l.filter(x=>x.cat===filtroCat);
    return l;
  },[salidas,filtroMes,filtroCat]);

  const totalFiltrado=lista.reduce((s,x)=>s+x.monto,0);
  const totalGeneral=salidas.reduce((s,x)=>s+x.monto,0);
  const interesCobradoTotal=prestamos.reduce((s,p)=>s+interesCobrado(p),0);

  // Totales por categoría
  const porCat=useMemo(()=>{
    const o={};CATS.forEach(c=>{o[c]=salidas.filter(x=>x.cat===c).reduce((s,x)=>s+x.monto,0);});
    return o;
  },[salidas]);

  // Totales por mes (últimos 6)
  const porMes=useMemo(()=>{
    const o={};
    salidas.forEach(x=>{const m=x.fecha.slice(0,7);o[m]=(o[m]||0)+x.monto;});
    return Object.entries(o).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,6);
  },[salidas]);

  const fmtMes=(ym)=>{const[y,m]=ym.split('-');return MESES_L[parseInt(m)-1]+' '+y;};

  return <div>
    <div style={{fontSize:20,fontWeight:700,marginBottom:14}}>Salidas de caja</div>

    {/* KPIs */}
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10,marginBottom:14}}>
      <KPI label="Total salidas" value={fmt(totalGeneral)} vc={DN} sub={salidas.length+' registros'}/>
      <KPI label="Interés cobrado" value={fmt(interesCobradoTotal)} vc={OK}/>
      <KPI label="Ganancia neta" value={fmt(interesCobradoTotal-totalGeneral)} vc={interesCobradoTotal-totalGeneral>0?OK:DN}/>
      {filtroMes&&<KPI label={'Salidas '+fmtMes(filtroMes)} value={fmt(totalFiltrado)} vc={DN} sub={lista.length+' registros'}/>}
    </div>

    {/* Resumen por categoría */}
    <Panel title="Por categoría">
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:9}}>
        {CATS.map(c=><div key={c} onClick={()=>setFiltroCat(filtroCat===c?'':c)} style={{padding:'10px 12px',borderRadius:8,border:'2px solid '+(filtroCat===c?DN:BD),background:filtroCat===c?DNB:S2,cursor:'pointer',transition:'all .15s'}}>
          <div style={{fontSize:11,color:MT,marginBottom:4}}>{c}</div>
          <div style={{fontSize:16,fontWeight:700,color:DN}}>{fmt(porCat[c]||0)}</div>
          <div style={{fontSize:11,color:FT}}>{salidas.filter(x=>x.cat===c).length} registros</div>
        </div>)}
      </div>
    </Panel>

    {/* Resumen por mes */}
    {porMes.length>0&&<Panel title="Últimos meses">
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:400}}>
        <thead><tr>{['Mes','Total salidas','Acciones'].map((t,i)=><th key={i} style={{textAlign:'left',padding:'6px 8px',fontSize:11,color:MT,fontWeight:700,borderBottom:'2px solid '+BD}}>{t}</th>)}</tr></thead>
        <tbody>{porMes.map(([ym,tot],i)=><tr key={ym} style={{borderBottom:'1px solid '+BD,background:filtroMes===ym?DNB:i%2===0?'transparent':S2}}>
          <td style={{padding:'8px',fontWeight:600}}>{fmtMes(ym)}</td>
          <td style={{padding:'8px',fontWeight:700,color:DN}}>{fmt(tot)}</td>
          <td style={{padding:'8px'}}><Btn sm onClick={()=>setFiltroMes(filtroMes===ym?'':ym)}>{filtroMes===ym?'Quitar filtro':'Ver detalle'}</Btn></td>
        </tr>)}
        </tbody>
      </table></div>
    </Panel>}

    {/* Registrar nueva salida */}
    <Panel title="Registrar salida">
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12,maxWidth:700}}>
        <Inp label="Fecha" type="date" value={sf} onChange={e=>setSf(e.target.value)}/>
        <Sel label="Categoría" value={sc} onChange={e=>setSc(e.target.value)}>{CATS.map(c=><option key={c} value={c}>{c}</option>)}</Sel>
        <Inp label="Monto ($)" type="number" value={sm} onChange={e=>setSm(e.target.value)} placeholder="150000"/>
        <Inp label="Concepto / quién" value={sq} onChange={e=>setSq(e.target.value)} placeholder="descripción"/>
      </div>
      <Btn v="primary" style={{marginTop:12}} onClick={guardar}>+ Registrar salida</Btn>
    </Panel>

    {/* Historial de salidas */}
    <Panel title={'Historial de salidas'+(filtroMes?' - '+fmtMes(filtroMes):'')+(filtroCat?' - '+filtroCat:'')+' ('+fmt(totalFiltrado)+')'} tr={
      <div style={{display:'flex',gap:6,alignItems:'center'}}>
        <Sel value={filtroMes} onChange={e=>setFiltroMes(e.target.value)} style={{maxWidth:160,fontSize:12}}>
          <option value="">Todos los meses</option>
          {meses.map(m=><option key={m} value={m}>{fmtMes(m)}</option>)}
        </Sel>
        <Sel value={filtroCat} onChange={e=>setFiltroCat(e.target.value)} style={{maxWidth:160,fontSize:12}}>
          <option value="">Todas las categorías</option>
          {CATS.map(c=><option key={c} value={c}>{c}</option>)}
        </Sel>
        {(filtroMes||filtroCat)&&<Btn sm onClick={()=>{setFiltroMes('');setFiltroCat('');}}>Limpiar</Btn>}
      </div>
    }>
      {lista.length===0?<Empty msg="Sin salidas registradas."/>:
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:500}}>
        <thead><tr>{['Fecha','Categoría','Concepto','Monto',''].map((t,i)=><th key={i} style={{textAlign:'left',padding:'6px 8px',fontSize:11,color:MT,fontWeight:700,borderBottom:'2px solid '+BD}}>{t}</th>)}</tr></thead>
        <tbody>{lista.map(x=>{
          const esConf=confirmDel===x.id;
          return <tr key={x.id} style={{borderBottom:'1px solid '+BD,background:esConf?DNB:'transparent'}} onMouseEnter={e=>{if(!esConf)e.currentTarget.style.background=S2;}} onMouseLeave={e=>{if(!esConf)e.currentTarget.style.background='transparent';}}>
            <td style={{padding:'8px',fontSize:12,color:MT,whiteSpace:'nowrap'}}>{fmtF(parseD(x.fecha))}</td>
            <td style={{padding:'8px'}}><span style={{fontSize:11,padding:'2px 8px',borderRadius:5,background:DNB,color:DN,fontWeight:600}}>{x.cat}</span></td>
            <td style={{padding:'8px',color:TX}}>{x.quien||'-'}</td>
            <td style={{padding:'8px',fontWeight:700,color:DN}}>{fmt(x.monto)}</td>
            <td style={{padding:'8px 5px'}}>
              {esConf
                ?<div style={{display:'flex',gap:4}}>
                  <Btn sm v="danger" onClick={()=>{onDeleteSalida(x.id);setConfirmDel(null);}}>Confirmar</Btn>
                  <Btn sm onClick={()=>setConfirmDel(null)}>Cancelar</Btn>
                </div>
                :<Btn sm v="danger" onClick={()=>setConfirmDel(x.id)}>Borrar</Btn>}
            </td>
          </tr>;
        })}
        <tr style={{borderTop:'2px solid '+BDS,background:S2}}>
          <td colSpan={3} style={{padding:'8px',fontWeight:700,fontSize:12}}>Total {filtroMes||filtroCat?'filtrado':'general'}</td>
          <td style={{padding:'8px',fontWeight:700,color:DN,fontSize:14}}>{fmt(totalFiltrado)}</td>
          <td/>
        </tr>
        </tbody>
      </table></div>}
    </Panel>
  </div>;
}

function SaldadosView({prestamos,onVerCliente,onCorregir}){
  const [rf,setRf]=useState('');
  const [nombre,setNombre]=useState('');

  const lista=useMemo(()=>{
    let l=prestamos.filter(isTerminado);
    if(rf)l=l.filter(p=>p.ruta===rf);
    if(nombre)l=l.filter(p=>p.nombre.toLowerCase().includes(nombre.toLowerCase()));
    return l.sort((a,b)=>totalAbonado(b)-totalAbonado(a));
  },[prestamos,rf,nombre]);

  return <div>
    <div style={{fontSize:20,fontWeight:700,marginBottom:6}}>Clientes que saldaron</div>
    <div style={{fontSize:13,color:MT,marginBottom:14}}>Clientes que terminaron de pagar su préstamo. Usa <b style={{color:G}}>Corregir</b> en la fila del cliente para editar el abono y devolverlo a activos si es necesario.</div>

    {/* Filtros */}
    <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
      <Sel value={rf} onChange={e=>setRf(e.target.value)} style={{maxWidth:180}}>
        <option value="">Todas las rutas</option>
        {['A','B','C'].map(r=><option key={r} value={r}>Ruta {r} - {RUTAS[r].cobrador}</option>)}
      </Sel>
      <Inp placeholder="Buscar cliente..." value={nombre} onChange={e=>setNombre(e.target.value)} style={{maxWidth:200}}/>
      <span style={{fontSize:12,color:FT}}>{lista.length} cliente{lista.length!==1?'s':''}</span>
    </div>

    {/* KPIs */}
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10,marginBottom:14}}>
      <KPI label="Total saldados" value={String(lista.length)} vc={OK}/>
      <KPI label="Capital recuperado" value={fmt(lista.reduce((s,p)=>s+p.monto,0))} vc={OK}/>
      <KPI label="Total recibido" value={fmt(lista.reduce((s,p)=>s+totalAbonado(p),0))} vc={OK}/>
      <KPI label="Interés cobrado" value={fmt(lista.reduce((s,p)=>s+interesCobrado(p),0))} vc={WN}/>
    </div>

    {lista.length===0?<Empty msg="Sin clientes saldados con los filtros actuales."/>:
    <div style={{background:SF,border:'1px solid '+BD,borderRadius:10,overflowX:'auto'}}>
      {/* Aviso */}
      <div style={{padding:'10px 14px',background:'#EEF6FF',borderBottom:'1px solid #C8DFF7',fontSize:12,color:'#1A4A8C'}}>
        ¿Te equivocaste en un monto? Usa <b style={{color:G}}>Corregir</b> en la fila del cliente para editar el abono y devolverlo a activos si es necesario.
      </div>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:860}}>
        <thead>
          <tr style={{background:S2}}>
            {['CLIENTE','RUTA','COBRADOR','FECHA PRÉSTAMO','ÚLTIMO ABONO','CAPITAL','TOTAL RECIBIDO','CUOTAS',''].map((t,i)=>
              <th key={i} style={{textAlign:'left',padding:'9px 12px',fontSize:11,color:MT,fontWeight:700,borderBottom:'2px solid '+BD,whiteSpace:'nowrap'}}>{t}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {lista.map(p=>{
            const abs=getAbonos(p).filter(a=>a&&a.monto>0&&a.fecha).sort((a,b)=>parseD(b.fecha)-parseD(a.fecha));
            const ultAbono=abs[0];
            const nCuotas=cuotasPagadasCompletas(p);
            return <tr key={p.id} style={{borderBottom:'1px solid '+BD,cursor:'pointer',transition:'background .1s'}}
              onMouseEnter={e=>e.currentTarget.style.background=S2}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <td style={{padding:'12px'}} onClick={()=>onVerCliente(p)}>
                <div style={{fontWeight:600,color:G}}>{p.nombre}</div>
              </td>
              <td style={{padding:'12px 8px'}} onClick={()=>onVerCliente(p)}>
                <span style={{display:'inline-block',padding:'2px 8px',borderRadius:5,background:RUTAS[p.ruta].bg,color:RUTAS[p.ruta].c,fontSize:11,fontWeight:700}}>{p.ruta}</span>
              </td>
              <td style={{padding:'12px 8px'}} onClick={()=>onVerCliente(p)}>
                <span style={{fontSize:12,color:RUTAS[p.ruta].c,fontWeight:600}}>{RUTAS[p.ruta].cobrador}</span>
              </td>
              <td style={{padding:'12px',fontSize:12,color:MT,whiteSpace:'nowrap'}} onClick={()=>onVerCliente(p)}>
                {fmtFL(parseD(p.fechaPrestamo))}
              </td>
              <td style={{padding:'12px',fontSize:12,whiteSpace:'nowrap'}} onClick={()=>onVerCliente(p)}>
                {ultAbono
                  ?<span style={{color:WN,fontWeight:600}}>{fmtFL(parseD(ultAbono.fecha))}</span>
                  :'-'}
              </td>
              <td style={{padding:'12px',fontWeight:600}} onClick={()=>onVerCliente(p)}>
                {fmt(p.monto)}
              </td>
              <td style={{padding:'12px',fontWeight:700,color:OK}} onClick={()=>onVerCliente(p)}>
                {fmt(totalAbonado(p))}
              </td>
              <td style={{padding:'12px',fontWeight:600,textAlign:'center'}} onClick={()=>onVerCliente(p)}>
                {nCuotas}
              </td>
              <td style={{padding:'12px 8px'}} onClick={e=>e.stopPropagation()}>
                <Btn sm onClick={()=>onCorregir(p)} style={{display:'flex',alignItems:'center',gap:4,whiteSpace:'nowrap'}}>
                  ✎ Corregir
                </Btn>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>}
  </div>;
}

function RespaldoView({prestamos,salidas,onRestaurar,ultimaSync}){
  const fileRef=useRef(null);
  const [historial,setHistorial]=useState(()=>{try{return JSON.parse(localStorage.getItem('mc_backups')||'[]');}catch{return[];}});
  const [importando,setImportando]=useState(false);

  const exportar=(auto=false)=>{
    const data={app:'Mi Cartera',version:8,exportado:new Date().toISOString(),prestamos,salidas};
    const b=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const u=URL.createObjectURL(b);
    const a=document.createElement('a');a.href=u;
    a.download='cartera-'+todayDS()+'.json';
    document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);
    // guardar en historial local
    const nuevo={fecha:new Date().toISOString(),prestamos:prestamos.length,salidas:salidas.length,auto};
    const h=[nuevo,...historial].slice(0,10);
    setHistorial(h);
    localStorage.setItem('mc_backups',JSON.stringify(h));
  };

  const importar=e=>{
    const f=e.target.files?.[0];if(!f)return;
    const r=new FileReader();
    r.onload=ev=>{
      try{
        const d=JSON.parse(String(ev.target?.result));
        if(!d.prestamos||!Array.isArray(d.prestamos))return alert('Archivo invalido');
        setImportando(true);
        if(!window.confirm('¿Cargar '+d.prestamos.length+' prestamos y '+( d.salidas?.length||0)+' salidas? Esto reemplaza todos los datos actuales.'))return setImportando(false);
        onRestaurar(d);
        setImportando(false);
      }catch{alert('No se pudo leer el archivo.');setImportando(false);}
    };
    r.readAsText(f);e.target.value='';
  };

  const fmtFecha=(iso)=>{const d=new Date(iso);return d.getDate()+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear()+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};

  return <div>
    <div style={{fontSize:20,fontWeight:700,marginBottom:14}}>Respaldo de datos</div>

    {/* Estado de sincronización */}
    <div style={{background:GB,border:'1px solid '+G+'33',borderRadius:10,padding:'14px 18px',marginBottom:14,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
      <div style={{width:10,height:10,borderRadius:'50%',background:OK,boxShadow:'0 0 0 3px '+OKB,flexShrink:0}}/>
      <div>
        <div style={{fontSize:13,fontWeight:700,color:G}}>Firebase sincronizado en tiempo real</div>
        <div style={{fontSize:11,color:MT,marginTop:2}}>Los datos se sincronizan automáticamente entre todos los dispositivos. Última actualización: {ultimaSync?fmtFecha(ultimaSync):'activo'}</div>
      </div>
    </div>

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(128px,1fr))',gap:9,marginBottom:14}}>
      <KPI label="Prestamos" value={String(prestamos.length)} sub={prestamos.filter(p=>!isTerminado(p)).length+' activos'}/>
      <KPI label="Terminados" value={String(prestamos.filter(isTerminado).length)} vc={OK}/>
      <KPI label="Total abonado" value={fmt(prestamos.reduce((s,p)=>s+totalAbonado(p),0))} vc={OK}/>
      <KPI label="Por cobrar" value={fmt(prestamos.filter(p=>!isTerminado(p)).reduce((s,p)=>s+saldoTotal(p),0))} vc={DN}/>
      <KPI label="Salidas" value={String(salidas.length)} sub={fmt(salidas.reduce((s,x)=>s+x.monto,0))+' total'}/>
    </div>

    <Panel title="Descargar respaldo manual">
      <p style={{fontSize:13,color:MT,marginBottom:12,lineHeight:1.6}}>Descarga un archivo JSON con todos tus datos actuales (prestamos + salidas). Guárdalo en un lugar seguro.</p>
      <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
        <Btn v="primary" onClick={()=>exportar(false)}>⬇ Descargar respaldo ahora</Btn>
      </div>
    </Panel>

    <Panel title="Historial de respaldos descargados">
      {historial.length===0?<div style={{fontSize:13,color:FT,padding:'8px 0'}}>No hay respaldos descargados aún. Descarga uno para empezar el historial.</div>:
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
        <thead><tr>{['Fecha descarga','Prestamos','Salidas','Tipo'].map((t,i)=><th key={i} style={{textAlign:'left',padding:'6px 8px',fontSize:11,color:MT,fontWeight:700,borderBottom:'2px solid '+BD}}>{t}</th>)}</tr></thead>
        <tbody>{historial.map((h,i)=><tr key={i} style={{borderBottom:'1px solid '+BD,background:i===0?GB:'transparent'}}>
          <td style={{padding:'7px 8px',fontWeight:i===0?700:400,color:i===0?G:TX}}>{fmtFecha(h.fecha)}{i===0&&<span style={{fontSize:10,color:OK,marginLeft:6,fontWeight:700}}>más reciente</span>}</td>
          <td style={{padding:'7px 8px'}}>{h.prestamos} prestamos</td>
          <td style={{padding:'7px 8px'}}>{h.salidas} salidas</td>
          <td style={{padding:'7px 8px'}}><span style={{fontSize:11,padding:'2px 7px',borderRadius:5,background:h.auto?WNB:GB,color:h.auto?WN:G,fontWeight:600}}>{h.auto?'Auto':'Manual'}</span></td>
        </tr>)}
        </tbody>
      </table></div>}
    </Panel>

    <Panel title="Restaurar desde archivo">
      <p style={{fontSize:13,color:MT,marginBottom:12,lineHeight:1.6}}>Carga un JSON descargado antes. <b style={{color:DN}}>Advertencia: reemplaza todos los datos actuales.</b></p>
      <Btn v={importando?'':'danger'} onClick={()=>fileRef.current?.click()} style={{opacity:importando?.6:1}}>{importando?'Cargando...':'⬆ Cargar archivo de respaldo'}</Btn>
      <input ref={fileRef} type="file" accept=".json" onChange={importar} style={{display:'none'}}/>
    </Panel>
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
  const [ultimaSync,setUltimaSync]=useState(null);

  const notify=useCallback((msg,err=false)=>{const id=Date.now()+Math.random();setToasts(t=>[...t,{id,msg,err}].slice(-3));setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3200);},[]);

  useEffect(()=>{
    const presRef=ref(db,'prestamos');
    const salRef=ref(db,'salidas');
    let first=true;
    const unsubP=onValue(presRef,snap=>{
      const val=snap.val();
      const arr=val&&Array.isArray(val)?val:val?Object.values(val):[];
      if(first&&arr.length===0){set(presRef,SEED_DATA.prestamos);set(salRef,SEED_DATA.salidas);first=false;}
      else{setPrestamos(arr);setLoading(false);setSyncOk(true);setUltimaSync(new Date().toISOString());first=false;}
    },()=>setSyncOk(false));
    const unsubS=onValue(salRef,snap=>{
      const val=snap.val();
      setSalidas(val&&Array.isArray(val)?val:val?Object.values(val):[]);
      setUltimaSync(new Date().toISOString());
    });
    // Forzar re-lectura de Firebase cada 5 segundos (por si acaso onValue no dispara)
    const interval=setInterval(()=>{
      import('firebase/database').then(({get})=>{
        get(ref(db,'prestamos')).then(snap=>{
          const val=snap.val();
          if(val){const arr=Array.isArray(val)?val:Object.values(val);setPrestamos(arr);setSyncOk(true);setUltimaSync(new Date().toISOString());}
        }).catch(()=>setSyncOk(false));
      }).catch(()=>{});
    },5000);
    return()=>{unsubP();unsubS();clearInterval(interval);};
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
    {k:'cartera',l:'Cartera activa',i:'A'},
    {k:'riesgo',l:'Riesgo y moras',i:'R',b:totalCS},
    {k:'saldados',l:'Clientes saldados',i:'✓',b:prestamos.filter(isTerminado).length},
    ...(currentUser.rol==='admin'?[
      {k:'finanzas',l:'Finanzas',i:'$'},
      {k:'salidas',l:'Salidas de caja',i:'↓'},
      {k:'respaldo',l:'Respaldo',i:'B',bot:true}
    ]:[]),
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
      {!syncOk&&<div style={{padding:'8px 13px',fontSize:11,color:DN,background:DNB,fontWeight:600}}>⚠ Sin conexion</div>}
      {syncOk&&ultimaSync&&<div style={{padding:'6px 13px',fontSize:10,color:OK,borderTop:'1px solid '+BD,display:'flex',alignItems:'center',gap:5}}><span style={{width:6,height:6,borderRadius:'50%',background:OK,display:'inline-block'}}/>{new Date(ultimaSync).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</div>}
    </nav>
    <main style={{flex:1,overflowY:'auto',padding:'18px 24px 60px'}}>
      {view==='dashboard'&&<Dashboard prestamos={prestamos} salidas={salidas} flujoOff={flujoOff} setFlujoOff={setFlujoOff} onVerCliente={setClienteModal}/>}
      {view==='nuevo'&&currentUser.rol==='admin'&&<NuevoView editando={editando} onGuardar={handleGuardar} onCancelar={()=>{setEditando(null);setView('consolidado');}}/>}
      {view==='semana'&&<CobrosView prestamos={prestamos} onSave={handleSave} semOff={semOff} setSemOff={setSemOff} currentUser={currentUser} onVerCliente={setClienteModal}/>}
      {view==='consolidado'&&<ConsolidadoView prestamos={prestamos} onEdit={p=>{setEditando(p);setView('nuevo');}} onDelete={handleDelete} currentUser={currentUser} onVerCliente={setClienteModal}/>}
      {view==='cartera'&&<CarteraActivaView prestamos={prestamos} salidas={salidas} onVerCliente={setClienteModal}/>}
      {view==='riesgo'&&<RiesgoView prestamos={prestamos} currentUser={currentUser} onVerCliente={setClienteModal}/>}
      {view==='saldados'&&<SaldadosView prestamos={prestamos} onVerCliente={setClienteModal} onCorregir={p=>{setEditando(p);setView('nuevo');}}/>}
      {view==='finanzas'&&currentUser.rol==='admin'&&<FinanzasView prestamos={prestamos} salidas={salidas} onSaveSalida={handleSaveSalida} onDeleteSalida={handleDeleteSalida} onVerCliente={setClienteModal}/>}
      {view==='salidas'&&currentUser.rol==='admin'&&<SalidasView salidas={salidas} onSaveSalida={handleSaveSalida} onDeleteSalida={handleDeleteSalida} prestamos={prestamos}/>}
      {view==='respaldo'&&currentUser.rol==='admin'&&<RespaldoView prestamos={prestamos} salidas={salidas} onRestaurar={handleRestaurar} ultimaSync={ultimaSync}/>}
    </main>
    <Toast toasts={toasts} onDismiss={id=>setToasts(t=>t.filter(x=>x.id!==id))}/>
  </div>;
}
