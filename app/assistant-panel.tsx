'use client';
import { useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';

type Message = { by:'user'|'assistant'; text:string };
export default function AssistantPanel({apiKey}:{apiKey:string}){
 const [open,setOpen]=useState(false),[question,setQuestion]=useState(''),[messages,setMessages]=useState<Message[]>([]),[busy,setBusy]=useState(false);
 async function ask(event:React.FormEvent){
  event.preventDefault();const prompt=question.trim();if(!prompt||busy)return;
  setMessages(previous=>[...previous,{by:'user',text:prompt}]);setQuestion('');setBusy(true);
  try{const response=await fetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:prompt,...(apiKey?{apiKey}:{})})});const body=await response.json() as {answer?:string;error?:string};setMessages(previous=>[...previous,{by:'assistant',text:body.answer||body.error||'Asisten belum bisa menjawab.'}]);}
  catch{setMessages(previous=>[...previous,{by:'assistant',text:'Koneksi terputus. Coba lagi nanti.'}]);}
  finally{setBusy(false)}
 }
 return <div className="assistant-root">{open&&<section className="assistant-panel" aria-label="Asisten AI Apar Lampung"><header><div><b>Asisten Apar Lampung</b><small>Baca data sesuai akses akunmu</small></div><button aria-label="Tutup asisten" onClick={()=>setOpen(false)}><X size={18}/></button></header><div className="assistant-messages" aria-live="polite">{messages.length?messages.map((m,i)=><p className={m.by} key={i}>{m.text}</p>):<div className="assistant-welcome"><MessageCircle size={25}/><b>Apa yang ingin kamu cek?</b><span>Contoh: “Pesanan mana yang tertahan?” atau “Berapa pembayaran tercatat?”</span></div>}{busy&&<p className="assistant-thinking">Membaca data aplikasi...</p>}</div><form onSubmit={ask}><input aria-label="Pertanyaan untuk asisten" value={question} maxLength={800} onChange={e=>setQuestion(e.target.value)} placeholder="Tanya data bisnis..."/><button disabled={busy||!question.trim()} aria-label="Kirim pertanyaan"><Send size={18}/></button></form></section>}<button className="assistant-launcher" aria-label={open?'Tutup asisten AI':'Buka asisten AI'} onClick={()=>setOpen(!open)}>{open?<X size={22}/>:<MessageCircle size={22}/>}<span>Asisten AI</span></button></div>
}
