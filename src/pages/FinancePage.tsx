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
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Construction className="h-12 w-12 mb-4" />
            <p className="text-lg">Painel Financeiro — em breve</p>
          </div>
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
