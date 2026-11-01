'use client';

import { useState } from 'react';

type Result = { ok?:boolean; duplicate?:boolean; orderId?:string; summary?:string; status?:string; error?:string; missing?:string[] };

export default function WaOrderIntake({apiKey,onCreated}:{apiKey:string;onCreated:()=>Promise<void>}) {
  const [text,setText] = useState('');
  const [phone,setPhone] = useState('');
  const [busy,setBusy] = useState(false);
  const [result,setResult] = useState<Result|null>(null);

  async function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch('/api/wa-intake', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text,phone,apiKey:apiKey||undefined}),
      });
      const data = await response.json() as Result;
      setResult(data);
      if (response.ok && data.ok) {
        if (!data.duplicate) { setText(''); setPhone(''); }
        await onCreated();
      }
    } catch {
      setResult({error:'Koneksi terputus. Periksa daftar pesanan sebelum mencoba lagi.'});
    } finally {
      setBusy(false);
    }
  }

  return <section className="card wa-intake">
    <h3>Tempel order WhatsApp</h3>
    <p className="muted">Tempel satu percakapan pesanan. AI merangkum, membuat pelanggan dan pesanan, lalu memasukkannya ke antrean harga pemilik.</p>
    <form onSubmit={submit}>
      <textarea value={text} onChange={event=>setText(event.target.value)} minLength={15} maxLength={8000} required placeholder="Contoh: Pak Budi minta isi ulang 3 tabung APAR powder 3 kg. Nomor WA 0812..., alamat..., tabung dijemput driver besok." aria-label="Salinan chat WhatsApp"/>
      <input type="tel" value={phone} onChange={event=>setPhone(event.target.value)} placeholder="Nomor WA pelanggan jika tidak ada di chat" aria-label="Nomor WhatsApp pelanggan tambahan"/>
      <button className="primary" disabled={busy || text.trim().length<15}>{busy?'AI sedang membaca chat...':'Analisis & buat pesanan'}</button>
    </form>
    {result&&<div className={`wa-intake-result ${result.error?'error':''}`} role={result.error?'alert':'status'}>
      <b>{result.error|| (result.duplicate?'Chat ini sudah pernah diinput.':'Pesanan otomatis dibuat.')}</b>
      {result.summary&&<p>{result.summary}</p>}
      {result.orderId&&<small>ID pesanan {result.orderId.slice(0,8).toUpperCase()} · {result.status||'Menunggu APAR'}</small>}
      {!!result.missing?.length&&<small>Tambahkan di chat: {result.missing.join(', ')}.</small>}
    </div>}
    <small className="wa-intake-note">Salinan chat disimpan sebagai jejak sumber pesanan. Harga tetap perlu disetujui pemilik.</small>
  </section>;
}
