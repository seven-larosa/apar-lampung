'use client';

import { useState } from 'react';
import { Wrench } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

type Row = Record<string, string | number>;
type Action = (action:string,payload:Record<string,unknown>)=>Promise<void>;

function Menu({value,onChange,placeholder,items}:{value:string;onChange:(value:string)=>void;placeholder:string;items:{value:string;label:string}[]}) {
  return <Select value={value||undefined} onValueChange={onChange}>
    <SelectTrigger className="theme-select" aria-label={placeholder}><SelectValue placeholder={placeholder}/></SelectTrigger>
    <SelectContent position="popper" className="theme-select-menu">
      {items.length?items.map(item=><SelectItem className="theme-select-item" key={item.value} value={item.value}>{item.label}</SelectItem>):<p className="theme-select-empty">Belum ada pilihan.</p>}
    </SelectContent>
  </Select>;
}

function SpareRequest({request,role,canManageStock,busy,act}:{request:Row;role:string;canManageStock:boolean;busy:boolean;act:Action}) {
  const [price,setPrice]=useState('');
  return <div className="workshop-request"><div><b>{request.stock_name} · {request.quantity} unit</b><small>{request.note}</small><small>{request.status}{role!=='technician'&&Number(request.unit_price)>0?` · Rp${(Number(request.quantity)*Number(request.unit_price)).toLocaleString('id-ID')}`:''}</small></div>
    {role==='owner'&&request.status==='Menunggu pemilik'&&<div className="workshop-request-actions"><input type="number" min="0" step="1" value={price} onChange={event=>setPrice(event.target.value)} placeholder="Harga per unit" aria-label="Harga spare part per unit"/><button disabled={busy||price===''||!Number.isSafeInteger(Number(price))||Number(price)<0} onClick={()=>void act('sparePartDecision',{requestId:request.id,decision:'Setujui',unitPrice:Number(price)})}>Setujui harga</button><button disabled={busy} onClick={()=>void act('sparePartDecision',{requestId:request.id,decision:'Tolak'})}>Tolak</button></div>}
    {role!=='technician'&&request.status==='Disetujui pemilik'&&<button disabled={busy||!canManageStock} title={!canManageStock?'Perlu akses Persediaan':undefined} onClick={()=>void act('sparePartInstall',{requestId:request.id})}>Konfirmasi pemasangan & keluarkan stok</button>}
  </div>;
}

function WorkshopOrder({order,customer,assignment,requests,spareParts,role,canManageStock,busy,act}:{order:Row;customer:string;assignment?:Row;requests:Row[];spareParts:Row[];role:string;canManageStock:boolean;busy:boolean;act:Action}) {
  const [selectedPart,setSelectedPart] = useState('');
  const [quantity,setQuantity] = useState('1');
  const [note,setNote] = useState('');
  const pending = requests.some(request=>['Menunggu pemilik','Disetujui pemilik'].includes(String(request.status)));
  const technician = role==='technician';
  return <article className="workshop-order">
    <div className="workshop-order-head"><div className="rowicon"><Wrench size={17}/></div><div><b>{customer}</b><small>{order.description} · {order.quantity} unit</small><small>Order {String(order.id).slice(0,8).toUpperCase()}{assignment?` · Teknisi ${assignment.assignee}`:''}</small></div><span className="badge">{order.status}</span></div>
    {technician&&order.status==='APAR masuk'&&!assignment&&<div className="workshop-action"><button className="primary" disabled={busy} onClick={()=>void act('workshopAccept',{orderId:order.id})}>Terima order & mulai proses</button></div>}
    {technician&&order.status==='Sedang diproses'&&<div className="workshop-spares"><h4>Request pergantian spare part</h4><p>Catat komponen yang perlu diganti dan jumlahnya. Pemilik menetapkan harga, admin mengonfirmasi pemasangan.</p>{spareParts.length?<><Menu value={selectedPart} onChange={setSelectedPart} placeholder="Pilih spare part" items={spareParts.map(part=>({value:String(part.id),label:String(part.name)}))}/><div className="workshop-action"><input type="number" min="1" step="1" value={quantity} onChange={event=>setQuantity(event.target.value)} aria-label="Jumlah spare part"/><input value={note} onChange={event=>setNote(event.target.value)} maxLength={500} placeholder="Alasan penggantian" aria-label="Alasan penggantian"/></div><button disabled={busy||!selectedPart||!note.trim()||!Number.isSafeInteger(Number(quantity))||Number(quantity)<1} onClick={()=>void act('sparePartRequest',{orderId:order.id,stockId:selectedPart,quantity:Number(quantity),note})}>Request pergantian spare part</button></>:<p>Spare part belum terdaftar. Minta admin menambahkannya di Persediaan.</p>}</div>}
    {requests.length>0&&<div className="workshop-requests"><h4>Permintaan spare part</h4>{requests.map(request=><SpareRequest key={String(request.id)} request={request} role={role} canManageStock={canManageStock} busy={busy} act={act}/>)}</div>}
    {technician&&order.status==='Sedang diproses'&&<div className="workshop-done"><button className="primary" disabled={busy||pending} onClick={()=>void act('workshopDone',{orderId:order.id})}>Proses selesai</button>{pending&&<small>Selesaikan persetujuan dan pemasangan spare part terlebih dahulu.</small>}</div>}
    {order.status==='Proses selesai'&&<p className="workshop-ready">Proses selesai. Invoice dan pembayaran tersedia untuk admin; APAR siap dikembalikan.</p>}
  </article>;
}

export default function WorkshopPanel({data,act,busy}:{data:{role:string;permissions:string[];orders:Row[];customers:Row[];workshopAssignments?:Row[];sparePartRequests?:Row[];spareParts?:Row[]};act:Action;busy:boolean}) {
  const orders=(data.orders||[]).filter(order=>order.kind==='Refill' && (data.role!=='technician'||order.status==='APAR masuk'||data.workshopAssignments?.some(item=>item.order_id===order.id)));
  return <div className="grid"><section className="card span2"><div className="sectionhead"><h2>Pekerjaan workshop</h2></div>{orders.length?orders.map(order=><WorkshopOrder key={String(order.id)} order={order} customer={String(data.customers?.find(customer=>customer.id===order.customer_id)?.name||'Pelanggan')} assignment={data.workshopAssignments?.find(item=>item.order_id===order.id)} requests={(data.sparePartRequests||[]).filter(item=>item.order_id===order.id)} spareParts={data.spareParts||[]} role={data.role} canManageStock={data.permissions.includes('Persediaan')} busy={busy} act={act}/>):<div className="empty">Belum ada APAR masuk untuk dikerjakan.</div>}</section><section className="card"><div className="sectionhead"><h2>Alur kerja</h2></div><div className="steps">APAR masuk → Terima order → Sedang diproses → Proses selesai → Pembayaran / pengembalian</div><p className="muted">Jika ada spare part, teknisi mengajukan jumlah, pemilik menyetujui harga, lalu admin mengonfirmasi pemasangan dan stok keluar.</p></section></div>;
}
