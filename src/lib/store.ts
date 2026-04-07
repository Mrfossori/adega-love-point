import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';

export type Product = Tables<'products'> & { stock: number };
export type StockSnapshot = Tables<'stock_snapshot'>;
export type InventoryMovement = Tables<'inventory_movements'>;
export type SalesOrder = Tables<'sales_orders'>;
export type SalesOrderItem = Tables<'sales_order_items'>;
export type SalesReport = Tables<'v_sales_report'>;

export interface ProductComponent {
  id: string;
  combo_product_id: string;
  component_product_id: string;
  component_qty: number;
}

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

// ---- Combo components ----
export async function getProductComponents(comboProductId: string): Promise<ProductComponent[]> {
  const { data, error } = await supabase
    .from('product_components')
    .select('*')
    .eq('combo_product_id', comboProductId);
  if (error) throw error;
  return (data || []) as ProductComponent[];
}

export async function setProductComponents(comboProductId: string, components: { component_product_id: string; component_qty: number }[]) {
  // Delete existing
  const { error: dErr } = await supabase
    .from('product_components')
    .delete()
    .eq('combo_product_id', comboProductId);
  if (dErr) throw dErr;

  if (components.length === 0) return;

  const rows = components.map(c => ({
    combo_product_id: comboProductId,
    component_product_id: c.component_product_id,
    component_qty: c.component_qty,
  }));
  const { error: iErr } = await supabase
    .from('product_components')
    .insert(rows);
  if (iErr) throw iErr;
}

// ---- Sale with combo support ----
export interface StockValidationError {
  productName: string;
  available: number;
  needed: number;
}

export async function validateStockForSale(
  items: { product_id: string; quantity: number }[],
  products: Product[],
): Promise<StockValidationError[]> {
  const errors: StockValidationError[] = [];
  const productMap = new Map(products.map(p => [p.id, p]));

  // Calculate total needed per component/product
  const needed = new Map<string, number>();

  for (const item of items) {
    const product = productMap.get(item.product_id);
    if (!product) continue;

    if (product.is_combo) {
      const components = await getProductComponents(product.id);
      for (const comp of components) {
        const current = needed.get(comp.component_product_id) || 0;
        needed.set(comp.component_product_id, current + Number(comp.component_qty) * item.quantity);
      }
      if (product.track_stock) {
        const current = needed.get(product.id) || 0;
        needed.set(product.id, current + item.quantity);
      }
    } else if (product.track_stock) {
      const current = needed.get(product.id) || 0;
      needed.set(product.id, current + item.quantity);
    }
  }

  for (const [productId, qty] of needed) {
    const product = productMap.get(productId);
    if (!product) continue;
    if (product.stock < qty) {
      errors.push({ productName: product.name, available: product.stock, needed: qty });
    }
  }

  return errors;
}

export async function createSale(
  order: Omit<TablesInsert<'sales_orders'>, 'id'>,
  items: Omit<TablesInsert<'sales_order_items'>, 'id' | 'order_id'>[],
  products: Product[],
) {
  const productMap = new Map(products.map(p => [p.id, p]));

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

  // Create inventory movements
  const movements: TablesInsert<'inventory_movements'>[] = [];

  for (const item of items) {
    const product = productMap.get(item.product_id);
    if (!product) continue;

    if (product.is_combo) {
      const components = await getProductComponents(product.id);
      for (const comp of components) {
        movements.push({
          product_id: comp.component_product_id,
          direction: 'OUT',
          reason: 'sale',
          quantity: Math.round(Number(comp.component_qty) * item.quantity * 1000) / 1000,
          note: `Combo: ${product.name} (Venda ${orderData.id.slice(0, 8)})`,
        });
      }
      if (product.track_stock) {
        movements.push({
          product_id: product.id,
          direction: 'OUT',
          reason: 'sale',
          quantity: item.quantity,
          note: `Venda ${orderData.id.slice(0, 8)}`,
        });
      }
    } else if (product.track_stock) {
      movements.push({
        product_id: product.id,
        direction: 'OUT',
        reason: 'sale',
        quantity: item.quantity,
        note: `Venda ${orderData.id.slice(0, 8)}`,
      });
    }
  }

  if (movements.length > 0) {
    const { error: mErr } = await supabase
      .from('inventory_movements')
      .insert(movements);
    if (mErr) throw mErr;
  }

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

export async function getSalesOrderItems(orderIds: string[]): Promise<SalesOrderItem[]> {
  if (orderIds.length === 0) return [];
  const { data, error } = await supabase
    .from('sales_order_items')
    .select('*')
    .in('order_id', orderIds);
  if (error) throw error;
  return data || [];
}

export async function getLowStockProducts(): Promise<Product[]> {
  const products = await getProductsWithStock();
  return products.filter(p => p.is_active && p.stock <= p.min_stock);
}
