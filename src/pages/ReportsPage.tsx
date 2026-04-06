import { useState, useMemo } from 'react';
import { getSales } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BarChart3, Banknote, CreditCard, Smartphone } from 'lucide-react';

const paymentLabels: Record<string, string> = {
  cash: 'Dinheiro', credit: 'Crédito', debit: 'Débito', pix: 'PIX',
};

export default function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  const sales = useMemo(() => {
    return getSales().filter(s => {
      const d = s.created_at.slice(0, 10);
      return d >= startDate && d <= endDate;
    });
  }, [startDate, endDate]);

  const totalSold = sales.reduce((s, sale) => s + sale.total, 0);
  const totalItems = sales.reduce((s, sale) => s + sale.items.reduce((a, i) => a + i.quantity, 0), 0);

  const byPayment = sales.reduce<Record<string, number>>((acc, sale) => {
    acc[sale.payment_method] = (acc[sale.payment_method] || 0) + sale.total;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4 bg-card p-4 rounded-lg border">
        <div>
          <Label>Data Inicial</Label>
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-12 w-44" />
        </div>
        <div>
          <Label>Data Final</Label>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-12 w-44" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border rounded-lg p-6 text-center">
          <p className="text-muted-foreground text-sm">Total Vendido</p>
          <p className="text-3xl font-bold text-accent mt-1">R$ {totalSold.toFixed(2)}</p>
        </div>
        <div className="bg-card border rounded-lg p-6 text-center">
          <p className="text-muted-foreground text-sm">Nº de Vendas</p>
          <p className="text-3xl font-bold mt-1">{sales.length}</p>
        </div>
        <div className="bg-card border rounded-lg p-6 text-center">
          <p className="text-muted-foreground text-sm">Itens Vendidos</p>
          <p className="text-3xl font-bold mt-1">{totalItems}</p>
        </div>
      </div>

      {/* By payment method */}
      {Object.keys(byPayment).length > 0 && (
        <div className="bg-card border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3">Por Forma de Pagamento</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(byPayment).map(([method, value]) => (
              <div key={method} className="bg-muted rounded-lg p-4 text-center">
                <p className="text-sm text-muted-foreground">{paymentLabels[method] || method}</p>
                <p className="text-xl font-bold text-accent">R$ {value.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sales list */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Lista de Vendas</h3>
        {sales.length === 0 ? (
          <p className="text-center text-muted-foreground py-12 text-lg">Nenhuma venda no período selecionado.</p>
        ) : sales.sort((a, b) => b.created_at.localeCompare(a.created_at)).map(sale => (
          <div key={sale.id} className="bg-card border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {new Date(sale.created_at).toLocaleString('pt-BR')}
                </span>
                <span className="text-xs px-2 py-1 rounded-full bg-primary/20 text-primary">
                  {sale.sale_type === 'presencial' ? 'Presencial' : 'Delivery'}
                </span>
                <span className="text-xs px-2 py-1 rounded-full bg-accent/20 text-accent">
                  {paymentLabels[sale.payment_method]}
                </span>
              </div>
              <span className="text-xl font-bold text-accent">R$ {sale.total.toFixed(2)}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {sale.items.map((item, i) => (
                <span key={i}>{item.quantity}x {item.product_name}{i < sale.items.length - 1 ? ' · ' : ''}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
