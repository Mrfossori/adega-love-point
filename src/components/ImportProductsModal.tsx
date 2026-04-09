import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, Download, FileText, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { downloadCsv } from '@/lib/csv';

interface ImportResult {
  created: number;
  updated: number;
  failed: number;
  errors: { row: number; message: string }[];
}

interface ParsedRow {
  name: string;
  barcode: string;
  sale_price: number;
  cost_price: number;
  min_stock: number;
  current_stock: number | null;
  is_active: boolean;
}

function parseBool(v: string | undefined): boolean {
  if (!v) return true;
  const lower = v.trim().toLowerCase();
  return !['false', '0', 'no', 'não', 'nao', 'inativo'].includes(lower);
}

function parseNum(v: string | undefined): number | null {
  if (!v || v.trim() === '') return null;
  const n = Number(v.replace(',', '.'));
  return isNaN(n) ? NaN : n;
}

function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',' || ch === ';') {
        row.push(current.trim());
        current = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(current.trim());
        if (row.some(c => c !== '')) rows.push(row);
        row = [];
        current = '';
      } else {
        current += ch;
      }
    }
  }
  row.push(current.trim());
  if (row.some(c => c !== '')) rows.push(row);
  return rows;
}

export default function ImportProductsModal({
  open,
  onOpenChange,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onComplete: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string[][] | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  function handleDownloadTemplate() {
    downloadCsv('template_produtos.csv', ['name', 'barcode', 'sale_price', 'cost_price', 'min_stock', 'current_stock', 'is_active'], [
      ['Produto Exemplo', '7891234567890', '19.90', '12.50', '5', '20', 'true'],
    ]);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCsvText(text);
      if (parsed.length < 2) {
        toast.error('Arquivo CSV vazio ou sem dados.');
        return;
      }
      const h = parsed[0].map(c => c.toLowerCase().replace(/\s+/g, '_'));
      setHeaders(h);
      const dataRows = parsed.slice(1);
      setRawRows(dataRows);
      setPreview(dataRows.slice(0, 5));
    };
    reader.readAsText(file, 'UTF-8');
  }

  async function handleImport() {
    if (rawRows.length === 0) return;
    setProcessing(true);
    const res: ImportResult = { created: 0, updated: 0, failed: 0, errors: [] };

    const nameIdx = headers.indexOf('name');
    const barcodeIdx = headers.indexOf('barcode');
    const salePriceIdx = headers.indexOf('sale_price');
    const costPriceIdx = headers.indexOf('cost_price');
    const minStockIdx = headers.indexOf('min_stock');
    const currentStockIdx = headers.indexOf('current_stock');
    const isActiveIdx = headers.indexOf('is_active');

    if (nameIdx === -1) {
      toast.error('Coluna "name" não encontrada no CSV.');
      setProcessing(false);
      return;
    }

    // Fetch existing products and stock
    const { data: existingProducts } = await supabase.from('products').select('*');
    const { data: snapshots } = await supabase.from('stock_snapshot').select('*');
    const stockMap = new Map((snapshots || []).map(s => [s.product_id, s.quantity]));
    const byBarcode = new Map((existingProducts || []).filter(p => p.barcode).map(p => [p.barcode!, p]));
    const byName = new Map((existingProducts || []).map(p => [p.name.toLowerCase().trim(), p]));

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowNum = i + 2; // 1-indexed + header
      try {
        const name = row[nameIdx]?.trim();
        if (!name) { res.failed++; res.errors.push({ row: rowNum, message: 'Nome vazio' }); continue; }

        const salePrice = parseNum(row[salePriceIdx]);
        if (salePrice !== null && isNaN(salePrice)) { res.failed++; res.errors.push({ row: rowNum, message: 'sale_price inválido' }); continue; }

        const costPrice = parseNum(row[costPriceIdx]);
        if (costPrice !== null && isNaN(costPrice)) { res.failed++; res.errors.push({ row: rowNum, message: 'cost_price inválido' }); continue; }

        const minStock = parseNum(row[minStockIdx]);
        if (minStock !== null && isNaN(minStock)) { res.failed++; res.errors.push({ row: rowNum, message: 'min_stock inválido' }); continue; }

        const currentStock = parseNum(row[currentStockIdx]);
        if (currentStock !== null && isNaN(currentStock)) { res.failed++; res.errors.push({ row: rowNum, message: 'current_stock inválido' }); continue; }

        const barcode = barcodeIdx >= 0 ? (row[barcodeIdx]?.trim() || '') : '';
        const isActive = parseBool(row[isActiveIdx]);

        // Match existing product
        let existing = barcode ? byBarcode.get(barcode) : undefined;
        if (!existing && !barcode) existing = byName.get(name.toLowerCase().trim());

        const productData: any = {
          name,
          barcode: barcode || null,
          sale_price: salePrice ?? 0,
          cost_price: costPrice ?? 0,
          min_stock: minStock ?? 0,
          is_active: isActive,
        };

        let productId: string;

        if (existing) {
          productData.id = existing.id;
          const { error } = await supabase.from('products').update(productData).eq('id', existing.id);
          if (error) throw error;
          productId = existing.id;
          res.updated++;
        } else {
          const { data: inserted, error } = await supabase.from('products').insert(productData).select().single();
          if (error) throw error;
          productId = inserted.id;
          res.created++;
          // Add to maps for dedup within the same import
          if (barcode) byBarcode.set(barcode, { ...productData, id: productId } as any);
          byName.set(name.toLowerCase().trim(), { ...productData, id: productId } as any);
        }

        // Stock adjustment
        if (currentStock !== null && currentStock >= 0) {
          const existingStock = stockMap.get(productId) ?? 0;
          const diff = currentStock - existingStock;
          if (diff !== 0) {
            const { error: mErr } = await supabase.from('inventory_movements').insert({
              product_id: productId,
              direction: diff > 0 ? 'IN' : 'OUT',
              reason: 'adjustment',
              quantity: Math.abs(diff),
              note: `Importação CSV (ajuste ${existingStock} → ${currentStock})`,
            });
            if (mErr) throw mErr;
            stockMap.set(productId, currentStock);
          }
        }
      } catch (e: any) {
        res.failed++;
        res.errors.push({ row: rowNum, message: e.message || 'Erro desconhecido' });
      }
    }

    setResult(res);
    setProcessing(false);
    if (res.created > 0 || res.updated > 0) onComplete();
  }

  function handleClose(v: boolean) {
    if (!v) {
      setPreview(null);
      setHeaders([]);
      setRawRows([]);
      setResult(null);
      if (fileRef.current) fileRef.current.value = '';
    }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <Upload className="h-5 w-5" /> Importar Produtos (CSV)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Instructions */}
          <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
            <p className="font-medium">Colunas aceitas:</p>
            <p className="text-muted-foreground">
              <code>name</code> (obrigatório), <code>barcode</code>, <code>sale_price</code>, <code>cost_price</code>, <code>min_stock</code>, <code>current_stock</code>, <code>is_active</code>
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              Se o código de barras existir, atualiza o produto. Senão, busca por nome exato. Se não encontrar, cria novo.
            </p>
          </div>

          {/* Template + Upload */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleDownloadTemplate} className="gap-2">
              <Download className="h-4 w-4" /> Baixar Template CSV
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()} className="gap-2 flex-1">
              <FileText className="h-4 w-4" /> Selecionar Arquivo CSV
            </Button>
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
          </div>

          {/* Preview */}
          {preview && preview.length > 0 && !result && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Pré-visualização ({rawRows.length} linhas):</p>
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted">
                      {headers.map((h, i) => (
                        <th key={i} className="px-2 py-1 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, ri) => (
                      <tr key={ri} className="border-t">
                        {headers.map((_, ci) => (
                          <td key={ci} className="px-2 py-1 truncate max-w-[150px]">{row[ci] || ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rawRows.length > 5 && <p className="text-xs text-muted-foreground">... e mais {rawRows.length - 5} linhas</p>}

              <Button onClick={handleImport} disabled={processing} className="w-full h-12 text-lg gap-2">
                {processing ? 'Processando...' : `Processar Importação (${rawRows.length} linhas)`}
              </Button>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <p className="text-lg font-semibold">Resultado da Importação</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-success/10 rounded-lg p-3 text-center">
                  <CheckCircle className="h-6 w-6 text-success mx-auto mb-1" />
                  <p className="text-2xl font-bold text-success">{result.created}</p>
                  <p className="text-xs text-muted-foreground">Criados</p>
                </div>
                <div className="bg-primary/10 rounded-lg p-3 text-center">
                  <FileText className="h-6 w-6 text-primary mx-auto mb-1" />
                  <p className="text-2xl font-bold text-primary">{result.updated}</p>
                  <p className="text-xs text-muted-foreground">Atualizados</p>
                </div>
                <div className="bg-destructive/10 rounded-lg p-3 text-center">
                  <XCircle className="h-6 w-6 text-destructive mx-auto mb-1" />
                  <p className="text-2xl font-bold text-destructive">{result.failed}</p>
                  <p className="text-xs text-muted-foreground">Falhas</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="border border-destructive/30 rounded-lg p-3 space-y-1 max-h-40 overflow-y-auto">
                  <p className="text-sm font-medium flex items-center gap-1 text-destructive">
                    <AlertTriangle className="h-4 w-4" /> Erros por linha:
                  </p>
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      <span className="font-medium">Linha {err.row}:</span> {err.message}
                    </p>
                  ))}
                </div>
              )}

              <Button variant="outline" onClick={() => handleClose(false)} className="w-full h-12">
                Fechar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
