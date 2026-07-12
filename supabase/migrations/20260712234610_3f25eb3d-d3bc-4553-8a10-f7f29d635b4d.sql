
-- Fix: restrict RLS policies to authenticated users only (no more anon/public write access)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'expense_categories','finance_entries','inventory_movements','operational_expenses',
    'product_components','products','sales_order_items','sales_orders',
    'stock_purchase_items','stock_purchases','stock_snapshot','suppliers'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow all access to '||t, t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format($f$CREATE POLICY "Authenticated users can select %1$s" ON public.%1$I FOR SELECT TO authenticated USING (true)$f$, t);
    EXECUTE format($f$CREATE POLICY "Authenticated users can insert %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL)$f$, t);
    EXECUTE format($f$CREATE POLICY "Authenticated users can update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)$f$, t);
    EXECUTE format($f$CREATE POLICY "Authenticated users can delete %1$s" ON public.%1$I FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL)$f$, t);
  END LOOP;
END $$;

-- Fix: revoke EXECUTE on SECURITY DEFINER functions (they run only via triggers)
REVOKE ALL ON FUNCTION public.update_stock_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_stock_snapshot_for_product() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
