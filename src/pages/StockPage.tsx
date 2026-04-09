import { useState, useEffect, useCallback } from 'react';
import { Product, getProductsWithStock, getLowStockProducts, addInventoryMovement } from '@/lib/store';
import { downloadCsv, copyCsvToClipboard } from '@/lib/csv';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ProductSearchSelect from '@/components/ProductSearchSelect';
import { AlertTriangle, ArrowDownToLine, SlidersHorizontal, Package, Download, Copy, Search } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

export default function StockPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [movType, setMovType] = useState<'entry' | 'adjustment'>('entry');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [prods, low] = await Promise.all([getProductsWithStock(), getLowStockProducts()]);
      setProducts(prods);
      setLowStock(low);
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  function openDialog(type: 'entry' | 'adjustment') {
    setMovType(type);
    setSelectedProductId('');
    setQuantity('');
    setNote('');
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!selectedProductId || !quantity) return;
    try {
      if (movType === 'entry') {
        await addInventoryMovement({
          product_id: selectedProductId,
          direction: 'IN',
          reason: 'purchase',
          quantity: +quantity,
          note,
        });
      } else {
        const current = products.find(p => p.id === selectedProductId);
        const currentStock = current?.stock || 0;
        const newStock = +quantity;
        const delta = newStock - currentStock;
        if (delta === 0) { setDialogOpen(false); return; }
        await addInventoryMovement({
          product_id: selectedProductId,
          direction: delta > 0 ? 'IN' : 'OUT',
          reason: 'adjustment',
          quantity: Math.abs(delta),
          note: note || `Ajuste: ${currentStock} → ${newStock}`,
        });
      }
      toast.success('Movimentação registrada!');
      setDialogOpen(false);
      await refresh();
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    }
  }

  const activeProducts = products.filter(p => p.is_active);
  const filteredAll = search.trim()
    ? activeProducts.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.barcode || '').includes(search))
    : activeProducts;
  const filteredLow = search.trim()
    ? lowStock.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.barcode || '').includes(search))
    : lowStock;

  function getExportData() {
    const source = activeTab === 'low' ? filteredLow : filteredAll;
    const headers = ['product_id', 'name', 'barcode', 'sale_price', 'cost_price', 'min_stock', 'current_stock', 'is_active'];
    const rows = source.map(p => [p.id, p.name, p.barcode || '', Number(p.sale_price), Number(p.cost_price), p.min_stock, p.stock, p.is_active ? 'Sim' : 'Não']);
    return { headers, rows };
  }

  function handleExportCsv() {
    const { headers, rows } = getExportData();
    const suffix = activeTab === 'low' ? '_estoque_baixo' : '_estoque';
    downloadCsv(`adega${suffix}_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    toast.success('CSV exportado!');
  }

  function handleCopyCsv() {
    const { headers, rows } = getExportData();
    copyCsvToClipboard(headers, rows);
    toast.success('Copiado! Cole no Google Sheets.');
  }

  if (loading) return <p className="text-center text-muted-foreground py-12 text-lg">Carregando...</p>;

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Button onClick={() => openDialog('entry')} size="lg" className="h-14 px-6 text-lg gap-2 flex-1">
          <ArrowDownToLine className="h-5 w-5" /> Entrada de Estoque
        </Button>
        <Button onClick={() => openDialog('adjustment')} variant="secondary" size="lg" className="h-14 px-6 text-lg gap-2 flex-1">
          <SlidersHorizontal className="h-5 w-5" /> Ajuste de Estoque
        </Button>
      </div>

      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou código de barras..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 h-14 text-lg bg-card"
          />
        </div>
        <Button onClick={handleExportCsv} variant="outline" size="lg" className="h-14 px-4 gap-2">
          <Download className="h-5 w-5" /> CSV
        </Button>
        <Button onClick={handleCopyCsv} variant="outline" size="lg" className="h-14 px-4 gap-2">
          <Copy className="h-5 w-5" /> Sheets
        </Button>
      </div>

      <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-12">
          <TabsTrigger value="all" className="text-base px-6 h-10">Todos os Produtos</TabsTrigger>
          <TabsTrigger value="low" className="text-base px-6 h-10 gap-2">
            <AlertTriangle className="h-4 w-4" /> Estoque Baixo ({lowStock.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-2 mt-4">
          {filteredAll.map(p => (
            <div key={p.id} className="flex items-center justify-between bg-card rounded-lg p-4 border">
              <div className="flex items-center gap-3">
                <Package className="h-6 w-6 text-primary" />
                <div>
                  <span className="text-lg font-medium">{p.name}</span>
                  {p.barcode && <p className="text-xs text-muted-foreground">{p.barcode}</p>}
                </div>
                {p.is_combo && <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent">Combo</span>}
              </div>
              <div className="flex items-center gap-4">
                <span className={`text-xl font-bold ${p.stock <= p.min_stock ? 'text-destructive' : 'text-success'}`}>
                  {p.stock} un
                </span>
                <span className="text-sm text-muted-foreground">(mín: {p.min_stock})</span>
              </div>
            </div>
          ))}
          {filteredAll.length === 0 && (
            <p className="text-center text-muted-foreground py-12 text-lg">Nenhum produto encontrado.</p>
          )}
        </TabsContent>

        <TabsContent value="low" className="space-y-2 mt-4">
          {filteredLow.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-lg">
              {search.trim() ? 'Nenhum produto encontrado.' : 'Nenhum produto com estoque baixo 🎉'}
            </p>
          ) : filteredLow.map(p => (
            <div key={p.id} className="flex items-center justify-between bg-destructive/10 rounded-lg p-4 border border-destructive/30">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-6 w-6 text-destructive" />
                <div>
                  <span className="text-lg font-medium">{p.name}</span>
                  {p.barcode && <p className="text-xs text-muted-foreground">{p.barcode}</p>}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xl font-bold text-destructive">{p.stock} un</span>
                <span className="text-sm text-muted-foreground">(mín: {p.min_stock})</span>
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {movType === 'entry' ? 'Entrada de Estoque' : 'Ajuste de Estoque'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Produto</Label>
              <ProductSearchSelect
                products={activeProducts}
                value={selectedProductId}
                onSelect={setSelectedProductId}
                showStock
                placeholder="Buscar produto..."
              />
            </div>
            <div>
              <Label>{movType === 'entry' ? 'Quantidade a adicionar' : 'Novo saldo'}</Label>
              <Input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} className="h-12 text-lg" />
            </div>
            <div>
              <Label>Observação (opcional)</Label>
              <Input value={note} onChange={e => setNote(e.target.value)} className="h-12" />
            </div>
            <Button onClick={handleSave} className="w-full h-14 text-lg">Confirmar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
