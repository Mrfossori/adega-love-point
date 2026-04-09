import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Search, Package, Layers } from 'lucide-react';

interface ProductOption {
  id: string;
  name: string;
  barcode?: string | null;
  sale_price?: number;
  stock?: number;
  is_combo?: boolean;
}

export default function ProductSearchSelect({
  products,
  value,
  onSelect,
  placeholder = 'Buscar produto por nome ou código...',
  showStock = false,
  showPrice = false,
  className = '',
}: {
  products: ProductOption[];
  value: string;
  onSelect: (id: string) => void;
  placeholder?: string;
  showStock?: boolean;
  showPrice?: boolean;
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = products.find(p => p.id === value);

  const filtered = query.trim()
    ? products.filter(p =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        (p.barcode || '').includes(query)
      ).slice(0, 20)
    : products.slice(0, 20);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleSelect(id: string) {
    onSelect(id);
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      {selected && !open ? (
        <button
          type="button"
          onClick={() => { setOpen(true); setQuery(''); }}
          className="w-full flex items-center gap-3 h-12 px-3 rounded-md border bg-background text-left text-base hover:bg-muted/50 transition-colors"
        >
          {selected.is_combo ? <Layers className="h-4 w-4 text-accent shrink-0" /> : <Package className="h-4 w-4 text-primary shrink-0" />}
          <span className="truncate flex-1">{selected.name}</span>
          {showStock && selected.stock !== undefined && (
            <span className="text-sm text-muted-foreground shrink-0">{selected.stock} un</span>
          )}
        </button>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="h-12 text-base pl-9"
            autoFocus={open}
          />
        </div>
      )}

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground text-center">Nenhum produto encontrado</p>
          ) : filtered.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelect(p.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left border-b last:border-0"
            >
              {p.is_combo ? <Layers className="h-4 w-4 text-accent shrink-0" /> : <Package className="h-4 w-4 text-primary shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.name}</p>
                {p.barcode && <p className="text-xs text-muted-foreground">{p.barcode}</p>}
              </div>
              {showPrice && p.sale_price !== undefined && (
                <span className="text-sm font-medium text-accent shrink-0">R$ {Number(p.sale_price).toFixed(2)}</span>
              )}
              {showStock && p.stock !== undefined && (
                <span className="text-xs text-muted-foreground shrink-0">{p.stock} un</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
