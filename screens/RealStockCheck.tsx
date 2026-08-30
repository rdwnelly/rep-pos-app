import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../hooks/useData';
import { StorageService } from '../services/storage';
import { Product, StockAdjustment, User, Category, StoreSettings } from '../types';
import { formatDate, formatDateDateOnly, formatTimeOnly, generateUUID, formatIDR, exportToCSV, exportToExcel } from '../utils';
import {
    Search, Filter, RotateCcw, Save, Package, TrendingUp, TrendingDown,
    FileText, Printer, Download, FileSpreadsheet, Calendar, X, Trash2,
    CheckCircle2, AlertTriangle, ArrowRight, ClipboardCheck, Tag, Layers,
    CheckSquare, RefreshCw, HelpCircle, ArrowUpDown, ChevronDown, Check,
    AlertCircle, Sparkles, CheckCheck, Clock, CalendarDays, Sun, History,
    CalendarCheck, CalendarRange
} from 'lucide-react';

interface RealStockCheckProps {
    currentUser: User | null;
}

export const RealStockCheck: React.FC<RealStockCheckProps> = ({ currentUser }) => {
    // Data Loading
    const products = useData(() => StorageService.getProducts(), [], 'products') || [];
    const stockAdjustments = useData(() => StorageService.getStockAdjustments(), [], 'stock_adjustments') || [];
    const categories = useData(() => StorageService.getCategories(), [], 'categories') || [];
    const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);

    useEffect(() => {
        StorageService.getStoreSettings().then(setStoreSettings).catch(console.error);
    }, []);

    // Main View Tab: 'worksheet' (Lembar Kerja Opname Masal) vs 'single' (Input Cepat 1 Produk)
    const [activeTab, setActiveTab] = useState<'worksheet' | 'single'>('worksheet');

    // ==========================================
    // DATE & TIME PICKER UTILITIES
    // ==========================================
    const getNowDateTimeLocal = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    // Shared Input Date, Day & Time State for Stock Opname
    const [opnameDateTime, setOpnameDateTime] = useState<string>(getNowDateTimeLocal());

    // Helper for Day Name in Indonesian
    const getDayName = (dateStr: string) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleDateString('id-ID', { weekday: 'long' });
    };

    const getFullDateDisplay = (dateStr: string) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    };

    const getTimeDisplay = (dateStr: string) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Constant Standard Reasons
    const REDUCTION_REASONS = [
        'Rusak / Cacat',
        'Kadaluarsa (Expired)',
        'Hilang / Tidak Ditemukan',
        'Salah Input / Catat Kasir',
        'Pengambilan Sampel / Uji Coba',
        'Pengecekan Manual (Opname)',
        'Lain-lain'
    ];

    const ADDITION_REASONS = [
        'Bonus / Hadiah Supplier',
        'Salah Hitung Sebelumnya',
        'Retur Masuk Belum Tercatat',
        'Temuan Stok',
        'Pengecekan Manual (Opname)',
        'Lain-lain'
    ];

    // ==========================================
    // 1. WORKSHEET / BATCH OPNAME STATE
    // ==========================================
    const [worksheetCategoryFilter, setWorksheetCategoryFilter] = useState('');
    const [worksheetStatusFilter, setWorksheetStatusFilter] = useState<'all' | 'variance' | 'matching' | 'empty'>('all');
    const [worksheetSearch, setWorksheetSearch] = useState('');
    const [worksheetInputs, setWorksheetInputs] = useState<Record<string, {
        physicalStock: string;
        reason: string;
        customReason?: string;
        note?: string;
    }>>({});
    const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
    const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);

    // Filtered Products in Worksheet
    const filteredWorksheetProducts = useMemo(() => {
        return products.filter(p => {
            if (worksheetCategoryFilter && p.categoryId !== worksheetCategoryFilter && p.categoryName !== worksheetCategoryFilter) {
                return false;
            }
            if (worksheetSearch) {
                const q = worksheetSearch.toLowerCase();
                const matchName = p.name.toLowerCase().includes(q);
                const matchSku = p.sku?.toLowerCase().includes(q);
                const matchCat = p.categoryName?.toLowerCase().includes(q);
                if (!matchName && !matchSku && !matchCat) return false;
            }

            const input = worksheetInputs[p.id];
            const hasInput = input && input.physicalStock !== '';
            const physStock = hasInput ? parseInt(input.physicalStock) : NaN;
            const isMatching = !isNaN(physStock) && physStock === p.stock;
            const hasVariance = !isNaN(physStock) && physStock !== p.stock;

            if (worksheetStatusFilter === 'variance' && !hasVariance) return false;
            if (worksheetStatusFilter === 'matching' && !isMatching) return false;
            if (worksheetStatusFilter === 'empty' && hasInput) return false;

            return true;
        }).sort((a, b) => a.name.localeCompare(b.name));
    }, [products, worksheetCategoryFilter, worksheetSearch, worksheetInputs, worksheetStatusFilter]);

    // Worksheet Summary Metrics
    const worksheetSummary = useMemo(() => {
        let totalChecked = 0;
        let totalMatching = 0;
        let totalSurplusCount = 0;
        let totalSurplusQty = 0;
        let totalSurplusValue = 0;
        let totalDeficitCount = 0;
        let totalDeficitQty = 0;
        let totalDeficitValue = 0;

        filteredWorksheetProducts.forEach(p => {
            const input = worksheetInputs[p.id];
            if (input && input.physicalStock !== '') {
                const physStock = parseInt(input.physicalStock);
                if (!isNaN(physStock)) {
                    totalChecked++;
                    const diff = physStock - p.stock;
                    const hpp = p.hpp || 0;
                    if (diff === 0) {
                        totalMatching++;
                    } else if (diff > 0) {
                        totalSurplusCount++;
                        totalSurplusQty += diff;
                        totalSurplusValue += (diff * hpp);
                    } else {
                        totalDeficitCount++;
                        totalDeficitQty += Math.abs(diff);
                        totalDeficitValue += (Math.abs(diff) * hpp);
                    }
                }
            }
        });

        const totalToAdjust = totalSurplusCount + totalDeficitCount;
        const netQty = totalSurplusQty - totalDeficitQty;
        const netValue = totalSurplusValue - totalDeficitValue;

        return {
            totalProducts: filteredWorksheetProducts.length,
            totalChecked,
            totalUnchecked: filteredWorksheetProducts.length - totalChecked,
            totalMatching,
            totalSurplusCount,
            totalSurplusQty,
            totalSurplusValue,
            totalDeficitCount,
            totalDeficitQty,
            totalDeficitValue,
            totalToAdjust,
            netQty,
            netValue
        };
    }, [filteredWorksheetProducts, worksheetInputs]);

    // Update single row in worksheet
    const handleWorksheetChange = (productId: string, field: 'physicalStock' | 'reason' | 'customReason' | 'note', value: string) => {
        setWorksheetInputs(prev => {
            const current = prev[productId] || {
                physicalStock: '',
                reason: 'Pengecekan Manual (Opname)',
                customReason: '',
                note: ''
            };
            return {
                ...prev,
                [productId]: {
                    ...current,
                    [field]: value
                }
            };
        });
    };

    // Auto fill all visible products with system stock (Match all)
    const handleMarkAllMatching = () => {
        setWorksheetInputs(prev => {
            const updated = { ...prev };
            filteredWorksheetProducts.forEach(p => {
                if (!updated[p.id] || updated[p.id].physicalStock === '') {
                    updated[p.id] = {
                        physicalStock: p.stock.toString(),
                        reason: 'Pengecekan Manual (Opname)',
                        customReason: '',
                        note: updated[p.id]?.note || ''
                    };
                }
            });
            return updated;
        });
    };

    // Reset Worksheet Inputs
    const handleResetWorksheet = () => {
        if (Object.keys(worksheetInputs).length === 0) return;
        if (confirm("Kosongkan semua input hasil hitungan fisik pada lembar kerja saat ini?")) {
            setWorksheetInputs({});
        }
    };

    // Submit Bulk Worksheet Opname
    const handleBulkWorksheetSubmit = async () => {
        const itemsToAdjust: { product: Product; physicalStock: number; diff: number; reason: string; note: string }[] = [];

        for (const p of products) {
            const input = worksheetInputs[p.id];
            if (input && input.physicalStock !== '') {
                const physStock = parseInt(input.physicalStock);
                if (!isNaN(physStock) && physStock !== p.stock) {
                    const diff = physStock - p.stock;
                    const finalReason = input.reason === 'Lain-lain'
                        ? (input.customReason || 'Pengecekan Manual (Opname)')
                        : (input.reason || 'Pengecekan Manual (Opname)');

                    itemsToAdjust.push({
                        product: p,
                        physicalStock: physStock,
                        diff,
                        reason: finalReason,
                        note: input.note || ''
                    });
                }
            }
        }

        if (itemsToAdjust.length === 0) {
            alert("Tidak ada produk dengan selisih stok yang perlu disesuaikan. Pastikan Anda telah mengisi stok fisik real yang berbeda dengan stok sistem.");
            return;
        }

        const dateFormatted = getFullDateDisplay(opnameDateTime);
        const timeFormatted = getTimeDisplay(opnameDateTime);

        const confirmMsg = `Konfirmasi Simpan Stock Opname:\n\n` +
            `• Waktu Opname: ${dateFormatted} pukul ${timeFormatted} WIB\n` +
            `• Jumlah Produk Disesuaikan: ${itemsToAdjust.length} produk\n` +
            `• Total Selisih Lebih (+): +${worksheetSummary.totalSurplusQty} unit (${formatIDR(worksheetSummary.totalSurplusValue)})\n` +
            `• Total Selisih Kurang (-): -${worksheetSummary.totalDeficitQty} unit (${formatIDR(worksheetSummary.totalDeficitValue)})\n` +
            `• Dampak Finansial Bersih: ${worksheetSummary.netValue >= 0 ? '+' : ''}${formatIDR(worksheetSummary.netValue)}\n\n` +
            `Lanjutkan menyimpan seluruh penyesuaian stok ini ke sistem?`;

        if (!confirm(confirmMsg)) return;

        setIsBulkSubmitting(true);
        setBulkProgress({ current: 0, total: itemsToAdjust.length });

        const adjustmentIsoDate = opnameDateTime ? new Date(opnameDateTime).toISOString() : new Date().toISOString();

        try {
            for (let i = 0; i < itemsToAdjust.length; i++) {
                const item = itemsToAdjust[i];
                const adjustmentType = item.diff > 0 ? 'INCREASE' : 'DECREASE';
                const qty = Math.abs(item.diff);

                const adjustment: StockAdjustment = {
                    id: generateUUID(),
                    date: adjustmentIsoDate,
                    productId: item.product.id,
                    productName: item.product.name,
                    type: adjustmentType,
                    reason: item.reason,
                    qty: qty,
                    previousStock: item.product.stock,
                    currentStock: item.physicalStock,
                    note: item.note,
                    userId: currentUser?.id,
                    userName: currentUser?.name
                };

                await StorageService.addStockAdjustment(adjustment);
                setBulkProgress({ current: i + 1, total: itemsToAdjust.length });
            }

            // Clear submitted items from worksheet
            setWorksheetInputs({});
            alert(`✅ Berhasil menyimpan ${itemsToAdjust.length} penyesuaian stock opname pada ${dateFormatted} pukul ${timeFormatted} WIB!`);
        } catch (error: any) {
            console.error('Error saving bulk opname:', error);
            alert(`Gagal menyimpan sebagian opname: ${error.message || 'Terjadi kesalahan'}`);
        } finally {
            setIsBulkSubmitting(false);
            setBulkProgress(null);
        }
    };

    // ==========================================
    // 2. SINGLE ITEM QUICK OPNAME STATE
    // ==========================================
    const [selectedProductId, setSelectedProductId] = useState('');
    const [singleInputMode, setSingleInputMode] = useState<'FINAL' | 'MANUAL'>('FINAL');
    const [finalStockInput, setFinalStockInput] = useState('');
    const [adjustmentType, setAdjustmentType] = useState<'INCREASE' | 'DECREASE'>('DECREASE');
    const [reason, setReason] = useState('Pengecekan Manual (Opname)');
    const [customReason, setCustomReason] = useState('');
    const [qty, setQty] = useState('');
    const [note, setNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Product Search Dropdown State
    const [productSearchTerm, setProductSearchTerm] = useState('');
    const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);

    const selectedProduct = useMemo(() => products.find(p => p.id === selectedProductId), [products, selectedProductId]);

    // Single item auto calculation when in FINAL mode
    useEffect(() => {
        if (singleInputMode === 'FINAL' && selectedProduct && finalStockInput !== '') {
            const finalStock = parseInt(finalStockInput);
            if (!isNaN(finalStock)) {
                const diff = finalStock - selectedProduct.stock;
                if (diff > 0) {
                    setAdjustmentType('INCREASE');
                    setQty(diff.toString());
                } else if (diff < 0) {
                    setAdjustmentType('DECREASE');
                    setQty(Math.abs(diff).toString());
                } else {
                    setQty('0');
                }
            } else {
                setQty('');
            }
        }
    }, [singleInputMode, finalStockInput, selectedProduct]);

    // Reset single item fields when selected product changes
    useEffect(() => {
        setFinalStockInput('');
        setQty('');
        setReason('Pengecekan Manual (Opname)');
        setCustomReason('');
        setNote('');
    }, [selectedProductId]);

    const handleSingleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProduct || !qty || !reason) return;

        const quantity = parseInt(qty);
        if (isNaN(quantity) || quantity <= 0) {
            alert("Jumlah selisih stok harus berupa angka positif.");
            return;
        }

        if (adjustmentType === 'DECREASE' && quantity > selectedProduct.stock) {
            alert(`Stok sistem tidak mencukupi untuk pengurangan ${quantity} unit (stok saat ini: ${selectedProduct.stock}).`);
            return;
        }

        const finalReason = reason === 'Lain-lain' ? (customReason || 'Lain-lain') : reason;
        const previousStock = selectedProduct.stock;
        const currentStock = adjustmentType === 'INCREASE' ? previousStock + quantity : previousStock - quantity;
        const adjustmentIsoDate = opnameDateTime ? new Date(opnameDateTime).toISOString() : new Date().toISOString();

        setIsSubmitting(true);
        try {
            const adjustment: StockAdjustment = {
                id: generateUUID(),
                date: adjustmentIsoDate,
                productId: selectedProduct.id,
                productName: selectedProduct.name,
                type: adjustmentType,
                reason: finalReason,
                qty: quantity,
                previousStock: previousStock,
                currentStock: currentStock,
                note: note,
                userId: currentUser?.id,
                userName: currentUser?.name
            };

            await StorageService.addStockAdjustment(adjustment);

            // Reset Form
            setQty('');
            setNote('');
            setReason('Pengecekan Manual (Opname)');
            setCustomReason('');
            setFinalStockInput('');
            setProductSearchTerm('');
            setSelectedProductId('');
            setIsProductDropdownOpen(false);

            alert(`✅ Penyesuaian stok real untuk "${selectedProduct.name}" berhasil disimpan pada ${getFullDateDisplay(opnameDateTime)} pukul ${getTimeDisplay(opnameDateTime)} WIB.`);
        } catch (error: any) {
            console.error(error);
            alert(`Gagal menyimpan data penyesuaian stok: ${error.message || 'Terjadi kesalahan'}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    // ==========================================
    // 3. HISTORY & DAILY GROUPING STATE
    // ==========================================
    const [historyViewMode, setHistoryViewMode] = useState<'daily' | 'flat'>('daily');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [historySearchQuery, setHistorySearchQuery] = useState('');
    const [historyCategoryFilter, setHistoryCategoryFilter] = useState('');
    const [historyTypeFilter, setHistoryTypeFilter] = useState<'ALL' | 'INCREASE' | 'DECREASE'>('ALL');
    const [historyReasonFilter, setHistoryReasonFilter] = useState('');

    // Quick Date Filter Helpers
    const setQuickDateFilter = (type: 'today' | 'yesterday' | '7days' | 'thisMonth' | 'all') => {
        const now = new Date();
        const formatDateString = (d: Date) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        if (type === 'today') {
            const todayStr = formatDateString(now);
            setStartDate(todayStr);
            setEndDate(todayStr);
        } else if (type === 'yesterday') {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const yestStr = formatDateString(yesterday);
            setStartDate(yestStr);
            setEndDate(yestStr);
        } else if (type === '7days') {
            const sevenDaysAgo = new Date(now);
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
            setStartDate(formatDateString(sevenDaysAgo));
            setEndDate(formatDateString(now));
        } else if (type === 'thisMonth') {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            setStartDate(formatDateString(firstDay));
            setEndDate(formatDateString(now));
        } else if (type === 'all') {
            setStartDate('');
            setEndDate('');
        }
    };

    // Available reasons in history
    const availableHistoryReasons = useMemo(() => {
        const set = new Set<string>();
        stockAdjustments.forEach(item => {
            if (item.reason) set.add(item.reason);
        });
        return Array.from(set).sort();
    }, [stockAdjustments]);

    // Sorted & Filtered Adjustments History
    const filteredAdjustments = useMemo(() => {
        let items = [...stockAdjustments];

        if (startDate || endDate) {
            items = items.filter(item => {
                const itemDateStr = new Date(item.date).toISOString().split('T')[0];
                if (startDate && itemDateStr < startDate) return false;
                if (endDate && itemDateStr > endDate) return false;
                return true;
            });
        }

        if (historyTypeFilter !== 'ALL') {
            items = items.filter(item => item.type === historyTypeFilter);
        }

        if (historyReasonFilter) {
            items = items.filter(item => item.reason === historyReasonFilter);
        }

        if (historyCategoryFilter) {
            items = items.filter(item => {
                const product = products.find(p => p.id === item.productId);
                return product && (product.categoryId === historyCategoryFilter || product.categoryName === historyCategoryFilter);
            });
        }

        if (historySearchQuery) {
            const q = historySearchQuery.toLowerCase();
            items = items.filter(item =>
                item.productName?.toLowerCase().includes(q) ||
                item.reason?.toLowerCase().includes(q) ||
                item.note?.toLowerCase().includes(q) ||
                item.userName?.toLowerCase().includes(q)
            );
        }

        return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [stockAdjustments, startDate, endDate, historyTypeFilter, historyReasonFilter, historyCategoryFilter, historySearchQuery, products]);

    // Grouped Adjustments by Day
    const groupedAdjustmentsByDay = useMemo(() => {
        const groups: Record<string, {
            dateKey: string;
            dayName: string;
            formattedDate: string;
            items: StockAdjustment[];
            totalIncreaseQty: number;
            totalIncreaseValue: number;
            totalDecreaseQty: number;
            totalDecreaseValue: number;
            netQty: number;
            netValue: number;
        }> = {};

        filteredAdjustments.forEach(item => {
            const d = new Date(item.date);
            const dateKey = isNaN(d.getTime()) ? 'Lainnya' : d.toISOString().split('T')[0];

            if (!groups[dateKey]) {
                const dayName = isNaN(d.getTime()) ? '-' : d.toLocaleDateString('id-ID', { weekday: 'long' });
                const formattedDate = isNaN(d.getTime()) ? '-' : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
                groups[dateKey] = {
                    dateKey,
                    dayName,
                    formattedDate,
                    items: [],
                    totalIncreaseQty: 0,
                    totalIncreaseValue: 0,
                    totalDecreaseQty: 0,
                    totalDecreaseValue: 0,
                    netQty: 0,
                    netValue: 0
                };
            }

            const product = products.find(p => p.id === item.productId);
            const hpp = product?.hpp || 0;
            const val = item.qty * hpp;

            groups[dateKey].items.push(item);
            if (item.type === 'INCREASE') {
                groups[dateKey].totalIncreaseQty += item.qty;
                groups[dateKey].totalIncreaseValue += val;
            } else {
                groups[dateKey].totalDecreaseQty += item.qty;
                groups[dateKey].totalDecreaseValue += val;
            }
        });

        Object.values(groups).forEach(g => {
            g.netQty = g.totalIncreaseQty - g.totalDecreaseQty;
            g.netValue = g.totalIncreaseValue - g.totalDecreaseValue;
        });

        return Object.values(groups).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    }, [filteredAdjustments, products]);

    // Summary Statistics for Historical Adjustments
    const summaryStats = useMemo(() => {
        let totalIncreaseQty = 0;
        let totalIncreaseValue = 0;
        let totalDecreaseQty = 0;
        let totalDecreaseValue = 0;

        filteredAdjustments.forEach(adj => {
            const product = products.find(p => p.id === adj.productId);
            const hpp = product?.hpp || 0;
            const val = adj.qty * hpp;

            if (adj.type === 'INCREASE') {
                totalIncreaseQty += adj.qty;
                totalIncreaseValue += val;
            } else {
                totalDecreaseQty += adj.qty;
                totalDecreaseValue += val;
            }
        });

        return {
            totalAdjustments: filteredAdjustments.length,
            totalDays: groupedAdjustmentsByDay.length,
            totalIncreaseQty,
            totalIncreaseValue,
            totalDecreaseQty,
            totalDecreaseValue,
            netQtyDiff: totalIncreaseQty - totalDecreaseQty,
            netValueDiff: totalIncreaseValue - totalDecreaseValue
        };
    }, [filteredAdjustments, groupedAdjustmentsByDay, products]);

    // Delete / Revert an adjustment
    const handleDeleteAdjustment = async (adjustment: StockAdjustment) => {
        if (!confirm(`Apakah Anda yakin ingin membatalkan & menghapus penyesuaian stok untuk "${adjustment.productName}"? Stok produk akan dikembalikan secara otomatis.`)) {
            return;
        }

        try {
            await (StorageService as any).deleteStockAdjustment(adjustment);
            alert(`✅ Penyesuaian stok berhasil dibatalkan dan stok produk "${adjustment.productName}" telah dikembalikan.`);
        } catch (error: any) {
            console.error(error);
            alert(`Gagal membatalkan penyesuaian stok: ${error.message || 'Terjadi kesalahan'}`);
        }
    };

    // ==========================================
    // 4. PRINT TEMPLATES
    // ==========================================

    // Print Blank Count Sheet (Form Hitung Lapangan)
    const handlePrintBlankCountSheet = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const targetProducts = products.filter(p => {
            if (worksheetCategoryFilter && p.categoryId !== worksheetCategoryFilter && p.categoryName !== worksheetCategoryFilter) {
                return false;
            }
            return true;
        }).sort((a, b) => (a.categoryName || '').localeCompare(b.categoryName || '') || a.name.localeCompare(b.name));

        const catTitle = worksheetCategoryFilter
            ? (categories.find(c => c.id === worksheetCategoryFilter)?.name || worksheetCategoryFilter)
            : 'Semua Kategori';

        const dayName = getDayName(opnameDateTime);
        const fullDate = getFullDateDisplay(opnameDateTime);
        const timeStr = getTimeDisplay(opnameDateTime);

        const rows = targetProducts.map((p, idx) => `
            <tr>
                <td style="text-align:center; padding: 6px;">${idx + 1}</td>
                <td style="padding: 6px; font-family: monospace; font-size: 11px;">${p.sku || '-'}</td>
                <td style="padding: 6px; font-weight: 600;">${p.name}</td>
                <td style="padding: 6px; color: #555;">${p.categoryName || '-'}</td>
                <td style="text-align:center; padding: 6px;">${p.unit || 'Pcs'}</td>
                <td style="text-align:center; padding: 6px; font-weight:bold; background:#f8fafc;">${p.stock}</td>
                <td style="text-align:center; padding: 6px; border: 1.5px solid #000; min-width: 80px; height: 28px;"></td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; min-width: 120px;"></td>
            </tr>
        `).join('');

        const html = `
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Form Hitung Fisik Lapangan (Stock Opname)</title>
                    <style>
                        @page { size: A4; margin: 12mm; }
                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 11px; color: #1e293b; line-height: 1.3; }
                        .header { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
                        .title { font-size: 16px; font-weight: 800; text-transform: uppercase; margin: 0 0 4px 0; color: #0f172a; }
                        .subtitle { font-size: 11px; color: #64748b; margin: 0; }
                        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0 14px 0; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0; }
                        .meta-item { font-size: 11px; }
                        .meta-item strong { color: #334155; }
                        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
                        th, td { border: 1px solid #cbd5e1; font-size: 10.5px; }
                        th { background: #f1f5f9; font-weight: 700; text-align: left; padding: 6px; text-transform: uppercase; font-size: 10px; color: #334155; }
                        .signature-section { margin-top: 25px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 40px; text-align: center; }
                        .signature-box { border-top: 1px dashed #94a3b8; margin-top: 45px; padding-top: 4px; font-weight: 600; font-size: 11px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1 class="title">📋 LEMBAR KERJA HITUNG FISIK (STOCK OPNAME HARIAN)</h1>
                        <p class="subtitle">${storeSettings?.name || 'Toko Retail & Grosir POS'} • ${storeSettings?.address || ''}</p>
                    </div>

                    <div class="meta-grid">
                        <div class="meta-item"><strong>Hari, Tanggal Opname:</strong> ${fullDate}</div>
                        <div class="meta-item"><strong>Waktu / Jam:</strong> ${timeStr} WIB</div>
                        <div class="meta-item"><strong>Kategori Produk:</strong> ${catTitle} (${targetProducts.length} Produk)</div>
                        <div class="meta-item"><strong>Petugas Pemeriksa:</strong> ${currentUser?.name || '...........................................'}</div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th style="width: 25px; text-align: center;">No</th>
                                <th style="width: 85px;">Barcode/SKU</th>
                                <th>Nama Produk</th>
                                <th style="width: 90px;">Kategori</th>
                                <th style="width: 45px; text-align: center;">Satuan</th>
                                <th style="width: 65px; text-align: center;">Stok Buku</th>
                                <th style="width: 85px; text-align: center; background: #e2e8f0;">Hasil Fisik Real</th>
                                <th style="width: 130px;">Kondisi / Keterangan</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>

                    <div class="signature-section">
                        <div>
                            <p style="margin: 0; font-size: 11px; color: #64748b;">Petugas Penghitung Fisik</p>
                            <div class="signature-box">( .................................................... )</div>
                        </div>
                        <div>
                            <p style="margin: 0; font-size: 11px; color: #64748b;">Kepala Toko / Supervisor</p>
                            <div class="signature-box">( .................................................... )</div>
                        </div>
                    </div>

                    <script>
                        window.onload = () => { window.print(); };
                    </script>
                </body>
            </html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
    };

    // Print Official Stock Opname Audit Report (Berita Acara Opname)
    const handlePrintAuditReport = (targetItems?: StockAdjustment[], customTitle?: string) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const itemsToPrint = targetItems || filteredAdjustments;

        const rows = itemsToPrint.map((item, idx) => {
            const product = products.find(p => p.id === item.productId);
            const hpp = product?.hpp || 0;
            const varianceVal = item.qty * hpp;
            return `
                <tr>
                    <td style="text-align:center; padding: 5px;">${idx + 1}</td>
                    <td style="padding: 5px;">${getFullDateDisplay(item.date)}</td>
                    <td style="padding: 5px; text-align:center; font-family:monospace;">${getTimeDisplay(item.date)}</td>
                    <td style="padding: 5px; font-weight: 600;">${item.productName}</td>
                    <td style="padding: 5px; text-align:center; font-weight:bold; color: ${item.type === 'INCREASE' ? '#16a34a' : '#dc2626'};">
                        ${item.type === 'INCREASE' ? 'SURPLUS (+)' : 'DEFISIT (-)'}
                    </td>
                    <td style="padding: 5px;">${item.reason}</td>
                    <td style="text-align:center; padding: 5px;">${item.previousStock ?? '-'}</td>
                    <td style="text-align:center; padding: 5px; font-weight:bold;">${item.type === 'INCREASE' ? `+${item.qty}` : `-${item.qty}`}</td>
                    <td style="text-align:center; padding: 5px; font-weight:bold;">${item.currentStock ?? '-'}</td>
                    <td style="text-align:right; padding: 5px; font-family: monospace;">${formatIDR(hpp)}</td>
                    <td style="text-align:right; padding: 5px; font-family: monospace; font-weight:bold; color: ${item.type === 'INCREASE' ? '#16a34a' : '#dc2626'};">
                        ${item.type === 'INCREASE' ? `+${formatIDR(varianceVal)}` : `-${formatIDR(varianceVal)}`}
                    </td>
                    <td style="padding: 5px; font-size: 10px; color: #555;">${item.userName || '-'}</td>
                </tr>
            `;
        }).join('');

        let totalIncQty = 0;
        let totalIncVal = 0;
        let totalDecQty = 0;
        let totalDecVal = 0;

        itemsToPrint.forEach(adj => {
            const product = products.find(p => p.id === adj.productId);
            const hpp = product?.hpp || 0;
            const val = adj.qty * hpp;
            if (adj.type === 'INCREASE') {
                totalIncQty += adj.qty;
                totalIncVal += val;
            } else {
                totalDecQty += adj.qty;
                totalDecVal += val;
            }
        });

        const netQty = totalIncQty - totalDecQty;
        const netVal = totalIncVal - totalDecVal;

        const html = `
            <!DOCTYPE html>
            <html>
                <head>
                    <title>${customTitle || 'Berita Acara & Laporan Hasil Audit Stock Opname'}</title>
                    <style>
                        @page { size: A4 landscape; margin: 10mm; }
                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 10px; color: #1e293b; }
                        .header { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-end; }
                        .title { font-size: 15px; font-weight: 800; text-transform: uppercase; margin: 0 0 2px 0; }
                        .subtitle { font-size: 10.5px; color: #64748b; margin: 0; }
                        .summary-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 12px; }
                        .card { background: #f8fafc; border: 1px solid #cbd5e1; padding: 7px 10px; border-radius: 6px; }
                        .card-label { font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; }
                        .card-value { font-size: 12px; font-weight: 800; margin-top: 2px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 6px; }
                        th, td { border: 1px solid #cbd5e1; font-size: 9.5px; }
                        th { background: #f1f5f9; font-weight: 700; padding: 5px 6px; text-transform: uppercase; font-size: 9px; color: #334155; }
                        .sign-grid { margin-top: 20px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 30px; text-align: center; }
                        .sign-box { border-top: 1px dashed #64748b; margin-top: 38px; padding-top: 4px; font-weight: 600; font-size: 10px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div>
                            <h1 class="title">📜 ${customTitle || 'BERITA ACARA & LAPORAN AUDIT STOCK OPNAME HARIAN'}</h1>
                            <p class="subtitle">${storeSettings?.name || 'Toko Retail & Grosir POS'} • ${storeSettings?.address || ''}</p>
                        </div>
                        <div style="text-align: right; font-size: 10px; color: #64748b;">
                            <div><strong>Periode Audit:</strong> ${startDate ? getFullDateDisplay(startDate) : 'Semua'} s/d ${endDate ? getFullDateDisplay(endDate) : 'Hari Ini'}</div>
                            <div>Dicetak pada: ${new Date().toLocaleString('id-ID')}</div>
                        </div>
                    </div>

                    <div class="summary-cards">
                        <div class="card">
                            <div class="card-label">Total Item Penyesuaian</div>
                            <div class="card-value">${itemsToPrint.length} Baris Audit</div>
                        </div>
                        <div class="card">
                            <div class="card-label">Surplus Fisik (+)</div>
                            <div class="card-value" style="color: #16a34a;">+${totalIncQty} Unit (${formatIDR(totalIncVal)})</div>
                        </div>
                        <div class="card">
                            <div class="card-label">Defisit / Kerugian (-)</div>
                            <div class="card-value" style="color: #dc2626;">-${totalDecQty} Unit (${formatIDR(totalDecVal)})</div>
                        </div>
                        <div class="card">
                            <div class="card-label">Dampak Finansial Bersih</div>
                            <div class="card-value" style="color: ${netVal >= 0 ? '#16a34a' : '#dc2626'};">
                                ${netQty >= 0 ? `+${netQty}` : netQty} Unit (${formatIDR(netVal)})
                            </div>
                        </div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th style="width: 25px; text-align:center;">No</th>
                                <th style="width: 110px;">Hari & Tanggal</th>
                                <th style="width: 50px; text-align:center;">Jam</th>
                                <th>Produk</th>
                                <th style="width: 75px; text-align:center;">Status</th>
                                <th style="width: 120px;">Alasan</th>
                                <th style="width: 50px; text-align:center;">Stok Awal</th>
                                <th style="width: 50px; text-align:center;">Selisih</th>
                                <th style="width: 50px; text-align:center;">Stok Akhir</th>
                                <th style="width: 70px; text-align:right;">HPP (Modal)</th>
                                <th style="width: 80px; text-align:right;">Nilai Selisih</th>
                                <th style="width: 75px;">Petugas</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>

                    <div class="sign-grid">
                        <div>
                            <p style="margin: 0; font-size: 10px; color: #64748b;">Petugas Stock Opname</p>
                            <div class="sign-box">( ${currentUser?.name || '...........................................'} )</div>
                        </div>
                        <div>
                            <p style="margin: 0; font-size: 10px; color: #64748b;">Supervisor / Kepala Toko</p>
                            <div class="sign-box">( .................................................... )</div>
                        </div>
                        <div>
                            <p style="margin: 0; font-size: 10px; color: #64748b;">Pemilik / Manajer Toko</p>
                            <div class="sign-box">( .................................................... )</div>
                        </div>
                    </div>

                    <script>
                        window.onload = () => { window.print(); };
                    </script>
                </body>
            </html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
    };

    // ==========================================
    // 5. EXPORT HELPERS
    // ==========================================
    const handleExportExcel = () => {
        const data = filteredAdjustments.map((item, idx) => {
            const product = products.find(p => p.id === item.productId);
            const hpp = product?.hpp || 0;
            const varianceVal = item.qty * hpp;
            return {
                'No': idx + 1,
                'Hari': getDayName(item.date),
                'Tanggal': new Date(item.date).toLocaleDateString('id-ID'),
                'Jam / Waktu': getTimeDisplay(item.date),
                'SKU / Barcode': product?.sku || '-',
                'Nama Produk': item.productName,
                'Kategori': product?.categoryName || '-',
                'HPP (Modal)': hpp,
                'Tipe': item.type === 'INCREASE' ? 'Penambahan (+)' : 'Pengurangan (-)',
                'Alasan': item.reason,
                'Stok Awal (Sistem)': item.previousStock ?? '-',
                'Selisih Qty': item.type === 'INCREASE' ? `+${item.qty}` : `-${item.qty}`,
                'Nilai Selisih (Rp)': item.type === 'INCREASE' ? varianceVal : -varianceVal,
                'Stok Akhir (Fisik)': item.currentStock ?? '-',
                'Petugas': item.userName || '-',
                'Catatan': item.note || '-'
            };
        });

        exportToExcel(data, 'Laporan_Harian_Stock_Opname', 'Data Opname Harian', [
            { wch: 6 },
            { wch: 12 },
            { wch: 14 },
            { wch: 12 },
            { wch: 16 },
            { wch: 28 },
            { wch: 18 },
            { wch: 14 },
            { wch: 16 },
            { wch: 25 },
            { wch: 18 },
            { wch: 14 },
            { wch: 18 },
            { wch: 18 },
            { wch: 18 },
            { wch: 25 }
        ]);
    };

    const handleExportCSV = () => {
        const headers = [
            'ID', 'Hari', 'Tanggal', 'Jam', 'Barcode/SKU', 'Produk', 'Kategori',
            'HPP', 'Tipe', 'Alasan', 'Stok Awal', 'Selisih Qty', 'Nilai Selisih Rp', 'Stok Akhir', 'Petugas', 'Catatan'
        ];

        const rows = filteredAdjustments.map(item => {
            const product = products.find(p => p.id === item.productId);
            const hpp = product?.hpp || 0;
            const varianceVal = item.qty * hpp;
            const d = new Date(item.date);
            return [
                item.id,
                getDayName(item.date),
                d.toLocaleDateString('id-ID'),
                getTimeDisplay(item.date),
                product?.sku || '-',
                item.productName,
                product?.categoryName || '-',
                hpp,
                item.type === 'INCREASE' ? 'PENAMBAHAN' : 'PENGURANGAN',
                item.reason,
                item.previousStock ?? 0,
                item.type === 'INCREASE' ? item.qty : -item.qty,
                item.type === 'INCREASE' ? varianceVal : -varianceVal,
                item.currentStock ?? 0,
                item.userName || '-',
                item.note || '-'
            ];
        });

        exportToCSV('laporan-harian-stock-opname.csv', headers, rows);
    };

    return (
        <div className="space-y-6 animate-fade-in p-2 md:p-0">
            {/* Top Title & Quick Actions Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2.5 tracking-tight">
                        <div className="p-2 bg-amber-500 text-white rounded-xl shadow-md shadow-amber-500/20">
                            <ClipboardCheck size={22} />
                        </div>
                        Pengecekan Stok Real (Stock Opname Harian)
                    </h1>
                    <p className="text-slate-500 text-xs sm:text-sm mt-1">
                        Sistem audit persediaan fisik real harian toko, rekonsiliasi selisih stok buku vs fisik, dan log riwayat opname per hari
                    </p>
                </div>

                {/* Print & Export Actions */}
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    <button
                        onClick={handlePrintBlankCountSheet}
                        className="flex-1 md:flex-none items-center justify-center gap-1.5 bg-white border border-slate-300 px-3.5 py-2 rounded-xl text-slate-700 hover:bg-slate-50 transition-all flex text-xs font-bold shadow-xs hover:border-amber-500"
                        title="Cetak Form Hitung Kosong untuk Dibawa Petugas ke Rak"
                    >
                        <FileText size={15} className="text-amber-600" />
                        Form Hitung Rak
                    </button>
                    <button
                        onClick={() => handlePrintAuditReport()}
                        className="flex-1 md:flex-none items-center justify-center gap-1.5 bg-amber-50 border border-amber-300 px-3.5 py-2 rounded-xl text-amber-900 hover:bg-amber-100 transition-all flex text-xs font-bold shadow-xs"
                        title="Cetak Berita Acara & Hasil Audit Opname Keseluruhan"
                    >
                        <Printer size={15} className="text-amber-700" />
                        Berita Acara Opname
                    </button>
                    <button
                        onClick={handleExportExcel}
                        className="flex-1 md:flex-none items-center justify-center gap-1.5 bg-emerald-50 border border-emerald-300 px-3.5 py-2 rounded-xl text-emerald-800 hover:bg-emerald-100 transition-all flex text-xs font-bold shadow-xs"
                        title="Ekspor Data Opname ke Excel"
                    >
                        <FileSpreadsheet size={15} className="text-emerald-700" />
                        Excel
                    </button>
                </div>
            </div>

            {/* Historical Summary Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Total Hari Opname</p>
                        <h3 className="text-xl font-black text-slate-900 mt-1">
                            {summaryStats.totalDays} <span className="text-xs font-normal text-slate-400">Hari</span>
                            <span className="text-xs font-bold text-amber-700 ml-2">({summaryStats.totalAdjustments} Item)</span>
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Riwayat audit fisik harian</p>
                    </div>
                    <div className="p-3 bg-slate-100 text-slate-700 rounded-xl shrink-0">
                        <CalendarDays size={22} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Surplus Fisik (+)</p>
                        <h3 className="text-xl font-black text-emerald-600 mt-1">
                            +{summaryStats.totalIncreaseQty} <span className="text-xs font-normal text-slate-400">unit</span>
                        </h3>
                        <p className="text-[11px] text-emerald-700 font-bold mt-0.5 font-mono">
                            +{formatIDR(summaryStats.totalIncreaseValue)}
                        </p>
                    </div>
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                        <TrendingUp size={22} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Defisit / Hilang / Rusak (-)</p>
                        <h3 className="text-xl font-black text-rose-600 mt-1">
                            -{summaryStats.totalDecreaseQty} <span className="text-xs font-normal text-slate-400">unit</span>
                        </h3>
                        <p className="text-[11px] text-rose-700 font-bold mt-0.5 font-mono">
                            -{formatIDR(summaryStats.totalDecreaseValue)}
                        </p>
                    </div>
                    <div className="p-3 bg-rose-50 text-rose-600 rounded-xl shrink-0">
                        <TrendingDown size={22} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Dampak Finansial Bersih</p>
                        <h3 className={`text-xl font-black mt-1 ${summaryStats.netValueDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {summaryStats.netQtyDiff >= 0 ? `+${summaryStats.netQtyDiff}` : summaryStats.netQtyDiff} <span className="text-xs font-normal text-slate-400">unit</span>
                        </h3>
                        <p className={`text-[11px] font-bold mt-0.5 font-mono ${summaryStats.netValueDiff >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {summaryStats.netValueDiff >= 0 ? `+${formatIDR(summaryStats.netValueDiff)}` : formatIDR(summaryStats.netValueDiff)}
                        </p>
                    </div>
                    <div className={`p-3 rounded-xl shrink-0 ${summaryStats.netValueDiff >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        <Package size={22} />
                    </div>
                </div>
            </div>

            {/* MAIN INPUT SECTION WITH DUAL MODE & DATE TIME PICKER */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                {/* Input Header with Day, Date & Time Picker */}
                <div className="p-4 bg-gradient-to-r from-amber-50 via-amber-50/70 to-orange-50 border-b border-amber-200 flex flex-wrap justify-between items-center gap-4">
                    {/* Mode Selector Tabs */}
                    <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-amber-200 shadow-2xs">
                        <button
                            type="button"
                            onClick={() => setActiveTab('worksheet')}
                            className={`px-3.5 py-2 text-xs font-extrabold rounded-lg transition-all flex items-center gap-2 ${activeTab === 'worksheet'
                                ? 'bg-amber-500 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                        >
                            <FileText size={15} />
                            1. Lembar Kerja Opname Masal (Worksheet)
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('single')}
                            className={`px-3.5 py-2 text-xs font-extrabold rounded-lg transition-all flex items-center gap-2 ${activeTab === 'single'
                                ? 'bg-amber-500 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                        >
                            <Package size={15} />
                            2. Input Cepat 1 Produk (Single Quick Scan)
                        </button>
                    </div>

                    {/* Prominent Opname Date, Day & Time Picker */}
                    <div className="flex flex-wrap items-center gap-2.5 bg-white px-3.5 py-2 rounded-xl border border-amber-300 shadow-xs">
                        <div className="flex items-center gap-2">
                            <Clock size={16} className="text-amber-600" />
                            <span className="text-xs font-extrabold text-amber-950">Waktu Opname:</span>
                        </div>

                        {/* Date Time Picker Input */}
                        <div className="relative">
                            <label htmlFor="opnameDateTimeInput" className="sr-only">Waktu Stock Opname</label>
                            <input
                                id="opnameDateTimeInput"
                                name="opnameDateTimeInput"
                                type="datetime-local"
                                className="px-2.5 py-1 bg-amber-50/50 border border-amber-300 rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 cursor-pointer"
                                value={opnameDateTime}
                                onChange={e => setOpnameDateTime(e.target.value)}
                            />
                        </div>

                        {/* Badge Hari & Tanggal Lengkap */}
                        <div className="bg-amber-100 text-amber-900 px-2.5 py-1 rounded-lg text-xs font-extrabold border border-amber-300 font-mono flex items-center gap-1.5">
                            <span>📅 {getDayName(opnameDateTime)}, {new Date(opnameDateTime).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            <span className="text-amber-700">• {getTimeDisplay(opnameDateTime)} WIB</span>
                        </div>

                        {/* Reset to Current Timestamp Button */}
                        <button
                            type="button"
                            onClick={() => setOpnameDateTime(getNowDateTimeLocal())}
                            className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[11px] font-bold transition-colors shadow-2xs flex items-center gap-1"
                            title="Set waktu ke saat ini"
                        >
                            <RefreshCw size={12} /> Saat Ini
                        </button>
                    </div>
                </div>

                {/* ======================================================== */}
                {/* TAB 1: WORKSHEET BATCH OPNAME */}
                {/* ======================================================== */}
                {activeTab === 'worksheet' && (
                    <div className="p-5 space-y-4">
                        {/* Worksheet Filters & Quick Fill Actions */}
                        <div className="flex flex-wrap justify-between items-center gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
                                {/* Category Filter */}
                                <div className="relative min-w-[180px]">
                                    <label htmlFor="wsCategory" className="sr-only">Filter Kategori</label>
                                    <select
                                        id="wsCategory"
                                        name="wsCategory"
                                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 pr-8 focus:border-amber-500 outline-none"
                                        value={worksheetCategoryFilter}
                                        onChange={e => setWorksheetCategoryFilter(e.target.value)}
                                    >
                                        <option value="">🏷️ Semua Kategori Produk</option>
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                        <ChevronDown size={14} />
                                    </div>
                                </div>

                                {/* Status Filter */}
                                <div className="relative min-w-[150px]">
                                    <label htmlFor="wsStatus" className="sr-only">Filter Status Opname</label>
                                    <select
                                        id="wsStatus"
                                        name="wsStatus"
                                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 pr-8 focus:border-amber-500 outline-none"
                                        value={worksheetStatusFilter}
                                        onChange={e => setWorksheetStatusFilter(e.target.value as any)}
                                    >
                                        <option value="all">🔍 Semua Produk</option>
                                        <option value="variance">⚠️ Ada Selisih Saja</option>
                                        <option value="matching">✅ Stok Sesuai (0 Selisih)</option>
                                        <option value="empty">📝 Belum Diisi</option>
                                    </select>
                                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                        <ChevronDown size={14} />
                                    </div>
                                </div>

                                {/* Live Search Box */}
                                <div className="relative flex-1 min-w-[180px]">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    <input
                                        type="text"
                                        placeholder="Cari produk / barcode di lembar kerja..."
                                        className="w-full pl-9 pr-7 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:border-amber-500 outline-none"
                                        value={worksheetSearch}
                                        onChange={e => setWorksheetSearch(e.target.value)}
                                    />
                                    {worksheetSearch && (
                                        <button
                                            type="button"
                                            onClick={() => setWorksheetSearch('')}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                        >
                                            <X size={13} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Batch Fill Actions */}
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleMarkAllMatching}
                                    className="px-3 py-2 bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-colors shadow-2xs"
                                    title="Isi otomatis stok fisik = stok sistem bagi produk yang masih kosong"
                                >
                                    <CheckCheck size={14} />
                                    Tandai Semua Sesuai
                                </button>
                                <button
                                    type="button"
                                    onClick={handleResetWorksheet}
                                    className="p-2 bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors"
                                    title="Kosongkan lembar kerja"
                                >
                                    <RotateCcw size={14} />
                                </button>
                            </div>
                        </div>

                        {/* Interactive Worksheet Table */}
                        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                            <div className="overflow-x-auto max-h-[500px]">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 uppercase font-extrabold tracking-wider sticky top-0 z-10">
                                        <tr>
                                            <th className="p-3 text-center w-10">No</th>
                                            <th className="p-3 min-w-[200px]">Nama Produk</th>
                                            <th className="p-3 min-w-[100px]">Kategori</th>
                                            <th className="p-3 text-right w-24">HPP (Modal)</th>
                                            <th className="p-3 text-center w-28 bg-amber-50/70 border-x border-amber-200">Stok Sistem</th>
                                            <th className="p-3 text-center w-36 bg-amber-100/70 border-r border-amber-300">Stok Fisik Real</th>
                                            <th className="p-3 text-center w-24">Selisih</th>
                                            <th className="p-3 text-right w-28">Nilai Selisih (Rp)</th>
                                            <th className="p-3 min-w-[180px]">Alasan Selisih</th>
                                            <th className="p-3 min-w-[140px]">Catatan</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredWorksheetProducts.length === 0 && (
                                            <tr>
                                                <td colSpan={10} className="p-8 text-center text-slate-400 italic">
                                                    Tidak ada produk yang sesuai dengan filter lembar kerja saat ini.
                                                </td>
                                            </tr>
                                        )}
                                        {filteredWorksheetProducts.map((product, idx) => {
                                            const input = worksheetInputs[product.id] || {
                                                physicalStock: '',
                                                reason: 'Pengecekan Manual (Opname)',
                                                customReason: '',
                                                note: ''
                                            };
                                            const hasInput = input.physicalStock !== '';
                                            const physStock = hasInput ? parseInt(input.physicalStock) : NaN;
                                            const diff = !isNaN(physStock) ? physStock - product.stock : 0;
                                            const isSurplus = diff > 0;
                                            const isDeficit = diff < 0;
                                            const isMatch = hasInput && diff === 0;
                                            const hpp = product.hpp || 0;
                                            const varianceValue = Math.abs(diff) * hpp;

                                            return (
                                                <tr
                                                    key={product.id}
                                                    className={`hover:bg-slate-50/80 transition-colors ${isMatch
                                                        ? 'bg-emerald-50/20'
                                                        : isSurplus
                                                            ? 'bg-emerald-50/40'
                                                            : isDeficit
                                                                ? 'bg-rose-50/40'
                                                                : ''
                                                        }`}
                                                >
                                                    <td className="p-3 text-center text-slate-400 font-mono font-bold">{idx + 1}</td>
                                                    <td className="p-3">
                                                        <div className="font-extrabold text-slate-900">{product.name}</div>
                                                        <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5">
                                                            {product.sku && <span>SKU: {product.sku}</span>}
                                                            {product.unit && <span>• Satuan: {product.unit}</span>}
                                                        </div>
                                                    </td>
                                                    <td className="p-3 text-slate-600">
                                                        <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[10px] font-semibold">
                                                            {product.categoryName || 'Tanpa Kategori'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-right font-mono text-slate-600">
                                                        {formatIDR(hpp)}
                                                    </td>
                                                    <td className="p-3 text-center font-mono font-extrabold text-slate-800 bg-amber-50/40 border-x border-amber-100">
                                                        {product.stock}
                                                    </td>
                                                    <td className="p-2.5 text-center bg-amber-50/60 border-r border-amber-200">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                placeholder={product.stock.toString()}
                                                                className={`w-20 px-2.5 py-1.5 border rounded-xl text-center font-black text-sm outline-none transition-all ${!hasInput
                                                                    ? 'bg-white border-slate-300 text-slate-700 focus:border-amber-500'
                                                                    : isMatch
                                                                        ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                                                                        : isSurplus
                                                                            ? 'bg-emerald-100 border-emerald-500 text-emerald-900 font-bold'
                                                                            : 'bg-rose-100 border-rose-500 text-rose-900 font-bold'
                                                                    }`}
                                                                value={input.physicalStock}
                                                                onChange={e => handleWorksheetChange(product.id, 'physicalStock', e.target.value)}
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => handleWorksheetChange(product.id, 'physicalStock', product.stock.toString())}
                                                                className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded"
                                                                title="Samakan dengan stok buku"
                                                            >
                                                                <Check size={14} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="p-3 text-center whitespace-nowrap">
                                                        {!hasInput ? (
                                                            <span className="text-slate-300 font-mono">-</span>
                                                        ) : isMatch ? (
                                                            <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-bold text-[10px] inline-flex items-center gap-1">
                                                                <Check size={11} /> 0 Sesuai
                                                            </span>
                                                        ) : isSurplus ? (
                                                            <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded-full font-extrabold text-[10px] inline-flex items-center gap-0.5">
                                                                <TrendingUp size={11} /> +{diff}
                                                            </span>
                                                        ) : (
                                                            <span className="bg-rose-100 text-rose-900 border border-rose-300 px-2 py-0.5 rounded-full font-extrabold text-[10px] inline-flex items-center gap-0.5">
                                                                <TrendingDown size={11} /> {diff}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-right font-mono font-bold whitespace-nowrap">
                                                        {!hasInput || isMatch ? (
                                                            <span className="text-slate-300">-</span>
                                                        ) : isSurplus ? (
                                                            <span className="text-emerald-700">+{formatIDR(varianceValue)}</span>
                                                        ) : (
                                                            <span className="text-rose-700">-{formatIDR(varianceValue)}</span>
                                                        )}
                                                    </td>
                                                    <td className="p-2.5">
                                                        {diff !== 0 && hasInput ? (
                                                            <div className="space-y-1">
                                                                <select
                                                                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:border-amber-500 outline-none"
                                                                    value={input.reason}
                                                                    onChange={e => handleWorksheetChange(product.id, 'reason', e.target.value)}
                                                                >
                                                                    {(diff > 0 ? ADDITION_REASONS : REDUCTION_REASONS).map(r => (
                                                                        <option key={r} value={r}>{r}</option>
                                                                    ))}
                                                                </select>
                                                                {input.reason === 'Lain-lain' && (
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Tulis alasan..."
                                                                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs"
                                                                        value={input.customReason || ''}
                                                                        onChange={e => handleWorksheetChange(product.id, 'customReason', e.target.value)}
                                                                    />
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-400 text-[11px]">-</span>
                                                        )}
                                                    </td>
                                                    <td className="p-2.5">
                                                        <input
                                                            type="text"
                                                            placeholder="Catatan..."
                                                            className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 placeholder:text-slate-300 focus:border-amber-500 outline-none"
                                                            value={input.note || ''}
                                                            onChange={e => handleWorksheetChange(product.id, 'note', e.target.value)}
                                                        />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Live Batch Summary Bar & Submit Action */}
                        <div className="bg-amber-500/10 border-2 border-amber-500/30 p-4 rounded-2xl flex flex-wrap justify-between items-center gap-4">
                            <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs text-slate-800">
                                <div>
                                    <span className="text-slate-500 font-medium">Diperiksa: </span>
                                    <strong className="font-extrabold font-mono text-slate-900">{worksheetSummary.totalChecked}</strong> / {worksheetSummary.totalProducts} Produk
                                </div>
                                <div className="text-emerald-700">
                                    <span className="font-medium">Sesuai: </span>
                                    <strong className="font-extrabold font-mono">{worksheetSummary.totalMatching}</strong>
                                </div>
                                <div className="text-emerald-800">
                                    <span className="font-medium">Surplus (+): </span>
                                    <strong className="font-extrabold font-mono">{worksheetSummary.totalSurplusCount} item (+{worksheetSummary.totalSurplusQty} unit)</strong>
                                </div>
                                <div className="text-rose-700">
                                    <span className="font-medium">Defisit (-): </span>
                                    <strong className="font-extrabold font-mono">{worksheetSummary.totalDeficitCount} item (-{worksheetSummary.totalDeficitQty} unit)</strong>
                                </div>
                                <div className="font-black text-amber-950 font-mono bg-amber-200/80 px-2.5 py-1 rounded-lg border border-amber-300">
                                    Dampak Bersih: {worksheetSummary.netValue >= 0 ? `+${formatIDR(worksheetSummary.netValue)}` : formatIDR(worksheetSummary.netValue)}
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleBulkWorksheetSubmit}
                                disabled={isBulkSubmitting || worksheetSummary.totalToAdjust === 0}
                                className="w-full sm:w-auto px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 shadow-md shadow-amber-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                                {isBulkSubmitting ? (
                                    <>
                                        <RefreshCw className="animate-spin" size={16} />
                                        Menyimpan ({bulkProgress?.current}/{bulkProgress?.total})...
                                    </>
                                ) : (
                                    <>
                                        <Save size={16} />
                                        Simpan Hasil Opname Masal ({worksheetSummary.totalToAdjust} Penyesuaian)
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* ======================================================== */}
                {/* TAB 2: SINGLE ITEM QUICK SCAN / OPNAME */}
                {/* ======================================================== */}
                {activeTab === 'single' && (
                    <div className="p-6">
                        <form onSubmit={handleSingleSubmit} className="space-y-6">
                            {/* Searchable Product Selector */}
                            <div className="relative">
                                <label htmlFor="productSearchInput" className="block text-xs font-extrabold text-slate-700 uppercase mb-2">
                                    Cari Produk / Scan Barcode Yang Di-Opname
                                </label>
                                <div className="relative">
                                    <input
                                        id="productSearchInput"
                                        name="productSearchInput"
                                        type="text"
                                        className="w-full px-4 py-3 pl-11 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all text-sm font-bold text-slate-800 placeholder:text-slate-400"
                                        placeholder="Ketik nama produk atau scan barcode..."
                                        value={productSearchTerm}
                                        onChange={(e) => {
                                            setProductSearchTerm(e.target.value);
                                            setIsProductDropdownOpen(true);
                                            if (e.target.value === '') {
                                                setSelectedProductId('');
                                            }
                                        }}
                                        onFocus={() => setIsProductDropdownOpen(true)}
                                    />
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />

                                    {productSearchTerm && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setProductSearchTerm('');
                                                setSelectedProductId('');
                                                setQty('');
                                                setIsProductDropdownOpen(true);
                                            }}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                                        >
                                            <X size={16} />
                                        </button>
                                    )}
                                </div>

                                {/* Dropdown Product Results */}
                                {isProductDropdownOpen && (
                                    <div className="absolute z-50 left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 max-h-64 overflow-y-auto divide-y divide-slate-100">
                                        {products
                                            .filter(p => !productSearchTerm || p.name.toLowerCase().includes(productSearchTerm.toLowerCase()) || p.sku?.toLowerCase().includes(productSearchTerm.toLowerCase()))
                                            .sort((a, b) => a.name.localeCompare(b.name))
                                            .length === 0 ? (
                                            <div className="p-4 text-center text-slate-500 text-xs italic">Produk tidak ditemukan.</div>
                                        ) : (
                                            products
                                                .filter(p => !productSearchTerm || p.name.toLowerCase().includes(productSearchTerm.toLowerCase()) || p.sku?.toLowerCase().includes(productSearchTerm.toLowerCase()))
                                                .sort((a, b) => a.name.localeCompare(b.name))
                                                .map(p => (
                                                    <button
                                                        key={p.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedProductId(p.id);
                                                            setProductSearchTerm(p.name);
                                                            setIsProductDropdownOpen(false);
                                                        }}
                                                        className="w-full text-left px-4 py-3 hover:bg-amber-50/50 transition-colors flex justify-between items-center group"
                                                    >
                                                        <div>
                                                            <span className="font-extrabold text-sm text-slate-800 group-hover:text-amber-700 transition-colors">{p.name}</span>
                                                            <div className="text-xs text-slate-400 font-mono">{p.sku ? `SKU: ${p.sku} • ` : ''}{p.categoryName || 'Tanpa Kategori'} {p.unit ? `• ${p.unit}` : ''}</div>
                                                        </div>
                                                        <div className="bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-1 rounded-lg text-xs font-bold font-mono">
                                                            Stok Buku: {p.stock}
                                                        </div>
                                                    </button>
                                                ))
                                        )}
                                    </div>
                                )}

                                {isProductDropdownOpen && (
                                    <div
                                        className="fixed inset-0 z-40"
                                        onClick={() => setIsProductDropdownOpen(false)}
                                    ></div>
                                )}
                            </div>

                            {/* Selected Product Detail & Adjustment Form */}
                            {selectedProduct && (
                                <div className="flex flex-col lg:flex-row gap-6 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                                    {/* Product Box */}
                                    <div className="flex items-start gap-4 lg:w-1/3 border-b lg:border-b-0 lg:border-r border-slate-200 pb-4 lg:pb-0 lg:pr-5">
                                        <div className="w-20 h-20 bg-white rounded-xl border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                                            {selectedProduct.image ? (
                                                <img src={selectedProduct.image} alt={selectedProduct.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <Package className="text-slate-300" size={32} />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-black text-slate-900 text-sm line-clamp-2">{selectedProduct.name}</h4>
                                            <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedProduct.sku ? `SKU: ${selectedProduct.sku} • ` : ''}{selectedProduct.categoryName || 'Tanpa Kategori'}</p>
                                            <div className="mt-2 text-xs text-slate-600 font-mono">
                                                HPP (Modal): <strong>{formatIDR(selectedProduct.hpp || 0)}</strong>
                                            </div>
                                            <div className="mt-2.5 flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs w-fit">
                                                <span className="text-xs text-slate-500 font-medium">Stok Sistem:</span>
                                                <span className="font-black text-sm text-amber-700 font-mono">{selectedProduct.stock} {selectedProduct.unit || 'unit'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Adjustment Mode Controls */}
                                    <div className="flex-1 space-y-4">
                                        <div>
                                            <label className="block text-xs font-extrabold text-slate-700 uppercase mb-2">Metode Perhitungan Opname</label>
                                            <div className="flex bg-slate-200/80 p-1 rounded-xl w-full sm:w-fit gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSingleInputMode('FINAL');
                                                        setFinalStockInput('');
                                                        setQty('');
                                                    }}
                                                    className={`flex-1 sm:flex-none px-4 py-2 text-xs font-extrabold rounded-lg transition-all ${singleInputMode === 'FINAL' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                                                >
                                                    A. Stok Fisik Akhir (Otomatis Hitung Selisih)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSingleInputMode('MANUAL');
                                                        setQty('');
                                                    }}
                                                    className={`flex-1 sm:flex-none px-4 py-2 text-xs font-extrabold rounded-lg transition-all ${singleInputMode === 'MANUAL' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                                                >
                                                    B. Selisih Qty Manual
                                                </button>
                                            </div>
                                        </div>

                                        {singleInputMode === 'FINAL' ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                                                <div>
                                                    <label htmlFor="finalStock" className="block text-xs font-bold text-slate-700 uppercase mb-1">
                                                        Stok Fisik Real (Hasil Hitungan Toko)
                                                    </label>
                                                    <input
                                                        id="finalStock"
                                                        name="finalStock"
                                                        type="number"
                                                        className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none font-black text-base text-slate-900"
                                                        placeholder={`Contoh: ${selectedProduct.stock}`}
                                                        min="0"
                                                        value={finalStockInput}
                                                        onChange={e => setFinalStockInput(e.target.value)}
                                                        required
                                                    />
                                                    <p className="text-slate-500 text-xs mt-1">
                                                        Stok buku di sistem: <span className="font-bold text-slate-800">{selectedProduct.stock}</span>
                                                    </p>
                                                </div>

                                                <div className="flex items-center">
                                                    {finalStockInput !== '' && !isNaN(parseInt(finalStockInput)) && parseInt(qty) > 0 ? (
                                                        <div className={`w-full p-3 rounded-xl border flex items-center gap-3 ${adjustmentType === 'INCREASE'
                                                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                                            : 'bg-rose-50 border-rose-200 text-rose-800'
                                                            }`}>
                                                            <div className={`p-2 rounded-full ${adjustmentType === 'INCREASE' ? 'bg-emerald-200 text-emerald-800' : 'bg-rose-200 text-rose-800'}`}>
                                                                {adjustmentType === 'INCREASE' ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                                                            </div>
                                                            <div>
                                                                <div className="font-black text-sm flex items-center gap-2">
                                                                    {selectedProduct.stock} <ArrowRight size={14} /> {finalStockInput}
                                                                    <span className="text-xs px-2 py-0.5 rounded-full font-extrabold bg-white border border-current">
                                                                        {adjustmentType === 'INCREASE' ? `+${qty}` : `-${qty}`} Unit
                                                                    </span>
                                                                </div>
                                                                <div className="text-[11px] opacity-90 mt-0.5 font-mono">
                                                                    Nilai Selisih: {formatIDR(parseInt(qty) * (selectedProduct.hpp || 0))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : finalStockInput !== '' && parseInt(finalStockInput) === selectedProduct.stock ? (
                                                        <div className="w-full p-3 rounded-xl border bg-white border-slate-200 text-slate-600 flex items-center gap-3">
                                                            <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
                                                            <div>
                                                                <div className="font-bold text-xs">Stok Sesuai (0 Selisih)</div>
                                                                <div className="text-[11px] text-slate-400">Jumlah fisik sama persis dengan stok sistem buku.</div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="w-full p-3 rounded-xl border bg-white border-dashed border-slate-300 text-slate-400 text-xs italic text-center">
                                                            Ketikkan hasil hitung fisik untuk melihat kalkulasi selisih.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Jenis Perubahan</label>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setAdjustmentType('DECREASE')}
                                                            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all border ${adjustmentType === 'DECREASE'
                                                                ? 'bg-rose-100 border-rose-300 text-rose-700 shadow-xs'
                                                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                                                                }`}
                                                        >
                                                            <TrendingDown size={15} /> Pengurangan (-)
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setAdjustmentType('INCREASE')}
                                                            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all border ${adjustmentType === 'INCREASE'
                                                                ? 'bg-emerald-100 border-emerald-300 text-emerald-700 shadow-xs'
                                                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                                                                }`}
                                                        >
                                                            <TrendingUp size={15} /> Penambahan (+)
                                                        </button>
                                                    </div>
                                                </div>

                                                <div>
                                                    <label htmlFor="manualQty" className="block text-xs font-bold text-slate-700 uppercase mb-1">Jumlah Selisih (Qty Unit)</label>
                                                    <input
                                                        id="manualQty"
                                                        name="manualQty"
                                                        type="number"
                                                        className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:border-amber-500 outline-none font-bold"
                                                        placeholder="Contoh: 5"
                                                        min="1"
                                                        value={qty}
                                                        onChange={e => setQty(e.target.value)}
                                                        required
                                                    />
                                                    {adjustmentType === 'DECREASE' && qty && parseInt(qty) > selectedProduct.stock && (
                                                        <p className="text-rose-500 text-[11px] mt-1 font-semibold">* Melebihi jumlah stok saat ini ({selectedProduct.stock})</p>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label htmlFor="stockReason" className="block text-xs font-bold text-slate-700 uppercase mb-1">Alasan Penyesuaian</label>
                                                <select
                                                    id="stockReason"
                                                    name="stockReason"
                                                    className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:border-amber-500 outline-none font-medium text-slate-800"
                                                    value={reason}
                                                    onChange={(e) => setReason(e.target.value)}
                                                    required
                                                >
                                                    {(adjustmentType === 'DECREASE' ? REDUCTION_REASONS : ADDITION_REASONS).map(r => (
                                                        <option key={r} value={r}>{r}</option>
                                                    ))}
                                                </select>
                                                {reason === 'Lain-lain' && (
                                                    <input
                                                        type="text"
                                                        className="mt-2 w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs"
                                                        placeholder="Tulis alasan spesifik..."
                                                        value={customReason}
                                                        onChange={e => setCustomReason(e.target.value)}
                                                        required
                                                    />
                                                )}
                                            </div>

                                            <div>
                                                <label htmlFor="stockNote" className="block text-xs font-bold text-slate-700 uppercase mb-1">Catatan Tambahan (Opsional)</label>
                                                <input
                                                    id="stockNote"
                                                    name="stockNote"
                                                    type="text"
                                                    className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:border-amber-500 outline-none"
                                                    placeholder="Contoh: Ditemukan kemasan rusak di rak belakang..."
                                                    value={note}
                                                    onChange={e => setNote(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end pt-2">
                                <button
                                    type="submit"
                                    disabled={isSubmitting || !selectedProduct || !qty || !reason || (qty === '0')}
                                    className="bg-amber-600 text-white px-7 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-amber-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-amber-600/20"
                                >
                                    <Save size={16} />
                                    Simpan Perubahan Stok Real
                                </button>
                            </div>
                        </form>
                    </div>
                )}
            </div>

            {/* ======================================================== */}
            {/* 3. RIWAYAT PENYESUAIAN STOK REAL HARIAN TABLE CONTAINER */}
            {/* ======================================================== */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap gap-4 justify-between items-center text-sm font-semibold text-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 text-amber-900 rounded-xl border border-amber-200">
                            <History size={18} />
                        </div>
                        <div>
                            <span className="font-black text-slate-900 text-sm">Riwayat Penyesuaian Stok Harian</span>
                            <span className="text-xs text-slate-500 font-normal ml-2">({filteredAdjustments.length} Item pada {groupedAdjustmentsByDay.length} Hari)</span>
                        </div>
                    </div>

                    {/* View Switcher & Actions */}
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-slate-200/80 p-1 rounded-xl">
                            <button
                                type="button"
                                onClick={() => setHistoryViewMode('daily')}
                                className={`px-2.5 py-1 text-xs font-extrabold rounded-lg transition-all flex items-center gap-1.5 ${historyViewMode === 'daily'
                                    ? 'bg-amber-500 text-white shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                title="Kelompokkan riwayat berdasarkan hari dan tanggal opname"
                            >
                                <CalendarDays size={13} />
                                Berkelompok per Hari
                            </button>
                            <button
                                type="button"
                                onClick={() => setHistoryViewMode('flat')}
                                className={`px-2.5 py-1 text-xs font-extrabold rounded-lg transition-all flex items-center gap-1.5 ${historyViewMode === 'flat'
                                    ? 'bg-amber-500 text-white shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                title="Tampilkan seluruh log baris standar"
                            >
                                <Layers size={13} />
                                Tabel Log
                            </button>
                        </div>
                    </div>
                </div>

                {/* Filter Toolbar with Quick Date Shortcuts */}
                <div className="p-3.5 bg-slate-50/50 border-b border-slate-100 flex flex-wrap justify-between items-center gap-3">
                    {/* Quick Date Range Buttons */}
                    <div className="flex flex-wrap items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setQuickDateFilter('today')}
                            className="px-2.5 py-1 bg-white border border-slate-200 hover:border-amber-400 hover:bg-amber-50 rounded-lg text-xs font-bold text-slate-700 transition-all"
                        >
                            ⚡ Hari Ini
                        </button>
                        <button
                            type="button"
                            onClick={() => setQuickDateFilter('yesterday')}
                            className="px-2.5 py-1 bg-white border border-slate-200 hover:border-amber-400 hover:bg-amber-50 rounded-lg text-xs font-bold text-slate-700 transition-all"
                        >
                            📆 Kemarin
                        </button>
                        <button
                            type="button"
                            onClick={() => setQuickDateFilter('7days')}
                            className="px-2.5 py-1 bg-white border border-slate-200 hover:border-amber-400 hover:bg-amber-50 rounded-lg text-xs font-bold text-slate-700 transition-all"
                        >
                            🗓️ 7 Hari Terakhir
                        </button>
                        <button
                            type="button"
                            onClick={() => setQuickDateFilter('thisMonth')}
                            className="px-2.5 py-1 bg-white border border-slate-200 hover:border-amber-400 hover:bg-amber-50 rounded-lg text-xs font-bold text-slate-700 transition-all"
                        >
                            📅 Bulan Ini
                        </button>
                        <button
                            type="button"
                            onClick={() => setQuickDateFilter('all')}
                            className="px-2.5 py-1 bg-white border border-slate-200 hover:border-amber-400 hover:bg-amber-50 rounded-lg text-xs font-bold text-slate-700 transition-all"
                        >
                            🌐 Semua
                        </button>
                    </div>

                    {/* Filter Controls */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Category Filter */}
                        <div className="relative min-w-[130px]">
                            <select
                                className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 outline-none focus:border-amber-500"
                                value={historyCategoryFilter}
                                onChange={e => setHistoryCategoryFilter(e.target.value)}
                            >
                                <option value="">🏷️ Semua Kategori</option>
                                {categories.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Type Filter */}
                        <div className="relative min-w-[120px]">
                            <select
                                className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 outline-none focus:border-amber-500"
                                value={historyTypeFilter}
                                onChange={e => setHistoryTypeFilter(e.target.value as any)}
                            >
                                <option value="ALL">Semua Tipe</option>
                                <option value="INCREASE">🟢 Surplus (+)</option>
                                <option value="DECREASE">🔴 Defisit (-)</option>
                            </select>
                        </div>

                        {/* Date Range Inputs */}
                        <div className="flex items-center bg-white border border-slate-300 rounded-lg px-2 py-0.5">
                            <input
                                type="date"
                                className="text-xs outline-none text-slate-700 bg-transparent font-mono"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                            />
                            <span className="mx-1 text-slate-400">-</span>
                            <input
                                type="date"
                                className="text-xs outline-none text-slate-700 bg-transparent font-mono"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                            />
                        </div>

                        {/* Live Search */}
                        <div className="relative">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Cari riwayat..."
                                className="pl-7 pr-6 py-1 border border-slate-300 rounded-lg text-xs focus:border-amber-500 outline-none w-32"
                                value={historySearchQuery}
                                onChange={e => setHistorySearchQuery(e.target.value)}
                            />
                            {historySearchQuery && (
                                <button
                                    onClick={() => setHistorySearchQuery('')}
                                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    <X size={11} />
                                </button>
                            )}
                        </div>

                        {(startDate || endDate || historySearchQuery || historyCategoryFilter || historyTypeFilter !== 'ALL' || historyReasonFilter) && (
                            <button
                                onClick={() => {
                                    setStartDate('');
                                    setEndDate('');
                                    setHistorySearchQuery('');
                                    setHistoryCategoryFilter('');
                                    setHistoryTypeFilter('ALL');
                                    setHistoryReasonFilter('');
                                }}
                                className="p-1 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition-colors text-xs"
                                title="Reset Filter"
                            >
                                <RotateCcw size={13} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Table Content: Daily Grouped vs Flat View */}
                <div className="overflow-x-auto touch-scroll">
                    <table className="w-full text-left text-xs min-w-[760px]">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                            <tr>
                                <th className="p-3.5">Hari & Tanggal</th>
                                <th className="p-3.5 text-center">Waktu / Jam</th>
                                <th className="p-3.5">Nama Produk</th>
                                <th className="p-3.5 text-center">Status Tipe</th>
                                <th className="p-3.5">Alasan Penyesuaian</th>
                                <th className="p-3.5 text-center">Stok Awal</th>
                                <th className="p-3.5 text-center">Selisih Qty</th>
                                <th className="p-3.5 text-right">Nilai Selisih (Rp)</th>
                                <th className="p-3.5 text-center">Stok Akhir Real</th>
                                <th className="p-3.5">Petugas</th>
                                <th className="p-3.5">Catatan</th>
                                <th className="p-3.5 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredAdjustments.length === 0 && (
                                <tr>
                                    <td colSpan={12} className="p-8 text-center text-slate-400 italic">
                                        Belum ada data riwayat penyesuaian stok yang sesuai dengan filter saat ini.
                                    </td>
                                </tr>
                            )}

                            {/* ======================================================== */}
                            {/* A. DAILY GROUPED VIEW (Default & Recommended) */}
                            {/* ======================================================== */}
                            {historyViewMode === 'daily' && groupedAdjustmentsByDay.map(dayGroup => (
                                <React.Fragment key={dayGroup.dateKey}>
                                    {/* Daily Section Header Banner */}
                                    <tr className="bg-amber-50/90 border-y-2 border-amber-300">
                                        <td colSpan={12} className="p-3 text-xs font-extrabold text-slate-800">
                                            <div className="flex flex-wrap justify-between items-center gap-2">
                                                <div className="flex flex-wrap items-center gap-2.5">
                                                    <span className="flex items-center gap-2 uppercase tracking-wider text-amber-950 font-black text-xs sm:text-sm">
                                                        📅 {dayGroup.dayName}, {dayGroup.formattedDate}
                                                    </span>
                                                    <span className="bg-white border border-amber-300 text-amber-900 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold shadow-2xs">
                                                        {dayGroup.items.length} Item Di-Opname
                                                    </span>
                                                    <span className="bg-emerald-100 border border-emerald-300 text-emerald-800 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold">
                                                        +{dayGroup.totalIncreaseQty} Surplus ({formatIDR(dayGroup.totalIncreaseValue)})
                                                    </span>
                                                    <span className="bg-rose-100 border border-rose-300 text-rose-800 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold">
                                                        -{dayGroup.totalDecreaseQty} Defisit ({formatIDR(dayGroup.totalDecreaseValue)})
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <span className="text-amber-950 font-mono text-xs font-black bg-amber-200/90 border border-amber-400 px-2.5 py-1 rounded-lg shadow-2xs">
                                                        Dampak Bersih: {dayGroup.netValue >= 0 ? `+${formatIDR(dayGroup.netValue)}` : formatIDR(dayGroup.netValue)}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handlePrintAuditReport(dayGroup.items, `BERITA ACARA AUDIT STOCK OPNAME - ${dayGroup.dayName.toUpperCase()}, ${dayGroup.formattedDate.toUpperCase()}`)}
                                                        className="px-2 py-1 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 rounded-lg text-[11px] font-bold transition-colors shadow-2xs flex items-center gap-1"
                                                        title="Cetak Berita Acara Opname Khusus Hari Ini"
                                                    >
                                                        <Printer size={12} /> Cetak Berita Acara Hari Ini
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>

                                    {/* Rows for this Day */}
                                    {dayGroup.items.map(item => {
                                        const product = products.find(p => p.id === item.productId);
                                        const hpp = product?.hpp || 0;
                                        const varianceVal = item.qty * hpp;

                                        return (
                                            <tr key={item.id} className="hover:bg-amber-50/30 transition-colors">
                                                <td className="p-3 text-slate-700 whitespace-nowrap">
                                                    <div className="font-extrabold text-slate-900">{dayGroup.dayName}</div>
                                                    <div className="text-[10px] text-slate-400">{dayGroup.formattedDate}</div>
                                                </td>
                                                <td className="p-3 text-center whitespace-nowrap bg-amber-50/20">
                                                    <span className="font-mono text-xs font-bold text-amber-900 bg-amber-100/80 px-2 py-0.5 rounded border border-amber-200 inline-block shadow-2xs">
                                                        {getTimeDisplay(item.date)}
                                                    </span>
                                                </td>
                                                <td className="p-3">
                                                    <div className="font-extrabold text-slate-900">{item.productName}</div>
                                                    <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5">
                                                        {product?.sku && <span>SKU: {product.sku}</span>}
                                                        <span>• {product?.categoryName || 'Tanpa Kategori'}</span>
                                                    </div>
                                                </td>
                                                <td className="p-3 text-center whitespace-nowrap">
                                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${item.type === 'INCREASE'
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        : 'bg-rose-50 text-rose-700 border-rose-200'
                                                        }`}>
                                                        {item.type === 'INCREASE' ? 'SURPLUS (+)' : 'DEFISIT (-)'}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-slate-700 font-semibold">{item.reason}</td>
                                                <td className="p-3 text-center text-slate-500 font-mono font-medium">{item.previousStock ?? '-'}</td>
                                                <td className="p-3 text-center font-black text-xs font-mono">
                                                    <span className={item.type === 'INCREASE' ? 'text-emerald-700' : 'text-rose-700'}>
                                                        {item.type === 'INCREASE' ? `+${item.qty}` : `-${item.qty}`}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-right font-mono font-bold whitespace-nowrap">
                                                    <span className={item.type === 'INCREASE' ? 'text-emerald-700' : 'text-rose-700'}>
                                                        {item.type === 'INCREASE' ? `+${formatIDR(varianceVal)}` : `-${formatIDR(varianceVal)}`}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-center font-black text-amber-800 font-mono bg-amber-50/30">{item.currentStock ?? '-'}</td>
                                                <td className="p-3 text-slate-600 whitespace-nowrap">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-700 shrink-0">
                                                            {item.userName?.charAt(0) || '?'}
                                                        </div>
                                                        <span className="truncate max-w-[100px] text-xs font-medium">{item.userName || '-'}</span>
                                                    </div>
                                                </td>
                                                <td className="p-3 text-slate-500 italic max-w-xs truncate" title={item.note}>{item.note || '-'}</td>
                                                <td className="p-3 text-right whitespace-nowrap">
                                                    <button
                                                        onClick={() => handleDeleteAdjustment(item)}
                                                        className="text-[11px] bg-rose-50 text-rose-600 hover:bg-rose-100 px-2 py-1 rounded-lg transition-colors inline-flex items-center gap-1 font-bold border border-rose-200"
                                                        title="Batalkan penyesuaian dan kembalikan stok"
                                                    >
                                                        <Trash2 size={12} /> Hapus
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </React.Fragment>
                            ))}

                            {/* ======================================================== */}
                            {/* B. FLAT LOG VIEW */}
                            {/* ======================================================== */}
                            {historyViewMode === 'flat' && filteredAdjustments.map(item => {
                                const product = products.find(p => p.id === item.productId);
                                const hpp = product?.hpp || 0;
                                const varianceVal = item.qty * hpp;

                                return (
                                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-3.5 text-slate-600 whitespace-nowrap">
                                            <div className="flex flex-col">
                                                <span className="font-extrabold text-slate-900">{getDayName(item.date)}</span>
                                                <span className="text-[10px] text-slate-400 font-mono">{new Date(item.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                            </div>
                                        </td>
                                        <td className="p-3.5 text-center whitespace-nowrap bg-amber-50/20">
                                            <span className="font-mono text-xs font-bold text-amber-900 bg-amber-100/80 px-2 py-0.5 rounded border border-amber-200 inline-block shadow-2xs">
                                                {getTimeDisplay(item.date)}
                                            </span>
                                        </td>
                                        <td className="p-3.5">
                                            <div className="font-extrabold text-slate-900">{item.productName}</div>
                                            <div className="text-[10px] text-slate-400 font-mono">
                                                {product?.categoryName || 'Tanpa Kategori'}
                                            </div>
                                        </td>
                                        <td className="p-3.5 text-center whitespace-nowrap">
                                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${item.type === 'INCREASE'
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                : 'bg-rose-50 text-rose-700 border-rose-200'
                                                }`}>
                                                {item.type === 'INCREASE' ? 'PENAMBAHAN' : 'PENGURANGAN'}
                                            </span>
                                        </td>
                                        <td className="p-3.5 text-slate-700 font-semibold">{item.reason}</td>
                                        <td className="p-3.5 text-center text-slate-500 font-mono font-medium">{item.previousStock ?? '-'}</td>
                                        <td className="p-3.5 text-center font-black text-xs font-mono">
                                            <span className={item.type === 'INCREASE' ? 'text-emerald-700' : 'text-rose-700'}>
                                                {item.type === 'INCREASE' ? `+${item.qty}` : `-${item.qty}`}
                                            </span>
                                        </td>
                                        <td className="p-3.5 text-right font-mono font-bold whitespace-nowrap">
                                            <span className={item.type === 'INCREASE' ? 'text-emerald-700' : 'text-rose-700'}>
                                                {item.type === 'INCREASE' ? `+${formatIDR(varianceVal)}` : `-${formatIDR(varianceVal)}`}
                                            </span>
                                        </td>
                                        <td className="p-3.5 text-center font-black text-amber-800 font-mono">{item.currentStock ?? '-'}</td>
                                        <td className="p-3.5 text-slate-600 whitespace-nowrap">
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-700 shrink-0">
                                                    {item.userName?.charAt(0) || '?'}
                                                </div>
                                                <span className="truncate max-w-[100px] text-xs font-medium">{item.userName || '-'}</span>
                                            </div>
                                        </td>
                                        <td className="p-3.5 text-slate-500 italic max-w-xs truncate" title={item.note}>{item.note || '-'}</td>
                                        <td className="p-3.5 text-right whitespace-nowrap">
                                            <button
                                                onClick={() => handleDeleteAdjustment(item)}
                                                className="text-[11px] bg-rose-50 text-rose-600 hover:bg-rose-100 px-2.5 py-1 rounded-lg transition-colors inline-flex items-center gap-1 font-bold border border-rose-200"
                                                title="Batalkan penyesuaian dan kembalikan stok"
                                            >
                                                <Trash2 size={12} /> Hapus
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
