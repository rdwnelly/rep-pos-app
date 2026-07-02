import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../hooks/useData';
import { StorageService } from '../services/storage';
import { User, UserRole, StoreSettings, BankAccount, PrinterType } from '../types';
import { Trash2, Plus, User as UserIcon, Shield, ShieldAlert, Edit2, Save, X, Store, Upload, CreditCard, Printer, AlertTriangle, Download, FileSpreadsheet, Settings as SettingsIcon, History as HistoryIcon, Palette, Bluetooth } from 'lucide-react';
import { exportToCSV, compressImage, exportToExcel } from '../utils';
import { useTheme } from '../hooks/useTheme';
import { useBluetoothPrinter } from '../hooks/useBluetoothPrinter';
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { firebaseConfig } from '../src/lib/firebase';

// Default store settings - defined outside component to avoid recreation
const DEFAULT_STORE_SETTINGS: StoreSettings = {
    name: '', jargon: '', address: '', phone: '', bankAccount: '', footerMessage: '', notes: '', instagram: '', tiktok: '',
    showAddress: true, showJargon: true, showBank: true, showPhone: true, showLogo: true, showInstagram: true, showTiktok: true, printerType: '58mm'
};

interface DeleteModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description: string;
    confirmationText: string;
    requireDateFilter: boolean;
    onConfirm: (startDate?: string, endDate?: string) => Promise<void>;
}

const DeleteConfirmationModal: React.FC<DeleteModalProps> = ({
    isOpen, onClose, title, description, confirmationText, requireDateFilter, onConfirm
}) => {
    const [dateFilterType, setDateFilterType] = useState<'ALL' | 'RANGE'>('ALL');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [confirmInput, setConfirmInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    if (!isOpen) return null;

    const handleConfirm = async () => {
        if (confirmInput.trim().toUpperCase() !== confirmationText.toUpperCase()) {
            alert('Teks konfirmasi tidak sesuai!');
            return;
        }

        let finalStart, finalEnd;
        if (requireDateFilter && dateFilterType === 'RANGE') {
            if (!startDate || !endDate) {
                alert('Silakan pilih rentang tanggal (Mulai dan Sampai) dengan lengkap!');
                return;
            }
            if (new Date(startDate) > new Date(endDate)) {
                alert('Tanggal mulai tidak boleh lebih besar dari tanggal selesai!');
                return;
            }
            // Append time to ensure start of day and end of day
            finalStart = `${startDate}T00:00:00.000Z`;
            finalEnd = `${endDate}T23:59:59.999Z`;
        }

        setIsLoading(true);
        try {
            await onConfirm(finalStart, finalEnd);
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        } finally {
            setIsLoading(false);
            setConfirmInput('');
            onClose();
        }
    };

    return createPortal(
        <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black/50 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl animate-fade-in">
                <div className="bg-red-50 p-4 border-b border-red-100 flex justify-between items-center">
                    <h3 className="font-bold text-red-700 flex items-center gap-2">
                        <AlertTriangle size={20} /> {title}
                    </h3>
                    <button onClick={onClose} disabled={isLoading} className="text-red-400 hover:text-red-700">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="text-sm text-slate-700 font-medium whitespace-pre-wrap">{description}</div>
                    
                    {requireDateFilter && (
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                            <p className="text-sm font-bold text-slate-700 mb-2">Pilih Rentang Waktu Data:</p>
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name="dateFilterType" checked={dateFilterType === 'ALL'} onChange={() => setDateFilterType('ALL')} className="text-red-600" />
                                    <span className="text-sm">Semua Waktu (Seluruh Data)</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name="dateFilterType" checked={dateFilterType === 'RANGE'} onChange={() => setDateFilterType('RANGE')} className="text-red-600" />
                                    <span className="text-sm">Pilih Tanggal Tertentu</span>
                                </label>
                            </div>

                            {dateFilterType === 'RANGE' && (
                                <div className="mt-3 grid grid-cols-2 gap-3 animate-fade-in">
                                    <div>
                                        <label className="block text-xs text-slate-500 mb-1">Mulai Tanggal</label>
                                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border border-slate-300 p-2 rounded focus:ring-2 focus:ring-red-500 outline-none text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-slate-500 mb-1">Sampai Tanggal</label>
                                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border border-slate-300 p-2 rounded focus:ring-2 focus:ring-red-500 outline-none text-sm" />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                        <label className="block text-sm text-red-900 mb-2">
                            Untuk melanjutkan, ketik: <strong>{confirmationText}</strong>
                        </label>
                        <input 
                            type="text" 
                            value={confirmInput} 
                            onChange={e => setConfirmInput(e.target.value)} 
                            placeholder={confirmationText}
                            className="w-full border border-red-300 p-2 rounded outline-none focus:ring-2 focus:ring-red-500 text-center font-bold"
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button onClick={onClose} disabled={isLoading} className="flex-1 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-medium border border-slate-200">
                            Batal
                        </button>
                        <button 
                            onClick={handleConfirm} 
                            disabled={isLoading || confirmInput.trim().toUpperCase() !== confirmationText} 
                            className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isLoading ? 'Menghapus...' : <><Trash2 size={16} /> Hapus Data</>}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export const Settings: React.FC = () => {
    // User State with useData
    const currentUser = JSON.parse(localStorage.getItem('pos_current_user') || '{}') as User;
    const isSuperAdmin = currentUser.role === UserRole.SUPERADMIN;
    const canManageStore = currentUser.role === UserRole.SUPERADMIN || currentUser.role === UserRole.OWNER || currentUser.role === UserRole.ADMIN;
    const initialTab = canManageStore ? 'store' : 'print';

    const [activeTab, setActiveTab] = useState<'store' | 'print' | 'users' | 'payments' | 'data' | 'appearance'>(initialTab);
    const { hue, setHue, saturation, setSaturation, resetTheme } = useTheme();
    const bluetooth = useBluetoothPrinter();

    const users = useData(async () => {
        if (isSuperAdmin) {
            return await StorageService.getUsers();
        }
        return [];
    }, [isSuperAdmin], 'users') || [];

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [userForm, setUserForm] = useState<Partial<User>>({
        name: '', username: '', email: '', password: '', role: UserRole.CASHIER, image: ''
    });

    const [deleteModalConfig, setDeleteModalConfig] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        confirmationText: string;
        requireDateFilter: boolean;
        onConfirm: (startDate?: string, endDate?: string) => Promise<void>;
    }>({
        isOpen: false,
        title: '',
        description: '',
        confirmationText: '',
        requireDateFilter: false,
        onConfirm: async () => {}
    });

    // Store State
    const loadedSettings = useData(() => StorageService.getStoreSettings(), [], 'storeSettings');
    const [storeSettings, setStoreSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);

    useEffect(() => {
        if (loadedSettings) {
            setStoreSettings({
                ...DEFAULT_STORE_SETTINGS,
                ...loadedSettings
            });
        }
    }, [loadedSettings]);

    // Bank State
    const banks = useData(() => StorageService.getBanks(), [], 'banks') || [];
    const [bankForm, setBankForm] = useState<Partial<BankAccount>>({ bankName: '', accountNumber: '', holderName: '' });
    const [isBankModalOpen, setIsBankModalOpen] = useState(false);
    const [editingBankId, setEditingBankId] = useState<string | null>(null);

    // --- STORE SETTINGS HANDLERS ---

    const handleSaveStore = async () => {
        try {
            console.log('Saving store settings:', storeSettings);
            await StorageService.saveStoreSettings(storeSettings);
            alert('Pengaturan toko berhasil disimpan!');
        } catch (error: any) {
            console.error("Failed to save store settings:", error);
            alert(`Gagal menyimpan pengaturan toko: ${error.message || 'Terjadi kesalahan'}`);
        }
    };

    // --- BANK MANAGEMENT HANDLERS ---

    const handleOpenBankModal = (bank?: BankAccount) => {
        if (bank) {
            setEditingBankId(bank.id);
            setBankForm({ bankName: bank.bankName, accountNumber: bank.accountNumber, holderName: bank.holderName });
        } else {
            setEditingBankId(null);
            setBankForm({ bankName: '', accountNumber: '', holderName: '' });
        }
        setIsBankModalOpen(true);
    };

    const handleSaveBank = async () => {
        if (!bankForm.bankName || !bankForm.accountNumber) return;
        const payload = { ...bankForm, id: editingBankId || undefined } as BankAccount;
        await StorageService.saveBank(payload);
        setIsBankModalOpen(false);
    };

    const handleDeleteBank = async (id: string) => {
        if (confirm('Hapus data bank/e-wallet ini?')) {
            await StorageService.deleteBank(id);
        }
    };

    const handleExportBankCSV = () => {
        const headers = ['ID', 'Nama Bank/E-Wallet', 'Nomor Rekening', 'Atas Nama'];
        const rows = banks.map(b => [b.id, b.bankName, b.accountNumber, b.holderName]);
        exportToCSV('data-bank.csv', headers, rows);
    };

    const handleExportBankExcel = () => {
        const data = banks.map(b => ({
            'ID': b.id,
            'Nama Bank/E-Wallet': b.bankName,
            'Nomor Rekening': b.accountNumber,
            'Atas Nama': b.holderName
        }));

        const cols = [
            { wch: 15 }, // ID
            { wch: 20 }, // Nama Bank
            { wch: 20 }, // No Rek
            { wch: 20 }  // Atas Nama
        ];

        exportToExcel(data, "Data_Bank", "Data Bank", cols);
    };

    const handlePrintBank = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const rows = banks.map((b, idx) => `
            <tr>
                <td>${idx + 1}</td>
                <td>${b.bankName}</td>
                <td>${b.accountNumber}</td>
                <td>${b.holderName}</td>
            </tr>
        `).join('');

        const html = `
            <html>
                <head>
                    <title>Data Bank & E-Wallet</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
                        h2 { text-align: center; margin-bottom: 20px; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background-color: #f2f2f2; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <h2>Data Bank & E-Wallet</h2>
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 40px">No</th>
                                <th>Nama Bank/E-Wallet</th>
                                <th>Nomor Rekening</th>
                                <th>Atas Nama</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                    <script>window.print();</script>
                </body>
            </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
    };

    // --- USER MANAGEMENT HANDLERS ---

    const handleOpenModal = (user?: User) => {
        if (user) {
            setEditingId(user.id);
            setUserForm({ name: user.name, username: user.username, email: user.email || '', password: '', role: user.role, image: user.image });
        } else {
            setEditingId(null);
            setUserForm({ name: '', username: '', email: '', password: '', role: UserRole.CASHIER, image: '' });
        }
        setIsModalOpen(true);
    };

    const handleSaveUser = async () => {
        // Validation: Name and Username are always required
        if (!userForm.username || !userForm.name || !userForm.email) {
            alert('Nama, Username, dan Email wajib diisi');
            return;
        }

        // Validation: Password is required ONLY for new users
        if (!editingId && !userForm.password) {
            alert('Password wajib diisi untuk user baru');
            return;
        }

        try {
            let uid = editingId;

            // If creating a new user, register them in Firebase Auth first
            if (!editingId) {
                // Initialize secondary app to avoid logging out the current superadmin
                const secondaryApp = getApps().find(app => app.name === 'Secondary') || initializeApp(firebaseConfig, 'Secondary');
                const secondaryAuth = getAuth(secondaryApp);
                const userCredential = await createUserWithEmailAndPassword(secondaryAuth, userForm.email!, userForm.password!);
                uid = userCredential.user.uid;
                await secondaryAuth.signOut(); // Clean up
            }

            const payload = {
                ...userForm,
                id: uid
            } as User;

            // If editing and password is empty, remove it from payload to keep existing password
            if (editingId && !userForm.password) {
                delete (payload as any).password;
            }

            await StorageService.saveUser(payload);
            setIsModalOpen(false);
            setEditingId(null);
            alert('User berhasil disimpan!');
        } catch (error: any) {
            console.error(error);
            let errorMessage = error.message || 'Pastikan email belum digunakan.';
            if (errorMessage.includes('Validation failed')) {
                errorMessage += ' (Password minimal 6 karakter)';
            }
            alert(`Gagal menyimpan user: ${errorMessage}`);
        }
    };

    const handleDeleteUser = async (id: string) => {

        const userToDelete = users.find(u => u.id === id);

        if (!userToDelete) return;

        // Only Superadmin can delete users
        if (currentUser.role !== UserRole.SUPERADMIN) {
            alert("Akses ditolak. Hanya Superadmin yang dapat menghapus user.");
            return;
        }

        // 1. Prevent deleting the main Superadmin
        if (userToDelete.username === 'superadmin') {
            alert("User Superadmin Utama tidak dapat dihapus!");
            return;
        }

        // 2. Prevent Self Deletion
        if (currentUser.id === userToDelete.id) {
            alert("Anda tidak dapat menghapus akun sendiri!");
            return;
        }

        if (confirm("Hapus user ini?")) {
            await StorageService.deleteUser(id);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const compressed = await compressImage(file);
                setUserForm({ ...userForm, image: compressed });
            } catch (error) {
                console.error("Gagal memproses gambar", error);
            }
        }
    };

    const handleRemoveUserImage = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setUserForm({ ...userForm, image: '' });
    };

    // --- DATA MANAGEMENT HANDLERS (SUPERADMIN ONLY) ---
    const handleResetProducts = async () => {
        if (!isSuperAdmin) return;
        setDeleteModalConfig({
            isOpen: true,
            title: 'Hapus Data Produk',
            description: 'PERINGATAN: Ini akan menghapus SEMUA data produk!\n\nSemua produk yang Anda input akan HILANG PERMANEN!\nStock akan kembali ke 0.',
            confirmationText: 'HAPUS PRODUK',
            requireDateFilter: false,
            onConfirm: async () => {
                await StorageService.resetProducts();
                alert('✅ Semua data produk berhasil dihapus!');
                window.location.reload();
            }
        });
    };

    const handleResetTransactions = async () => {
        if (!isSuperAdmin) return;
        setDeleteModalConfig({
            isOpen: true,
            title: 'Hapus Data Transaksi',
            description: 'PERINGATAN: Ini akan menghapus data transaksi penjualan!',
            confirmationText: 'HAPUS TRANSAKSI',
            requireDateFilter: true,
            onConfirm: async (startDate, endDate) => {
                await StorageService.resetTransactions(startDate, endDate);
                alert('✅ Data transaksi berhasil dihapus!');
                window.location.reload();
            }
        });
    };

    const handleResetPurchases = async () => {
        if (!isSuperAdmin) return;
        setDeleteModalConfig({
            isOpen: true,
            title: 'Hapus Data Pembelian',
            description: 'PERINGATAN: Ini akan menghapus data pembelian/stok masuk!',
            confirmationText: 'HAPUS PEMBELIAN',
            requireDateFilter: true,
            onConfirm: async (startDate, endDate) => {
                await StorageService.resetPurchases(startDate, endDate);
                alert('✅ Data pembelian berhasil dihapus!');
                window.location.reload();
            }
        });
    };

    const handleResetCashFlow = async () => {
        if (!isSuperAdmin) return;
        setDeleteModalConfig({
            isOpen: true,
            title: 'Hapus Data Arus Kas',
            description: 'PERINGATAN: Ini akan menghapus data arus kas!',
            confirmationText: 'HAPUS ARUS KAS',
            requireDateFilter: true,
            onConfirm: async (startDate, endDate) => {
                await StorageService.resetCashFlow(startDate, endDate);
                alert('✅ Data arus kas berhasil dihapus!');
                window.location.reload();
            }
        });
    };

    const handleResetStockAdjustments = async () => {
        if (!isSuperAdmin) return;
        setDeleteModalConfig({
            isOpen: true,
            title: 'Hapus Penyesuaian Stok',
            description: 'PERINGATAN: Ini akan menghapus data riwayat penyesuaian stok!',
            confirmationText: 'HAPUS DATA STOK',
            requireDateFilter: true,
            onConfirm: async (startDate, endDate) => {
                await StorageService.resetStockAdjustments(startDate, endDate);
                alert('✅ Data penyesuaian stok berhasil dihapus!');
                window.location.reload();
            }
        });
    };

    const handleResetAllFinancial = async () => {
        if (!isSuperAdmin) return;
        setDeleteModalConfig({
            isOpen: true,
            title: 'Reset Semua Keuangan',
            description: '⚠️ BAHAYA: Ini akan menghapus data keuangan (Transaksi, Pembelian, Arus Kas, Penyesuaian Stok)!\nTindakan ini TIDAK DAPAT DIBATALKAN!',
            confirmationText: 'RESET SEMUA',
            requireDateFilter: true,
            onConfirm: async (startDate, endDate) => {
                await StorageService.resetAllFinancialData(startDate, endDate);
                alert('✅ Data keuangan berhasil dihapus!');
                window.location.reload();
            }
        });
    };

    const handleResetMasterData = async () => {
        if (!isSuperAdmin) return;
        setDeleteModalConfig({
            isOpen: true,
            title: 'Reset Master Data',
            description: '⚠️ BAHAYA: Ini akan me-reset SEMUA Master Data (Produk, Kategori, Pelanggan, Supplier) ke default awal!\nData yang Anda input akan HILANG PERMANEN!',
            confirmationText: 'RESET MASTER DATA',
            requireDateFilter: false,
            onConfirm: async () => {
                await StorageService.resetMasterData();
                alert('✅ Master Data berhasil di-reset ke default!');
                window.location.reload();
            }
        });
    };

    const handleResetAllData = async () => {
        if (!isSuperAdmin) return;
        
        const tripleConfirm = prompt('🚨 PERINGATAN EKSTRIM 🚨\n\nMenghapus SELURUH DATA dari database.\nKetik nama toko Anda untuk konfirmasi awal penghapusan total data:');
        if (!tripleConfirm) return;
        
        const storeSettingsData = await StorageService.getStoreSettings();
        if (tripleConfirm !== storeSettingsData.name) {
            alert('❌ Nama toko tidak cocok. Penghapusan dibatalkan.');
            return;
        }

        setDeleteModalConfig({
            isOpen: true,
            title: 'HAPUS SEMUA DATA',
            description: '🚨 PERINGATAN EKSTRIM 🚨\n\nIni akan menghapus SELURUH DATA dari database:\n• Transaksi Penjualan\n• Pembelian\n• Arus Kas\n• Penyesuaian Stok\n• Produk\n• Kategori\n• Pelanggan\n• Supplier\n\nSEMUA DATA AKAN HILANG PERMANEN!',
            confirmationText: 'HAPUS SEMUA DATA',
            requireDateFilter: false,
            onConfirm: async () => {
                await StorageService.resetAllData();
                alert('✅ SEMUA data berhasil dihapus! Aplikasi akan dimuat ulang.');
                window.location.reload();
            }
        });
    };





    return (
        <div className="space-y-6 animate-fade-in">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                    <SettingsIcon className="text-primary" />
                    Pengaturan
                </h2>
                <p className="text-slate-500 text-sm mt-1">Kelola profil toko, metode pembayaran, dan akses pengguna.</p>
            </div>

            <div className="flex gap-4 mb-6 border-b border-slate-200 overflow-x-auto">
                {canManageStore && (
                    <button
                        onClick={() => setActiveTab('store')}
                        className={`pb-3 px-4 font-medium text-sm transition-colors border-b-2 whitespace-nowrap ${activeTab === 'store' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        Profil Toko
                    </button>
                )}
                {canManageStore && (
                    <button
                        onClick={() => setActiveTab('payments')}
                        className={`pb-3 px-4 font-medium text-sm transition-colors border-b-2 whitespace-nowrap ${activeTab === 'payments' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        Bank & E-Wallet
                    </button>
                )}
                <button
                    onClick={() => setActiveTab('print')}
                    className={`pb-3 px-4 font-medium text-sm transition-colors border-b-2 whitespace-nowrap ${activeTab === 'print' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    Pengaturan Cetak
                </button>
                <button
                    onClick={() => setActiveTab('appearance')}
                    className={`pb-3 px-4 font-medium text-sm transition-colors border-b-2 whitespace-nowrap ${activeTab === 'appearance' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    Tampilan
                </button>
                {/* Only Superadmin can see User Management */}
                {isSuperAdmin && (
                    <>
                        <button
                            onClick={() => setActiveTab('users')}
                            className={`pb-3 px-4 font-medium text-sm transition-colors border-b-2 whitespace-nowrap ${activeTab === 'users' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        >
                            Manajemen User
                        </button>
                        <button
                            onClick={() => setActiveTab('data')}
                            className={`pb-3 px-4 font-medium text-sm transition-colors border-b-2 whitespace-nowrap ${activeTab === 'data' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        >
                            <span className="flex items-center gap-1">
                                <AlertTriangle size={14} />
                                Data Management
                            </span>
                        </button>
                    </>
                )}
            </div>

            {activeTab === 'store' && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 animate-fade-in">
                    <div className="flex items-start gap-6 flex-col md:flex-row">
                        <div className="bg-primary/10 p-4 rounded-full">
                            <Store size={48} className="text-primary" />
                        </div>
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                            <div className="col-span-2">
                                <label htmlFor="storeName" className="block text-sm font-medium text-slate-700 mb-1">Nama Toko</label>
                                <input id="storeName" name="storeName" type="text" className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-primary outline-none" value={storeSettings.name} onChange={e => setStoreSettings({ ...storeSettings, name: e.target.value })} placeholder="Contoh: Toko Maju Jaya" />
                            </div>
                            <div className="col-span-2">
                                <label htmlFor="storeJargon" className="block text-sm font-medium text-slate-700 mb-1">Jargon / Slogan</label>
                                <input id="storeJargon" name="storeJargon" type="text" className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-primary outline-none" value={storeSettings.jargon} onChange={e => setStoreSettings({ ...storeSettings, jargon: e.target.value })} placeholder="Murah, Lengkap, Berkualitas" />
                            </div>
                            <div className="col-span-2">
                                <label htmlFor="storeAddress" className="block text-sm font-medium text-slate-700 mb-1">Alamat Lengkap</label>
                                <textarea id="storeAddress" name="storeAddress" rows={2} className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-primary outline-none" value={storeSettings.address} onChange={e => setStoreSettings({ ...storeSettings, address: e.target.value })}></textarea>
                            </div>
                            <div>
                                <label htmlFor="storePhone" className="block text-sm font-medium text-slate-700 mb-1">No. Telepon / WA</label>
                                <input id="storePhone" name="storePhone" type="text" className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-primary outline-none" value={storeSettings.phone} onChange={e => setStoreSettings({ ...storeSettings, phone: e.target.value })} />
                            </div>
                            <div>
                                <label htmlFor="storeInstagram" className="block text-sm font-medium text-slate-700 mb-1">Akun Instagram</label>
                                <input id="storeInstagram" name="storeInstagram" type="text" className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-primary outline-none" value={storeSettings.instagram || ''} onChange={e => setStoreSettings({ ...storeSettings, instagram: e.target.value })} placeholder="@rumah_etnik_papua" />
                            </div>
                            <div>
                                <label htmlFor="storeTiktok" className="block text-sm font-medium text-slate-700 mb-1">Akun TikTok</label>
                                <input id="storeTiktok" name="storeTiktok" type="text" className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-primary outline-none" value={storeSettings.tiktok || ''} onChange={e => setStoreSettings({ ...storeSettings, tiktok: e.target.value })} placeholder="Rumah Etnik Papua" />
                            </div>
                            <div>
                                <label htmlFor="storeBankInfo" className="block text-sm font-medium text-slate-700 mb-1">Info Bank Utama (Di Struk)</label>
                                <textarea id="storeBankInfo" name="storeBankInfo" rows={3} className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-primary outline-none" value={storeSettings.bankAccount} onChange={e => setStoreSettings({ ...storeSettings, bankAccount: e.target.value })} placeholder="BCA 123xxx an Budi&#10;Mandiri 456xxx an Budi" />
                            </div>
                            <div className="col-span-2">
                                <label htmlFor="storeFooter" className="block text-sm font-medium text-slate-700 mb-1">Pesan Footer (Struk)</label>
                                <input id="storeFooter" name="storeFooter" type="text" className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-primary outline-none" value={storeSettings.footerMessage} onChange={e => setStoreSettings({ ...storeSettings, footerMessage: e.target.value })} />
                            </div>
                            <div className="col-span-2">
                                <label htmlFor="storeNotes" className="block text-sm font-medium text-slate-700 mb-1">Catatan Tambahan</label>
                                <textarea
                                    id="storeNotes"
                                    name="storeNotes"
                                    rows={3}
                                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                                    value={storeSettings.notes || ''}
                                    onChange={e => setStoreSettings({ ...storeSettings, notes: e.target.value })}
                                    placeholder="Catatan internal untuk toko (tidak ditampilkan di struk)"
                                ></textarea>
                            </div>

                        </div>
                    </div>

                    <div className="mt-6 flex justify-end">
                        <button onClick={handleSaveStore} className="bg-primary text-white px-6 py-2.5 rounded-lg font-bold hover:bg-primary/90 flex items-center gap-2">
                            <Save size={18} /> Simpan Pengaturan
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'print' && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 animate-fade-in">
                    <div className="flex items-start gap-6 flex-col md:flex-row">
                        <div className="bg-primary/10 p-4 rounded-full">
                            <Printer size={48} className="text-primary" />
                        </div>
                        <div className="flex-1 w-full">
                            <div className="border-slate-100 pb-4">
                                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Printer size={16} /> Pengaturan Cetak Nota</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <p className="block text-sm font-medium text-slate-700 mb-2">Jenis Printer / Ukuran Kertas</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            <button
                                                onClick={() => setStoreSettings({ ...storeSettings, printerType: '58mm' })}
                                                className={`p-2 text-sm rounded border transition-colors ${storeSettings.printerType === '58mm' ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'} `}
                                            >
                                                Thermal 58mm
                                            </button>
                                            <button
                                                onClick={() => setStoreSettings({ ...storeSettings, printerType: '80mm' })}
                                                className={`p-2 text-sm rounded border transition-colors ${storeSettings.printerType === '80mm' ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'} `}
                                            >
                                                Thermal 80mm
                                            </button>
                                            <button
                                                onClick={() => setStoreSettings({ ...storeSettings, printerType: 'A4' })}
                                                className={`p-2 text-sm rounded border transition-colors ${storeSettings.printerType === 'A4' ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'} `}
                                            >
                                                DotMatrix / A4
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-6 mt-2">
                                    <label htmlFor="showLogo" className="flex items-center gap-2 cursor-pointer">
                                        <input id="showLogo" name="showLogo" type="checkbox" checked={storeSettings.showLogo !== false} onChange={e => setStoreSettings({ ...storeSettings, showLogo: e.target.checked })} className="w-4 h-4 text-primary rounded" />
                                        <span className="text-sm text-slate-700">Tampilkan Logo</span>
                                    </label>
                                    <label htmlFor="showAddress" className="flex items-center gap-2 cursor-pointer">
                                        <input id="showAddress" name="showAddress" type="checkbox" checked={storeSettings.showAddress !== false} onChange={e => setStoreSettings({ ...storeSettings, showAddress: e.target.checked })} className="w-4 h-4 text-primary rounded" />
                                        <span className="text-sm text-slate-700">Tampilkan Alamat</span>
                                    </label>
                                    <label htmlFor="showPhone" className="flex items-center gap-2 cursor-pointer">
                                        <input id="showPhone" name="showPhone" type="checkbox" checked={storeSettings.showPhone !== false} onChange={e => setStoreSettings({ ...storeSettings, showPhone: e.target.checked })} className="w-4 h-4 text-primary rounded" />
                                        <span className="text-sm text-slate-700">Tampilkan Telepon/WA</span>
                                    </label>
                                    <label htmlFor="showInstagram" className="flex items-center gap-2 cursor-pointer">
                                        <input id="showInstagram" name="showInstagram" type="checkbox" checked={storeSettings.showInstagram !== false} onChange={e => setStoreSettings({ ...storeSettings, showInstagram: e.target.checked })} className="w-4 h-4 text-primary rounded" />
                                        <span className="text-sm text-slate-700">Tampilkan Instagram</span>
                                    </label>
                                    <label htmlFor="showTiktok" className="flex items-center gap-2 cursor-pointer">
                                        <input id="showTiktok" name="showTiktok" type="checkbox" checked={storeSettings.showTiktok !== false} onChange={e => setStoreSettings({ ...storeSettings, showTiktok: e.target.checked })} className="w-4 h-4 text-primary rounded" />
                                        <span className="text-sm text-slate-700">Tampilkan TikTok</span>
                                    </label>
                                    <label htmlFor="showJargon" className="flex items-center gap-2 cursor-pointer">
                                        <input id="showJargon" name="showJargon" type="checkbox" checked={storeSettings.showJargon !== false} onChange={e => setStoreSettings({ ...storeSettings, showJargon: e.target.checked })} className="w-4 h-4 text-primary rounded" />
                                        <span className="text-sm text-slate-700">Tampilkan Jargon</span>
                                    </label>
                                    <label htmlFor="showBank" className="flex items-center gap-2 cursor-pointer">
                                        <input id="showBank" name="showBank" type="checkbox" checked={storeSettings.showBank !== false} onChange={e => setStoreSettings({ ...storeSettings, showBank: e.target.checked })} className="w-4 h-4 text-primary rounded" />
                                        <span className="text-sm text-slate-700">Tampilkan Info Bank</span>
                                    </label>
                                </div>
                                
                                <div className="mt-4 p-4 border border-blue-100 bg-blue-50/50 rounded-lg">
                                    <h5 className="font-semibold text-slate-800 mb-2 flex items-center gap-2"><Bluetooth size={16} className="text-blue-600" /> Bluetooth Printer (Silent Print)</h5>
                                    <p className="text-xs text-slate-600 mb-3">Gunakan Web Bluetooth API untuk mencetak langsung ke printer thermal tanpa popup dialog browser.</p>
                                    
                                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                                        <label htmlFor="useBluetoothPrinter" className="flex items-center gap-2 cursor-pointer">
                                            <input id="useBluetoothPrinter" name="useBluetoothPrinter" type="checkbox" checked={storeSettings.useBluetoothPrinter || false} onChange={e => setStoreSettings({ ...storeSettings, useBluetoothPrinter: e.target.checked })} className="w-4 h-4 text-blue-600 rounded" />
                                            <span className="text-sm font-medium text-slate-700">Aktifkan Bluetooth Print</span>
                                        </label>

                                        {storeSettings.useBluetoothPrinter && (
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={async () => {
                                                        try {
                                                            await bluetooth.connect();
                                                        } catch (err: any) {
                                                            alert(err.message || 'Gagal koneksi ke printer');
                                                        }
                                                    }}
                                                    className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
                                                >
                                                    <Bluetooth size={14} /> {bluetooth.isConnected ? 'Hubungkan Ulang' : 'Cari Printer'}
                                                </button>
                                                
                                                {bluetooth.isConnected && (
                                                    <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded">
                                                        Terhubung: {bluetooth.deviceName}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end">
                        <button onClick={handleSaveStore} className="bg-primary text-white px-6 py-2.5 rounded-lg font-bold hover:bg-primary/90 flex items-center gap-2">
                            <Save size={18} /> Simpan Pengaturan
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'payments' && (
                <div className="animate-fade-in">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-lg text-slate-800">Daftar Rekening & E-Wallet</h3>
                        <button onClick={() => handleOpenBankModal()} className="bg-primary text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-primary/90 shadow">
                            <Plus size={18} /> Tambah Rekening
                        </button>
                    </div>
                    <div className="flex justify-end gap-2 mb-4">
                        <button onClick={handlePrintBank} className="bg-white border border-slate-300 text-slate-700 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-50 text-sm font-medium">
                            <Printer size={16} /> Print
                        </button>
                        <button onClick={handleExportBankExcel} className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-green-100 text-sm font-medium">
                            <FileSpreadsheet size={16} /> Excel
                        </button>
                        <button onClick={handleExportBankCSV} className="bg-white border border-slate-300 text-slate-700 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-50 text-sm font-medium">
                            <Download size={16} /> CSV
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {banks.map(bank => (
                            <div key={bank.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 transition-colors group">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                                            <CreditCard size={20} />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-800">{bank.bankName}</h4>
                                            <p className="text-sm text-slate-500">{bank.accountNumber}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => handleOpenBankModal(bank)} className="p-2 text-primary hover:bg-primary/10 rounded-lg"><Edit2 size={16} /></button>
                                        <button onClick={() => handleDeleteBank(bank.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                                    </div>
                                </div>
                                <div className="mt-3 pt-3 border-t border-slate-50 text-xs text-slate-400 uppercase font-medium">
                                    a.n {bank.holderName}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Bank Modal */}
                    {isBankModalOpen && createPortal(
                        <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black/40 backdrop-blur-md z-[99999] flex items-center justify-center p-4 overflow-y-auto">
                            <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
                                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                    <h3 className="font-bold text-slate-800">{editingBankId ? 'Edit Rekening' : 'Tambah Rekening'}</h3>
                                    <button onClick={() => setIsBankModalOpen(false)}><X size={20} className="text-slate-400" /></button>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div>
                                        <label htmlFor="bankName" className="block text-sm font-medium text-slate-700 mb-1">Nama Bank / E-Wallet</label>
                                        <input id="bankName" name="bankName" type="text" placeholder="Contoh: BCA, GoPay, Dana" className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-primary outline-none" value={bankForm.bankName} onChange={e => setBankForm({ ...bankForm, bankName: e.target.value })} />
                                    </div>
                                    <div>
                                        <label htmlFor="accountNumber" className="block text-sm font-medium text-slate-700 mb-1">Nomor Rekening / HP</label>
                                        <input id="accountNumber" name="accountNumber" type="text" className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-primary outline-none" value={bankForm.accountNumber} onChange={e => setBankForm({ ...bankForm, accountNumber: e.target.value })} />
                                    </div>
                                    <div>
                                        <label htmlFor="holderName" className="block text-sm font-medium text-slate-700 mb-1">Atas Nama</label>
                                        <input id="holderName" name="holderName" type="text" className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-primary outline-none" value={bankForm.holderName} onChange={e => setBankForm({ ...bankForm, holderName: e.target.value })} />
                                    </div>
                                    <div className="pt-4 flex gap-3">
                                        <button onClick={() => setIsBankModalOpen(false)} className="flex-1 text-slate-500 py-2 text-sm hover:bg-slate-50 rounded-lg">Batal</button>
                                        <button onClick={handleSaveBank} className="flex-1 bg-primary text-white py-2 rounded-lg font-bold hover:bg-primary/90 flex items-center justify-center gap-2">
                                            <Save size={16} /> Simpan
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>,
                        document.body
                    )}
                </div>
            )
            }

            {
                activeTab === 'users' && (
                    <div className="animate-fade-in">
                        <div className="flex justify-end mb-4">
                            <button onClick={() => handleOpenModal()} className="bg-primary text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-primary/90 shadow">
                                <Plus size={18} /> Tambah User
                            </button>
                        </div>

                        <div className="grid gap-4">
                            {users.map(u => (
                                <div key={u.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 rounded-full overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
                                            {u.image ? (
                                                <img src={u.image} alt={u.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className={`w-full h-full flex items-center justify-center ${u.role === UserRole.OWNER ? 'bg-purple-100 text-purple-600' : 'bg-primary/10 text-primary'} `}>
                                                    {u.role === UserRole.OWNER ? <ShieldAlert size={24} /> : <UserIcon size={24} />}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-800 text-lg">{u.name}</h4>
                                            <div className="flex gap-2 text-sm text-slate-500">
                                                <span className="font-mono bg-slate-100 px-2 rounded">@{u.username}</span>
                                                <span>•</span>
                                                <span className="font-medium">
                                                    {u.role === UserRole.SUPERADMIN ? 'Superadmin' :
                                                        u.role === UserRole.OWNER ? 'Pemilik (Owner)' :
                                                            u.role === UserRole.ADMIN ? 'Admin' :
                                                                u.role === UserRole.WAREHOUSE ? 'Gudang' : 'Kasir'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleOpenModal(u)} className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors">
                                            <Edit2 size={20} />
                                        </button>
                                        <button onClick={() => handleDeleteUser(u.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                            <Trash2 size={20} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            }

            {activeTab === 'appearance' && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 animate-fade-in">
                    <div className="flex items-start gap-6 flex-col md:flex-row">
                        <div className="bg-primary/10 p-4 rounded-full">
                            <Palette size={48} className="text-primary" />
                        </div>
                        <div className="flex-1 space-y-8">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Kustomisasi Tema</h3>
                                <p className="text-slate-500 text-sm">Sesuaikan warna aplikasi dengan brand Anda.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    <div>
                                        <div className="flex justify-between mb-2">
                                            <label htmlFor="themeHue" className="text-sm font-medium text-slate-700">Warna (Hue)</label>
                                            <span className="text-xs font-mono text-slate-500">{hue}°</span>
                                        </div>
                                        <input
                                            id="themeHue"
                                            name="themeHue"
                                            type="range"
                                            min="0"
                                            max="360"
                                            value={hue}
                                            onChange={(e) => setHue(parseInt(e.target.value))}
                                            className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                                            style={{ background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)' }}
                                        />
                                    </div>

                                    <div>
                                        <div className="flex justify-between mb-2">
                                            <label htmlFor="themeSaturation" className="text-sm font-medium text-slate-700">Kepekatan (Saturation)</label>
                                            <span className="text-xs font-mono text-slate-500">{saturation}%</span>
                                        </div>
                                        <input
                                            id="themeSaturation"
                                            name="themeSaturation"
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={saturation}
                                            onChange={(e) => setSaturation(parseInt(e.target.value))}
                                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                                        />
                                    </div>

                                    <div className="pt-4">
                                        <button
                                            onClick={resetTheme}
                                            className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors"
                                        >
                                            Reset ke Default (Nuansa Papua)
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-4 tracking-wider">Preview Tampilan</h4>

                                    <div className="space-y-4">
                                        {/* Prime Button */}
                                        <button className="w-full bg-primary text-white py-2.5 rounded-lg font-bold shadow-lg shadow-primary/30 transform transition-transform hover:scale-[1.02]">
                                            Tombol Utama
                                        </button>

                                        {/* Outline Button */}
                                        <button className="w-full bg-white border-2 border-primary text-primary py-2.5 rounded-lg font-bold">
                                            Tombol Sekunder
                                        </button>

                                        {/* Alert / Badges */}
                                        <div className="flex gap-2">
                                            <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold">
                                                Badge
                                            </span>
                                            <span className="bg-primary text-white px-3 py-1 rounded-full text-xs font-bold">
                                                Active
                                            </span>
                                        </div>

                                        {/* Card Accent */}
                                        <div className="bg-white p-4 rounded-lg border-l-4 border-primary shadow-sm">
                                            <h5 className="font-bold text-slate-800">Card Title</h5>
                                            <p className="text-xs text-slate-500 mt-1">Contoh elemen UI dengan aksen warna.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Data Management Tab (SUPERADMIN ONLY) */}
            {
                activeTab === 'data' && isSuperAdmin && (
                    <div className="animate-fade-in space-y-6">
                        {/* Warning Banner */}
                        <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-lg">
                            <div className="flex items-start gap-3">
                                <AlertTriangle size={24} className="text-red-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <h3 className="font-bold text-red-900 text-lg mb-1">⚠️ Zona Berbahaya-Superadmin Only</h3>
                                    <p className="text-red-700 text-sm leading-relaxed">
                                        Fitur di halaman ini dapat menghapus data secara permanen dan <strong>TIDAK DAPAT DIBATALKAN</strong>.
                                        Pastikan Anda memahami konsekuensi sebelum melakukan tindakan apapun.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Reset Actions */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Reset Products */}
                            <div className="bg-white p-6 rounded-xl border-2 border-green-200 hover:border-green-400 transition-colors">
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                                        <Trash2 size={24} className="text-green-600" />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-slate-800 text-lg">Hapus Data Produk</h4>
                                        <p className="text-sm text-slate-600 mt-1">Menghapus semua produk dan stock kembali ke 0</p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleResetProducts}
                                    className="w-full bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
                                >
                                    <Trash2 size={18} />
                                    Hapus Produk
                                </button>
                            </div>

                            {/* Reset Stock Adjustments - Moved here as requested */}
                            <div className="bg-white p-6 rounded-xl border-2 border-orange-200 hover:border-orange-400 transition-colors">
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                                        <HistoryIcon size={24} className="text-orange-600" />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-slate-800 text-lg">Hapus Penyesuaian Stok</h4>
                                        <p className="text-sm text-slate-600 mt-1">Menghapus riwayat stock opname manual</p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleResetStockAdjustments}
                                    className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
                                >
                                    <Trash2 size={18} />
                                    Hapus Riwayat Stok
                                </button>
                            </div>

                            {/* Reset Transactions */}
                            <div className="bg-white p-6 rounded-xl border-2 border-orange-200 hover:border-orange-400 transition-colors">
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                                        <Trash2 size={24} className="text-orange-600" />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-slate-800 text-lg">Hapus Data Transaksi</h4>
                                        <p className="text-sm text-slate-600 mt-1">Menghapus semua riwayat penjualan dan piutang pelanggan</p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleResetTransactions}
                                    className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
                                >
                                    <Trash2 size={18} />
                                    Hapus Transaksi
                                </button>
                            </div>

                            {/* Reset Purchases */}
                            <div className="bg-white p-6 rounded-xl border-2 border-orange-200 hover:border-orange-400 transition-colors">
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                                        <Trash2 size={24} className="text-orange-600" />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-slate-800 text-lg">Hapus Data Pembelian</h4>
                                        <p className="text-sm text-slate-600 mt-1">Menghapus semua riwayat pembelian dan utang supplier</p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleResetPurchases}
                                    className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
                                >
                                    <Trash2 size={18} />
                                    Hapus Pembelian
                                </button>
                            </div>

                            {/* Reset Cash Flow */}
                            <div className="bg-white p-6 rounded-xl border-2 border-orange-200 hover:border-orange-400 transition-colors">
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                                        <Trash2 size={24} className="text-orange-600" />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-slate-800 text-lg">Hapus Data Arus Kas</h4>
                                        <p className="text-sm text-slate-600 mt-1">Menghapus semua catatan arus kas masuk dan keluar</p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleResetCashFlow}
                                    className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
                                >
                                    <Trash2 size={18} />
                                    Hapus Arus Kas
                                </button>
                            </div>



                            {/* Reset ALL Financial Data */}
                            <div className="bg-white p-6 rounded-xl border-2 border-red-300 hover:border-red-500 transition-colors">
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                                        <AlertTriangle size={24} className="text-red-600" />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-red-800 text-lg">🔥 Reset SEMUA Data Keuangan</h4>
                                        <p className="text-sm text-red-600 mt-1 font-medium">Menghapus SEMUA transaksi, pembelian, arus kas, dan penyesuaian stok!</p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleResetAllFinancial}
                                    className="w-full bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors shadow-lg"
                                >
                                    <AlertTriangle size={18} />
                                    RESET SEMUA KEUANGAN
                                </button>
                            </div>

                            {/* Reset Master Data */}
                            <div className="bg-white p-6 rounded-xl border-2 border-blue-300 hover:border-blue-500 transition-colors">
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                                        <Trash2 size={24} className="text-blue-600" />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-blue-800 text-lg">♻️ Reset Master Data</h4>
                                        <p className="text-sm text-blue-600 mt-1 font-medium">Reset Produk, Kategori, Pelanggan & Supplier ke Default (Awal).</p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleResetMasterData}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors shadow-lg"
                                >
                                    <Trash2 size={18} />
                                    RESET MASTER DATA
                                </button>
                            </div>

                            {/* NUCLEAR OPTION: Reset ALL Data */}
                            <div className="bg-gradient-to-br from-red-50 to-pink-50 p-6 rounded-xl border-4 border-red-500 hover:border-red-600 transition-all shadow-lg col-span-full">
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="w-14 h-14 bg-gradient-to-br from-red-600 to-pink-600 rounded-full flex items-center justify-center flex-shrink-0 animate-pulse">
                                        <AlertTriangle size={28} className="text-white" />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-black text-red-900 text-xl flex items-center gap-2">
                                            🚨 NUCLEAR OPTION: HAPUS SEMUA DATA 🚨
                                        </h4>
                                        <p className="text-sm text-red-700 mt-2 font-bold">
                                            Menghapus SELURUH DATA dari database (Finansial + Master Data)
                                        </p>
                                        <div className="mt-3 bg-white/80 p-3 rounded-lg border border-red-200">
                                            <p className="text-xs text-red-800 font-semibold mb-2">Yang akan dihapus:</p>
                                            <ul className="text-xs text-red-700 space-y-1 list-disc list-inside grid grid-cols-2 gap-1">
                                                <li>Transaksi Penjualan</li>
                                                <li>Produk</li>
                                                <li>Pembelian</li>
                                                <li>Kategori</li>
                                                <li>Arus Kas</li>
                                                <li>Pelanggan</li>
                                                <li>Penyesuaian Stok</li>
                                                <li>Supplier</li>
                                            </ul>
                                        </div>
                                        <div className="mt-2 bg-yellow-100 border border-yellow-400 p-2 rounded text-xs text-yellow-900 font-bold">
                                            ⚠️ HANYA Data User, Bank, dan Store Settings yang TIDAK dihapus
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={handleResetAllData}
                                    className="w-full bg-gradient-to-r from-red-700 to-pink-700 hover:from-red-800 hover:to-pink-800 text-white py-3.5 rounded-lg font-black text-lg flex items-center justify-center gap-2 transition-all shadow-2xl border-2 border-red-900"
                                >
                                    <AlertTriangle size={22} />
                                    HAPUS SEMUA DATA (TRIPLE CONFIRM)
                                </button>
                            </div>




                        </div>

                        {/* Info Box */}
                        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                            <h4 className="font-bold text-blue-900 text-sm mb-2">ℹ️ Informasi Penting:</h4>
                            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                                <li>Data yang dihapus <strong>tidak dapat dikembalikan</strong></li>
                                <li>Disarankan untuk <strong>export data</strong> terlebih dahulu sebelum menghapus</li>
                                <li>Data produk, pelanggan, dan supplier <strong>tidak akan terhapus</strong> (Kecuali jika Anda memilih Reset Master Data atau Hapus Semua Data)</li>
                                <li>Hanya <strong>SUPERADMIN</strong> yang dapat mengakses fitur ini</li>
                            </ul>
                        </div>
                    </div>
                )
            }

            {/* User Modal */}
            {
                isModalOpen && createPortal(
                    <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black/40 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 overflow-y-auto">
                        <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
                            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <h3 className="font-bold text-slate-800">{editingId ? 'Edit Pengguna' : 'Tambah Pengguna'}</h3>
                                <button onClick={() => setIsModalOpen(false)}><X size={20} className="text-slate-400" /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="flex justify-center mb-4 relative">
                                    <label htmlFor="userImage" className="relative w-24 h-24 rounded-full bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-blue-500 overflow-hidden group">
                                        {userForm.image ? (
                                            <img src={userForm.image} className="w-full h-full object-cover" alt="Preview" />
                                        ) : (
                                            <Upload className="text-slate-400 group-hover:text-blue-500" />
                                        )}
                                        <input id="userImage" name="userImage" type="file" className="hidden" accept="image/*" onChange={handleImageUpload} aria-label="Upload Foto Pengguna" />
                                        <div className={`absolute inset-0 bg-black/30 flex items-center justify-center transition-opacity text-white text-xs ${userForm.image ? 'opacity-0 group-hover:opacity-100' : 'opacity-0'}`}>
                                            Ubah Foto
                                        </div>
                                    </label>
                                    {userForm.image && (
                                        <button
                                            onClick={handleRemoveUserImage}
                                            className="absolute -top-1 -right-1 md:right-auto md:left-2/3 bg-white text-red-600 p-1.5 rounded-full shadow-md border border-slate-200 hover:bg-red-50 z-10"
                                            title="Hapus Foto"
                                            type="button"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                                <div>
                                    <label htmlFor="userName" className="block text-sm font-medium text-slate-700 mb-1">Nama Lengkap</label>
                                    <input id="userName" name="userName" type="text" autoComplete="name" className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-primary outline-none" value={userForm.name} onChange={e => setUserForm({ ...userForm, name: e.target.value })} />
                                </div>
                                <div>
                                    <label htmlFor="userEmail" className="block text-sm font-medium text-slate-700 mb-1">Email (Untuk Login)</label>
                                    <input id="userEmail" name="userEmail" type="email" autoComplete="email" className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-primary outline-none" value={userForm.email} onChange={e => setUserForm({ ...userForm, email: e.target.value })} disabled={!!editingId} title={editingId ? "Email tidak dapat diubah setelah dibuat" : ""} />
                                </div>
                                <div>
                                    <label htmlFor="userUsername" className="block text-sm font-medium text-slate-700 mb-1">Username (Opsional/Internal)</label>
                                    <input id="userUsername" name="userUsername" type="text" autoComplete="username" className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-primary outline-none" value={userForm.username} onChange={e => setUserForm({ ...userForm, username: e.target.value })} />
                                </div>
                                <div>
                                    <label htmlFor="userPassword" className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                                    <input id="userPassword" name="userPassword" type="password" autoComplete="new-password" className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-primary outline-none" value={userForm.password} onChange={e => setUserForm({ ...userForm, password: e.target.value })} placeholder={editingId ? "Kosongkan jika tidak ingin mengubah password" : ""} />
                                </div>
                                <div>
                                    <label htmlFor="userRole" className="block text-sm font-medium text-slate-700 mb-1">Level Akses</label>
                                    <select id="userRole" name="userRole" className="w-full border border-slate-300 p-2 rounded-lg bg-white outline-none" value={userForm.role} onChange={e => setUserForm({ ...userForm, role: e.target.value as UserRole })}>
                                        <option value={UserRole.CASHIER}>Kasir (POS Only)</option>
                                        <option value={UserRole.WAREHOUSE}>Gudang (Stok Only)</option>
                                        <option value={UserRole.ADMIN}>Admin (Admin + POS)</option>
                                        <option value={UserRole.OWNER}>Owner (Full Access)</option>
                                        <option value={UserRole.SUPERADMIN}>Superadmin (Unlimited)</option>
                                    </select>
                                </div>
                                <div className="pt-4 flex gap-3">
                                    <button onClick={() => setIsModalOpen(false)} className="flex-1 text-slate-500 py-2 text-sm hover:bg-slate-50 rounded-lg">Batal</button>
                                    <button onClick={handleSaveUser} className="flex-1 bg-primary text-white py-2 rounded-lg font-bold hover:bg-primary/90 flex items-center justify-center gap-2">
                                        <Save size={16} /> Simpan
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>,
                    document.body
                )
            }

            <DeleteConfirmationModal 
                {...deleteModalConfig} 
                onClose={() => setDeleteModalConfig(prev => ({ ...prev, isOpen: false }))} 
            />
        </div >
    );
};
