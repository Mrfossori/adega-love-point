import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Textarea } from '@/components/ui/textarea';
import ProductSearchSelect from '@/components/ProductSearchSelect';
import { cn } from '@/lib/utils';
import { format, isAfter, isBefore, addDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, Plus, Trash2, Search, Package, Eye, CheckCircle, Banknote, Truck, Construction, Pencil, AlertTriangle, Clock, FileText, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getProductsWithStock, addInventoryMovement, type Product } from '@/lib/store';
import FinancialDashboard from '@/components/FinancialDashboard';

// ---------- shared types ----------
interface ExpenseCategory { id: string; name: string; }
interface OperationalExpense {
  id: string; category_id: string | null; description: string; amount: number;
  expense_date: string; due_date: string | null; payment_status: string;
  payment_method: string | null; supplier_name: string | null; notes: string | null;
  finance_entry_id: string | null; created_at: string; category_name?: string;
}

// ---------- types ----------
interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  tax_id: string | null;
  notes: string | null;
  created_at: string;
}

interface PurchaseItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
}

interface StockPurchase {
  id: string;
  supplier_id: string | null;
  purchase_date: string;
  expected_receipt_date: string | null;
  due_date: string | null;
  stock_status: string;
  payment_status: string;
  payment_method: string | null;
  notes: string | null;
  total_amount: number;
  stock_received_at: string | null;
  payment_recorded_at: string | null;
  created_at: string;
  supplier_name?: string;
  items?: PurchaseItemRow[];
}

interface PurchaseItemRow {
  id: string;
  stock_purchase_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
}

// ---------- helpers ----------
function stockStatusBadge(s: string) {
  switch (s) {
    case 'pending_receipt': return <Badge variant="outline" className="border-warning text-warning">Aguardando</Badge>;
    case 'received': return <Badge className="bg-success text-success-foreground">Recebido</Badge>;
    case 'cancelled': return <Badge variant="destructive">Cancelado</Badge>;
    default: return <Badge variant="outline">{s}</Badge>;
  }
}
function payStatusBadge(s: string) {
  switch (s) {
    case 'unpaid': return <Badge variant="outline" className="border-destructive text-destructive">Não Pago</Badge>;
    case 'paid': return <Badge className="bg-success text-success-foreground">Pago</Badge>;
    case 'cancelled': return <Badge variant="destructive">Cancelado</Badge>;
    default: return <Badge variant="outline">{s}</Badge>;
  }
}
function fmtMoney(v: number) { return `R$ ${Number(v).toFixed(2)}`; }
function fmtDate(d: string | null) { return d ? format(new Date(d), 'dd/MM/yyyy') : '—'; }

// ---------- main ----------
export default function FinancePage() {
  const [financeTab, setFinanceTab] = useState('purchases');

  return (
    <div className="space-y-4">
      <Tabs value={financeTab} onValueChange={setFinanceTab}>
        <TabsList className="h-12">
          <TabsTrigger value="purchases" className="text-base px-6 h-10 gap-2">
            <Truck className="h-4 w-4" /> Compras
          </TabsTrigger>
          <TabsTrigger value="expenses" className="text-base px-6 h-10 gap-2">
            <Banknote className="h-4 w-4" /> Despesas
          </TabsTrigger>
          <TabsTrigger value="payables" className="text-base px-6 h-10 gap-2">
            <CalendarIcon className="h-4 w-4" /> Contas a Pagar
          </TabsTrigger>
          <TabsTrigger value="fin_dashboard" className="text-base px-6 h-10 gap-2">
            <Construction className="h-4 w-4" /> Painel Financeiro
          </TabsTrigger>
        </TabsList>

        <TabsContent value="purchases"><PurchasesTab /></TabsContent>
        <TabsContent value="expenses"><ExpensesTab /></TabsContent>
        <TabsContent value="payables"><AccountsPayableTab /></TabsContent>
        <TabsContent value="fin_dashboard">
          <FinancialDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ===================== PURCHASES TAB =====================
function PurchasesTab() {
  const [purchases, setPurchases] = useState<StockPurchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPayment, setFilterPayment] = useState<string>('all');
  const [filterSupplier, setFilterSupplier] = useState<string>('all');
  const [filterStart, setFilterStart] = useState<Date | undefined>();
  const [filterEnd, setFilterEnd] = useState<Date | undefined>();

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [detailPurchase, setDetailPurchase] = useState<StockPurchase | null>(null);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [{ data: pData }, { data: sData }, prods] = await Promise.all([
        supabase.from('stock_purchases').select('*').order('created_at', { ascending: false }),
        supabase.from('suppliers').select('*').order('name'),
        getProductsWithStock(),
      ]);
      const supplierMap = new Map((sData || []).map((s: any) => [s.id, s.name]));
      setPurchases((pData || []).map((p: any) => ({ ...p, supplier_name: supplierMap.get(p.supplier_id) || 'Sem fornecedor' })));
      setSuppliers(sData || []);
      setProducts(prods.filter(p => p.is_active));
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = purchases.filter(p => {
    if (filterStatus !== 'all' && p.stock_status !== filterStatus) return false;
    if (filterPayment !== 'all' && p.payment_status !== filterPayment) return false;
    if (filterSupplier !== 'all' && p.supplier_id !== filterSupplier) return false;
    if (filterStart && new Date(p.purchase_date) < filterStart) return false;
    if (filterEnd && new Date(p.purchase_date) > filterEnd) return false;
    return true;
  });

  if (loading) return <p className="text-center text-muted-foreground py-12 text-lg">Carregando...</p>;

  return (
    <div className="space-y-4 mt-4">
      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        <Button onClick={() => setCreateOpen(true)} size="lg" className="h-14 px-6 text-lg gap-2">
          <Plus className="h-5 w-5" /> Nova Compra
        </Button>
        <Button onClick={() => setSupplierDialogOpen(true)} variant="secondary" size="lg" className="h-14 px-6 text-lg gap-2">
          <Plus className="h-5 w-5" /> Novo Fornecedor
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-end">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Status Estoque</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px] h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending_receipt">Aguardando</SelectItem>
              <SelectItem value="received">Recebido</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Pagamento</Label>
          <Select value={filterPayment} onValueChange={setFilterPayment}>
            <SelectTrigger className="w-[140px] h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="unpaid">Não Pago</SelectItem>
              <SelectItem value="paid">Pago</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Fornecedor</Label>
          <Select value={filterSupplier} onValueChange={setFilterSupplier}>
            <SelectTrigger className="w-[180px] h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Data Início</Label>
          <DatePicker date={filterStart} onSelect={setFilterStart} placeholder="Início" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Data Fim</Label>
          <DatePicker date={filterEnd} onSelect={setFilterEnd} placeholder="Fim" />
        </div>
        {(filterStatus !== 'all' || filterPayment !== 'all' || filterSupplier !== 'all' || filterStart || filterEnd) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterStatus('all'); setFilterPayment('all'); setFilterSupplier('all'); setFilterStart(undefined); setFilterEnd(undefined); }}>
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Purchases list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12 text-lg">Nenhuma compra encontrada.</p>
        ) : filtered.map(p => (
          <div key={p.id} className="bg-card rounded-lg border p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="space-y-1">
                <p className="text-sm font-medium">{p.supplier_name}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(p.purchase_date)} • {p.id.slice(0, 8)}
                  {p.due_date && ` • Venc: ${fmtDate(p.due_date)}`}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {stockStatusBadge(p.stock_status)}
                {payStatusBadge(p.payment_status)}
                <span className="text-lg font-bold">{fmtMoney(p.total_amount)}</span>
                <Button variant="ghost" size="icon" onClick={() => setDetailPurchase(p)}>
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create purchase dialog */}
      <CreatePurchaseDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        suppliers={suppliers}
        products={products}
        onCreated={refresh}
        onNewSupplier={() => setSupplierDialogOpen(true)}
      />

      {/* Purchase detail dialog */}
      {detailPurchase && (
        <PurchaseDetailDialog
          purchase={detailPurchase}
          products={products}
          onClose={() => setDetailPurchase(null)}
          onUpdated={refresh}
        />
      )}

      {/* Supplier dialog */}
      <SupplierDialog
        open={supplierDialogOpen}
        onClose={() => setSupplierDialogOpen(false)}
        onCreated={refresh}
      />
    </div>
  );
}

// ===================== DATE PICKER =====================
function DatePicker({ date, onSelect, placeholder }: { date: Date | undefined; onSelect: (d: Date | undefined) => void; placeholder: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("w-[140px] h-10 justify-start text-left font-normal", !date && "text-muted-foreground")}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, 'dd/MM/yy') : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date} onSelect={onSelect} className={cn("p-3 pointer-events-auto")} />
      </PopoverContent>
    </Popover>
  );
}

// ===================== SUPPLIER DIALOG =====================
function SupplierDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [taxId, setTaxId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) { toast.error('Nome obrigatório'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('suppliers').insert({ name: name.trim(), phone: phone || null, tax_id: taxId || null, notes: notes || null });
      if (error) throw error;
      toast.success('Fornecedor criado!');
      setName(''); setPhone(''); setTaxId(''); setNotes('');
      onClose();
      onCreated();
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="text-xl">Novo Fornecedor</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Nome *</Label><Input value={name} onChange={e => setName(e.target.value)} className="h-12 text-lg" /></div>
          <div><Label>Telefone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} className="h-12" /></div>
          <div><Label>CNPJ/CPF</Label><Input value={taxId} onChange={e => setTaxId(e.target.value)} className="h-12" /></div>
          <div><Label>Observações</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} /></div>
          <Button onClick={handleSave} disabled={saving} className="w-full h-14 text-lg">{saving ? 'Salvando...' : 'Salvar Fornecedor'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===================== CREATE PURCHASE =====================
function CreatePurchaseDialog({ open, onClose, suppliers, products, onCreated, onNewSupplier }: {
  open: boolean; onClose: () => void; suppliers: Supplier[]; products: Product[];
  onCreated: () => void; onNewSupplier: () => void;
}) {
  const [supplierId, setSupplierId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState<Date>(new Date());
  const [expectedDate, setExpectedDate] = useState<Date | undefined>();
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [saving, setSaving] = useState(false);

  // temp item
  const [tempProductId, setTempProductId] = useState('');
  const [tempQty, setTempQty] = useState('');
  const [tempCost, setTempCost] = useState('');

  function addItem() {
    if (!tempProductId || !tempQty || !tempCost) { toast.error('Preencha produto, qtd e custo'); return; }
    const prod = products.find(p => p.id === tempProductId);
    if (!prod) return;
    const qty = Number(tempQty);
    const cost = Number(tempCost);
    setItems(prev => [...prev, { product_id: prod.id, product_name: prod.name, quantity: qty, unit_cost: cost, line_total: qty * cost }]);
    setTempProductId(''); setTempQty(''); setTempCost('');
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  const total = items.reduce((s, i) => s + i.line_total, 0);

  async function handleSave() {
    if (!supplierId) { toast.error('Selecione um fornecedor'); return; }
    if (items.length === 0) { toast.error('Adicione pelo menos um item'); return; }
    setSaving(true);
    try {
      const { data: purchase, error: pErr } = await supabase.from('stock_purchases').insert({
        supplier_id: supplierId,
        purchase_date: format(purchaseDate, 'yyyy-MM-dd'),
        expected_receipt_date: expectedDate ? format(expectedDate, 'yyyy-MM-dd') : null,
        due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
        notes: notes || null,
        total_amount: total,
        stock_status: 'pending_receipt' as any,
        payment_status: 'unpaid' as any,
      }).select().single();
      if (pErr) throw pErr;

      const itemRows = items.map(i => ({
        stock_purchase_id: purchase.id,
        product_id: i.product_id,
        quantity: i.quantity,
        unit_cost: i.unit_cost,
        line_total: i.line_total,
      }));
      const { error: iErr } = await supabase.from('stock_purchase_items').insert(itemRows);
      if (iErr) throw iErr;

      toast.success('Compra registrada!');
      // Reset
      setSupplierId(''); setItems([]); setNotes('');
      setExpectedDate(undefined); setDueDate(undefined);
      setPurchaseDate(new Date());
      onClose();
      onCreated();
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-xl">Nova Compra</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Supplier */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label>Fornecedor *</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="icon" className="h-12 w-12 shrink-0" onClick={onNewSupplier}><Plus className="h-4 w-4" /></Button>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Data Compra *</Label>
              <DatePicker date={purchaseDate} onSelect={d => d && setPurchaseDate(d)} placeholder="Data" />
            </div>
            <div>
              <Label>Previsão Receb.</Label>
              <DatePicker date={expectedDate} onSelect={setExpectedDate} placeholder="Previsão" />
            </div>
            <div>
              <Label>Vencimento</Label>
              <DatePicker date={dueDate} onSelect={setDueDate} placeholder="Vencimento" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label>Observações</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>

          {/* Add item */}
          <div className="bg-muted/30 rounded-lg p-3 space-y-3">
            <Label className="text-sm font-semibold">Adicionar Item</Label>
            <div className="grid grid-cols-[1fr_80px_100px_auto] gap-2 items-end">
              <div>
                <Label className="text-xs">Produto</Label>
                <ProductSearchSelect
                  products={products}
                  value={tempProductId}
                  onSelect={setTempProductId}
                  placeholder="Buscar produto..."
                />
              </div>
              <div>
                <Label className="text-xs">Qtd</Label>
                <Input type="number" value={tempQty} onChange={e => setTempQty(e.target.value)} className="h-12" min="1" />
              </div>
              <div>
                <Label className="text-xs">Custo Un.</Label>
                <Input type="number" value={tempCost} onChange={e => setTempCost(e.target.value)} className="h-12" min="0" step="0.01" />
              </div>
              <Button onClick={addItem} size="icon" className="h-12 w-12 shrink-0"><Plus className="h-4 w-4" /></Button>
            </div>
          </div>

          {/* Items list */}
          {items.length > 0 && (
            <div className="space-y-1">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between bg-card rounded-md px-3 py-2 border text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <Package className="h-4 w-4 text-primary shrink-0" />
                    <span className="truncate">{item.product_name}</span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span>{item.quantity} x {fmtMoney(item.unit_cost)}</span>
                    <span className="font-medium">{fmtMoney(item.line_total)}</span>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeItem(idx)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="text-right text-lg font-bold pt-2">Total: {fmtMoney(total)}</div>
            </div>
          )}

          <Button onClick={handleSave} disabled={saving} className="w-full h-14 text-lg">
            {saving ? 'Salvando...' : 'Registrar Compra'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===================== PURCHASE DETAIL =====================
function PurchaseDetailDialog({ purchase, products, onClose, onUpdated }: {
  purchase: StockPurchase; products: Product[]; onClose: () => void; onUpdated: () => void;
}) {
  const [items, setItems] = useState<PurchaseItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const productMap = new Map(products.map(p => [p.id, p]));

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('stock_purchase_items').select('*').eq('stock_purchase_id', purchase.id);
      setItems(data || []);
      setLoading(false);
    })();
  }, [purchase.id]);

  async function handleReceive() {
    if (purchase.stock_received_at) { toast.error('Estoque já foi recebido para esta compra.'); return; }
    setActing(true);
    try {
      // Create inventory IN movements for each item
      for (const item of items) {
        await addInventoryMovement({
          product_id: item.product_id,
          direction: 'IN',
          reason: 'purchase',
          quantity: Number(item.quantity),
          note: `Compra ${purchase.id.slice(0, 8)}`,
        });
      }
      // Update purchase status
      const { error } = await supabase.from('stock_purchases').update({
        stock_status: 'received' as any,
        stock_received_at: new Date().toISOString(),
      }).eq('id', purchase.id);
      if (error) throw error;

      toast.success('Estoque recebido e atualizado!');
      onClose();
      onUpdated();
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setActing(false);
    }
  }

  async function handlePay() {
    if (purchase.payment_recorded_at) { toast.error('Pagamento já registrado para esta compra.'); return; }
    setActing(true);
    try {
      // Create finance entry
      const { error: fErr } = await supabase.from('finance_entries').insert({
        entry_type: 'expense' as any,
        source_type: 'stock_purchase' as any,
        source_id: purchase.id,
        amount: purchase.total_amount,
        status: 'paid' as any,
        payment_date: format(new Date(), 'yyyy-MM-dd'),
        payment_method: purchase.payment_method,
        notes: `Pagamento compra ${purchase.id.slice(0, 8)}`,
      });
      if (fErr) throw fErr;

      // Update purchase
      const { error } = await supabase.from('stock_purchases').update({
        payment_status: 'paid' as any,
        payment_recorded_at: new Date().toISOString(),
      }).eq('id', purchase.id);
      if (error) throw error;

      toast.success('Pagamento registrado!');
      onClose();
      onUpdated();
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setActing(false);
    }
  }

  async function handleCancel() {
    setActing(true);
    try {
      const { error } = await supabase.from('stock_purchases').update({
        stock_status: 'cancelled' as any,
        payment_status: 'cancelled' as any,
      }).eq('id', purchase.id);
      if (error) throw error;
      toast.success('Compra cancelada.');
      onClose();
      onUpdated();
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setActing(false);
    }
  }

  const canReceive = purchase.stock_status === 'pending_receipt' && !purchase.stock_received_at;
  const canPay = purchase.payment_status === 'unpaid' && !purchase.payment_recorded_at;
  const canCancel = purchase.stock_status !== 'cancelled';

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Compra {purchase.id.slice(0, 8)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Fornecedor:</span> <span className="font-medium">{purchase.supplier_name}</span></div>
            <div><span className="text-muted-foreground">Data:</span> {fmtDate(purchase.purchase_date)}</div>
            <div><span className="text-muted-foreground">Vencimento:</span> {fmtDate(purchase.due_date)}</div>
            <div><span className="text-muted-foreground">Total:</span> <span className="font-bold">{fmtMoney(purchase.total_amount)}</span></div>
            <div className="flex items-center gap-2"><span className="text-muted-foreground">Estoque:</span> {stockStatusBadge(purchase.stock_status)}</div>
            <div className="flex items-center gap-2"><span className="text-muted-foreground">Pagamento:</span> {payStatusBadge(purchase.payment_status)}</div>
          </div>

          {purchase.notes && <p className="text-sm bg-muted/30 rounded p-2">{purchase.notes}</p>}

          {/* Items */}
          <div>
            <Label className="text-sm font-semibold">Itens</Label>
            {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : (
              <div className="space-y-1 mt-2">
                {items.map(item => (
                  <div key={item.id} className="flex items-center justify-between bg-card rounded px-3 py-2 border text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <Package className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate">{productMap.get(item.product_id)?.name || item.product_id.slice(0, 8)}</span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span>{Number(item.quantity)} x {fmtMoney(Number(item.unit_cost))}</span>
                      <span className="font-medium">{fmtMoney(Number(item.line_total))}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap pt-2">
            {canReceive && (
              <Button onClick={handleReceive} disabled={acting} className="gap-2 flex-1 h-12">
                <CheckCircle className="h-4 w-4" /> Receber Estoque
              </Button>
            )}
            {canPay && (
              <Button onClick={handlePay} disabled={acting} variant="secondary" className="gap-2 flex-1 h-12">
                <Banknote className="h-4 w-4" /> Registrar Pagamento
              </Button>
            )}
            {canCancel && (
              <Button onClick={handleCancel} disabled={acting} variant="destructive" className="gap-2 h-12">
                Cancelar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===================== EXPENSES TAB =====================
function ExpensesTab() {
  const [expenses, setExpenses] = useState<OperationalExpense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterCategory, setFilterCategory] = useState('all');
  const [filterPayment, setFilterPayment] = useState('all');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterStart, setFilterStart] = useState<Date | undefined>();
  const [filterEnd, setFilterEnd] = useState<Date | undefined>();

  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<OperationalExpense | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [{ data: eData }, { data: cData }] = await Promise.all([
        supabase.from('operational_expenses').select('*').order('expense_date', { ascending: false }),
        supabase.from('expense_categories').select('*').order('name'),
      ]);
      const catMap = new Map((cData || []).map((c: any) => [c.id, c.name]));
      setExpenses((eData || []).map((e: any) => ({ ...e, category_name: catMap.get(e.category_id) || 'Sem categoria' })));
      setCategories(cData || []);
    } catch (e: any) { toast.error('Erro: ' + e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = expenses.filter(e => {
    if (filterCategory !== 'all' && e.category_id !== filterCategory) return false;
    if (filterPayment !== 'all' && e.payment_status !== filterPayment) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      if (!e.description.toLowerCase().includes(q) && !(e.supplier_name || '').toLowerCase().includes(q)) return false;
    }
    if (filterStart && new Date(e.expense_date) < filterStart) return false;
    if (filterEnd && new Date(e.expense_date) > filterEnd) return false;
    return true;
  });

  if (loading) return <p className="text-center text-muted-foreground py-12 text-lg">Carregando...</p>;

  return (
    <div className="space-y-4 mt-4">
      <Button onClick={() => { setEditingExpense(null); setFormOpen(true); }} size="lg" className="h-14 px-6 text-lg gap-2">
        <Plus className="h-5 w-5" /> Nova Despesa
      </Button>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-end">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Descrição ou fornecedor" className="pl-9 h-10 w-[220px]" />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Categoria</Label>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[160px] h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Pagamento</Label>
          <Select value={filterPayment} onValueChange={setFilterPayment}>
            <SelectTrigger className="w-[140px] h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="unpaid">Não Pago</SelectItem>
              <SelectItem value="paid">Pago</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Data Início</Label>
          <DatePicker date={filterStart} onSelect={setFilterStart} placeholder="Início" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Data Fim</Label>
          <DatePicker date={filterEnd} onSelect={setFilterEnd} placeholder="Fim" />
        </div>
        {(filterCategory !== 'all' || filterPayment !== 'all' || filterSearch || filterStart || filterEnd) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterCategory('all'); setFilterPayment('all'); setFilterSearch(''); setFilterStart(undefined); setFilterEnd(undefined); }}>
            Limpar filtros
          </Button>
        )}
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12 text-lg">Nenhuma despesa encontrada.</p>
        ) : filtered.map(e => (
          <div key={e.id} className="bg-card rounded-lg border p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="space-y-1">
                <p className="text-sm font-medium">{e.description}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(e.expense_date)} • {e.category_name}
                  {e.supplier_name && ` • ${e.supplier_name}`}
                  {e.due_date && ` • Venc: ${fmtDate(e.due_date)}`}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {payStatusBadge(e.payment_status)}
                <span className="text-lg font-bold">{fmtMoney(e.amount)}</span>
                <Button variant="ghost" size="icon" onClick={() => { setEditingExpense(e); setFormOpen(true); }}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {formOpen && (
        <ExpenseFormDialog
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditingExpense(null); }}
          categories={categories}
          expense={editingExpense}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

// ===================== EXPENSE FORM DIALOG =====================
function ExpenseFormDialog({ open, onClose, categories, expense, onSaved }: {
  open: boolean; onClose: () => void; categories: ExpenseCategory[];
  expense: OperationalExpense | null; onSaved: () => void;
}) {
  const isEdit = !!expense;
  const [categoryId, setCategoryId] = useState(expense?.category_id || '');
  const [description, setDescription] = useState(expense?.description || '');
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [expenseDate, setExpenseDate] = useState<Date>(expense ? new Date(expense.expense_date) : new Date());
  const [dueDate, setDueDate] = useState<Date | undefined>(expense?.due_date ? new Date(expense.due_date) : undefined);
  const [paymentStatus, setPaymentStatus] = useState(expense?.payment_status || 'unpaid');
  const [paymentMethod, setPaymentMethod] = useState(expense?.payment_method || '');
  const [supplierName, setSupplierName] = useState(expense?.supplier_name || '');
  const [notes, setNotes] = useState(expense?.notes || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!description.trim()) { toast.error('Descrição obrigatória'); return; }
    if (!amount || Number(amount) <= 0) { toast.error('Valor inválido'); return; }
    setSaving(true);
    try {
      const record: any = {
        category_id: categoryId || null,
        description: description.trim(),
        amount: Number(amount),
        expense_date: format(expenseDate, 'yyyy-MM-dd'),
        due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
        payment_status: paymentStatus,
        payment_method: paymentMethod || null,
        supplier_name: supplierName || null,
        notes: notes || null,
      };

      if (isEdit) {
        const prevStatus = expense!.payment_status;
        const { error } = await supabase.from('operational_expenses').update(record).eq('id', expense!.id);
        if (error) throw error;

        // If changing to paid and no finance entry yet
        if (paymentStatus === 'paid' && prevStatus !== 'paid' && !expense!.finance_entry_id) {
          const { data: fe, error: fErr } = await supabase.from('finance_entries').insert({
            entry_type: 'expense' as any,
            source_type: 'operational_expense' as any,
            source_id: expense!.id,
            amount: Number(amount),
            status: 'paid' as any,
            payment_date: format(new Date(), 'yyyy-MM-dd'),
            payment_method: paymentMethod || null,
            due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
            notes: `Despesa: ${description.trim()}`,
          }).select().single();
          if (fErr) throw fErr;
          await supabase.from('operational_expenses').update({ finance_entry_id: fe.id }).eq('id', expense!.id);
        }
        toast.success('Despesa atualizada!');
      } else {
        // Create new expense
        const { data: newExp, error } = await supabase.from('operational_expenses').insert(record).select().single();
        if (error) throw error;

        // Create finance entry
        const feStatus = paymentStatus === 'paid' ? 'paid' : 'pending';
        const { data: fe, error: fErr } = await supabase.from('finance_entries').insert({
          entry_type: 'expense' as any,
          source_type: 'operational_expense' as any,
          source_id: newExp.id,
          amount: Number(amount),
          status: feStatus as any,
          payment_date: paymentStatus === 'paid' ? format(new Date(), 'yyyy-MM-dd') : null,
          payment_method: paymentMethod || null,
          due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
          notes: `Despesa: ${description.trim()}`,
        }).select().single();
        if (fErr) throw fErr;
        await supabase.from('operational_expenses').update({ finance_entry_id: fe.id }).eq('id', newExp.id);
        toast.success('Despesa registrada!');
      }
      onClose();
      onSaved();
    } catch (e: any) { toast.error('Erro: ' + e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-xl">{isEdit ? 'Editar Despesa' : 'Nova Despesa'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Descrição *</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} className="h-12 text-lg" placeholder="Ex: Aluguel janeiro" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor *</Label>
              <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="h-12" min="0" step="0.01" placeholder="0.00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data Despesa *</Label>
              <DatePicker date={expenseDate} onSelect={d => d && setExpenseDate(d)} placeholder="Data" />
            </div>
            <div>
              <Label>Vencimento</Label>
              <DatePicker date={dueDate} onSelect={setDueDate} placeholder="Vencimento" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status Pagamento</Label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid">Não Pago</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Forma de Pagamento</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Dinheiro</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="card">Cartão</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="transfer">Transferência</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Fornecedor / Prestador</Label>
            <Input value={supplierName} onChange={e => setSupplierName(e.target.value)} className="h-12" placeholder="Ex: Imobiliária ABC" />
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full h-14 text-lg">
            {saving ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Registrar Despesa'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===================== ACCOUNTS PAYABLE TAB =====================
function AccountsPayableTab() {
  const [payables, setPayables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterStart, setFilterStart] = useState<Date | undefined>();
  const [filterEnd, setFilterEnd] = useState<Date | undefined>();

  const refresh = useCallback(async () => {
    try {
      const [{ data: purchases }, { data: expenses }, { data: suppliers }] = await Promise.all([
        supabase.from('stock_purchases').select('*').eq('payment_status', 'unpaid'),
        supabase.from('operational_expenses').select('*').eq('payment_status', 'unpaid'),
        supabase.from('suppliers').select('id, name'),
      ]);
      const supplierMap = new Map((suppliers || []).map((s: any) => [s.id, s.name]));

      const items: any[] = [];
      (purchases || []).forEach((p: any) => {
        items.push({
          id: p.id, type: 'purchase', description: supplierMap.get(p.supplier_id) || 'Compra de estoque',
          due_date: p.due_date, amount: p.total_amount, status: p.payment_status, source: p,
        });
      });
      (expenses || []).forEach((e: any) => {
        items.push({
          id: e.id, type: 'expense', description: e.description + (e.supplier_name ? ` (${e.supplier_name})` : ''),
          due_date: e.due_date, amount: e.amount, status: e.payment_status, source: e,
        });
      });
      items.sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      });
      setPayables(items);
    } catch (e: any) { toast.error('Erro: ' + e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const today = startOfDay(new Date());
  const endOfWeek = addDays(today, 7);

  const totalUnpaid = payables.reduce((s, p) => s + Number(p.amount), 0);
  const overdue = payables.filter(p => p.due_date && isBefore(new Date(p.due_date), today));
  const overdueTotal = overdue.reduce((s, p) => s + Number(p.amount), 0);
  const dueThisWeek = payables.filter(p => p.due_date && !isBefore(new Date(p.due_date), today) && isBefore(new Date(p.due_date), endOfWeek));
  const dueThisWeekTotal = dueThisWeek.reduce((s, p) => s + Number(p.amount), 0);

  const filtered = payables.filter(p => {
    if (filterType !== 'all' && p.type !== filterType) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      if (!p.description.toLowerCase().includes(q)) return false;
    }
    if (filterStart && p.due_date && new Date(p.due_date) < filterStart) return false;
    if (filterEnd && p.due_date && new Date(p.due_date) > filterEnd) return false;
    return true;
  });

  async function handleMarkPaid(item: any) {
    try {
      if (item.type === 'purchase') {
        const src = item.source;
        if (src.payment_recorded_at) { toast.error('Pagamento já registrado.'); return; }
        const { error: fErr } = await supabase.from('finance_entries').insert({
          entry_type: 'expense' as any, source_type: 'stock_purchase' as any, source_id: src.id,
          amount: src.total_amount, status: 'paid' as any,
          payment_date: format(new Date(), 'yyyy-MM-dd'), notes: `Pagamento compra ${src.id.slice(0, 8)}`,
        });
        if (fErr) throw fErr;
        const { error } = await supabase.from('stock_purchases').update({
          payment_status: 'paid' as any, payment_recorded_at: new Date().toISOString(),
        }).eq('id', src.id);
        if (error) throw error;
      } else {
        const src = item.source;
        if (src.finance_entry_id) {
          // Update existing finance entry
          await supabase.from('finance_entries').update({
            status: 'paid' as any, payment_date: format(new Date(), 'yyyy-MM-dd'),
          }).eq('id', src.finance_entry_id);
        } else {
          const { data: fe, error: fErr } = await supabase.from('finance_entries').insert({
            entry_type: 'expense' as any, source_type: 'operational_expense' as any, source_id: src.id,
            amount: src.amount, status: 'paid' as any,
            payment_date: format(new Date(), 'yyyy-MM-dd'), notes: `Despesa: ${src.description}`,
          }).select().single();
          if (fErr) throw fErr;
          await supabase.from('operational_expenses').update({ finance_entry_id: fe.id }).eq('id', src.id);
        }
        await supabase.from('operational_expenses').update({ payment_status: 'paid' }).eq('id', src.id);
      }
      toast.success('Pagamento registrado!');
      refresh();
    } catch (e: any) { toast.error('Erro: ' + e.message); }
  }

  if (loading) return <p className="text-center text-muted-foreground py-12 text-lg">Carregando...</p>;

  return (
    <div className="space-y-4 mt-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><FileText className="h-4 w-4" /> Total a Pagar</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmtMoney(totalUnpaid)}</p><p className="text-xs text-muted-foreground">{payables.length} conta(s)</p></CardContent>
        </Card>
        <Card className={overdueTotal > 0 ? 'border-destructive' : ''}>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Vencidas</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-destructive">{fmtMoney(overdueTotal)}</p><p className="text-xs text-muted-foreground">{overdue.length} conta(s)</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Clock className="h-4 w-4" /> Vence esta semana</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmtMoney(dueThisWeekTotal)}</p><p className="text-xs text-muted-foreground">{dueThisWeek.length} conta(s)</p></CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-end">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Descrição ou fornecedor" className="pl-9 h-10 w-[220px]" />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tipo</Label>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[160px] h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="purchase">Compras</SelectItem>
              <SelectItem value="expense">Despesas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Venc. Início</Label>
          <DatePicker date={filterStart} onSelect={setFilterStart} placeholder="Início" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Venc. Fim</Label>
          <DatePicker date={filterEnd} onSelect={setFilterEnd} placeholder="Fim" />
        </div>
        {(filterType !== 'all' || filterSearch || filterStart || filterEnd) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterType('all'); setFilterSearch(''); setFilterStart(undefined); setFilterEnd(undefined); }}>
            Limpar filtros
          </Button>
        )}
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12 text-lg">Nenhuma conta a pagar encontrada.</p>
        ) : filtered.map(p => {
          const isOverdue = p.due_date && isBefore(new Date(p.due_date), today);
          return (
            <div key={`${p.type}-${p.id}`} className={cn("bg-card rounded-lg border p-4", isOverdue && "border-destructive/50")}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {p.type === 'purchase' ? 'Compra' : 'Despesa'}
                    </Badge>
                    {isOverdue && <Badge variant="destructive" className="text-xs">Vencida</Badge>}
                  </div>
                  <p className="text-sm font-medium">{p.description}</p>
                  <p className="text-xs text-muted-foreground">
                    Venc: {fmtDate(p.due_date)}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-lg font-bold">{fmtMoney(p.amount)}</span>
                  <Button size="sm" className="gap-1 h-9" onClick={() => handleMarkPaid(p)}>
                    <CheckCircle className="h-4 w-4" /> Pagar
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
