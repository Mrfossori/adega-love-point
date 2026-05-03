import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, TrendingUp, TrendingDown, Wallet, AlertTriangle, Package, Truck, Banknote, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getLowStockProducts, type Product } from '@/lib/store';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

function fmtMoney(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtDate(d: string | null) {
  return d ? format(new Date(d), 'dd/MM/yyyy') : '—';
}

interface DashboardData {
  salesRevenue: number;
  stockPaid: number;
  expensesPaid: number;
  unpaidPurchases: { id: string; total: number; supplier: string | null; due: string | null }[];
  unpaidExpenses: { id: string; amount: number; description: string; due: string | null; category: string | null }[];
  byCategory: { name: string; total: number }[];
  topSuppliers: { name: string; total: number; count: number }[];
  monthly: { month: string; revenue: number; outflow: number }[];
  recent: { date: string; type: string; description: string; amount: number; direction: 'in' | 'out' }[];
  lowStock: Product[];
}

export default function FinancialDashboard() {
  const [start, setStart] = useState<Date>(startOfMonth(new Date()));
  const [end, setEnd] = useState<Date>(endOfMonth(new Date()));
  const [chartRange, setChartRange] = useState<6 | 12>(6);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [start, end, chartRange]);

  async function load() {
    setLoading(true);
    try {
      const startISO = startOfDay(start).toISOString();
      const endISO = endOfDay(end).toISOString();
      const startDateStr = format(start, 'yyyy-MM-dd');
      const endDateStr = format(end, 'yyyy-MM-dd');

      // Sales revenue (period)
      const { data: sales } = await supabase
        .from('sales_orders')
        .select('id, total, payment_method, created_at')
        .gte('created_at', startISO)
        .lte('created_at', endISO);

      const salesRevenue = (sales || []).reduce((s, x) => s + Number(x.total || 0), 0);

      // Paid stock purchases in period (use payment_recorded_at)
      const { data: paidPurchases } = await supabase
        .from('stock_purchases')
        .select('id, total_amount, payment_recorded_at, supplier_id, payment_method')
        .eq('payment_status', 'paid')
        .gte('payment_recorded_at', startISO)
        .lte('payment_recorded_at', endISO);
      const stockPaid = (paidPurchases || []).reduce((s, x) => s + Number(x.total_amount || 0), 0);

      // Paid expenses in period (use expense_date)
      const { data: paidExpenses } = await supabase
        .from('operational_expenses')
        .select('id, amount, description, expense_date, category_id, payment_method')
        .eq('payment_status', 'paid')
        .gte('expense_date', startDateStr)
        .lte('expense_date', endDateStr);
      const expensesPaid = (paidExpenses || []).reduce((s, x) => s + Number(x.amount || 0), 0);

      // Unpaid purchases (all)
      const { data: unpaidP } = await supabase
        .from('stock_purchases')
        .select('id, total_amount, due_date, supplier_id, suppliers:supplier_id(name)')
        .eq('payment_status', 'unpaid');
      const unpaidPurchases = (unpaidP || []).map((p: any) => ({
        id: p.id, total: Number(p.total_amount || 0),
        supplier: p.suppliers?.name || null, due: p.due_date,
      }));

      // Unpaid expenses (all)
      const { data: unpaidE } = await supabase
        .from('operational_expenses')
        .select('id, amount, description, due_date, category_id, expense_categories:category_id(name)')
        .eq('payment_status', 'unpaid');
      const unpaidExpenses = (unpaidE || []).map((e: any) => ({
        id: e.id, amount: Number(e.amount || 0), description: e.description,
        due: e.due_date, category: e.expense_categories?.name || null,
      }));

      // Expense breakdown by category (paid in period)
      const catMap = new Map<string, number>();
      const { data: cats } = await supabase.from('expense_categories').select('id, name');
      const catNameMap = new Map((cats || []).map(c => [c.id, c.name]));
      for (const e of paidExpenses || []) {
        const name = e.category_id ? (catNameMap.get(e.category_id) || 'Sem categoria') : 'Sem categoria';
        catMap.set(name, (catMap.get(name) || 0) + Number(e.amount || 0));
      }
      const byCategory = Array.from(catMap.entries())
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total);

      // Top suppliers (paid in period)
      const supMap = new Map<string, { total: number; count: number }>();
      const { data: sups } = await supabase.from('suppliers').select('id, name');
      const supNameMap = new Map((sups || []).map(s => [s.id, s.name]));
      for (const p of paidPurchases || []) {
        const name = p.supplier_id ? (supNameMap.get(p.supplier_id) || 'Sem fornecedor') : 'Sem fornecedor';
        const cur = supMap.get(name) || { total: 0, count: 0 };
        cur.total += Number(p.total_amount || 0);
        cur.count += 1;
        supMap.set(name, cur);
      }
      const topSuppliers = Array.from(supMap.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

      // Monthly chart
      const months: { key: string; label: string; from: Date; to: Date }[] = [];
      for (let i = chartRange - 1; i >= 0; i--) {
        const d = subMonths(new Date(), i);
        months.push({
          key: format(d, 'yyyy-MM'),
          label: format(d, 'MMM/yy', { locale: ptBR }),
          from: startOfMonth(d),
          to: endOfMonth(d),
        });
      }
      const earliest = months[0].from;
      const latest = months[months.length - 1].to;

      const [allSalesRes, allPurchPaidRes, allExpPaidRes] = await Promise.all([
        supabase.from('sales_orders').select('total, created_at')
          .gte('created_at', earliest.toISOString()).lte('created_at', latest.toISOString()),
        supabase.from('stock_purchases').select('total_amount, payment_recorded_at')
          .eq('payment_status', 'paid')
          .gte('payment_recorded_at', earliest.toISOString()).lte('payment_recorded_at', latest.toISOString()),
        supabase.from('operational_expenses').select('amount, expense_date')
          .eq('payment_status', 'paid')
          .gte('expense_date', format(earliest, 'yyyy-MM-dd')).lte('expense_date', format(latest, 'yyyy-MM-dd')),
      ]);

      const monthly = months.map(m => {
        const revenue = (allSalesRes.data || [])
          .filter(s => s.created_at >= m.from.toISOString() && s.created_at <= m.to.toISOString())
          .reduce((sum, s) => sum + Number(s.total || 0), 0);
        const purch = (allPurchPaidRes.data || [])
          .filter((p: any) => p.payment_recorded_at >= m.from.toISOString() && p.payment_recorded_at <= m.to.toISOString())
          .reduce((sum: number, p: any) => sum + Number(p.total_amount || 0), 0);
        const exp = (allExpPaidRes.data || [])
          .filter((e: any) => e.expense_date >= format(m.from, 'yyyy-MM-dd') && e.expense_date <= format(m.to, 'yyyy-MM-dd'))
          .reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
        return { month: m.label, revenue, outflow: purch + exp };
      });

      // Recent activity
      const recent: DashboardData['recent'] = [];
      for (const p of (paidPurchases || []).slice(0, 5)) {
        recent.push({
          date: p.payment_recorded_at!,
          type: 'Compra paga',
          description: p.supplier_id ? (supNameMap.get(p.supplier_id) || 'Fornecedor') : 'Compra',
          amount: Number(p.total_amount || 0),
          direction: 'out',
        });
      }
      for (const e of (paidExpenses || []).slice(0, 5)) {
        recent.push({
          date: e.expense_date,
          type: 'Despesa paga',
          description: e.description,
          amount: Number(e.amount || 0),
          direction: 'out',
        });
      }
      for (const s of (sales || []).slice(0, 5)) {
        recent.push({
          date: s.created_at,
          type: 'Venda',
          description: `Venda #${s.id.slice(0, 8)}`,
          amount: Number(s.total || 0),
          direction: 'in',
        });
      }
      recent.sort((a, b) => b.date.localeCompare(a.date));

      // Low stock
      const lowStock = await getLowStockProducts();

      setData({
        salesRevenue, stockPaid, expensesPaid,
        unpaidPurchases, unpaidExpenses, byCategory, topSuppliers,
        monthly, recent: recent.slice(0, 10), lowStock,
      });
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const kpis = useMemo(() => {
    if (!data) return null;
    const net = data.salesRevenue - data.stockPaid - data.expensesPaid;
    const totalUnpaid =
      data.unpaidPurchases.reduce((s, x) => s + x.total, 0) +
      data.unpaidExpenses.reduce((s, x) => s + x.amount, 0);
    const today = startOfDay(new Date());
    const overdue =
      data.unpaidPurchases.filter(p => p.due && isAfter(today, new Date(p.due))).reduce((s, x) => s + x.total, 0) +
      data.unpaidExpenses.filter(e => e.due && isAfter(today, new Date(e.due))).reduce((s, x) => s + x.amount, 0);
    return { net, totalUnpaid, overdue };
  }, [data]);

  function setQuick(preset: 'this_month' | 'last_30' | 'last_month' | 'ytd') {
    const now = new Date();
    if (preset === 'this_month') { setStart(startOfMonth(now)); setEnd(endOfMonth(now)); }
    if (preset === 'last_30') { const s = new Date(); s.setDate(s.getDate() - 30); setStart(s); setEnd(now); }
    if (preset === 'last_month') { const lm = subMonths(now, 1); setStart(startOfMonth(lm)); setEnd(endOfMonth(lm)); }
    if (preset === 'ytd') { setStart(new Date(now.getFullYear(), 0, 1)); setEnd(now); }
  }

  return (
    <div className="space-y-4">
      {/* Date filter */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Data inicial</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[170px] justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(start, 'dd/MM/yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={start} onSelect={(d) => d && setStart(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Data final</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[170px] justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(end, 'dd/MM/yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={end} onSelect={(d) => d && setEnd(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setQuick('this_month')}>Este mês</Button>
            <Button variant="secondary" size="sm" onClick={() => setQuick('last_month')}>Mês passado</Button>
            <Button variant="secondary" size="sm" onClick={() => setQuick('last_30')}>Últimos 30 dias</Button>
            <Button variant="secondary" size="sm" onClick={() => setQuick('ytd')}>Ano</Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="Receita de Vendas" value={fmtMoney(data?.salesRevenue || 0)} icon={<ArrowUpCircle className="h-4 w-4 text-success" />} />
        <KpiCard label="Compras Pagas" value={fmtMoney(data?.stockPaid || 0)} icon={<Truck className="h-4 w-4 text-muted-foreground" />} />
        <KpiCard label="Despesas Pagas" value={fmtMoney(data?.expensesPaid || 0)} icon={<Banknote className="h-4 w-4 text-muted-foreground" />} />
        <KpiCard
          label="Resultado Líquido"
          value={fmtMoney(kpis?.net || 0)}
          icon={(kpis?.net || 0) >= 0 ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
          valueClass={(kpis?.net || 0) >= 0 ? 'text-success' : 'text-destructive'}
        />
        <KpiCard
          label="A Pagar (total)"
          value={fmtMoney(kpis?.totalUnpaid || 0)}
          icon={<Wallet className="h-4 w-4 text-warning" />}
          subtitle={kpis?.overdue ? `Vencido: ${fmtMoney(kpis.overdue)}` : undefined}
          subtitleClass="text-destructive"
        />
      </div>

      {/* Monthly chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Receita vs Saídas (mensal)</CardTitle>
          <div className="flex gap-1">
            <Button size="sm" variant={chartRange === 6 ? 'default' : 'outline'} onClick={() => setChartRange(6)}>6 meses</Button>
            <Button size="sm" variant={chartRange === 12 ? 'default' : 'outline'} onClick={() => setChartRange(12)}>12 meses</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer>
              <BarChart data={data?.monthly || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                <Legend />
                <Bar dataKey="revenue" name="Receita" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="outflow" name="Saídas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Breakdown + Top Suppliers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Despesas por Categoria</CardTitle></CardHeader>
          <CardContent>
            {!data?.byCategory.length ? (
              <p className="text-sm text-muted-foreground">Sem despesas pagas no período.</p>
            ) : (
              <div className="space-y-2">
                {data.byCategory.map(c => {
                  const max = data.byCategory[0].total || 1;
                  return (
                    <div key={c.name}>
                      <div className="flex justify-between text-sm">
                        <span>{c.name}</span>
                        <span className="font-medium">{fmtMoney(c.total)}</span>
                      </div>
                      <div className="h-2 bg-muted rounded">
                        <div className="h-full bg-primary rounded" style={{ width: `${(c.total / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Top Fornecedores</CardTitle></CardHeader>
          <CardContent>
            {!data?.topSuppliers.length ? (
              <p className="text-sm text-muted-foreground">Sem compras pagas no período.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr><th className="text-left font-normal pb-2">Fornecedor</th><th className="text-right font-normal pb-2">Compras</th><th className="text-right font-normal pb-2">Total</th></tr>
                </thead>
                <tbody>
                  {data.topSuppliers.map(s => (
                    <tr key={s.name} className="border-t">
                      <td className="py-2">{s.name}</td>
                      <td className="text-right">{s.count}</td>
                      <td className="text-right font-medium">{fmtMoney(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Attention */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" /> Atenção
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <AttentionList
              title="Compras não pagas"
              empty="Nenhuma"
              items={(data?.unpaidPurchases || []).slice(0, 6).map(p => ({
                primary: p.supplier || 'Sem fornecedor',
                secondary: `Venc: ${fmtDate(p.due)}`,
                value: fmtMoney(p.total),
                overdue: !!(p.due && isAfter(startOfDay(new Date()), new Date(p.due))),
              }))}
            />
            <AttentionList
              title="Despesas não pagas"
              empty="Nenhuma"
              items={(data?.unpaidExpenses || []).slice(0, 6).map(e => ({
                primary: e.description,
                secondary: `${e.category || 'Sem categoria'} • Venc: ${fmtDate(e.due)}`,
                value: fmtMoney(e.amount),
                overdue: !!(e.due && isAfter(startOfDay(new Date()), new Date(e.due))),
              }))}
            />
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2"><Package className="h-4 w-4" /> Estoque baixo</h4>
              {!data?.lowStock.length ? (
                <p className="text-sm text-muted-foreground">Tudo certo.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {data.lowStock.slice(0, 6).map(p => (
                    <li key={p.id} className="flex justify-between">
                      <span className="truncate pr-2">{p.name}</span>
                      <Badge variant="outline" className="border-warning text-warning">{p.stock}/{p.min_stock}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card>
        <CardHeader><CardTitle className="text-base">Atividade Recente</CardTitle></CardHeader>
        <CardContent>
          {!data?.recent.length ? (
            <p className="text-sm text-muted-foreground">Sem atividade recente no período.</p>
          ) : (
            <ul className="divide-y">
              {data.recent.map((r, i) => (
                <li key={i} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    {r.direction === 'in'
                      ? <ArrowUpCircle className="h-4 w-4 text-success shrink-0" />
                      : <ArrowDownCircle className="h-4 w-4 text-destructive shrink-0" />}
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.description}</div>
                      <div className="text-xs text-muted-foreground">{r.type} • {fmtDate(r.date)}</div>
                    </div>
                  </div>
                  <span className={cn('font-medium', r.direction === 'in' ? 'text-success' : 'text-destructive')}>
                    {r.direction === 'in' ? '+' : '-'}{fmtMoney(r.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {loading && <p className="text-xs text-muted-foreground text-center">Carregando…</p>}
    </div>
  );
}

function KpiCard({ label, value, icon, subtitle, valueClass, subtitleClass }: {
  label: string; value: string; icon?: React.ReactNode; subtitle?: string; valueClass?: string; subtitleClass?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          {icon}
        </div>
        <div className={cn("text-2xl font-bold mt-2", valueClass)}>{value}</div>
        {subtitle && <div className={cn("text-xs mt-1", subtitleClass)}>{subtitle}</div>}
      </CardContent>
    </Card>
  );
}

function AttentionList({ title, empty, items }: {
  title: string; empty: string;
  items: { primary: string; secondary: string; value: string; overdue: boolean }[];
}) {
  return (
    <div>
      <h4 className="text-sm font-medium mb-2">{title}</h4>
      {!items.length ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {items.map((it, i) => (
            <li key={i} className="flex justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate">{it.primary}</div>
                <div className={cn("text-xs", it.overdue ? "text-destructive" : "text-muted-foreground")}>
                  {it.secondary}{it.overdue ? ' • Vencido' : ''}
                </div>
              </div>
              <span className="font-medium shrink-0">{it.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
