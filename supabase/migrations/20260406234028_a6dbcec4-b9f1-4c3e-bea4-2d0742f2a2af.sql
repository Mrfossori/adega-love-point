
DROP VIEW IF EXISTS public.v_sales_report;
CREATE OR REPLACE VIEW public.v_sales_report WITH (security_invoker = on) AS
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
