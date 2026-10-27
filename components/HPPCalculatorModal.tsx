import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Calculator, CheckCircle2 } from 'lucide-react';
import { formatIDR } from '../utils';

interface Ingredient {
  id: string;
  name: string;
  cost: number | '';
}

interface HPPCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  /** Menerima HPP per porsi hasil hitungan; harga jual diisi sendiri di form produk. */
  onApply: (hpp: number) => void;
}

/**
 * Kalkulator HPP: menjumlahkan biaya bahan dan overhead, lalu membaginya
 * per porsi.
 *
 * Panel "Saran Harga AI" (Gemini) dihapus atas permintaan — penentuan harga
 * jual dilakukan manual di form produk. Dengan begitu aplikasi tidak lagi
 * butuh GEMINI_API_KEY maupun panggilan ke layanan luar.
 */
export const HPPCalculatorModal: React.FC<HPPCalculatorModalProps> = ({ isOpen, onClose, productName, onApply }) => {
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ id: '1', name: '', cost: '' }]);
  const [overhead, setOverhead] = useState({ packaging: '' as number | '', other: '' as number | '' });
  const [portions, setPortions] = useState<number | ''>(1);

  if (!isOpen) return null;

  const handleAddIngredient = () => {
    setIngredients([...ingredients, { id: Date.now().toString(), name: '', cost: '' }]);
  };

  const handleRemoveIngredient = (id: string) => {
    setIngredients(ingredients.filter(i => i.id !== id));
  };

  const updateIngredient = (id: string, field: keyof Ingredient, value: string | number) => {
    setIngredients(ingredients.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const totalIngredients = ingredients.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
  const totalOverhead = (Number(overhead.packaging) || 0) + (Number(overhead.other) || 0);
  const totalCost = totalIngredients + totalOverhead;
  const p = Number(portions) || 1;
  const hppPerPortion = p > 0 ? Math.round(totalCost / p) : 0;

  return createPortal(
    <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black/60 backdrop-blur-sm z-[999999] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        <div className="p-6 md:p-8 bg-slate-50 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-xl text-slate-800 flex items-center gap-2">
              <Calculator className="text-primary" /> Kalkulator HPP
            </h3>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
          </div>

          <div className="mb-4">
            <p className="text-sm text-slate-500 font-medium mb-1">Produk Target:</p>
            <p className="font-bold text-lg text-slate-800">{productName || <span className="italic text-slate-400">Belum ada nama produk</span>}</p>
          </div>

          {/* Bahan Baku */}
          <div className="mb-6">
            <h4 className="font-bold text-sm text-slate-700 mb-3 flex justify-between items-center">
              <span>Bahan Baku / Komponen</span>
              <button onClick={handleAddIngredient} className="text-xs text-primary font-bold hover:underline flex items-center gap-1">
                <Plus size={14} /> Tambah
              </button>
            </h4>
            <div className="space-y-2">
              {ingredients.map(ing => (
                <div key={ing.id} className="flex items-center gap-2">
                  <div className="flex-1">
                    <input type="text" placeholder="Cth: Ayam 1kg" className="w-full border border-slate-300 px-3 py-2 rounded-lg text-sm outline-none focus:border-primary" value={ing.name} onChange={e => updateIngredient(ing.id, 'name', e.target.value)} />
                  </div>
                  <div className="w-1/3 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">Rp</span>
                    <input type="number" placeholder="0" className="w-full border border-slate-300 pl-8 pr-3 py-2 rounded-lg text-sm outline-none focus:border-primary" value={ing.cost} onChange={e => updateIngredient(ing.id, 'cost', Number(e.target.value))} />
                  </div>
                  <button onClick={() => handleRemoveIngredient(ing.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>

          {/* Overhead */}
          <div className="mb-6">
            <h4 className="font-bold text-sm text-slate-700 mb-3">Biaya Overhead (Opsional)</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Kemasan / Porsi</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">Rp</span>
                  <input type="number" placeholder="0" className="w-full border border-slate-300 pl-8 pr-3 py-2 rounded-lg text-sm outline-none focus:border-primary" value={overhead.packaging} onChange={e => setOverhead({ ...overhead, packaging: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Lainnya (Gas/Staf) / Porsi</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">Rp</span>
                  <input type="number" placeholder="0" className="w-full border border-slate-300 pl-8 pr-3 py-2 rounded-lg text-sm outline-none focus:border-primary" value={overhead.other} onChange={e => setOverhead({ ...overhead, other: Number(e.target.value) })} />
                </div>
              </div>
            </div>
          </div>

          {/* Pembagian Porsi */}
          <div className="mb-6 p-4 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <h4 className="font-bold text-sm text-slate-800">Menghasilkan berapa porsi?</h4>
              <p className="text-xs text-slate-500">Resep/modal di atas untuk berapa barang</p>
            </div>
            <input type="number" className="w-20 border border-slate-300 px-3 py-2 rounded-lg text-center font-bold outline-none focus:border-primary" value={portions} onChange={e => setPortions(Number(e.target.value))} />
          </div>

          {/* HPP Final */}
          <div className="p-5 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl flex items-center justify-between shadow-sm">
            <div>
              <p className="text-amber-800 text-sm font-bold">Total HPP per Porsi</p>
              <p className="text-xs text-amber-600/80">Modal murni per satu item</p>
            </div>
            <p className="text-2xl font-black text-amber-600">{formatIDR(hppPerPortion)}</p>
          </div>
        </div>

        <div className="p-5 bg-white border-t border-slate-200 flex flex-col gap-2">
          <button
            onClick={() => onApply(hppPerPortion)}
            disabled={hppPerPortion <= 0}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold shadow-sm transition-colors text-sm ${hppPerPortion > 0
              ? 'bg-primary text-white hover:bg-primary/90'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
          >
            <CheckCircle2 size={16} />
            Pakai HPP Ini ({formatIDR(hppPerPortion)})
          </button>
          <button onClick={onClose} className="w-full text-slate-400 text-xs hover:text-slate-600 py-1">Batal</button>
        </div>
      </div>
    </div>,
    document.body
  );
};
