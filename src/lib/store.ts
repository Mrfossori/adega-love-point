import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';

export type Product = Tables<'products'> & { stock: number };
export type StockSnapshot = Tables<'stock_snapshot'>;
export type InventoryMovement = Tables<'inventory_movements'>;
export type SalesOrder = Tables<'sales_orders'>;
export type SalesOrderItem = Tables<'sales_order_items'>;
export type SalesReport = Tables<'v_sales_report'>;

export async function getProductsWithStock(): Promise<Product[]> {
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('*')
    .order('name');
  if (pErr) throw pErr;

  const { data: snapshots, error: sErr } = await supabase
    .from('stock_snapshot')
    .select('*');
  if (sErr) throw sErr;

  const stockMap = new Map(snapshots?.map(s => [s.product_id, s.quantity]) || []);
  return (products || []).map(p => ({ ...p, stock: stockMap.get(p.id) || 0 }));
}

export async function upsertProduct(product: TablesInsert<'products'>) {
  const { error } = await supabase
    .from('products')
    .upsert(product);
  if (error) throw error;
}

export async function addInventoryMovement(mov: TablesInsert<'inventory_movements'>) {
  const { error } = await supabase
    .from('inventory_movements')
    .insert(mov);
  if (error) throw error;
}

export async function createSale(
  order: Omit<TablesInsert<'sales_orders'>, 'id'>,
  items: Omit<TablesInsert<'sales_order_items'>, 'id' | 'order_id'>[]
) {
  // Insert order
  const { data: orderData, error: oErr } = await supabase
    .from('sales_orders')
    .insert(order)
    .select()
    .single();
  if (oErr) throw oErr;

  // Insert items
  const orderItems = items.map(item => ({
    ...item,
    order_id: orderData.id,
  }));
  const { error: iErr } = await supabase
    .from('sales_order_items')
    .insert(orderItems);
  if (iErr) throw iErr;

  // Create OUT movements for each item (triggers stock update)
  const movements = items.map(item => ({
    product_id: item.product_id,
    direction: 'OUT' as const,
    reason: 'sale' as const,
    quantity: item.quantity,
    note: `Venda ${orderData.id}`,
  }));
  const { error: mErr } = await supabase
    .from('inventory_movements')
    .insert(movements);
  if (mErr) throw mErr;

  return orderData;
}

export async function getSalesReport(startDate: string, endDate: string): Promise<SalesReport[]> {
  const { data, error } = await supabase
    .from('v_sales_report')
    .select('*')
    .gte('created_at', `${startDate}T00:00:00`)
    .lte('created_at', `${endDate}T23:59:59`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getLowStockProducts(): Promise<Product[]> {
  const products = await getProductsWithStock();
  return products.filter(p => p.is_active && p.stock <= p.min_stock);
}
