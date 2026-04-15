
-- Create expense_categories table
CREATE TABLE public.expense_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to expense_categories"
ON public.expense_categories FOR ALL
USING (true) WITH CHECK (true);

-- Preload categories
INSERT INTO public.expense_categories (name) VALUES
  ('Aluguel'), ('Energia'), ('Internet'), ('Embalagens'), ('Limpeza'),
  ('Manutenção'), ('Marketing'), ('Taxas'), ('Frete'), ('Outros');

-- Create operational_expenses table
CREATE TABLE public.operational_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  payment_method TEXT,
  supplier_name TEXT,
  notes TEXT,
  finance_entry_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to operational_expenses"
ON public.operational_expenses FOR ALL
USING (true) WITH CHECK (true);
