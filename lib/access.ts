export const teamModules = [
  'Ringkasan', 'Pesanan', 'Pelanggan', 'Workshop', 'Persediaan',
  'Dokumen', 'Pembayaran', 'Pengingat', 'Marketing', 'Tugas & OKR', 'Asisten AI',
] as const;

export type TeamModule = typeof teamModules[number];

const technicianModules: TeamModule[] = ['Ringkasan', 'Pesanan', 'Workshop', 'Tugas & OKR', 'Asisten AI'];

export function allowedModules(role: string): TeamModule[] {
  return role === 'admin' ? [...teamModules] : role === 'technician' ? technicianModules : [];
}

export function memberAccess(role: string, stored: string | null | undefined): string[] {
  if (role === 'owner') return [...teamModules, 'Pengetahuan AI', 'Akses tim'];
  const allowed = allowedModules(role);
  if (stored == null) return allowed;
  try {
    const selected: unknown = JSON.parse(stored);
    return Array.isArray(selected) ? allowed.filter(module => selected.includes(module)) : [];
  } catch {
    return [];
  }
}

export function canReadTable(access: readonly string[], table: string): boolean {
  const needs: Record<string, readonly string[]> = {
    customers: ['Pelanggan', 'Pesanan', 'Pengingat', 'Dokumen', 'Pembayaran', 'Ringkasan'],
    orders: ['Pesanan', 'Workshop', 'Dokumen', 'Pembayaran', 'Ringkasan'],
    stock: ['Persediaan'],
    stock_movements: ['Persediaan'],
    documents: ['Dokumen'],
    payments: ['Pembayaran'],
    reminders: ['Pengingat'],
    tasks: ['Tugas & OKR'],
    metrics: ['Marketing'],
    okrs: ['Tugas & OKR'],
    members: ['Akses tim'],
  };
  return (needs[table] ?? []).some(module => access.includes(module));
}
