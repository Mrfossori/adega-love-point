
-- Products table
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  barcode TEXT DEFAULT '',
  sale_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  cost_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to products" ON public.products FOR ALL USING (true) WITH CHECK (true);

-- Stock snapshot table (current balance per product)
CREATE TABLE public.stock_snapshot (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE UNIQUE,
  quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to stock_snapshot" ON public.stock_snapshot FOR ALL USING (true) WITH CHECK (true);

-- Inventory movements table
CREATE TYPE public.movement_direction AS ENUM ('IN', 'OUT');
CREATE TYPE public.movement_reason AS ENUM ('purchase', 'sale', 'adjustment');

CREATE TABLE public.inventory_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  direction public.movement_direction NOT NULL,
  reason public.movement_reason NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to inventory_movements" ON public.inventory_movements FOR ALL USING (true) WITH CHECK (true);

-- Sales orders table
CREATE TABLE public.sales_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  sale_type TEXT NOT NULL DEFAULT 'presencial',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to sales_orders" ON public.sales_orders FOR ALL USING (true) WITH CHECK (true);

-- Sales order items table
CREATE TABLE public.sales_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to sales_order_items" ON public.sales_order_items FOR ALL USING (true) WITH CHECK (true);

-- Trigger function: update stock_snapshot when inventory_movements is inserted
CREATE OR REPLACE FUNCTION public.update_stock_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.stock_snapshot (product_id, quantity, updated_at)
  VALUES (
    NEW.product_id,
    CASE WHEN NEW.direction = 'IN' THEN NEW.quantity ELSE -NEW.quantity END,
    now()
  )
  ON CONFLICT (product_id)
  DO UPDATE SET
    quantity = stock_snapshot.quantity + CASE WHEN NEW.direction = 'IN' THEN NEW.quantity ELSE -NEW.quantity END,
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_update_stock_snapshot
  AFTER INSERT ON public.inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_stock_snapshot();

-- Auto-create stock_snapshot row when product is created
CREATE OR REPLACE FUNCTION public.create_stock_snapshot_for_product()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.stock_snapshot (product_id, quantity) VALUES (NEW.id, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_create_stock_snapshot
  AFTER INSERT ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.create_stock_snapshot_for_product();

-- Updated_at trigger for products
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- View for sales report
CREATE OR REPLACE VIEW public.v_sales_report AS
SELECT
  so.id,
  so.created_at,
  so.total,
  so.payment_method,
  so.sale_type,
  COALESCE(SUM(soi.quantity), 0) AS total_items
FROM public.sales_orders so
LEFT JOIN public.sales_order_items soi ON soi.order_id = so.id
GROUP BY so.id, so.created_at, so.total, so.payment_method, so.sale_type;
