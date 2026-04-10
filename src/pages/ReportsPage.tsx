import { useState, useEffect, useMemo } from 'react';
import { SalesReport, SalesOrderItem, getSalesReport, getSalesOrderItems } from '@/lib/store';
import { downloadCsv, copyCsvToClipboard } from '@/lib/csv';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Download, Copy, TrendingUp, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const paymentLabels: Record<string, string> = {
  cash: 'Dinheiro', credit: 'Crédito', debit: 'Débito', pix: 'PIX',
};

interface TopProduct {
  product_id: string;
  product_name: string;
  qty_sold: number;
  order_count: number;
  revenue: number;
  details: { order_id: string; created_at: string; qty: number; subtotal: number }[];
}

export default function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [sales, setSales] = useState<SalesReport[]>([]);
  const [allItems, setAllItems] = useState<SalesOrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [productSearch, setProductSearch] = useState('');
  const [sortBy, setSortBy] = useState<'qty' | 'revenue'>('qty');
  const [selectedProduct, setSelectedProduct] = useState<TopProduct | null>(null);
  const [expandedSales, setExpandedSales] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await getSalesReport(startDate, endDate);
        setSales(data);
        const orderIds = data.map(s => s.id).filter(Boolean) as string[];
        const items = await getSalesOrderItems(orderIds);
        setAllItems(items);
      } catch (e: any) {
        toast.error('Erro: ' + e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [startDate, endDate]);

  const filteredSales = useMemo(() => {
    let result = sales;
    if (paymentFilter !== 'all') {
      result = result.filter(s => s.payment_method === paymentFilter);
    }
    return result;
  }, [sales, paymentFilter]);

  const filteredOrderIds = new Set(filteredSales.map(s => s.id));
  const filteredItems = allItems.filter(i => filteredOrderIds.has(i.order_id));

  // KPIs
  const totalSold = filteredSales.reduce((s, sale) => s + (sale.total || 0), 0);
  const totalOrders = filteredSales.length;
  const avgTicket = totalOrders > 0 ? totalSold / totalOrders : 0;
  const totalItems = filteredItems.reduce((s, i) => s + i.quantity, 0);

  // By payment method
  const byPayment = filteredSales.reduce<Record<string, number>>((acc, sale) => {
    const method = sale.payment_method || 'cash';
    acc[method] = (acc[method] || 0) + (sale.total || 0);
    return acc;
  }, {});

  // Top products
  const topProducts = useMemo(() => {
    const map = new Map<string, TopProduct>();
    for (const item of filteredItems) {
      let entry = map.get(item.product_id);
      if (!entry) {
        entry = { product_id: item.product_id, product_name: item.product_name, qty_sold: 0, order_count: 0, revenue: 0, details: [] };
        map.set(item.product_id, entry);
      }
      entry.qty_sold += item.quantity;
      entry.revenue += Number(item.subtotal);
      const sale = filteredSales.find(s => s.id === item.order_id);
      entry.details.push({
        order_id: item.order_id,
        created_at: sale?.created_at || item.created_at,
        qty: item.quantity,
        subtotal: Number(item.subtotal),
      });
    }
    for (const entry of map.values()) {
      entry.order_count = new Set(entry.details.map(d => d.order_id)).size;
    }
    let result = Array.from(map.values());
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase();
      result = result.filter(p => p.product_name.toLowerCase().includes(q));
    }
    result.sort((a, b) => sortBy === 'qty' ? b.qty_sold - a.qty_sold : b.revenue - a.revenue);
    return result;
  }, [filteredItems, filteredSales, productSearch, sortBy]);

  function toggleSale(id: string | null) {
    if (!id) return;
    setExpandedSales(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // CSV exports
  function exportSalesCsv() {
    const headers = ['order_id', 'data', 'tipo_venda', 'pagamento', 'total'];
    const rows = filteredSales.map(s => [
      s.id || '', s.created_at ? new Date(s.created_at).toLocaleString('pt-BR') : '', s.sale_type || '', paymentLabels[s.payment_method || ''] || s.payment_method, Number(s.total).toFixed(2),
    ]);
    downloadCsv(`vendas_${startDate}_${endDate}.csv`, headers, rows);
    toast.success('CSV de vendas exportado!');
  }

  function exportItemsCsv() {
    const headers = ['order_id', 'data', 'product_id', 'produto', 'qtd', 'preco_unitario', 'subtotal'];
    const rows = filteredItems.map(i => {
      const sale = filteredSales.find(s => s.id === i.order_id);
      return [i.order_id, sale?.created_at ? new Date(sale.created_at).toLocaleString('pt-BR') : '', i.product_id, i.product_name, i.quantity, Number(i.unit_price).toFixed(2), Number(i.subtotal).toFixed(2)];
    });
    downloadCsv(`itens_vendidos_${startDate}_${endDate}.csv`, headers, rows);
    toast.success('CSV de itens exportado!');
  }

  function copySalesCsv() {
    const headers = ['order_id', 'data', 'tipo_venda', 'pagamento', 'total'];
    const rows = filteredSales.map(s => [
      s.id || '', s.created_at ? new Date(s.created_at).toLocaleString('pt-BR') : '', s.sale_type || '', paymentLabels[s.payment_method || ''] || s.payment_method, Number(s.total).toFixed(2),
    ]);
    copyCsvToClipboard(headers, rows);
    toast.success('Copiado! Cole no Google Sheets.');
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 bg-card p-4 rounded-lg border">
        <div>
          <Label>Data Inicial</Label>
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-12 w-44" />
        </div>
        <div>
          <Label>Data Final</Label>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-12 w-44" />
        </div>
        <div>
          <Label>Pagamento</Label>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="h-12 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="cash">Dinheiro</SelectItem>
              <SelectItem value="pix">PIX</SelectItem>
              <SelectItem value="credit">Crédito</SelectItem>
              <SelectItem value="debit">Débito</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 ml-auto">
          <Button onClick={exportSalesCsv} variant="outline" size="sm" className="gap-1 h-10">
            <Download className="h-4 w-4" /> Vendas CSV
          </Button>
          <Button onClick={exportItemsCsv} variant="outline" size="sm" className="gap-1 h-10">
            <Download className="h-4 w-4" /> Itens CSV
          </Button>
          <Button onClick={copySalesCsv} variant="outline" size="sm" className="gap-1 h-10">
            <Copy className="h-4 w-4" /> Copiar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-card border rounded-lg p-5 text-center">
          <p className="text-muted-foreground text-sm">Total Vendido</p>
          <p className="text-2xl font-bold text-accent mt-1">R$ {totalSold.toFixed(2)}</p>
        </div>
        <div className="bg-card border rounded-lg p-5 text-center">
          <p className="text-muted-foreground text-sm">Nº de Vendas</p>
          <p className="text-2xl font-bold mt-1">{totalOrders}</p>
        </div>
        <div className="bg-card border rounded-lg p-5 text-center">
          <p className="text-muted-foreground text-sm">Ticket Médio</p>
          <p className="text-2xl font-bold text-accent mt-1">R$ {avgTicket.toFixed(2)}</p>
        </div>
        <div className="bg-card border rounded-lg p-5 text-center">
          <p className="text-muted-foreground text-sm">Itens Vendidos</p>
          <p className="text-2xl font-bold mt-1">{totalItems}</p>
        </div>
        <div className="bg-card border rounded-lg p-5 text-center col-span-2 sm:col-span-1">
          <p className="text-muted-foreground text-sm">Formas Pgto</p>
          <div className="mt-1 space-y-0.5">
            {Object.entries(byPayment).map(([method, value]) => (
              <p key={method} className="text-xs">
                <span className="text-muted-foreground">{paymentLabels[method] || method}: </span>
                <span className="font-semibold text-accent">R$ {value.toFixed(2)}</span>
              </p>
            ))}
            {Object.keys(byPayment).length === 0 && <p className="text-xs text-muted-foreground">—</p>}
          </div>
        </div>
      </div>

      {/* Sales list with expandable items */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold">Lista de Vendas</h3>
        </div>
        {loading ? (
          <p className="text-center text-muted-foreground py-12 text-lg">Carregando...</p>
        ) : filteredSales.length === 0 ? (
          <p className="text-center text-muted-foreground py-12 text-lg">Nenhuma venda no período selecionado.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Data / Hora</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSales.map(sale => {
                const isOpen = expandedSales.has(sale.id || '');
                const saleItems = allItems.filter(i => i.order_id === sale.id);
                return (
                  <Collapsible key={sale.id} open={isOpen} onOpenChange={() => toggleSale(sale.id)} asChild>
                    <>
                      <CollapsibleTrigger asChild>
                        <TableRow className="cursor-pointer">
                          <TableCell className="w-10">
                            {isOpen
                              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            }
                          </TableCell>
                          <TableCell className="text-sm">
                            {sale.created_at ? new Date(sale.created_at).toLocaleString('pt-BR') : '—'}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs px-2 py-1 rounded-full bg-primary/20 text-primary">
                              {sale.sale_type === 'presencial' ? 'Presencial' : 'Delivery'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs px-2 py-1 rounded-full bg-accent/20 text-accent">
                              {paymentLabels[sale.payment_method || ''] || sale.payment_method}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-sm">{Number(sale.total_items)}</TableCell>
                          <TableCell className="text-right font-bold text-accent">R$ {Number(sale.total).toFixed(2)}</TableCell>
                        </TableRow>
                      </CollapsibleTrigger>
                      <CollapsibleContent asChild>
                        <tr>
                          <td colSpan={6} className="p-0">
                            <div className="bg-muted/30 px-6 py-3 border-t">
                              <p className="text-xs font-medium text-muted-foreground mb-2">
                                Itens da venda · Pedido {sale.id?.slice(0, 8)}
                              </p>
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-xs text-muted-foreground">
                                    <th className="text-left py-1 font-medium">Produto</th>
                                    <th className="text-right py-1 font-medium">Qtd</th>
                                    <th className="text-right py-1 font-medium">Preço Unit.</th>
                                    <th className="text-right py-1 font-medium">Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {saleItems.map(item => (
                                    <tr key={item.id} className="border-t border-border/50">
                                      <td className="py-1.5">{item.product_name}</td>
                                      <td className="text-right py-1.5">{item.quantity}</td>
                                      <td className="text-right py-1.5">R$ {Number(item.unit_price).toFixed(2)}</td>
                                      <td className="text-right py-1.5 font-medium text-accent">R$ {Number(item.subtotal).toFixed(2)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      </CollapsibleContent>
                    </>
                  </Collapsible>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Products sold in period */}
      <div className="bg-card border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-accent" /> Produtos vendidos no período
          </h3>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Buscar produto..."
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              className="h-9 w-48"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortBy(sortBy === 'qty' ? 'revenue' : 'qty')}
              className="gap-1 h-9"
            >
              {sortBy === 'qty' ? 'Ordenar: Qtd' : 'Ordenar: Receita'}
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground py-6">Carregando...</p>
        ) : topProducts.length === 0 ? (
          <p className="text-center text-muted-foreground py-6">Nenhum dado no período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Qtd Vendida</TableHead>
                <TableHead className="text-right">Nº Vendas</TableHead>
                <TableHead className="text-right">Receita</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topProducts.map((p, idx) => (
                <TableRow
                  key={p.product_id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedProduct(p)}
                >
                  <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="font-medium">{p.product_name}</TableCell>
                  <TableCell className="text-right font-bold">{p.qty_sold}</TableCell>
                  <TableCell className="text-right">{p.order_count}</TableCell>
                  <TableCell className="text-right font-bold text-accent">R$ {p.revenue.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Product detail dialog */}
      <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">{selectedProduct?.product_name}</DialogTitle>
          </DialogHeader>
          {selectedProduct && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-muted rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Qtd Vendida</p>
                  <p className="text-xl font-bold">{selectedProduct.qty_sold}</p>
                </div>
                <div className="bg-muted rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Nº de Vendas</p>
                  <p className="text-xl font-bold">{selectedProduct.order_count}</p>
                </div>
                <div className="bg-muted rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Receita</p>
                  <p className="text-xl font-bold text-accent">R$ {selectedProduct.revenue.toFixed(2)}</p>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Vendas onde aparece:</p>
                {selectedProduct.details.map((d, i) => (
                  <div key={i} className="flex items-center justify-between bg-card rounded p-3 border text-sm">
                    <span className="text-muted-foreground">{new Date(d.created_at).toLocaleString('pt-BR')}</span>
                    <span>{d.qty} un</span>
                    <span className="font-bold text-accent">R$ {d.subtotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
