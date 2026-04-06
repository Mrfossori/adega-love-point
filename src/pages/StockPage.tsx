import { useState } from 'react';
import { Product, StockMovement } from '@/lib/types';
import { getProducts, addMovement, getLowStockProducts, getMovements } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, ArrowDownToLine, SlidersHorizontal, Package } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function StockPage() {
  const [products, setProducts] = useState<Product[]>(getProducts());
  const [lowStock, setLowStock] = useState<Product[]>(getLowStockProducts());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [movType, setMovType] = useState<'entry' | 'adjustment'>('entry');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');

  function refresh() {
    setProducts(getProducts());
    setLowStock(getLowStockProducts());
  }

  function openDialog(type: 'entry' | 'adjustment') {
    setMovType(type);
    setSelectedProductId('');
    setQuantity('');
    setNote('');
    setDialogOpen(true);
  }

  function handleSave() {
    if (!selectedProductId || !quantity) return;
    addMovement({
      id: crypto.randomUUID(),
      product_id: selectedProductId,
      type: movType,
      quantity: +quantity,
      note,
      created_at: new Date().toISOString(),
    });
    refresh();
    setDialogOpen(false);
  }

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
