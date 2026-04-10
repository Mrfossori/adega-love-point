import { useState } from 'react';
import { Package, Warehouse, ShoppingCart, BarChart3, Wine, LayoutDashboard } from 'lucide-react';
import DashboardPage from '@/pages/DashboardPage';
import ProductsPage from '@/pages/ProductsPage';
import StockPage from '@/pages/StockPage';
import PosPage from '@/pages/PosPage';
import ReportsPage from '@/pages/ReportsPage';

const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'pos', label: 'PDV', icon: ShoppingCart },
  { id: 'products', label: 'Produtos', icon: Package },
  { id: 'stock', label: 'Estoque', icon: Warehouse },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
] as const;

type Tab = typeof tabs[number]['id'];

export default function Index() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-card border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wine className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold">Adega<span className="text-primary">ERP</span></h1>
        </div>
        <nav className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 rounded-lg text-base font-medium transition-colors
                ${activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-muted-foreground'
                }`}
            >
              <tab.icon className="h-5 w-5" />
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Content */}
      <main className="flex-1 p-6 overflow-y-auto">
        {activeTab === 'dashboard' && <DashboardPage />}
        {activeTab === 'pos' && <PosPage />}
        {activeTab === 'products' && <ProductsPage />}
        {activeTab === 'stock' && <StockPage />}
        {activeTab === 'reports' && <ReportsPage />}
      </main>
    </div>
  );
}
