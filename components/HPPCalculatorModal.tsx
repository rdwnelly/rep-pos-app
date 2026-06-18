import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Calculator, Sparkles, AlertCircle, TrendingUp, CheckCircle2 } from 'lucide-react';
import { formatIDR } from '../utils';

interface Ingredient {
  id: string;
  name: string;
  cost: number | '';
}

interface PriceSuggestion {
  tier: string;
  price: number;
  marginPercentage: number;
  reasoning: string;
}

interface HPPCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  categoryName: string;
  onApply: (hpp: number, selectedPrice: number, allSuggestions: PriceSuggestion[]) => void;
}

export const HPPCalculatorModal: React.FC<HPPCalculatorModalProps> = ({ isOpen, onClose, productName, categoryName, onApply }) => {
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ id: '1', name: '', cost: '' }]);
  const [overhead, setOverhead] = useState({ packaging: '' as number | '', labor: '' as number | '', other: '' as number | '' });
  const [portions, setPortions] = useState<number | ''>(1);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [suggestions, setSuggestions] = useState<PriceSuggestion[]>([]);
  const [aiError, setAiError] = useState('');

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
  const totalOverhead = (Number(overhead.packaging) || 0) + (Number(overhead.labor) || 0) + (Number(overhead.other) || 0);
  const totalCost = totalIngredients + totalOverhead;
  const p = Number(portions) || 1;
  const hppPerPortion = p > 0 ? Math.round(totalCost / p) : 0;

  const fetchAISuggestions = async () => {
    if (!productName) {
      alert('Nama produk di form utama belum diisi. Silakan isi terlebih dahulu untuk mendapatkan saran yang relevan.');
      return;
    }
    if (hppPerPortion <= 0) {
      alert('HPP total tidak boleh nol. Pastikan Anda memasukkan estimasi biaya.');
      return;
    }

    setIsLoadingAI(true);
    setAiError('');
    try {
      const res = await fetch('/api/ai/suggest-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName, category: categoryName, hpp: hppPerPortion })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Terjadi kesalahan sistem saat menghubungi AI.');
      }

      setSuggestions(data.data);
    } catch (err: any) {
      setAiError(err.message);
    } finally {
      setIsLoadingAI(false);
    }
  };

  const handleSelectOption = (suggestion: PriceSuggestion) => {
    onApply(hppPerPortion, suggestion.price, suggestions);
  };

  return createPortal(
    <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black/60 backdrop-blur-sm z-[999999] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]">
        
        {/* Kiri: Kalkulator HPP */}
        <div className="flex-1 p-6 md:p-8 bg-slate-50 border-r border-slate-200 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-xl text-slate-800 flex items-center gap-2">
              <Calculator className="text-primary" /> Kalkulator HPP
            </h3>
            <button onClick={onClose} className="md:hidden p-2 text-slate-400 hover:text-slate-600"><X size={20}/></button>
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
                <Plus size={14}/> Tambah
              </button>
            </h4>
            <div className="space-y-2">
              {ingredients.map((ing, idx) => (
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
                  <input type="number" placeholder="0" className="w-full border border-slate-300 pl-8 pr-3 py-2 rounded-lg text-sm outline-none focus:border-primary" value={overhead.packaging} onChange={e => setOverhead({...overhead, packaging: Number(e.target.value)})} />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Lainnya (Gas/Staf) / Porsi</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">Rp</span>
                  <input type="number" placeholder="0" className="w-full border border-slate-300 pl-8 pr-3 py-2 rounded-lg text-sm outline-none focus:border-primary" value={overhead.other} onChange={e => setOverhead({...overhead, other: Number(e.target.value)})} />
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

        {/* Kanan: AI Saran Harga */}
        <div className="flex-1 p-6 md:p-8 bg-white overflow-y-auto flex flex-col relative">
          <button onClick={onClose} className="hidden md:block absolute top-6 right-6 p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"><X size={20}/></button>
          
          <div className="mb-6">
            <h3 className="font-bold text-xl text-slate-800 flex items-center gap-2">
              <Sparkles className="text-indigo-500" /> Saran Harga AI
            </h3>
            <p className="text-sm text-slate-500 mt-1">Dapatkan rekomendasi margin yang sehat dan strategi harga dari Gemini AI.</p>
          </div>

          {suggestions.length === 0 && !isLoadingAI && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
                <Sparkles size={40} className="text-indigo-400" />
              </div>
              <p className="text-slate-600 font-medium mb-6">Hitung HPP Anda di kiri, lalu minta AI membuatkan 3 opsi harga jual terbaik.</p>
              <button onClick={fetchAISuggestions} className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:-translate-y-0.5 transition-all flex items-center gap-2">
                <Sparkles size={18} /> Minta Saran Harga AI
              </button>
              
              {aiError && (
                <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-start gap-2 text-left">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <p>{aiError}</p>
                </div>
              )}
            </div>
          )}

          {isLoadingAI && (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
              <p className="text-slate-600 font-medium animate-pulse">Gemini sedang menganalisis harga...</p>
            </div>
          )}

          {suggestions.length > 0 && !isLoadingAI && (
            <div className="space-y-4 flex-1">
              {suggestions.map((sug, idx) => (
                <div key={idx} className="border border-slate-200 rounded-2xl p-5 hover:border-indigo-300 hover:shadow-md transition-all group">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className={`text-xs font-bold px-2 py-1 rounded uppercase tracking-wider ${
                        sug.tier === 'Ekonomis' ? 'bg-green-100 text-green-700' :
                        sug.tier === 'Standar' ? 'bg-blue-100 text-blue-700' :
                        'bg-purple-100 text-purple-700'
                      }`}>
                        {sug.tier}
                      </span>
                      <p className="text-2xl font-black text-slate-800 mt-2">{formatIDR(sug.price)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500 font-medium mb-1">Margin Target</p>
                      <p className="text-sm font-bold text-slate-700 flex items-center justify-end gap-1">
                        <TrendingUp size={14} className="text-indigo-500" /> {sug.marginPercentage}%
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-xl mb-4 italic">
                    "{sug.reasoning}"
                  </p>
                  <button onClick={() => handleSelectOption(sug)} className="w-full py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-indigo-600 hover:text-white transition-colors flex items-center justify-center gap-2 group-hover:bg-indigo-50 group-hover:text-indigo-600">
                    <CheckCircle2 size={18} /> Gunakan Harga Ini
                  </button>
                </div>
              ))}
              
              <button onClick={fetchAISuggestions} className="w-full py-3 text-indigo-600 font-bold hover:underline text-sm flex justify-center items-center gap-2">
                <Sparkles size={16} /> Regenerate Analisis AI
              </button>
            </div>
          )}

        </div>
      </div>
    </div>, document.body
  );
};
