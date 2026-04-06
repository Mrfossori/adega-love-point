import { useState } from 'react';
import { Product } from '@/lib/types';
import { getProducts, saveProduct } from '@/lib/store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Search, Plus, Edit, Package } from 'lucide-react';

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>(getProducts());
  const [search, setSearch] = useState('');
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode.includes(search)
  );

  const emptyProduct: Product = {
    id: '', name: '', barcode: '', sale_price: 0, cost_price: 0,
    min_stock: 0, is_active: true, stock: 0,
  };

  function openNew() {
    setEditProduct({ ...emptyProduct, id: crypto.randomUUID() });
    setDialogOpen(true);
  }

  function openEdit(p: Product) {
    setEditProduct({ ...p });
    setDialogOpen(true);
  }

  function handleSave() {
    if (!editProduct || !editProduct.name.trim()) return;
    saveProduct(editProduct);
    setProducts(getProducts());
    setDialogOpen(false);
    setEditProduct(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou código de barras..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 h-14 text-lg bg-card"
          />
        </div>
        <Button onClick={openNew} size="lg" className="h-14 px-6 text-lg gap-2">
          <Plus className="h-5 w-5" /> Novo Produto
        </Button>
      </div>

      <div className="grid gap-2">
        {filtered.map(p => (
          <div key={p.id} className="flex items-center justify-between bg-card rounded-lg p-4 border">
            <div className="flex items-center gap-4">
              <Package className="h-8 w-8 text-primary" />
              <div>
                <p className="text-lg font-semibold">{p.name}</p>
                <p className="text-sm text-muted-foreground">Código: {p.barcode || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-lg font-bold text-accent">R$ {p.sale_price.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Custo: R$ {p.cost_price.toFixed(2)}</p>
              </div>
              <div className="text-right min-w-[80px]">
                <p className={`text-lg font-bold ${p.stock <= p.min_stock ? 'text-destructive' : 'text-success'}`}>
                  {p.stock} un
                </p>
                <p className="text-xs text-muted-foreground">Mín: {p.min_stock}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${p.is_active ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>
                {p.is_active ? 'Ativo' : 'Inativo'}
              </span>
              <Button variant="outline" size="icon" onClick={() => openEdit(p)} className="h-12 w-12">
                <Edit className="h-5 w-5" />
              </Button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-12 text-lg">Nenhum produto encontrado.</p>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">{editProduct?.name ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
          </DialogHeader>
          {editProduct && (
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input value={editProduct.name} onChange={e => setEditProduct({ ...editProduct, name: e.target.value })} className="h-12 text-lg" />
              </div>
              <div>
                <Label>Código de barras</Label>
                <Input value={editProduct.barcode} onChange={e => setEditProduct({ ...editProduct, barcode: e.target.value })} className="h-12" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Preço Venda (R$)</Label>
                  <Input type="number" step="0.01" value={editProduct.sale_price || ''} onChange={e => setEditProduct({ ...editProduct, sale_price: +e.target.value })} className="h-12" />
                </div>
                <div>
                  <Label>Preço Custo (R$)</Label>
                  <Input type="number" step="0.01" value={editProduct.cost_price || ''} onChange={e => setEditProduct({ ...editProduct, cost_price: +e.target.value })} className="h-12" />
                </div>
              </div>
              <div>
                <Label>Estoque Mínimo</Label>
                <Input type="number" value={editProduct.min_stock || ''} onChange={e => setEditProduct({ ...editProduct, min_stock: +e.target.value })} className="h-12" />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={editProduct.is_active} onCheckedChange={v => setEditProduct({ ...editProduct, is_active: v })} />
                <Label>Produto ativo</Label>
              </div>
              <Button onClick={handleSave} className="w-full h-14 text-lg">Salvar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
