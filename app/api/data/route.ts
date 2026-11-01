import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';

const json = (value: unknown, status = 200) => Response.json(value, { status });
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const allowedRoles = ['owner', 'admin', 'technician'];

async function context() {
  const user = await getChatGPTUser();
  if (!user) return null;
  const db = env.DB;
  if (!db) throw new Error('Database belum tersedia');
  let member = await db.prepare('SELECT role FROM members WHERE user_id = ?').bind(user.userId).first<{ role: string }>();
  if (['indokalampung@gmail.com','agenlampung77@gmail.com','sevenhexclick1@gmail.com'].includes(user.email.toLowerCase()) && member?.role !== 'owner') {
    await db.prepare("INSERT INTO members (user_id,email,role,created_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email, role='owner'")
      .bind(user.userId,user.email,'owner',now()).run();
    member = await db.prepare('SELECT role FROM members WHERE user_id = ?').bind(user.userId).first<{ role: string }>();
  }
  if (user.email.toLowerCase() === 'spite0tram@icloud.com' && member?.role !== 'technician') {
    await db.prepare("INSERT INTO members (user_id,email,role,created_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email, role='technician'")
      .bind(user.userId,user.email,'technician',now()).run();
    member = await db.prepare('SELECT role FROM members WHERE user_id = ?').bind(user.userId).first<{ role: string }>();
  }
  if (!member) {
    const count = await db.prepare('SELECT COUNT(*) AS count FROM members').first<{ count: number }>();
    if (count?.count === 0) {
      await db.prepare("INSERT INTO members (user_id,email,role,created_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email, role='owner'")
        .bind(user.userId,user.email,'owner',now()).run();
      member = await db.prepare('SELECT role FROM members WHERE user_id = ?').bind(user.userId).first<{ role: string }>();
    }
  }
  return { user, db, role: member?.role ?? null };
}

export async function GET() {
  const ctx = await context();
  if (!ctx) return json({ error: 'Masuk terlebih dahulu' }, 401);
  if (!ctx.role) return json({ error: 'Akun belum diberi akses oleh pemilik' }, 403);
  const tables = ['customers','orders','stock','documents','payments','reminders','tasks','metrics','okrs','members'] as const;
  const data: Record<string, unknown> = { role: ctx.role, email: ctx.user.email };
  for (const table of tables) {
    if (ctx.role === 'technician' && ['payments','metrics','okrs','members'].includes(table)) continue;
    const rows = await ctx.db.prepare(`SELECT * FROM ${table} ORDER BY rowid DESC LIMIT 200`).all();
    data[table] = rows.results;
  }
  if (ctx.role === 'technician') {
    const assigned = (data.tasks as Record<string, unknown>[]).filter(t => t.assignee === ctx.user.email);
    const orderIds = new Set(assigned.map(t => t.order_id));
    data.tasks = assigned;
    data.orders = (data.orders as Record<string, unknown>[]).filter(o => orderIds.has(o.id)).map(({ unit_price, owner_approved, ...rest }) => rest);
    const customerIds = new Set((data.orders as Record<string, unknown>[]).map(o => o.customer_id));
    data.customers = (data.customers as Record<string, unknown>[]).filter(c => customerIds.has(c.id)).map(({ phone, ...rest }) => rest);
    data.documents = []; data.reminders = []; data.stock = [];
  }
  return json(data);
}

export async function POST(request: Request) {
  const ctx = await context();
  if (!ctx) return json({ error: 'Masuk terlebih dahulu' }, 401);
  if (!ctx.role) return json({ error: 'Akun belum diberi akses oleh pemilik' }, 403);
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return json({ error: 'Data tidak valid' }, 400); }
  const action = String(input.action ?? '');
  const str = (key: string) => String(input[key] ?? '').trim();
  const int = (key: string) => Number(input[key]);
  const admin = ctx.role === 'owner' || ctx.role === 'admin';
  try {
    if (action === 'sample' && ctx.role === 'owner') {
      const count = await ctx.db.prepare('SELECT COUNT(*) AS count FROM customers').first<{count:number}>();
      if (count?.count) return json({ error: 'Contoh hanya bisa dimuat saat data pelanggan kosong' },400);
      const created = now();
      await ctx.db.batch([
        ctx.db.prepare('INSERT INTO customers VALUES (?,?,?,?,?,?)').bind('demo-customer-1','CONTOH · Toko Lampung Jaya','6281234567890','Bandar Lampung','WhatsApp',created),
        ctx.db.prepare('INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,?)').bind('demo-order-1','demo-customer-1','Refill','Menunggu harga','CONTOH · Refill powder 3 kg',2,175000,0,created,created),
        ctx.db.prepare('INSERT INTO stock VALUES (?,?,?,?,?,?)').bind('demo-stock-1','CONTOH · Powder 3 kg','Bahan refill','kg',12,5),
        ctx.db.prepare('INSERT INTO reminders VALUES (?,?,?,?,?)').bind('demo-reminder-1','demo-customer-1','2027-11-01','CONTOH · Hubungi pelanggan untuk jadwal isi ulang','Terjadwal'),
      ]);
    } else if (action === 'sampleClear' && ctx.role === 'owner') {
      const usage = await ctx.db.prepare("SELECT (SELECT COUNT(*) FROM documents WHERE order_id='demo-order-1') + (SELECT COUNT(*) FROM payments WHERE order_id='demo-order-1') AS count").first<{count:number}>();
      if (usage?.count) return json({ error: 'Contoh sudah dipakai pada dokumen atau pembayaran. Periksa dulu sebelum menghapus.' },409);
      await ctx.db.batch([
        ctx.db.prepare("DELETE FROM reminders WHERE id='demo-reminder-1'"),
        ctx.db.prepare("DELETE FROM orders WHERE id='demo-order-1'"),
        ctx.db.prepare("DELETE FROM stock WHERE id='demo-stock-1' AND NOT EXISTS (SELECT 1 FROM stock_movements WHERE stock_id='demo-stock-1')"),
        ctx.db.prepare("DELETE FROM customers WHERE id='demo-customer-1' AND NOT EXISTS (SELECT 1 FROM orders WHERE customer_id='demo-customer-1')"),
      ]);
    } else if (action === 'customer' && admin) {
      if (!str('name') || !str('phone')) return json({ error: 'Nama dan WhatsApp wajib diisi' },400);
      await ctx.db.prepare('INSERT INTO customers VALUES (?,?,?,?,?,?)').bind(id(),str('name'),str('phone'),str('address'),str('source') || 'Belum diketahui',now()).run();
    } else if (action === 'order' && admin) {
      if (!str('customerId') || !['Refill','APAR baru'].includes(str('kind')) || !str('description') || !Number.isInteger(int('quantity')) || int('quantity') < 1 || !Number.isSafeInteger(int('unitPrice')) || int('unitPrice') < 0) return json({ error: 'Periksa rincian pesanan' },400);
      const customer = await ctx.db.prepare('SELECT id FROM customers WHERE id = ?').bind(str('customerId')).first();
      if (!customer) return json({ error: 'Pelanggan tidak ditemukan' },400);
      await ctx.db.prepare('INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id(),str('customerId'),str('kind'),'Menunggu harga',str('description'),int('quantity'),int('unitPrice'),0,now(),now()).run();
    } else if (action === 'approve' && ctx.role === 'owner') {
      await ctx.db.prepare("UPDATE orders SET owner_approved = 1, status = 'Disetujui', updated_at = ? WHERE id = ? AND owner_approved = 0").bind(now(),str('orderId')).run();
    } else if (action === 'status' && admin) {
      const statuses = ['Disetujui','Di workshop','Dikerjakan','Menunggu QC','Selesai','Dikembalikan'];
      if (!statuses.includes(str('status'))) return json({ error: 'Status tidak dikenal' },400);
      await ctx.db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND owner_approved = 1').bind(str('status'),now(),str('orderId')).run();
    } else if (action === 'stock' && admin) {
      if (!str('name') || !['APAR baru','Bahan refill','Spare part'].includes(str('category')) || !str('unit') || !Number.isSafeInteger(int('quantity')) || int('quantity') < 0 || !Number.isSafeInteger(int('minimum')) || int('minimum') < 0) return json({ error: 'Periksa barang dan jumlah' },400);
      await ctx.db.prepare('INSERT INTO stock VALUES (?,?,?,?,?,?)').bind(id(),str('name'),str('category'),str('unit'),int('quantity'),int('minimum')).run();
    } else if (action === 'movement' && admin) {
      if (!Number.isSafeInteger(int('delta')) || int('delta') === 0 || !str('note')) return json({ error: 'Jumlah dan alasan wajib diisi' },400);
      const movementId = id();
      const results = await ctx.db.batch([
        ctx.db.prepare('INSERT INTO stock_movements SELECT ?, id, ?, ?, ?, ? FROM stock WHERE id = ? AND quantity + ? >= 0').bind(movementId,int('delta'),str('note'),ctx.user.userId,now(),str('stockId'),int('delta')),
        ctx.db.prepare('UPDATE stock SET quantity = quantity + ? WHERE id = ? AND EXISTS (SELECT 1 FROM stock_movements WHERE id = ?)').bind(int('delta'),str('stockId'),movementId),
      ]);
      if (!results[0].meta.changes || !results[1].meta.changes) return json({ error: 'Stok tidak cukup atau barang tidak ditemukan' },400);
    } else if (action === 'document' && admin) {
      const type = str('type');
      if (!['Invoice','Tanda terima','BAST'].includes(type)) return json({ error: 'Jenis dokumen tidak dikenal' },400);
      const order = await ctx.db.prepare('SELECT o.*, c.name customer_name, c.phone customer_phone, c.address customer_address FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?').bind(str('orderId')).first<Record<string,unknown>>();
      if (!order || (type === 'Invoice' && (!order.owner_approved || !['Selesai','Dikembalikan'].includes(String(order.status))))) return json({ error: 'Pesanan belum siap untuk dokumen ini' },400);
      const snapshot = JSON.stringify({ ...order, note: str('note') });
      await ctx.db.prepare('INSERT INTO documents VALUES (?,?,?,?,?,?)').bind(id(),str('orderId'),type,'Disiapkan',snapshot,now()).run();
    } else if (action === 'payment' && admin) {
      const order = await ctx.db.prepare("SELECT o.*, (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.order_id=o.id) paid FROM orders o WHERE o.id=?").bind(str('orderId')).first<{ quantity:number;unit_price:number;paid:number;status:string }>();
      if (!order || !['Selesai','Dikembalikan'].includes(order.status) || !Number.isSafeInteger(int('amount')) || int('amount') <= 0 || int('amount') > order.quantity*order.unit_price-order.paid) return json({ error: 'Periksa jumlah dan status pekerjaan' },400);
      const result = await ctx.db.prepare("INSERT INTO payments SELECT ?, id, ?, ?, ?, ?, ? FROM orders WHERE id = ? AND status IN ('Selesai','Dikembalikan') AND quantity * unit_price - (SELECT COALESCE(SUM(amount),0) FROM payments WHERE order_id = orders.id) >= ?")
        .bind(id(),int('amount'),str('method'),str('reference'),ctx.user.userId,now(),str('orderId'),int('amount')).run();
      if (!result.meta.changes) return json({ error: 'Saldo tagihan berubah. Periksa ulang.' },409);
    } else if (action === 'reminder' && admin) {
      if (!str('customerId') || !/^\d{4}-\d{2}-\d{2}$/.test(str('dueDate'))) return json({ error: 'Pelanggan dan tanggal wajib diisi' },400);
      await ctx.db.prepare('INSERT INTO reminders VALUES (?,?,?,?,?)').bind(id(),str('customerId'),str('dueDate'),str('note'),'Terjadwal').run();
    } else if (action === 'task' && admin) {
      if (!str('title')) return json({ error: 'Judul tugas wajib diisi' },400);
      await ctx.db.prepare('INSERT INTO tasks VALUES (?,?,?,?,?,?)').bind(id(),str('orderId'),str('title'),str('assignee'),'Aktif',str('dueDate')).run();
    } else if (action === 'taskDone') {
      await ctx.db.prepare("UPDATE tasks SET status = 'Selesai' WHERE id = ? AND (assignee = ? OR ? = 'owner' OR ? = 'admin')").bind(str('taskId'),ctx.user.email,ctx.role,ctx.role).run();
    } else if (action === 'metric' && admin) {
      if (!str('channel') || !str('period') || !Number.isSafeInteger(int('views')) || !Number.isSafeInteger(int('leads'))) return json({ error: 'Periksa data kanal' },400);
      await ctx.db.prepare('INSERT INTO metrics VALUES (?,?,?,?,?,?)').bind(id(),str('channel'),str('period'),int('views'),int('leads'),str('source') || 'Manual').run();
    } else if (action === 'okr' && ctx.role === 'owner') {
      if (!str('title') || !Number.isSafeInteger(int('target')) || !Number.isSafeInteger(int('actual'))) return json({ error: 'Periksa target' },400);
      await ctx.db.prepare('INSERT INTO okrs VALUES (?,?,?,?,?,?)').bind(id(),str('title'),str('period'),int('target'),int('actual'),str('unit')).run();
    } else if (action === 'member' && ctx.role === 'owner') {
      if (!str('userId') || !str('email') || !allowedRoles.includes(str('role'))) return json({ error: 'ID akun, email dan peran wajib diisi' },400);
      await ctx.db.prepare('INSERT INTO members VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email, role=excluded.role').bind(str('userId'),str('email'),str('role'),now()).run();
    } else return json({ error: 'Aksi tidak diizinkan' },403);
    return json({ ok: true });
  } catch (error) {
    console.error('Data action failed',action,error);
    return json({ error: 'Penyimpanan gagal. Periksa kembali sebelum mencoba ulang.' },500);
  }
}
