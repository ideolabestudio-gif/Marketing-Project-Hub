-- Métricas de tienda online (p. ej. el informe de Ingresos de WooCommerce, una fila por día).
-- Solo se registran o importan; ninguna se calcula a partir de otras (por eso no hay «ticket medio»).
INSERT INTO metric_definitions (key, kind, label, unit, description, source_note, default_aggregation, position) VALUES
  ('shop.orders', 'shop', 'Pedidos', 'count', 'Pedidos recibidos en el periodo.', 'En WooCommerce: «Cantidad de pedidos» (Analíticas › Ingresos).', 'sum', 10),
  ('shop.items_sold', 'shop', 'Artículos vendidos', 'count', 'Unidades vendidas en el periodo.', 'En WooCommerce: «Número de artículos vendidos».', 'sum', 20),
  ('shop.gross_sales', 'shop', 'Ventas brutas', 'currency', 'Ventas antes de descuentos y reembolsos.', 'En WooCommerce: «Cantidad de ventas bruto». Comprueba si tu tienda incluye impuestos.', 'sum', 30),
  ('shop.net_sales', 'shop', 'Ventas netas', 'currency', 'Ventas después de descuentos y reembolsos, sin impuestos ni envíos.', 'En WooCommerce: «Cantidad de ventas netas». Un día puede ser negativo si hubo devoluciones.', 'sum', 40),
  ('shop.coupons', 'shop', 'Descuentos con cupón', 'currency', 'Importe descontado con cupones.', 'En WooCommerce: «Importe del cupón».', 'sum', 50),
  ('shop.refunds', 'shop', 'Reembolsos', 'currency', 'Importe devuelto a clientes.', 'En WooCommerce: «Cantidad reembolsada».', 'sum', 60),
  ('shop.shipping', 'shop', 'Envíos cobrados', 'currency', 'Importe cobrado por envíos.', 'En WooCommerce: «Cantidad de envíos» (es un importe, no un número de envíos).', 'sum', 70);
