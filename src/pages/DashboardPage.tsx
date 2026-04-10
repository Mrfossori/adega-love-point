import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getProductsWithStock, Product } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DollarSign, ShoppingCart, TrendingUp, Star, AlertTriangle, CreditCard } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const paymentLabels: Record<string, string> = {
  cash: 'Dinheiro', credit: 'Crédito', debit: 'Débito', pix: 'PIX',
};

interface MonthlySales {
  month: string;
  label: string;
  revenue: number;
}

export default function DashboardPage() {
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [monthRevenue, setMonthRevenue] = useState(0);
  const [monthSalesCount, setMonthSalesCount] = useState(0);
  const [bestProduct, setBestProduct] = useState('—');
  const [topProducts, setTopProducts] = useState<{ name: string; qty: number; revenue: number }[]>([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState<{ method: string; count: number; total: number }[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlySales[]>([]);
  const [monthRange, setMonthRange] = useState<6 | 12>(6);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    try {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

      // Today's revenue
      const { data: todaySales } = await supabase
        .from('sales_orders')
        .select('total')
        .gte('created_at', `${todayStr}T00:00:00`)
        .lte('created_at', `${todayStr}T23:59:59`);
      setTodayRevenue((todaySales || []).reduce((s, r) => s + Number(r.total), 0));

      // Month revenue & count
      const { data: monthSales } = await supabase
        .from('sales_orders')
        .select('total, payment_method')
        .gte('created_at', `${monthStart}T00:00:00`);
      const ms = monthSales || [];
      setMonthRevenue(ms.reduce((s, r) => s + Number(r.total), 0));
      setMonthSalesCount(ms.length);

      // Payment breakdown (current month)
      const pmMap = new Map<string, { count: number; total: number }>();
      for (const sale of ms) {
        const m = sale.payment_method || 'cash';
        const entry = pmMap.get(m) || { count: 0, total: 0 };
        entry.count++;
        entry.total += Number(sale.total);
        pmMap.set(m, entry);
      }
      setPaymentBreakdown(
        Array.from(pmMap.entries())
          .map(([method, v]) => ({ method, ...v }))
          .sort((a, b) => b.total - a.total)
      );

      // Top 5 products (current month)
      const { data: monthItems } = await supabase
        .from('sales_order_items')
        .select('product_name, quantity, subtotal, order_id')
        .in('order_id', ms.length > 0
          ? (await supabase.from('sales_orders').select('id').gte('created_at', `${monthStart}T00:00:00`)).data?.map(o => o.id) || []
          : ['__none__']
        );
      const prodMap = new Map<string, { name: string; qty: number; revenue: number }>();
      for (const item of monthItems || []) {
        const entry = prodMap.get(item.product_name) || { name: item.product_name, qty: 0, revenue: 0 };
        entry.qty += item.quantity;
        entry.revenue += Number(item.subtotal);
        prodMap.set(item.product_name, entry);
      }
      const sorted = Array.from(prodMap.values()).sort((a, b) => b.qty - a.qty);
      setTopProducts(sorted.slice(0, 5));
      setBestProduct(sorted.length > 0 ? sorted[0].name : '—');

      // Low stock
      const products = await getProductsWithStock();
      setLowStockProducts(products.filter(p => p.is_active && p.track_stock && p.stock <= p.min_stock));

      // Monthly revenue (last 12 months)
      const months: MonthlySales[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
        const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        months.push({ month: start, label, revenue: 0 });
      }
      // Fetch all sales from last 12 months in one query
      const oldestMonth = months[0].month;
      const { data: allSales } = await supabase
        .from('sales_orders')
        .select('total, created_at')
        .gte('created_at', `${oldestMonth}T00:00:00`);
      for (const sale of allSales || []) {
        const saleDate = new Date(sale.created_at);
        const key = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}-01`;
        const entry = months.find(m => m.month === key);
        if (entry) entry.revenue += Number(sale.total);
      }
      setMonthlyData(months);
    } catch (e: any) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
    }
  }

  const chartData = useMemo(() => {
    return monthRange === 6 ? monthlyData.slice(-6) : monthlyData;
  }, [monthlyData, monthRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-lg">Carregando dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Receita Hoje</p>
                <p className="text-2xl font-bold">R$ {todayRevenue.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/10">
                <TrendingUp className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Receita do Mês</p>
                <p className="text-2xl font-bold">R$ {monthRevenue.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <ShoppingCart className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Vendas no Mês</p>
                <p className="text-2xl font-bold">{monthSalesCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/10">
                <Star className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Mais Vendido</p>
                <p className="text-lg font-bold truncate max-w-[180px]" title={bestProduct}>{bestProduct}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Revenue Chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Receita Mensal</CardTitle>
            <div className="flex gap-1">
              <Button
                variant={monthRange === 6 ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMonthRange(6)}
              >
                6 meses
              </Button>
              <Button
                variant={monthRange === 12 ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMonthRange(12)}
              >
                12 meses
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {chartData.every(d => d.revenue === 0) ? (
            <p className="text-center text-muted-foreground py-12">Sem dados de vendas no período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `R$${v}`} />
                <Tooltip
                  formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Receita']}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Highlights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top 5 Products */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Top 5 Produtos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Sem vendas no mês.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Produto</TableHead>
                    <TableHead className="text-xs text-right">Qtd</TableHead>
                    <TableHead className="text-xs text-right">Receita</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topProducts.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm font-medium truncate max-w-[140px]" title={p.name}>{p.name}</TableCell>
                      <TableCell className="text-sm text-right">{p.qty}</TableCell>
                      <TableCell className="text-sm text-right font-semibold">R$ {p.revenue.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" /> Formas de Pagamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            {paymentBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Sem vendas no mês.</p>
            ) : (
              <div className="space-y-3">
                {paymentBreakdown.map(pm => (
                  <div key={pm.method} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{paymentLabels[pm.method] || pm.method}</p>
                      <p className="text-xs text-muted-foreground">{pm.count} vendas</p>
                    </div>
                    <p className="text-sm font-bold">R$ {pm.total.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Low Stock */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Estoque Baixo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lowStockProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Todos os estoques OK.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Produto</TableHead>
                    <TableHead className="text-xs text-right">Atual</TableHead>
                    <TableHead className="text-xs text-right">Mínimo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockProducts.slice(0, 8).map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm truncate max-w-[140px]" title={p.name}>{p.name}</TableCell>
                      <TableCell className="text-sm text-right font-bold text-destructive">{p.stock}</TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground">{p.min_stock}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
