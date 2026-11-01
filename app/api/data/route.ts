import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { allowedModules, canReadTable, memberAccess, teamModules } from '../../../lib/access';

const json = (value: unknown, status = 200) => Response.json(value, { status });
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
type Member = { role: string; access_json: string | null };

async function context() {
  const user = await getChatGPTUser();
  if (!user) return null;
  const db = env.DB;
  if (!db) throw new Error('Database belum tersedia');
  let member = await db.prepare('SELECT role,access_json FROM members WHERE user_id = ?').bind(user.userId).first<Member>();
  if (['indokalampung@gmail.com','agenlampung77@gmail.com','sevenhexclick1@gmail.com'].includes(user.email.toLowerCase()) && member?.role !== 'owner') {
    await db.prepare("INSERT INTO members (user_id,email,role,created_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email, role='owner'")
      .bind(user.userId,user.email,'owner',now()).run();
    member = await db.prepare('SELECT role,access_json FROM members WHERE user_id = ?').bind(user.userId).first<Member>();
  }
  if (user.email.toLowerCase() === 'spite0tram@icloud.com' && !member) {
    await db.prepare("INSERT INTO members (user_id,email,role,created_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email, role='technician'")
      .bind(user.userId,user.email,'technician',now()).run();
    member = await db.prepare('SELECT role,access_json FROM members WHERE user_id = ?').bind(user.userId).first<Member>();
  }
  if (process.env.NODE_ENV === 'development' && user.userId === 'local_admin' && user.email === 'admin@apar-lampung.test' && !member) {
    await db.prepare("INSERT INTO members (user_id,email,role,created_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email, role='admin'")
      .bind(user.userId,user.email,'admin',now()).run();
    member = await db.prepare('SELECT role,access_json FROM members WHERE user_id = ?').bind(user.userId).first<Member>();
  }
  if (!member) {
    const pending = await db.prepare('SELECT user_id FROM members WHERE user_id = ? AND lower(email) = ?')
      .bind(`pending:${user.email.toLowerCase()}`, user.email.toLowerCase()).first<{user_id:string}>();
    if (pending) {
      await db.prepare('UPDATE members SET user_id = ? WHERE user_id = ?').bind(user.userId,pending.user_id).run();
      member = await db.prepare('SELECT role,access_json FROM members WHERE user_id = ?').bind(user.userId).first<Member>();
    }
  }
  if (!member) {
    const count = await db.prepare('SELECT COUNT(*) AS count FROM members').first<{ count: number }>();
    if (count?.count === 0) {
      await db.prepare("INSERT INTO members (user_id,email,role,created_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email, role='owner'")
        .bind(user.userId,user.email,'owner',now()).run();
      member = await db.prepare('SELECT role,access_json FROM members WHERE user_id = ?').bind(user.userId).first<Member>();
    }
  }
  return { user, db, role: member?.role ?? null, access: memberAccess(member?.role ?? '', member?.access_json) };
}

export async function GET() {
  const ctx = await context();
  if (!ctx) return json({ error: 'Masuk terlebih dahulu' }, 401);
  if (!ctx.role) return json({ error: 'Akun belum diberi akses oleh pemilik' }, 403);
  const tables = ['customers','orders','stock','documents','payments','reminders','tasks','metrics','okrs','members'] as const;
  const data: Record<string, unknown> = { role: ctx.role, email: ctx.user.email, permissions: ctx.access };
  for (const table of tables) {
    if (!canReadTable(ctx.access,table) || (ctx.role === 'technician' && ['payments','metrics','okrs','members'].includes(table))) continue;
    const rows = await ctx.db.prepare(`SELECT * FROM ${table} ORDER BY rowid DESC LIMIT 200`).all();
    data[table] = rows.results;
  }
  if (ctx.role !== 'technician' && ctx.access.includes('Pesanan')) {
    const intakes = await ctx.db.prepare('SELECT order_id,summary,created_at FROM wa_intakes ORDER BY created_at DESC LIMIT 200').all();
    data.waIntakes = intakes.results;
  }
  if (ctx.access.includes('Workshop')) {
    const assignments = await ctx.db.prepare('SELECT order_id,assignee,assigned_at FROM workshop_assignments WHERE assignee=? OR ?=1 ORDER BY assigned_at DESC LIMIT 200')
      .bind(ctx.user.email,ctx.role === 'technician' ? 0 : 1).all();
    data.workshopAssignments = assignments.results;
    const requests = await ctx.db.prepare("SELECT r.id,r.order_id,r.stock_id,r.quantity,r.note,r.status,r.unit_price,r.requested_by,r.created_at,s.name AS stock_name FROM spare_part_requests r JOIN stock s ON s.id=r.stock_id WHERE EXISTS(SELECT 1 FROM workshop_assignments a WHERE a.order_id=r.order_id AND a.assignee=?) OR ?=1 ORDER BY r.created_at DESC LIMIT 200")
      .bind(ctx.user.email,ctx.role === 'technician' ? 0 : 1).all();
    data.sparePartRequests = ctx.role === 'technician' ? (requests.results as Record<string, unknown>[]).map(({unit_price,...row})=>row) : requests.results;
    data.spareParts = (await ctx.db.prepare("SELECT id,name FROM stock WHERE category='Spare part' ORDER BY name LIMIT 200").all()).results;
    if (ctx.role !== 'technician') data.technicians = (await ctx.db.prepare("SELECT email FROM members WHERE role='technician' ORDER BY email LIMIT 100").all()).results;
  }
  if (ctx.role !== 'owner' && !['Pelanggan','Pengingat','Dokumen','Pembayaran'].some(module => ctx.access.includes(module)) && data.customers) {
    data.customers = (data.customers as Record<string, unknown>[]).map(({id,name}) => ({id,name}));
  }
  if (ctx.role !== 'owner' && !['Pesanan','Dokumen','Pembayaran'].some(module => ctx.access.includes(module)) && data.orders) {
    data.orders = (data.orders as Record<string, unknown>[]).map(({unit_price,...order}) => order);
  }
  if (ctx.role === 'technician') {
    const assignments = await ctx.db.prepare("SELECT order_id FROM tasks WHERE assignee=? UNION SELECT order_id FROM workshop_assignments WHERE assignee=? UNION SELECT id FROM orders WHERE kind='Refill' AND status='APAR masuk' AND NOT EXISTS(SELECT 1 FROM workshop_assignments a WHERE a.order_id=orders.id)").bind(ctx.user.email,ctx.user.email).all<{order_id:string}>();
    const orderIds = new Set(assignments.results.map(t => t.order_id));
    data.tasks = ctx.access.includes('Tugas & OKR') ? ((data.tasks ?? []) as Record<string, unknown>[]).filter(t => t.assignee === ctx.user.email) : [];
    data.orders = ((data.orders ?? []) as Record<string, unknown>[]).filter(o => orderIds.has(String(o.id))).map(({ unit_price, owner_approved, ...rest }) => rest);
    const customerIds = new Set((data.orders as Record<string, unknown>[]).map(o => o.customer_id));
    data.customers = ((data.customers ?? []) as Record<string, unknown>[]).filter(c => customerIds.has(c.id)).map(({ phone, ...rest }) => rest);
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
  const can = (module: string) => ctx.access.includes(module);
  try {
    if (action === 'sample' && ctx.role === 'owner') {
      const count = await ctx.db.prepare('SELECT COUNT(*) AS count FROM customers').first<{count:number}>();
      if (count?.count) return json({ error: 'Contoh hanya bisa dimuat saat data pelanggan kosong' },400);
      const created = now();
      await ctx.db.batch([
        ctx.db.prepare('INSERT INTO customers VALUES (?,?,?,?,?,?)').bind('demo-customer-1','CONTOH · Toko Lampung Jaya','6281234567890','Bandar Lampung','WhatsApp',created),
        ctx.db.prepare('INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,?)').bind('demo-order-1','demo-customer-1','Refill','Menunggu APAR','CONTOH · Refill powder 3 kg',2,175000,0,created,created),
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
    } else if (action === 'customer' && admin && can('Pelanggan')) {
      if (!str('name') || !str('phone')) return json({ error: 'Nama dan WhatsApp wajib diisi' },400);
      await ctx.db.prepare('INSERT INTO customers VALUES (?,?,?,?,?,?)').bind(id(),str('name'),str('phone'),str('address'),str('source') || 'Belum diketahui',now()).run();
    } else if (action === 'order' && admin && can('Pesanan')) {
      if (!str('customerId') || !['Refill','APAR baru'].includes(str('kind')) || !str('description') || !Number.isInteger(int('quantity')) || int('quantity') < 1 || !Number.isSafeInteger(int('unitPrice')) || int('unitPrice') < 0) return json({ error: 'Periksa rincian pesanan' },400);
      const customer = await ctx.db.prepare('SELECT id FROM customers WHERE id = ?').bind(str('customerId')).first();
      if (!customer) return json({ error: 'Pelanggan tidak ditemukan' },400);
      await ctx.db.prepare('INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id(),str('customerId'),str('kind'),str('kind')==='Refill'?'Menunggu APAR':'Menunggu harga',str('description'),int('quantity'),int('unitPrice'),0,now(),now()).run();
    } else if (action === 'price' && ctx.role === 'owner') {
      if (!Number.isSafeInteger(int('unitPrice')) || int('unitPrice') <= 0) return json({ error: 'Harga per unit harus lebih dari nol' },400);
      const result = await ctx.db.prepare('UPDATE orders SET unit_price=?,updated_at=? WHERE id=? AND owner_approved=0')
        .bind(int('unitPrice'),now(),str('orderId')).run();
      if (!result.meta.changes) return json({ error: 'Pesanan tidak ditemukan atau harga sudah disetujui' },404);
    } else if (action === 'approve' && ctx.role === 'owner') {
      const result = await ctx.db.prepare("UPDATE orders SET owner_approved = 1, status = CASE WHEN kind='Refill' THEN status ELSE 'Disetujui' END, updated_at = ? WHERE id = ? AND owner_approved = 0 AND unit_price > 0").bind(now(),str('orderId')).run();
      if (!result.meta.changes) return json({ error: 'Tetapkan harga per unit lebih dulu' },400);
    } else if (action === 'status' && admin && can('Pesanan')) {
      const statuses = ['Disetujui','Di workshop','Dikerjakan','Menunggu QC','Selesai','Dikembalikan'];
      if (!statuses.includes(str('status'))) return json({ error: 'Status tidak dikenal' },400);
      const order = await ctx.db.prepare('SELECT kind,status FROM orders WHERE id=?').bind(str('orderId')).first<{kind:string;status:string}>();
      if (!order) return json({ error: 'Pesanan tidak ditemukan' },404);
      if (order.kind === 'Refill') return json({ error: 'Status refill mengikuti alur terima APAR, teknisi, dan pengembalian' },400);
      await ctx.db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND owner_approved = 1').bind(str('status'),now(),str('orderId')).run();
    } else if (action === 'receiveApar' && admin && can('Pesanan')) {
      const order = await ctx.db.prepare("SELECT o.*,c.name customer_name,c.phone customer_phone,c.address customer_address FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=? AND o.kind='Refill' AND o.status='Menunggu APAR'").bind(str('orderId')).first<Record<string,unknown>>();
      if (!order) return json({ error: 'Pesanan tidak sedang menunggu APAR' },409);
      const snapshot = JSON.stringify({...order,status:'APAR masuk',note:str('note')});
      const created = now();
      const results = await ctx.db.batch([
        ctx.db.prepare("UPDATE orders SET status='APAR masuk',updated_at=? WHERE id=? AND status='Menunggu APAR'").bind(created,str('orderId')),
        ctx.db.prepare("INSERT INTO documents (id,order_id,type,status,snapshot,created_at) SELECT ?,id,'Tanda terima','Disiapkan',?,? FROM orders WHERE id=? AND status='APAR masuk' AND NOT EXISTS(SELECT 1 FROM documents WHERE order_id=? AND type='Tanda terima')")
          .bind(id(),snapshot,created,str('orderId'),str('orderId')),
      ]);
      if (!results[0].meta.changes) return json({ error: 'Status pesanan sudah berubah' },409);
    } else if (action === 'returnApar' && admin && can('Pesanan')) {
      const order = await ctx.db.prepare("SELECT o.*,c.name customer_name,c.phone customer_phone,c.address customer_address FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=? AND o.kind='Refill' AND o.status='Proses selesai'").bind(str('orderId')).first<Record<string,unknown>>();
      if (!order) return json({ error: 'Pekerjaan belum selesai atau sudah dikembalikan' },409);
      const snapshot = JSON.stringify({...order,status:'Dikembalikan',note:str('note')});
      const created = now();
      const results = await ctx.db.batch([
        ctx.db.prepare("UPDATE orders SET status='Dikembalikan',updated_at=? WHERE id=? AND status='Proses selesai'").bind(created,str('orderId')),
        ctx.db.prepare("INSERT INTO documents (id,order_id,type,status,snapshot,created_at) SELECT ?,id,'BAST','Disiapkan',?,? FROM orders WHERE id=? AND status='Dikembalikan' AND NOT EXISTS(SELECT 1 FROM documents WHERE order_id=? AND type='BAST')")
          .bind(id(),snapshot,created,str('orderId'),str('orderId')),
      ]);
      if (!results[0].meta.changes) return json({ error: 'Status pesanan sudah berubah' },409);
    } else if (action === 'workshopAccept' && ctx.role === 'technician' && can('Workshop')) {
      const orderId = str('orderId');
      const created = now();
      const results = await ctx.db.batch([
        ctx.db.prepare("INSERT OR IGNORE INTO workshop_assignments (order_id,assignee,assigned_by,assigned_at) SELECT id,?,?,? FROM orders WHERE id=? AND kind='Refill' AND status='APAR masuk'")
          .bind(ctx.user.email,ctx.user.userId,created,orderId),
        ctx.db.prepare("UPDATE orders SET status='Sedang diproses',updated_at=? WHERE id=? AND status='APAR masuk' AND EXISTS(SELECT 1 FROM workshop_assignments a WHERE a.order_id=orders.id AND a.assignee=?)")
          .bind(created,orderId,ctx.user.email),
      ]);
      if (!results[1].meta.changes) return json({ error: 'Order sudah diambil teknisi lain atau belum diterima admin' },409);
    } else if (action === 'sparePartRequest' && ctx.role === 'technician' && can('Workshop')) {
      if (!Number.isSafeInteger(int('quantity')) || int('quantity') <= 0 || !str('note') || str('note').length > 500) return json({ error: 'Pilih jumlah dan jelaskan alasan penggantian' },400);
      const result = await ctx.db.prepare("INSERT INTO spare_part_requests (id,order_id,stock_id,quantity,note,status,requested_by,created_at) SELECT ?,o.id,s.id,?,?,'Menunggu pemilik',?,? FROM orders o JOIN stock s ON s.id=? AND s.category='Spare part' JOIN workshop_assignments a ON a.order_id=o.id AND a.assignee=? WHERE o.id=? AND o.kind='Refill' AND o.status='Sedang diproses'")
        .bind(id(),int('quantity'),str('note'),ctx.user.userId,now(),str('stockId'),ctx.user.email,str('orderId')).run();
      if (!result.meta.changes) return json({ error: 'Pekerjaan atau spare part tidak tersedia' },409);
    } else if (action === 'sparePartDecision' && ctx.role === 'owner' && can('Workshop')) {
      const decision = str('decision');
      const requestId = str('requestId');
      if (decision === 'Tolak') {
        const result = await ctx.db.prepare("UPDATE spare_part_requests SET status='Ditolak',decided_by=?,decided_at=? WHERE id=? AND status='Menunggu pemilik'")
          .bind(ctx.user.userId,now(),requestId).run();
        if (!result.meta.changes) return json({ error: 'Permintaan sudah diputuskan' },409);
      } else if (decision === 'Setujui') {
        if (!Number.isSafeInteger(int('unitPrice')) || int('unitPrice') < 0) return json({ error: 'Harga spare part tidak valid' },400);
        const result = await ctx.db.prepare("UPDATE spare_part_requests SET status='Disetujui pemilik',unit_price=?,decided_by=?,decided_at=? WHERE id=? AND status='Menunggu pemilik'")
          .bind(int('unitPrice'),ctx.user.userId,now(),requestId).run();
        if (!result.meta.changes) return json({ error: 'Permintaan sudah diputuskan' },409);
      } else return json({ error: 'Keputusan tidak dikenal' },400);
    } else if (action === 'sparePartInstall' && admin && can('Workshop') && can('Persediaan')) {
      const requestId = str('requestId');
      const created = now();
      const results = await ctx.db.batch([
        ctx.db.prepare("INSERT INTO stock_movements (id,stock_id,delta,note,actor_id,created_at) SELECT r.id,r.stock_id,-r.quantity,'Spare part untuk order ' || substr(r.order_id,1,8) || ': ' || r.note,?,? FROM spare_part_requests r JOIN stock s ON s.id=r.stock_id WHERE r.id=? AND r.status='Disetujui pemilik' AND s.category='Spare part' AND s.quantity>=r.quantity")
          .bind(ctx.user.userId,created,requestId),
        ctx.db.prepare("UPDATE stock SET quantity=quantity-(SELECT quantity FROM spare_part_requests WHERE id=?) WHERE id=(SELECT stock_id FROM spare_part_requests WHERE id=?) AND EXISTS(SELECT 1 FROM stock_movements WHERE id=?) AND EXISTS(SELECT 1 FROM spare_part_requests WHERE id=? AND status='Disetujui pemilik')")
          .bind(requestId,requestId,requestId,requestId),
        ctx.db.prepare("UPDATE spare_part_requests SET status='Terpasang',installed_by=?,installed_at=? WHERE id=? AND status='Disetujui pemilik' AND EXISTS(SELECT 1 FROM stock_movements WHERE id=?)")
          .bind(ctx.user.userId,created,requestId,requestId),
      ]);
      if (!results[0].meta.changes || !results[1].meta.changes || !results[2].meta.changes) return json({ error: 'Stok tidak cukup atau pemasangan sudah dicatat' },409);
    } else if (action === 'workshopDone' && ctx.role === 'technician' && can('Workshop')) {
      const result = await ctx.db.prepare("UPDATE orders SET status='Proses selesai',updated_at=? WHERE id=? AND kind='Refill' AND status='Sedang diproses' AND EXISTS(SELECT 1 FROM workshop_assignments a WHERE a.order_id=orders.id AND a.assignee=?) AND NOT EXISTS(SELECT 1 FROM spare_part_requests r WHERE r.order_id=orders.id AND r.status IN ('Menunggu pemilik','Disetujui pemilik'))")
        .bind(now(),str('orderId'),ctx.user.email).run();
      if (!result.meta.changes) return json({ error: 'Selesaikan permintaan spare part yang masih menunggu sebelum proses selesai' },409);
    } else if (action === 'stock' && admin && can('Persediaan')) {
      if (!str('name') || !['APAR baru','Bahan refill','Spare part'].includes(str('category')) || !str('unit') || !Number.isSafeInteger(int('quantity')) || int('quantity') < 0 || !Number.isSafeInteger(int('minimum')) || int('minimum') < 0) return json({ error: 'Periksa barang dan jumlah' },400);
      await ctx.db.prepare('INSERT INTO stock VALUES (?,?,?,?,?,?)').bind(id(),str('name'),str('category'),str('unit'),int('quantity'),int('minimum')).run();
    } else if (action === 'movement' && admin && can('Persediaan')) {
      if (!Number.isSafeInteger(int('delta')) || int('delta') === 0 || !str('note')) return json({ error: 'Jumlah dan alasan wajib diisi' },400);
      const movementId = id();
      const results = await ctx.db.batch([
        ctx.db.prepare('INSERT INTO stock_movements SELECT ?, id, ?, ?, ?, ? FROM stock WHERE id = ? AND quantity + ? >= 0').bind(movementId,int('delta'),str('note'),ctx.user.userId,now(),str('stockId'),int('delta')),
        ctx.db.prepare('UPDATE stock SET quantity = quantity + ? WHERE id = ? AND EXISTS (SELECT 1 FROM stock_movements WHERE id = ?)').bind(int('delta'),str('stockId'),movementId),
      ]);
      if (!results[0].meta.changes || !results[1].meta.changes) return json({ error: 'Stok tidak cukup atau barang tidak ditemukan' },400);
    } else if (action === 'document' && admin && can('Dokumen')) {
      const type = str('type');
      if (!['Invoice','Tanda terima','BAST'].includes(type)) return json({ error: 'Jenis dokumen tidak dikenal' },400);
      const order = await ctx.db.prepare('SELECT o.*, c.name customer_name, c.phone customer_phone, c.address customer_address FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?').bind(str('orderId')).first<Record<string,unknown>>();
      if (!order) return json({ error: 'Pesanan tidak ditemukan' },404);
      const refill = order.kind === 'Refill';
      const ready = type === 'Invoice' ? Boolean(order.owner_approved) && (refill ? ['Proses selesai','Dikembalikan'].includes(String(order.status)) : ['Selesai','Dikembalikan'].includes(String(order.status)))
        : type === 'Tanda terima' ? refill && !['Menunggu APAR'].includes(String(order.status))
        : refill && order.status === 'Dikembalikan';
      if (!ready) return json({ error: 'Pesanan belum siap untuk dokumen ini' },400);
      const parts = type === 'Invoice' ? (await ctx.db.prepare("SELECT s.name,r.quantity,r.unit_price FROM spare_part_requests r JOIN stock s ON s.id=r.stock_id WHERE r.order_id=? AND r.status='Terpasang'").bind(str('orderId')).all()).results : [];
      const snapshot = JSON.stringify({ ...order, parts, note: str('note') });
      const result = await ctx.db.prepare('INSERT INTO documents SELECT ?,id,?,?,?,? FROM orders WHERE id=? AND NOT EXISTS(SELECT 1 FROM documents WHERE order_id=? AND type=?)')
        .bind(id(),type,'Disiapkan',snapshot,now(),str('orderId'),str('orderId'),type).run();
      if (!result.meta.changes) return json({ error: 'Dokumen ini sudah tersedia' },409);
    } else if (action === 'payment' && admin && can('Pembayaran')) {
      const order = await ctx.db.prepare("SELECT o.*, (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.order_id=o.id) paid, (SELECT COALESCE(SUM(quantity*unit_price),0) FROM spare_part_requests r WHERE r.order_id=o.id AND r.status='Terpasang') parts_total FROM orders o WHERE o.id=?").bind(str('orderId')).first<{ quantity:number;unit_price:number;paid:number;parts_total:number;status:string;owner_approved:number }>();
      if (!order || !order.owner_approved || !['Proses selesai','Selesai','Dikembalikan'].includes(order.status) || !Number.isSafeInteger(int('amount')) || int('amount') <= 0 || int('amount') > order.quantity*order.unit_price+order.parts_total-order.paid) return json({ error: 'Periksa jumlah dan status pekerjaan' },400);
      const result = await ctx.db.prepare("INSERT INTO payments SELECT ?, id, ?, ?, ?, ?, ? FROM orders WHERE id = ? AND owner_approved=1 AND status IN ('Proses selesai','Selesai','Dikembalikan') AND quantity * unit_price + (SELECT COALESCE(SUM(quantity*unit_price),0) FROM spare_part_requests WHERE order_id=orders.id AND status='Terpasang') - (SELECT COALESCE(SUM(amount),0) FROM payments WHERE order_id = orders.id) >= ?")
        .bind(id(),int('amount'),str('method'),str('reference'),ctx.user.userId,now(),str('orderId'),int('amount')).run();
      if (!result.meta.changes) return json({ error: 'Saldo tagihan berubah. Periksa ulang.' },409);
    } else if (action === 'reminder' && admin && can('Pengingat')) {
      if (!str('customerId') || !/^\d{4}-\d{2}-\d{2}$/.test(str('dueDate'))) return json({ error: 'Pelanggan dan tanggal wajib diisi' },400);
      await ctx.db.prepare('INSERT INTO reminders VALUES (?,?,?,?,?)').bind(id(),str('customerId'),str('dueDate'),str('note'),'Terjadwal').run();
    } else if (action === 'task' && admin && can('Tugas & OKR')) {
      if (!str('title')) return json({ error: 'Judul tugas wajib diisi' },400);
      await ctx.db.prepare('INSERT INTO tasks VALUES (?,?,?,?,?,?)').bind(id(),str('orderId'),str('title'),str('assignee'),'Aktif',str('dueDate')).run();
    } else if (action === 'taskDone' && can('Tugas & OKR')) {
      await ctx.db.prepare("UPDATE tasks SET status = 'Selesai' WHERE id = ? AND (assignee = ? OR ? = 'owner' OR ? = 'admin')").bind(str('taskId'),ctx.user.email,ctx.role,ctx.role).run();
    } else if (action === 'metric' && admin && can('Marketing')) {
      if (!str('channel') || !str('period') || !Number.isSafeInteger(int('views')) || !Number.isSafeInteger(int('leads'))) return json({ error: 'Periksa data kanal' },400);
      await ctx.db.prepare('INSERT INTO metrics VALUES (?,?,?,?,?,?)').bind(id(),str('channel'),str('period'),int('views'),int('leads'),str('source') || 'Manual').run();
    } else if (action === 'okr' && ctx.role === 'owner') {
      if (!str('title') || !Number.isSafeInteger(int('target')) || !Number.isSafeInteger(int('actual'))) return json({ error: 'Periksa target' },400);
      await ctx.db.prepare('INSERT INTO okrs VALUES (?,?,?,?,?,?)').bind(id(),str('title'),str('period'),int('target'),int('actual'),str('unit')).run();
    } else if (action === 'member' && ctx.role === 'owner') {
      const email = str('email').toLowerCase();
      const role = str('role');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['admin','technician'].includes(role)) return json({ error: 'Email dan peran tim tidak valid' },400);
      const existing = await ctx.db.prepare('SELECT user_id,role FROM members WHERE lower(email)=?').bind(email).first<{user_id:string;role:string}>();
      if (existing?.role === 'owner') return json({ error: 'Peran pemilik tidak dapat diubah di sini' },403);
      if (existing) await ctx.db.prepare('UPDATE members SET role=?,access_json=NULL WHERE user_id=?').bind(role,existing.user_id).run();
      else await ctx.db.prepare('INSERT INTO members (user_id,email,role,created_at) VALUES (?,?,?,?)').bind(`pending:${email}`,email,role,now()).run();
    } else if (action === 'memberAccess' && ctx.role === 'owner') {
      const target = await ctx.db.prepare('SELECT role FROM members WHERE user_id=?').bind(str('userId')).first<{role:string}>();
      const selected = input.permissions;
      if (!target || target.role === 'owner' || !Array.isArray(selected) || selected.some(value => typeof value !== 'string' || !teamModules.includes(value as typeof teamModules[number])) || selected.some(value => !allowedModules(target.role).includes(value as typeof teamModules[number]))) return json({ error: 'Pengaturan akses tidak valid' },400);
      await ctx.db.prepare('UPDATE members SET access_json=? WHERE user_id=?').bind(JSON.stringify(selected),str('userId')).run();
    } else return json({ error: 'Aksi tidak diizinkan' },403);
    return json({ ok: true });
  } catch (error) {
    console.error('Data action failed',action,error);
    return json({ error: 'Penyimpanan gagal. Periksa kembali sebelum mencoba ulang.' },500);
  }
}
