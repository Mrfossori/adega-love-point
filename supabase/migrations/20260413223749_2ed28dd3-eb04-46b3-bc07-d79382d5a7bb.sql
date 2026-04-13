
-- Create enums
CREATE TYPE public.stock_purchase_status AS ENUM ('pending_receipt', 'received', 'cancelled');
CREATE TYPE public.payment_status AS ENUM ('unpaid', 'paid', 'cancelled');
CREATE TYPE public.finance_entry_type AS ENUM ('income', 'expense');
CREATE TYPE public.finance_source_type AS ENUM ('stock_purchase', 'operational_expense', 'sale', 'manual');
CREATE TYPE public.finance_entry_status AS ENUM ('pending', 'paid', 'cancelled');

-- Suppliers table
CREATE TABLE public.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  tax_id TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to suppliers" ON public.suppliers FOR ALL USING (true) WITH CHECK (true);

-- Stock purchases table
CREATE TABLE public.stock_purchases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_receipt_date DATE,
  due_date DATE,
  stock_status public.stock_purchase_status NOT NULL DEFAULT 'pending_receipt',
  payment_status public.payment_status NOT NULL DEFAULT 'unpaid',
  payment_method TEXT,
  notes TEXT,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  stock_received_at TIMESTAMP WITH TIME ZONE,
  payment_recorded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to stock_purchases" ON public.stock_purchases FOR ALL USING (true) WITH CHECK (true);

-- Stock purchase items
CREATE TABLE public.stock_purchase_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_purchase_id UUID NOT NULL REFERENCES public.stock_purchases(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity NUMERIC NOT NULL,
  unit_cost NUMERIC NOT NULL,
  line_total NUMERIC NOT NULL
);
ALTER TABLE public.stock_purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to stock_purchase_items" ON public.stock_purchase_items FOR ALL USING (true) WITH CHECK (true);

-- Finance entries (generic ledger)
CREATE TABLE public.finance_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_type public.finance_entry_type NOT NULL,
  source_type public.finance_source_type NOT NULL,
  source_id UUID,
  amount NUMERIC NOT NULL,
  status public.finance_entry_status NOT NULL DEFAULT 'pending',
  payment_date DATE,
  due_date DATE,
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to finance_entries" ON public.finance_entries FOR ALL USING (true) WITH CHECK (true);
