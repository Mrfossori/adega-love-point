export interface Product {
  id: string;
  name: string;
  barcode: string;
  sale_price: number;
  cost_price: number;
  min_stock: number;
  is_active: boolean;
  stock: number;
}

export interface StockMovement {
  id: string;
  product_id: string;
  type: 'entry' | 'adjustment' | 'sale';
  quantity: number;
  note: string;
  created_at: string;
}

export interface Sale {
  id: string;
  items: SaleItem[];
  total: number;
  payment_method: 'cash' | 'credit' | 'debit' | 'pix';
  sale_type: 'presencial' | 'delivery';
  created_at: string;
}

export interface SaleItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}
