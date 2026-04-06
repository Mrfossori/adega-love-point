import { useState, useEffect, useCallback } from 'react';
import { Product, getProductsWithStock, createSale } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, ShoppingCart, CreditCard, Banknote, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

interface CartItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export default function PosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [saleType, setSaleType] = useState<string>('presencial');

  const loadProducts = useCallback(async () => {
    try {
      const data = await getProductsWithStock();
      setProducts(data.filter(p => p.is_active));
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const total = items.reduce((s, i) => s + i.subtotal, 0);

  const filtered = search.trim()
    ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.barcode || '').includes(search))
    : [];

  function addItem(p: Product) {
    setItems(prev => {
      const existing = prev.find(i => i.product_id === p.id);
      if (existing) {
        return prev.map(i => i.product_id === p.id
          ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.unit_price }
          : i
        );
      }
      return [...prev, {
        product_id: p.id,
        product_name: p.name,
        quantity: 1,
        unit_price: Number(p.sale_price),
        subtotal: Number(p.sale_price),
      }];
    });
    setSearch('');
  }

  function removeItem(productId: string) {
    setItems(prev => prev.filter(i => i.product_id !== productId));
  }

  function updateQty(productId: string, qty: number) {
    if (qty <= 0) return removeItem(productId);
    setItems(prev => prev.map(i => i.product_id === productId
      ? { ...i, quantity: qty, subtotal: qty * i.unit_price }
      : i
    ));
  }

  async function finalizeSale() {
    if (items.length === 0) return;
    try {
      await createSale(
        { total, payment_method: paymentMethod, sale_type: saleType },
        items.map(i => ({
          product_id: i.product_id,
          product_name: i.product_name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          subtotal: i.subtotal,
        }))
      );
      setItems([]);
      toast.success(`Venda registrada! Total: R$ ${total.toFixed(2)}`);
      await loadProducts();
    } catch (e: any) {
      toast.error('Erro ao registrar venda: ' + e.message);
    }
  }

  const paymentOptions = [
    { value: 'cash', label: 'Dinheiro', icon: Banknote },
    { value: 'credit', label: 'Crédito', icon: CreditCard },
    { value: 'debit', label: 'Débito', icon: CreditCard },
    { value: 'pix', label: 'PIX', icon: Smartphone },
  ] as const;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-8rem)]">
      <div className="lg:col-span-2 space-y-3">
        <div className="relative">
          <Input
            placeholder="Buscar produto por nome ou código de barras..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-16 text-xl bg-card pl-4"
            autoFocus
          />
        </div>

        {filtered.length > 0 && (
          <div className="bg-card border rounded-lg max-h-60 overflow-y-auto">
            {filtered.map(p => (
              <button
                key={p.id}
                onClick={() => addItem(p)}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors border-b last:border-0"
              >
                <span className="text-lg">{p.name}</span>
                <span className="text-lg font-bold text-accent">R$ {Number(p.sale_price).toFixed(2)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 space-y-2 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <ShoppingCart className="h-16 w-16 mb-4" />
              <p className="text-xl">Busque produtos acima para adicionar à venda</p>
            </div>
          ) : items.map(item => (
            <div key={item.product_id} className="flex items-center gap-4 bg-card rounded-lg p-4 border">
              <div className="flex-1">
                <p className="text-lg font-medium">{item.product_name}</p>
                <p className="text-sm text-muted-foreground">R$ {item.unit_price.toFixed(2)} cada</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => updateQty(item.product_id, item.quantity - 1)}>-</Button>
                <span className="w-10 text-center text-xl font-bold">{item.quantity}</span>
                <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => updateQty(item.product_id, item.quantity + 1)}>+</Button>
              </div>
              <p className="text-lg font-bold text-accent w-28 text-right">R$ {item.subtotal.toFixed(2)}</p>
              <Button variant="ghost" size="icon" onClick={() => removeItem(item.product_id)} className="text-destructive h-10 w-10">
                <Trash2 className="h-5 w-5" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border rounded-lg p-4 flex flex-col gap-4">
        <div>
          <Label className="text-base">Tipo de Venda</Label>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {(['presencial', 'delivery'] as const).map(t => (
              <Button
                key={t}
                variant={saleType === t ? 'default' : 'outline'}
                onClick={() => setSaleType(t)}
                className="h-12 text-base"
              >
                {t === 'presencial' ? 'Presencial' : 'Delivery'}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-base">Pagamento</Label>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {paymentOptions.map(opt => (
              <Button
                key={opt.value}
                variant={paymentMethod === opt.value ? 'default' : 'outline'}
                onClick={() => setPaymentMethod(opt.value)}
                className="h-12 text-base gap-2"
              >
                <opt.icon className="h-4 w-4" />
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex-1" />

        <div className="border-t pt-4">
          <div className="flex justify-between items-center mb-4">
            <span className="text-xl">Total</span>
            <span className="text-3xl font-bold text-accent">R$ {total.toFixed(2)}</span>
          </div>
          <Button
            onClick={finalizeSale}
            disabled={items.length === 0}
            className="w-full h-16 text-xl gap-2"
          >
            <ShoppingCart className="h-6 w-6" /> Registrar Venda
          </Button>
        </div>
      </div>
    </div>
  );
}
