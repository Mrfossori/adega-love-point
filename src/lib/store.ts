import { Product, StockMovement, Sale } from './types';

const PRODUCTS_KEY = 'adega_products';
const MOVEMENTS_KEY = 'adega_movements';
const SALES_KEY = 'adega_sales';

function load<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch { return []; }
}

function save<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
}

export function getProducts(): Product[] {
  return load<Product>(PRODUCTS_KEY);
}

export function saveProduct(product: Product) {
  const products = getProducts();
  const idx = products.findIndex(p => p.id === product.id);
  if (idx >= 0) products[idx] = product;
  else products.push(product);
  save(PRODUCTS_KEY, products);
}

export function getMovements(): StockMovement[] {
  return load<StockMovement>(MOVEMENTS_KEY);
}

export function addMovement(mov: StockMovement) {
  const movements = getMovements();
  movements.push(mov);
  save(MOVEMENTS_KEY, movements);

  const products = getProducts();
  const product = products.find(p => p.id === mov.product_id);
  if (product) {
    if (mov.type === 'entry') product.stock += mov.quantity;
    else if (mov.type === 'adjustment') product.stock = mov.quantity;
    else if (mov.type === 'sale') product.stock -= mov.quantity;
    save(PRODUCTS_KEY, products);
  }
}

export function getSales(): Sale[] {
  return load<Sale>(SALES_KEY);
}

export function addSale(sale: Sale) {
  const sales = getSales();
  sales.push(sale);
  save(SALES_KEY, sales);
  // Deduct stock
  sale.items.forEach(item => {
    addMovement({
      id: crypto.randomUUID(),
      product_id: item.product_id,
      type: 'sale',
      quantity: item.quantity,
      note: `Venda ${sale.id}`,
      created_at: sale.created_at,
    });
  });
}

export function getLowStockProducts(): Product[] {
  return getProducts().filter(p => p.is_active && p.stock <= p.min_stock);
}
