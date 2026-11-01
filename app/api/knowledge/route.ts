import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { extractText } from 'unpdf';
import mammoth from 'mammoth';

async function owner() {
  const user = await getChatGPTUser();
  const db=env.DB;if (!user || !db) return null;
  const row = await db.prepare('SELECT role FROM members WHERE user_id=?').bind(user.userId).first<{role:string}>();
  return row?.role === 'owner' ? user : null;
}
const error = (message:string,status:number) => Response.json({error:message},{status});

export async function GET(){
  if (!await owner()) return error('Akses pemilik diperlukan.',403);
  const db=env.DB;if(!db)return error('Database tidak tersedia.',503);
  const rows = await db.prepare('SELECT id,title,file_name,mime_type,status,created_at FROM knowledge ORDER BY created_at DESC LIMIT 100').all();
  return Response.json({items:rows.results});
}

export async function POST(request:Request){
  const user=await owner();if(!user)return error('Akses pemilik diperlukan.',403);
  const db=env.DB;if(!db)return error('Database tidak tersedia.',503);
  const bucket=env.BUCKET;if(!bucket)return error('Penyimpanan berkas belum tersedia.',503);
  const form=await request.formData();const file=form.get('file');const title=String(form.get('title')??'').trim();
  if(!(file instanceof File)||!title||title.length>150)return error('Judul dan berkas wajib diisi.',400);
  if(file.size===0||file.size>5_000_000)return error('Ukuran berkas harus 1 byte sampai 5 MB.',400);
  const ext=file.name.toLowerCase().split('.').pop();
  if(!ext||!['pdf','docx','md','txt'].includes(ext))return error('Gunakan PDF, DOCX, Markdown, atau TXT.',400);
  const bytes=new Uint8Array(await file.arrayBuffer());let extracted='';
  try{
    if(ext==='pdf')extracted=String((await extractText(bytes,{mergePages:true})).text);
    else if(ext==='docx')extracted=(await mammoth.extractRawText({buffer:Buffer.from(bytes)})).value;
    else extracted=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  }catch{return error('Teks berkas tidak dapat dibaca. Untuk PDF pindai, gunakan PDF dengan teks yang dapat dipilih.',400)}
  extracted=extracted.replace(/\u0000/g,'').trim();
  if(!extracted)return error('Berkas tidak memiliki teks yang bisa dibaca.',400);
  if(extracted.length>250_000)return error('Isi dokumen terlalu panjang. Bagi menjadi beberapa dokumen.',400);
  const id=crypto.randomUUID(),key=`knowledge/${id}/${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  await bucket.put(key,bytes,{httpMetadata:{contentType:ext==='pdf'?'application/pdf':ext==='docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'text/plain'}});
  try{
    await db.prepare('INSERT INTO knowledge (id,title,file_name,mime_type,r2_key,extracted_text,status,uploaded_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(id,title,file.name,file.type||ext,key,extracted,'Aktif',user.userId,new Date().toISOString()).run();
  }catch{await bucket.delete(key);return error('Penyimpanan pengetahuan gagal.',500)}
  return Response.json({ok:true,id});
}

export async function PATCH(request:Request){
  if(!await owner())return error('Akses pemilik diperlukan.',403);
  const db=env.DB;if(!db)return error('Database tidak tersedia.',503);
  const body=await request.json() as {id?:string;status?:string};
  if(!body.id||!['Aktif','Nonaktif'].includes(body.status||''))return error('Permintaan tidak valid.',400);
  const result=await db.prepare('UPDATE knowledge SET status=? WHERE id=?').bind(body.status,body.id).run();
  if(!result.meta.changes)return error('Dokumen tidak ditemukan.',404);
  return Response.json({ok:true});
}
