
-- Add combo columns to products
ALTER TABLE public.products ADD COLUMN is_combo boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN track_stock boolean NOT NULL DEFAULT true;

-- Create product_components table
CREATE TABLE public.product_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  component_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  component_qty numeric NOT NULL CHECK (component_qty > 0),
  UNIQUE(combo_product_id, component_product_id)
);

ALTER TABLE public.product_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to product_components"
  ON public.product_components FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
