import { useState, useEffect, useCallback } from 'react';
import { Product, upsertProduct, getProductsWithStock, getProductComponents, setProductComponents, ProductComponent } from '@/lib/store';
import { downloadCsv } from '@/lib/csv';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Edit, Package, Download, Upload, Trash2, Layers } from 'lucide-react';
import { toast } from 'sonner';
import ImportProductsModal from '@/components/ImportProductsModal';

interface ComponentRow {
  component_product_id: string;
  component_qty: number;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [editProduct, setEditProduct] = useState<Partial<Product> | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [components, setComponents] = useState<ComponentRow[]>([]);

  const loadProducts = useCallback(async () => {
    try {
      const data = await getProductsWithStock();
      setProducts(data);
    } catch (e: any) {
      toast.error('Erro ao carregar produtos: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.barcode || '').includes(search)
  );

  function openNew() {
    setEditProduct({ name: '', barcode: '', sale_price: 0, cost_price: 0, min_stock: 0, is_active: true, is_combo: false, track_stock: true });
    setComponents([]);
    setDialogOpen(true);
  }

  async function openEdit(p: Product) {
    setEditProduct({ ...p });
    if (p.is_combo) {
      try {
        const comps = await getProductComponents(p.id);
        setComponents(comps.map(c => ({ component_product_id: c.component_product_id, component_qty: Number(c.component_qty) })));
      } catch { setComponents([]); }
    } else {
      setComponents([]);
    }
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!editProduct || !editProduct.name?.trim()) return;
    try {
      const productData: any = {
        ...(editProduct.id ? { id: editProduct.id } : {}),
        name: editProduct.name!,
        barcode: editProduct.barcode || '',
        sale_price: editProduct.sale_price || 0,
        cost_price: editProduct.cost_price || 0,
        min_stock: editProduct.min_stock || 0,
        is_active: editProduct.is_active ?? true,
        is_combo: editProduct.is_combo ?? false,
        track_stock: editProduct.track_stock ?? true,
      };
      await upsertProduct(productData);

      // If it's a combo, save components after we have the product ID
      if (editProduct.is_combo) {
        // Need product id - if new, fetch it
        let productId = editProduct.id;
        if (!productId) {
          const refreshed = await getProductsWithStock();
          const found = refreshed.find(p => p.name === editProduct.name);
          productId = found?.id;
        }
        if (productId) {
          await setProductComponents(productId, components.filter(c => c.component_product_id && c.component_qty > 0));
        }
      }

      toast.success('Produto salvo!');
      setDialogOpen(false);
      setEditProduct(null);
      await loadProducts();
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message);
    }
  }

  function handleExportCsv() {
    const headers = ['product_id', 'name', 'barcode', 'sale_price', 'cost_price', 'min_stock', 'current_stock', 'is_active', 'is_combo'];
    const rows = filtered.map(p => [p.id, p.name, p.barcode || '', Number(p.sale_price), Number(p.cost_price), p.min_stock, p.stock, p.is_active ? 'Sim' : 'Não', p.is_combo ? 'Sim' : 'Não']);
    downloadCsv(`adega_produtos_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    toast.success('CSV exportado!');
  }

  function addComponent() {
    setComponents(prev => [...prev, { component_product_id: '', component_qty: 1 }]);
  }

  function removeComponent(idx: number) {
    setComponents(prev => prev.filter((_, i) => i !== idx));
  }

  function updateComponent(idx: number, field: keyof ComponentRow, value: any) {
    setComponents(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  }

  // Products available as components (not the combo itself)
  const availableComponents = products.filter(p => p.is_active && p.id !== editProduct?.id && !p.is_combo);

  if (loading) return <p className="text-center text-muted-foreground py-12 text-lg">Carregando...</p>;

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
        <Button onClick={handleExportCsv} variant="outline" size="lg" className="h-14 px-4 gap-2">
          <Download className="h-5 w-5" /> CSV
        </Button>
        <Button onClick={openNew} size="lg" className="h-14 px-6 text-lg gap-2">
          <Plus className="h-5 w-5" /> Novo Produto
        </Button>
      </div>

      <div className="grid gap-2">
        {filtered.map(p => (
          <div key={p.id} className="flex items-center justify-between bg-card rounded-lg p-4 border">
            <div className="flex items-center gap-4">
              {p.is_combo ? <Layers className="h-8 w-8 text-accent" /> : <Package className="h-8 w-8 text-primary" />}
              <div>
                <p className="text-lg font-semibold">{p.name}</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">Código: {p.barcode || '—'}</p>
                  {p.is_combo && <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent">Combo</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-lg font-bold text-accent">R$ {Number(p.sale_price).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Custo: R$ {Number(p.cost_price).toFixed(2)}</p>
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
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">{editProduct?.id ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
          </DialogHeader>
          {editProduct && (
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input value={editProduct.name || ''} onChange={e => setEditProduct({ ...editProduct, name: e.target.value })} className="h-12 text-lg" />
              </div>
              <div>
                <Label>Código de barras</Label>
                <Input value={editProduct.barcode || ''} onChange={e => setEditProduct({ ...editProduct, barcode: e.target.value })} className="h-12" />
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
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <Switch checked={editProduct.is_active ?? true} onCheckedChange={v => setEditProduct({ ...editProduct, is_active: v })} />
                  <Label>Ativo</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={editProduct.is_combo ?? false} onCheckedChange={v => setEditProduct({ ...editProduct, is_combo: v, track_stock: v ? false : true })} />
                  <Label>Combo</Label>
                </div>
                {editProduct.is_combo && (
                  <div className="flex items-center gap-3">
                    <Switch checked={editProduct.track_stock ?? true} onCheckedChange={v => setEditProduct({ ...editProduct, track_stock: v })} />
                    <Label>Controlar estoque do combo</Label>
                  </div>
                )}
              </div>

              {editProduct.is_combo && (
                <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Componentes da Receita</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addComponent} className="gap-1">
                      <Plus className="h-4 w-4" /> Componente
                    </Button>
                  </div>
                  {components.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-2">Adicione os produtos que compõem este combo</p>
                  )}
                  {components.map((comp, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Select value={comp.component_product_id} onValueChange={v => updateComponent(idx, 'component_product_id', v)}>
                        <SelectTrigger className="flex-1 h-10">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableComponents.map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={comp.component_qty}
                        onChange={e => updateComponent(idx, 'component_qty', +e.target.value)}
                        className="w-24 h-10"
                        placeholder="Qtd"
                      />
                      <Button variant="ghost" size="icon" onClick={() => removeComponent(idx)} className="h-10 w-10 text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <Button onClick={handleSave} className="w-full h-14 text-lg">Salvar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
