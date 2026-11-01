import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const members = sqliteTable('members', {
  userId: text('user_id').primaryKey(),
  email: text('email').notNull(),
  role: text('role').notNull(),
  accessJson: text('access_json'),
  createdAt: text('created_at').notNull(),
});
export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(), name: text('name').notNull(), phone: text('phone').notNull(),
  address: text('address').notNull(), source: text('source').notNull(), createdAt: text('created_at').notNull(),
});
export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(), customerId: text('customer_id').notNull(), kind: text('kind').notNull(),
  status: text('status').notNull(), description: text('description').notNull(), quantity: integer('quantity').notNull(),
  unitPrice: integer('unit_price').notNull(), ownerApproved: integer('owner_approved').notNull().default(0),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
});
export const stock = sqliteTable('stock', {
  id: text('id').primaryKey(), name: text('name').notNull(), category: text('category').notNull(),
  unit: text('unit').notNull(), quantity: integer('quantity').notNull(), minimum: integer('minimum').notNull(),
});
export const stockMovements = sqliteTable('stock_movements', {
  id: text('id').primaryKey(), stockId: text('stock_id').notNull(), delta: integer('delta').notNull(),
  note: text('note').notNull(), actorId: text('actor_id').notNull(), createdAt: text('created_at').notNull(),
});
export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(), orderId: text('order_id').notNull(), type: text('type').notNull(),
  status: text('status').notNull(), snapshot: text('snapshot').notNull(), createdAt: text('created_at').notNull(),
});
export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(), orderId: text('order_id').notNull(), amount: integer('amount').notNull(),
  method: text('method').notNull(), reference: text('reference').notNull(), actorId: text('actor_id').notNull(), createdAt: text('created_at').notNull(),
});
export const reminders = sqliteTable('reminders', {
  id: text('id').primaryKey(), customerId: text('customer_id').notNull(), dueDate: text('due_date').notNull(),
  note: text('note').notNull(), status: text('status').notNull(),
});
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(), orderId: text('order_id').notNull(), title: text('title').notNull(),
  assignee: text('assignee').notNull(), status: text('status').notNull(), dueDate: text('due_date').notNull(),
});
export const metrics = sqliteTable('metrics', {
  id: text('id').primaryKey(), channel: text('channel').notNull(), period: text('period').notNull(),
  views: integer('views').notNull(), leads: integer('leads').notNull(), source: text('source').notNull(),
});
export const okrs = sqliteTable('okrs', {
  id: text('id').primaryKey(), title: text('title').notNull(), period: text('period').notNull(),
  target: integer('target').notNull(), actual: integer('actual').notNull(), unit: text('unit').notNull(),
});

export const knowledge = sqliteTable('knowledge', {
  id: text('id').primaryKey(), title: text('title').notNull(), fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(), r2Key: text('r2_key').notNull(),
  extractedText: text('extracted_text').notNull(), status: text('status').notNull(),
  uploadedBy: text('uploaded_by').notNull(), createdAt: text('created_at').notNull(),
});

export const waIntakes = sqliteTable('wa_intakes', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull(),
  contentHash: text('content_hash').notNull().unique(),
  rawText: text('raw_text').notNull(),
  summary: text('summary').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
});

export const sparePartRequests = sqliteTable('spare_part_requests', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull(),
  stockId: text('stock_id').notNull(),
  quantity: integer('quantity').notNull(),
  note: text('note').notNull(),
  status: text('status').notNull(),
  unitPrice: integer('unit_price').notNull().default(0),
  requestedBy: text('requested_by').notNull(),
  createdAt: text('created_at').notNull(),
  decidedBy: text('decided_by'),
  decidedAt: text('decided_at'),
  installedBy: text('installed_by'),
  installedAt: text('installed_at'),
});

export const workshopAssignments = sqliteTable('workshop_assignments', {
  orderId: text('order_id').primaryKey(),
  assignee: text('assignee').notNull(),
  assignedBy: text('assigned_by').notNull(),
  assignedAt: text('assigned_at').notNull(),
});
