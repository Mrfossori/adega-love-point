import { useState, useEffect, useCallback } from 'react';
import { Product, getProductsWithStock, getLowStockProducts, addInventoryMovement } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, ArrowDownToLine, SlidersHorizontal, Package } from 'lucide-react';
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
        // Adjustment: calculate delta from current stock
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

      <Tabs defaultValue="all">
        <TabsList className="h-12">
          <TabsTrigger value="all" className="text-base px-6 h-10">Todos os Produtos</TabsTrigger>
          <TabsTrigger value="low" className="text-base px-6 h-10 gap-2">
            <AlertTriangle className="h-4 w-4" /> Estoque Baixo ({lowStock.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-2 mt-4">
          {products.filter(p => p.is_active).map(p => (
            <div key={p.id} className="flex items-center justify-between bg-card rounded-lg p-4 border">
              <div className="flex items-center gap-3">
                <Package className="h-6 w-6 text-primary" />
                <span className="text-lg font-medium">{p.name}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className={`text-xl font-bold ${p.stock <= p.min_stock ? 'text-destructive' : 'text-success'}`}>
                  {p.stock} un
                </span>
                <span className="text-sm text-muted-foreground">(mín: {p.min_stock})</span>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="low" className="space-y-2 mt-4">
          {lowStock.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-lg">Nenhum produto com estoque baixo 🎉</p>
          ) : lowStock.map(p => (
            <div key={p.id} className="flex items-center justify-between bg-destructive/10 rounded-lg p-4 border border-destructive/30">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-6 w-6 text-destructive" />
                <span className="text-lg font-medium">{p.name}</span>
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
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger className="h-12 text-base">
                  <SelectValue placeholder="Selecione o produto" />
                </SelectTrigger>
                <SelectContent>
                  {products.filter(p => p.is_active).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} (atual: {p.stock})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
