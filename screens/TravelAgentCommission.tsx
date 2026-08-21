import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useData } from '../hooks/useData';
import { StorageService } from '../services/storage';
import { TravelAgent, TravelBookingCommission, CommissionMethod, CommissionStatus, PaymentMethod, User, StoreSettings, BankAccount } from '../types';
import { formatIDR, formatDate, formatDateDateOnly, formatTimeOnly, exportToCSV, exportToExcel, generateId } from '../utils';
import { ConfirmationModal } from '../components/ui/ConfirmationModal';
import { 
  BadgePercent, Users, Plus, Search, Filter, RotateCcw, X, Eye, Printer, 
  FileSpreadsheet, Download, Calendar, DollarSign, CheckCircle2, Clock, 
  XCircle, Phone, Mail, Building2, CreditCard, Edit3, Trash2, ChevronRight, 
  Briefcase, AlertCircle, ExternalLink, Sparkles
} from 'lucide-react';

interface TravelAgentCommissionProps {
  currentUser: User | null;
}

export const TravelAgentCommission: React.FC<TravelAgentCommissionProps> = ({ currentUser }) => {
  // Data subscriptions
  const agents = useData(() => StorageService.getTravelAgents(), [], 'travel_agents') || [];
  const commissions = useData(() => StorageService.getTravelCommissions(), [], 'travel_commissions') || [];
  const customers = useData(() => StorageService.getCustomers(), [], 'customers') || [];
  const banks = useData(() => StorageService.getBanks(), [], 'banks') || [];

  // State Tabs: 'commissions' | 'agents'
  const [activeTab, setActiveTab] = useState<'commissions' | 'agents'>('commissions');

  // Filter States - Commissions
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [agentFilter, setAgentFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter States - Agents
  const [agentCategoryFilter, setAgentCategoryFilter] = useState('');
  const [agentSearchQuery, setAgentSearchQuery] = useState('');

  // Modals & Drawers State
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<TravelAgent | null>(null);

  const [isCommissionModalOpen, setIsCommissionModalOpen] = useState(false);
  const [editingCommission, setEditingCommission] = useState<TravelBookingCommission | null>(null);

  const [disbursingCommission, setDisbursingCommission] = useState<TravelBookingCommission | null>(null);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);

  // Pagination & Confirmation
  const [visibleCount, setVisibleCount] = useState(20);
  const [confirmation, setConfirmation] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    type?: 'danger' | 'warning' | 'default';
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Ya',
    cancelLabel: 'Batal',
    onConfirm: () => {},
  });

  // Agent Form State
  const [agentForm, setAgentForm] = useState<Partial<TravelAgent>>({
    name: '',
    phone: '',
    email: '',
    category: 'Driver / Guide',
    bankName: '',
    accountNumber: '',
    holderName: '',
    notes: ''
  });

  // Commission Form State
  const [commissionForm, setCommissionForm] = useState<Partial<TravelBookingCommission>>({
    bookingCode: '',
    agentId: '',
    touristName: '',
    paxCount: 1,
    tourPackage: '',
    departureDate: new Date().toISOString().split('T')[0],
    totalSales: 0,
    commissionMethod: CommissionMethod.PERCENTAGE,
    commissionRate: 10,
    status: CommissionStatus.PENDING,
    notes: ''
  });

  // Disbursement Form State
  const [disbursementForm, setDisbursementForm] = useState({
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: PaymentMethod.CASH,
    bankId: '',
    notes: ''
  });

  useEffect(() => {
    StorageService.getStoreSettings().then(setStoreSettings);
  }, []);

  // Helper WIT Date string
  const getWITDateStr = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T'));
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Jayapura' });
  };

  // Automated Commission Calculator
  const calculatedCommissionValue = useMemo(() => {
    const sales = Number(commissionForm.totalSales) || 0;
    const rate = Number(commissionForm.commissionRate) || 0;
    const pax = Number(commissionForm.paxCount) || 1;

    if (commissionForm.commissionMethod === CommissionMethod.PERCENTAGE) {
      return Math.round((sales * rate) / 100);
    } else if (commissionForm.commissionMethod === CommissionMethod.FLAT_PER_PAX) {
      return Math.round(rate * pax);
    } else if (commissionForm.commissionMethod === CommissionMethod.FLAT_PER_GROUP) {
      return Math.round(rate);
    }
    return 0;
  }, [commissionForm.totalSales, commissionForm.commissionRate, commissionForm.paxCount, commissionForm.commissionMethod]);

  // Filtered Commissions List
  const filteredCommissions = useMemo(() => {
    let items = [...commissions];

    // Date Filter (by Departure Date)
    if (startDate || endDate) {
      items = items.filter(c => {
        const itemDateStr = getWITDateStr(c.departureDate);
        if (startDate && itemDateStr < startDate) return false;
        if (endDate && itemDateStr > endDate) return false;
        return true;
      });
    }

    // Status Filter
    if (statusFilter) {
      items = items.filter(c => c.status === statusFilter);
    }

    // Agent Filter
    if (agentFilter) {
      items = items.filter(c => c.agentId === agentFilter);
    }

    // Search Query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(c =>
        c.bookingCode.toLowerCase().includes(q) ||
        c.touristName.toLowerCase().includes(q) ||
        c.tourPackage.toLowerCase().includes(q) ||
        c.agentName.toLowerCase().includes(q)
      );
    }

    // Sort by Departure Date descending
    return items.sort((a, b) => new Date(b.departureDate).getTime() - new Date(a.departureDate).getTime());
  }, [commissions, startDate, endDate, statusFilter, agentFilter, searchQuery]);

  // Filtered Agents List
  const filteredAgents = useMemo(() => {
    let items = [...agents];

    if (agentCategoryFilter) {
      items = items.filter(a => a.category === agentCategoryFilter);
    }

    if (agentSearchQuery) {
      const q = agentSearchQuery.toLowerCase();
      items = items.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.phone.toLowerCase().includes(q) ||
        (a.email && a.email.toLowerCase().includes(q)) ||
        a.bankName.toLowerCase().includes(q) ||
        a.accountNumber.toLowerCase().includes(q)
      );
    }

    return items.sort((a, b) => a.name.localeCompare(b.name));
  }, [agents, agentCategoryFilter, agentSearchQuery]);

  // Metric Summaries
  const metrics = useMemo(() => {
    const totalPaid = commissions
      .filter(c => c.status === CommissionStatus.PAID)
      .reduce((sum, c) => sum + c.totalCommission, 0);

    const totalPending = commissions
      .filter(c => c.status === CommissionStatus.PENDING)
      .reduce((sum, c) => sum + c.totalCommission, 0);

    const totalSalesAmount = commissions.reduce((sum, c) => sum + c.totalSales, 0);
    const totalPax = commissions.reduce((sum, c) => sum + c.paxCount, 0);

    return {
      totalPaid,
      totalPending,
      totalSalesAmount,
      totalPax,
      activeAgentsCount: agents.length,
      totalBookingsCount: commissions.length
    };
  }, [commissions, agents]);

  // Handlers Agent Modal
  const handleOpenAgentModal = (agent?: TravelAgent) => {
    if (agent) {
      setEditingAgent(agent);
      setAgentForm(agent);
    } else {
      setEditingAgent(null);
      setAgentForm({
        name: '',
        phone: '',
        email: '',
        category: 'Driver / Guide',
        bankName: '',
        accountNumber: '',
        holderName: '',
        notes: ''
      });
    }
    setIsAgentModalOpen(true);
  };

  const handleSaveAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentForm.name || !agentForm.phone || !agentForm.bankName || !agentForm.accountNumber) {
      alert("Mohon lengkapi Nama Agen, Kontak WhatsApp, Nama Bank, dan Nomor Rekening.");
      return;
    }

    const payload: TravelAgent = {
      id: editingAgent?.id || generateId(),
      name: agentForm.name.trim(),
      phone: agentForm.phone.trim(),
      email: agentForm.email?.trim() || '',
      category: agentForm.category || 'Lainnya',
      bankName: agentForm.bankName.trim(),
      accountNumber: agentForm.accountNumber.trim(),
      holderName: agentForm.holderName?.trim() || agentForm.name.trim(),
      notes: agentForm.notes || '',
      createdAt: editingAgent?.createdAt || new Date().toISOString()
    };

    await StorageService.saveTravelAgent(payload);
    setIsAgentModalOpen(false);
  };

  const handleDeleteAgent = (id: string, name: string) => {
    setConfirmation({
      isOpen: true,
      title: 'Hapus Data Agen',
      message: `Apakah Anda yakin ingin menghapus agen mitra "${name}"? Data pemesanan terkait agen ini akan tetap tersimpan.`,
      confirmLabel: 'Hapus',
      cancelLabel: 'Batal',
      type: 'danger',
      onConfirm: async () => {
        await StorageService.deleteTravelAgent(id);
        setConfirmation(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // Handlers Commission Modal
  const handleOpenCommissionModal = (commission?: TravelBookingCommission) => {
    if (commission) {
      setEditingCommission(commission);
      setCommissionForm(commission);
    } else {
      setEditingCommission(null);
      const generatedCode = `TRV-${Math.floor(100000 + Math.random() * 900000)}`;
      setCommissionForm({
        bookingCode: generatedCode,
        agentId: agents.length > 0 ? agents[0].id : '',
        touristName: '',
        paxCount: 1,
        tourPackage: '',
        departureDate: new Date().toISOString().split('T')[0],
        totalSales: 0,
        commissionMethod: CommissionMethod.PERCENTAGE,
        commissionRate: 10,
        status: CommissionStatus.PENDING,
        notes: ''
      });
    }
    setIsCommissionModalOpen(true);
  };

  const handleSaveCommission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commissionForm.bookingCode || !commissionForm.agentId || !commissionForm.touristName || !commissionForm.tourPackage) {
      alert("Mohon lengkapi Kode Pemesanan, Pilih Agen, Nama Turis/Grup, dan Jenis Paket Wisata.");
      return;
    }

    const selectedAgent = agents.find(a => a.id === commissionForm.agentId);

    const payload: TravelBookingCommission = {
      id: editingCommission?.id || generateId(),
      bookingCode: commissionForm.bookingCode.trim(),
      agentId: commissionForm.agentId,
      agentName: selectedAgent?.name || commissionForm.agentName || 'Agen Unregistered',
      agentCategory: selectedAgent?.category || '',
      customerId: commissionForm.customerId || '',
      touristName: commissionForm.touristName.trim(),
      paxCount: Number(commissionForm.paxCount) || 1,
      tourPackage: commissionForm.tourPackage.trim(),
      departureDate: commissionForm.departureDate || new Date().toISOString().split('T')[0],
      totalSales: Number(commissionForm.totalSales) || 0,
      commissionMethod: commissionForm.commissionMethod || CommissionMethod.PERCENTAGE,
      commissionRate: Number(commissionForm.commissionRate) || 0,
      totalCommission: calculatedCommissionValue,
      status: commissionForm.status || CommissionStatus.PENDING,
      paymentDate: commissionForm.paymentDate || '',
      paymentMethod: commissionForm.paymentMethod,
      bankId: commissionForm.bankId || '',
      notes: commissionForm.notes || '',
      createdAt: editingCommission?.createdAt || new Date().toISOString()
    };

    await StorageService.saveTravelCommission(payload);
    setIsCommissionModalOpen(false);
  };

  const handleDeleteCommission = (id: string, code: string) => {
    setConfirmation({
      isOpen: true,
      title: 'Hapus Pemesanan Komisi',
      message: `Hapus catatan pemesanan "${code}"? Tindakan ini tidak dapat dibatalkan.`,
      confirmLabel: 'Hapus',
      cancelLabel: 'Batal',
      type: 'danger',
      onConfirm: async () => {
        await StorageService.deleteTravelCommission(id);
        setConfirmation(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // Handler Disbursement / Process Payment
  const handleProcessDisbursement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disbursingCommission) return;

    const selectedBank = banks.find(b => b.id === disbursementForm.bankId);

    const updated: TravelBookingCommission = {
      ...disbursingCommission,
      status: CommissionStatus.PAID,
      paymentDate: disbursementForm.paymentDate,
      paymentMethod: disbursementForm.paymentMethod,
      bankId: disbursementForm.bankId,
      bankName: selectedBank ? `${selectedBank.bankName} - ${selectedBank.accountNumber}` : '',
      notes: disbursementForm.notes ? `${disbursingCommission.notes ? disbursingCommission.notes + ' | ' : ''}Pencairan: ${disbursementForm.notes}` : disbursingCommission.notes
    };

    await StorageService.saveTravelCommission(updated);
    setDisbursingCommission(null);
  };

  // Export Excel & CSV
  const handleExportCommissionsCSV = () => {
    const headers = [
      'Kode Booking',
      'Tanggal Keberangkatan',
      'Nama Turis / Grup',
      'Jumlah Pax',
      'Paket Wisata',
      'Nama Agen',
      'Kategori Agen',
      'Total Penjualan (Rp)',
      'Skema Komisi',
      'Total Komisi (Rp)',
      'Status',
      'Tanggal Pencairan'
    ];

    const rows = filteredCommissions.map(c => [
      c.bookingCode,
      c.departureDate,
      c.touristName,
      c.paxCount,
      c.tourPackage,
      c.agentName,
      c.agentCategory || '-',
      c.totalSales,
      c.commissionMethod === CommissionMethod.PERCENTAGE ? `${c.commissionRate}%` : c.commissionMethod === CommissionMethod.FLAT_PER_PAX ? `Rp ${c.commissionRate}/pax` : `Rp ${c.commissionRate}/grup`,
      c.totalCommission,
      c.status,
      c.paymentDate || '-'
    ]);

    exportToCSV(`Laporan_Komisi_Agen_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
  };

  const handleExportCommissionsExcel = () => {
    const data = filteredCommissions.map(c => ({
      'Kode Booking': c.bookingCode,
      'Tanggal Keberangkatan': c.departureDate,
      'Nama Turis / Grup': c.touristName,
      'Jumlah Pax': c.paxCount,
      'Paket Wisata': c.tourPackage,
      'Nama Agen': c.agentName,
      'Kategori Agen': c.agentCategory || '-',
      'Total Penjualan (Rp)': c.totalSales,
      'Skema Komisi': c.commissionMethod === CommissionMethod.PERCENTAGE ? `${c.commissionRate}%` : c.commissionMethod === CommissionMethod.FLAT_PER_PAX ? `Rp ${c.commissionRate}/pax` : `Rp ${c.commissionRate}/grup`,
      'Total Komisi (Rp)': c.totalCommission,
      'Status': c.status,
      'Tanggal Pencairan': c.paymentDate || '-'
    }));

    exportToExcel(data, `Laporan_Komisi_Agen_${new Date().toISOString().split('T')[0]}`, 'Komisi Agen');
  };

  // Print Receipt Voucher Komisi
  const handlePrintVoucher = (c: TravelBookingCommission) => {
    const settings = storeSettings || ({ name: 'Kasir REP' } as StoreSettings);
    const agent = agents.find(a => a.id === c.agentId);

    const w = window.open('', '', 'width=800,height=600');
    if (!w) return;

    const html = `
      <html>
        <head>
          <title>Voucher Komisi ${c.bookingCode}</title>
          <style>
            body { font-family: 'Inter', sans-serif; padding: 20px; color: #1e293b; max-width: 190mm; margin: 0 auto; }
            .header { text-align: center; border-b: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px; }
            .title { font-size: 16pt; font-weight: bold; color: #d97706; text-transform: uppercase; margin: 0; }
            .subtitle { font-size: 10pt; color: #64748b; margin-top: 4px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; font-size: 10pt; }
            .box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; rounded: 8px; }
            .box-title { font-weight: bold; color: #475569; border-b: 1px solid #cbd5e1; padding-bottom: 4px; margin-bottom: 8px; font-size: 9pt; uppercase; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 10pt; }
            th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
            th { background-color: #f1f5f9; font-weight: bold; }
            .text-right { text-align: right; }
            .total-row { background-color: #fef3c7; font-weight: bold; font-size: 11pt; }
            .sig-section { display: flex; justify-content: space-between; margin-top: 40px; text-align: center; font-size: 9pt; }
            .sig-box { width: 150px; }
            .sig-space { height: 50px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="title">BUKTI PENCAIRAN KOMISI AGEN</h1>
            <div class="subtitle">${settings.name} ${settings.phone ? '• ' + settings.phone : ''}</div>
          </div>

          <div class="grid">
            <div class="box">
              <div class="box-title">INFORMASI AGEN MITRA</div>
              <div><strong>Nama Agen:</strong> ${c.agentName}</div>
              <div><strong>Kategori:</strong> ${c.agentCategory || '-'}</div>
              <div><strong>No. WA:</strong> ${agent?.phone || '-'}</div>
              <div><strong>Rekening:</strong> ${agent?.bankName || '-'} ${agent?.accountNumber || ''} (a.n ${agent?.holderName || '-'})</div>
            </div>
            <div class="box">
              <div class="box-title">Rincian PEMESANAN</div>
              <div><strong>Kode Booking:</strong> ${c.bookingCode}</div>
              <div><strong>Nama Turis/Grup:</strong> ${c.touristName} (${c.paxCount} Pax)</div>
              <div><strong>Paket Wisata:</strong> ${c.tourPackage}</div>
              <div><strong>Tgl Keberangkatan:</strong> ${formatDate(c.departureDate)}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Deskripsi Skema Komisi</th>
                <th class="text-right">Total Nilai Penjualan</th>
                <th class="text-right">Komisi Terhitung</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  ${c.tourPackage} (${c.paxCount} Pax)<br/>
                  <small style="color: #64748b;">Skema: ${c.commissionMethod === CommissionMethod.PERCENTAGE ? `${c.commissionRate}% dari Nilai Penjualan` : c.commissionMethod === CommissionMethod.FLAT_PER_PAX ? `Rp ${c.commissionRate.toLocaleString('id-ID')}/pax` : `Rp ${c.commissionRate.toLocaleString('id-ID')}/grup`}</small>
                </td>
                <td class="text-right">${formatIDR(c.totalSales)}</td>
                <td class="text-right" style="font-weight: bold; color: #d97706;">${formatIDR(c.totalCommission)}</td>
              </tr>
              <tr class="total-row">
                <td colspan="2">TOTAL KOMISI DICAIRKAN</td>
                <td class="text-right" style="color: #b45309;">${formatIDR(c.totalCommission)}</td>
              </tr>
            </tbody>
          </table>

          <div style="margin-top: 16px; font-size: 9pt; color: #475569;">
            <strong>Status Pembayaran:</strong> ${c.status === 'PAID' ? 'LUNAS (SUDAH DICAIRKAN)' : 'PENDING'}<br/>
            ${c.paymentDate ? `<strong>Tanggal Pencairan:</strong> ${formatDate(c.paymentDate)}<br/>` : ''}
            ${c.bankName ? `<strong>Sumber Pembayaran:</strong> ${c.bankName}<br/>` : ''}
          </div>

          <div class="sig-section">
            <div class="sig-box">
              <div>Penerima (Agen)</div>
              <div class="sig-space"></div>
              <div>( ${c.agentName} )</div>
            </div>
            <div class="sig-box">
              <div>Kasir / Admin</div>
              <div class="sig-space"></div>
              <div>( ${currentUser?.name || settings.name} )</div>
            </div>
          </div>

          <script>window.addEventListener('afterprint', function() { window.close(); }); window.print();</script>
        </body>
      </html>
    `;

    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="space-y-6 animate-fade-in min-h-[101vh]">
      {/* Header & Controls Bar */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap justify-between items-center gap-4 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
          {/* Navigation Tabs */}
          <div className="flex gap-2 p-1 bg-slate-100/80 rounded-xl">
            <button
              onClick={() => setActiveTab('commissions')}
              className={`flex items-center gap-2 px-4 py-2 font-semibold text-xs rounded-lg transition-all ${
                activeTab === 'commissions'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <BadgePercent size={16} />
              <span>Transaksi & Komisi</span>
              {commissions.length > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${activeTab === 'commissions' ? 'bg-amber-700 text-amber-100' : 'bg-slate-200 text-slate-700'}`}>
                  {commissions.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('agents')}
              className={`flex items-center gap-2 px-4 py-2 font-semibold text-xs rounded-lg transition-all ${
                activeTab === 'agents'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Users size={16} />
              <span>Profil Agen Mitra</span>
              {agents.length > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${activeTab === 'agents' ? 'bg-amber-700 text-amber-100' : 'bg-slate-200 text-slate-700'}`}>
                  {agents.length}
                </span>
              )}
            </button>
          </div>

          {/* Top Right Actions */}
          <div className="flex items-center gap-2">
            {activeTab === 'commissions' ? (
              <>
                <button
                  onClick={handleExportCommissionsExcel}
                  className="text-xs flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl text-emerald-700 hover:bg-emerald-100 font-medium transition-colors shadow-sm"
                >
                  <FileSpreadsheet size={15} /> Excel
                </button>
                <button
                  onClick={handleExportCommissionsCSV}
                  className="text-xs flex items-center gap-1.5 bg-white border border-slate-300 px-3 py-2 rounded-xl text-slate-700 hover:bg-slate-50 font-medium transition-colors shadow-sm"
                >
                  <Download size={15} /> CSV
                </button>
                <button
                  onClick={() => handleOpenCommissionModal()}
                  className="text-xs flex items-center gap-1.5 bg-amber-600 text-white px-4 py-2 rounded-xl shadow-md hover:bg-amber-700 font-bold transition-colors"
                >
                  <Plus size={16} /> Catat Booking & Komisi
                </button>
              </>
            ) : (
              <button
                onClick={() => handleOpenAgentModal()}
                className="text-xs flex items-center gap-1.5 bg-amber-600 text-white px-4 py-2 rounded-xl shadow-md hover:bg-amber-700 font-bold transition-colors"
              >
                <Plus size={16} /> Tambah Agen Baru
              </button>
            )}
          </div>
        </div>

        {/* Dashboard Metric Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Komisi Terbayar</p>
              <h3 className="text-lg font-extrabold text-emerald-600 mt-1">{formatIDR(metrics.totalPaid)}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Sudah Dicairkan</p>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 size={24} />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Komisi Pending</p>
              <h3 className="text-lg font-extrabold text-amber-600 mt-1">{formatIDR(metrics.totalPending)}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Belum Dicairkan</p>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <Clock size={24} />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Penjualan Tur</p>
              <h3 className="text-lg font-extrabold text-blue-600 mt-1">{formatIDR(metrics.totalSalesAmount)}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">{metrics.totalBookingsCount} Booking ({metrics.totalPax} Pax)</p>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <Briefcase size={24} />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Agen Mitra Aktif</p>
              <h3 className="text-lg font-extrabold text-indigo-600 mt-1">{metrics.activeAgentsCount} Agen</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Driver, Guide & Biro Travel</p>
            </div>
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <Users size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* --- TAB 1: TRANSAKSI & KOMISI PEMESANAN --- */}
      {activeTab === 'commissions' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              {/* Departure Date Filter */}
              <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200 text-xs">
                <Calendar size={14} className="text-slate-400 ml-1" />
                <input
                  type="date"
                  className="bg-transparent border-0 outline-none text-slate-700 text-xs"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  placeholder="Awal"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="date"
                  className="bg-transparent border-0 outline-none text-slate-700 text-xs"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  placeholder="Akhir"
                />
              </div>

              {/* Status Filter Dropdown */}
              <select
                className="px-3.5 py-2 bg-white border border-slate-300 rounded-xl outline-none text-xs text-slate-700 font-medium"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="">Semua Status</option>
                <option value={CommissionStatus.PENDING}>Pending (Belum Cair)</option>
                <option value={CommissionStatus.PAID}>Lunas (Sudah Cair)</option>
                <option value={CommissionStatus.CANCELLED}>Dibatalkan</option>
              </select>

              {/* Agent Filter Dropdown */}
              <select
                className="px-3.5 py-2 bg-white border border-slate-300 rounded-xl outline-none text-xs text-slate-700 font-medium max-w-[200px]"
                value={agentFilter}
                onChange={e => setAgentFilter(e.target.value)}
              >
                <option value="">Semua Agen</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.category})</option>
                ))}
              </select>

              {/* Search Box */}
              <div className="relative flex-1 min-w-[200px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari Kode Booking, Turis, Paket, Agen..."
                  className="w-full pl-9 pr-8 py-2 bg-white border border-slate-300 rounded-xl outline-none text-xs text-slate-700"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {(startDate || endDate || statusFilter || agentFilter || searchQuery) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setStatusFilter('');
                  setAgentFilter('');
                  setSearchQuery('');
                }}
                className="text-xs text-amber-700 hover:text-amber-900 flex items-center gap-1 font-semibold"
              >
                <RotateCcw size={13} /> Reset Filter
              </button>
            )}
          </div>

          {/* Commissions Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-100 font-semibold text-slate-700 text-xs flex justify-between items-center">
              <span className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <BadgePercent className="text-amber-600" size={18} />
                Daftar Transaksi & Komisi Agen ({filteredCommissions.length})
              </span>
              <span className="text-amber-700 font-extrabold text-sm">
                Total Komisi: {formatIDR(filteredCommissions.reduce((s, c) => s + c.totalCommission, 0))}
              </span>
            </div>

            <div className="overflow-x-auto touch-scroll">
              <table className="w-full text-left text-xs min-w-[640px]">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="p-3.5 whitespace-nowrap">Kode & Keberangkatan</th>
                    <th className="p-3.5 whitespace-nowrap">Wisatawan / Grup</th>
                    <th className="p-3.5 whitespace-nowrap">Paket Wisata</th>
                    <th className="p-3.5 whitespace-nowrap">Agen Referensi</th>
                    <th className="p-3.5 whitespace-nowrap">Total Penjualan</th>
                    <th className="p-3.5 whitespace-nowrap">Skema Komisi</th>
                    <th className="p-3.5 bg-amber-50/50 text-amber-900 whitespace-nowrap">Total Komisi</th>
                    <th className="p-3.5 whitespace-nowrap">Status</th>
                    <th className="p-3.5 text-center whitespace-nowrap">Aksi & Pencairan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCommissions.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400">Tidak ada data pemesanan atau komisi agen ditemukan.</td>
                    </tr>
                  )}
                  {filteredCommissions.slice(0, visibleCount).map(c => {
                    const agent = agents.find(a => a.id === c.agentId);
                    return (
                      <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3.5 whitespace-nowrap">
                          <div className="font-mono font-bold text-slate-900">{c.bookingCode}</div>
                          <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                            <Calendar size={11} /> {formatDateDateOnly(c.departureDate)}
                          </div>
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          <div className="font-bold text-slate-800">{c.touristName}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{c.paxCount} Pax / Peserta</div>
                        </td>
                        <td className="p-3.5 whitespace-nowrap max-w-[180px] truncate">
                          <div className="font-semibold text-slate-700">{c.tourPackage}</div>
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          <div className="font-semibold text-amber-900">{c.agentName}</div>
                          <div className="text-[10px] text-slate-400 font-medium">{c.agentCategory || agent?.category || 'Agen'}</div>
                        </td>
                        <td className="p-3.5 font-bold text-slate-800 whitespace-nowrap">
                          {formatIDR(c.totalSales)}
                        </td>
                        <td className="p-3.5 text-slate-600 whitespace-nowrap">
                          <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-[10px] font-bold">
                            {c.commissionMethod === CommissionMethod.PERCENTAGE ? `${c.commissionRate}%` : c.commissionMethod === CommissionMethod.FLAT_PER_PAX ? `Rp ${c.commissionRate.toLocaleString('id-ID')}/pax` : `Rp ${c.commissionRate.toLocaleString('id-ID')}/grup`}
                          </span>
                        </td>
                        <td className="p-3.5 bg-amber-50/20 whitespace-nowrap">
                          <span className="font-extrabold text-amber-700 text-xs">
                            {formatIDR(c.totalCommission)}
                          </span>
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          <span className={`px-2.5 py-0.5 rounded text-[10px] font-extrabold border ${
                            c.status === CommissionStatus.PAID
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : c.status === CommissionStatus.PENDING
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            {c.status === CommissionStatus.PAID ? 'LUNAS' : c.status === CommissionStatus.PENDING ? 'PENDING' : 'BATAL'}
                          </span>
                        </td>
                        <td className="p-3.5 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {c.status === CommissionStatus.PENDING && (
                              <button
                                onClick={() => {
                                  setDisbursingCommission(c);
                                  setDisbursementForm({
                                    paymentDate: new Date().toISOString().split('T')[0],
                                    paymentMethod: PaymentMethod.CASH,
                                    bankId: '',
                                    notes: ''
                                  });
                                }}
                                className="px-2 py-1 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg text-[11px] font-bold shadow-xs transition-colors flex items-center gap-1"
                              >
                                <DollarSign size={12} /> Cairkan
                              </button>
                            )}
                            <button
                              onClick={() => handlePrintVoucher(c)}
                              className="px-2 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg text-[11px] font-semibold border border-amber-200 transition-colors flex items-center gap-1"
                              title="Cetak Bukti Voucher"
                            >
                              <Printer size={12} /> Bukti
                            </button>
                            <button
                              onClick={() => handleOpenCommissionModal(c)}
                              className="p-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
                              title="Edit Transaksi"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteCommission(c.id, c.bookingCode)}
                              className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors"
                              title="Hapus Transaksi"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 2: PROFIL & MASTER AGEN MITRA --- */}
      {activeTab === 'agents' && (
        <div className="space-y-4">
          {/* Agent Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <select
                className="px-3.5 py-2 bg-white border border-slate-300 rounded-xl outline-none text-xs text-slate-700 font-medium"
                value={agentCategoryFilter}
                onChange={e => setAgentCategoryFilter(e.target.value)}
              >
                <option value="">Semua Kategori Agen</option>
                <option value="Driver / Guide">Driver / Guide</option>
                <option value="Biro Travel">Biro Travel / Agency</option>
                <option value="Freelancer">Freelancer / Sales</option>
                <option value="Hotel Mitra">Hotel / Homestay Mitra</option>
                <option value="Lainnya">Lainnya</option>
              </select>

              <div className="relative flex-1 min-w-[200px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari nama agen, WhatsApp, bank, no rekening..."
                  className="w-full pl-9 pr-8 py-2 bg-white border border-slate-300 rounded-xl outline-none text-xs text-slate-700"
                  value={agentSearchQuery}
                  onChange={e => setAgentSearchQuery(e.target.value)}
                />
                {agentSearchQuery && (
                  <button onClick={() => setAgentSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Agents Grid Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAgents.length === 0 && (
              <div className="col-span-full bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-400">
                Belum ada data profil agen mitra ditemukan. Klik "Tambah Agen Baru" untuk mendaftarkan mitra.
              </div>
            )}
            {filteredAgents.map(a => {
              const agentCommissions = commissions.filter(c => c.agentId === a.id);
              const totalEarned = agentCommissions
                .filter(c => c.status === CommissionStatus.PAID)
                .reduce((s, c) => s + c.totalCommission, 0);

              const waPhone = a.phone.replace(/[^0-9]/g, '');
              const waLink = waPhone ? `https://wa.me/${waPhone.startsWith('0') ? '62' + waPhone.substring(1) : waPhone}` : '#';

              return (
                <div key={a.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold uppercase tracking-wider">
                          {a.category}
                        </span>
                        <h3 className="font-extrabold text-base text-slate-900 mt-1.5">{a.name}</h3>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenAgentModal(a)}
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => handleDeleteAgent(a.id, a.name)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 mt-3 text-xs text-slate-600">
                      <div className="flex items-center gap-2">
                        <Phone size={14} className="text-slate-400 flex-shrink-0" />
                        <span className="font-mono">{a.phone}</span>
                        {waLink !== '#' && (
                          <a href={waLink} target="_blank" rel="noreferrer" className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded font-bold hover:bg-emerald-100">
                            WA
                          </a>
                        )}
                      </div>
                      {a.email && (
                        <div className="flex items-center gap-2">
                          <Mail size={14} className="text-slate-400 flex-shrink-0" />
                          <span className="truncate">{a.email}</span>
                        </div>
                      )}
                    </div>

                    {/* Bank Info Container */}
                    <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs">
                      <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5 mb-1">
                        <CreditCard size={12} /> Rekening Pencairan
                      </div>
                      <div className="font-bold text-slate-800">{a.bankName} - <span className="font-mono">{a.accountNumber}</span></div>
                      <div className="text-slate-500 text-[11px]">a.n. {a.holderName}</div>
                    </div>
                  </div>

                  {/* Summary Footer */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <div className="text-[10px] text-slate-400 font-medium">Total Booking</div>
                      <div className="font-bold text-slate-800">{agentCommissions.length} Transaksi</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 font-medium">Komisi Diterima</div>
                      <div className="font-extrabold text-emerald-600">{formatIDR(totalEarned)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- MODAL FORM PROFIL AGEN --- */}
      {isAgentModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-100">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                <Users size={18} className="text-amber-600" />
                {editingAgent ? 'Edit Profil Agen Mitra' : 'Tambah Profil Agen Mitra'}
              </h3>
              <button onClick={() => setIsAgentModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveAgent} className="p-5 space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Nama Agen / Instansi / Pemandu *</label>
                <input
                  type="text"
                  required
                  placeholder="Misal: Budi Driver, Pak Komang Guide"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:border-amber-500"
                  value={agentForm.name}
                  onChange={e => setAgentForm({ ...agentForm, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Kontak WhatsApp *</label>
                  <input
                    type="text"
                    required
                    placeholder="08123456789"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:border-amber-500"
                    value={agentForm.phone}
                    onChange={e => setAgentForm({ ...agentForm, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Email (Opsional)</label>
                  <input
                    type="email"
                    placeholder="agen@gmail.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:border-amber-500"
                    value={agentForm.email}
                    onChange={e => setAgentForm({ ...agentForm, email: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Kategori Agen *</label>
                <select
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:border-amber-500"
                  value={agentForm.category}
                  onChange={e => setAgentForm({ ...agentForm, category: e.target.value })}
                >
                  <option value="Driver / Guide">Driver / Pemandu Wisata</option>
                  <option value="Biro Travel">Biro Travel / Tour Agency</option>
                  <option value="Freelancer">Freelancer / Sales Freelance</option>
                  <option value="Hotel Mitra">Hotel / Homestay Mitra</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="font-bold text-slate-700 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                  <CreditCard size={14} className="text-amber-600" /> Detail Rekening Bank Pencairan
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Nama Bank / E-Wallet *</label>
                  <input
                    type="text"
                    required
                    placeholder="BCA, Mandiri, BRI, GoPay, Dana"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:border-amber-500"
                    value={agentForm.bankName}
                    onChange={e => setAgentForm({ ...agentForm, bankName: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Nomor Rekening *</label>
                    <input
                      type="text"
                      required
                      placeholder="1234567890"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:border-amber-500 font-mono"
                      value={agentForm.accountNumber}
                      onChange={e => setAgentForm({ ...agentForm, accountNumber: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Atas Nama (Pemilik)</label>
                    <input
                      type="text"
                      placeholder="Nama di buku tabungan"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:border-amber-500"
                      value={agentForm.holderName}
                      onChange={e => setAgentForm({ ...agentForm, holderName: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAgentModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-600 rounded-xl font-medium hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 shadow-md"
                >
                  Simpan Profil
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL FORM BOOKING & KOMISI --- */}
      {isCommissionModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden border border-slate-100">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                <BadgePercent size={18} className="text-amber-600" />
                {editingCommission ? 'Edit Catatan Pemesanan & Komisi' : 'Input Catatan Pemesanan & Komisi'}
              </h3>
              <button onClick={() => setIsCommissionModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCommission} className="p-5 space-y-4 text-xs max-h-[85vh] overflow-y-auto">
              {/* Agent Picker */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Pilih Agen Mitra *</label>
                {agents.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
                    Belum ada agen mitra. Silakan tambah Profil Agen lebih dulu di tab "Profil Agen Mitra".
                  </div>
                ) : (
                  <select
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:border-amber-500 font-medium"
                    value={commissionForm.agentId}
                    onChange={e => setCommissionForm({ ...commissionForm, agentId: e.target.value })}
                  >
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.category}) - Rek: {a.bankName} {a.accountNumber}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Kode / No. Pemesanan *</label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:border-amber-500 font-mono font-bold"
                    value={commissionForm.bookingCode}
                    onChange={e => setCommissionForm({ ...commissionForm, bookingCode: e.target.value })}
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Tanggal Keberangkatan *</label>
                  <input
                    type="date"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:border-amber-500"
                    value={commissionForm.departureDate}
                    onChange={e => setCommissionForm({ ...commissionForm, departureDate: e.target.value })}
                  />
                </div>
              </div>

              {/* Customer Auto-Fill Dropdown */}
              {customers.length > 0 && (
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Pilih Pelanggan Terdaftar (Auto-Fill Wisatawan/Grup)
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:border-amber-500 font-medium bg-slate-50 text-slate-700"
                    value={commissionForm.customerId || ''}
                    onChange={e => {
                      const custId = e.target.value;
                      const selectedCust = customers.find(c => c.id === custId);
                      setCommissionForm(prev => ({
                        ...prev,
                        customerId: custId,
                        touristName: selectedCust ? selectedCust.name : prev.touristName || ''
                      }));
                    }}
                  >
                    <option value="">-- Mode Manual / Pelanggan Baru --</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="font-semibold text-slate-700 block mb-1">Nama Turis / Grup Wisatawan *</label>
                  <input
                    type="text"
                    required
                    placeholder="Bpk. Made & Rombongan"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:border-amber-500"
                    value={commissionForm.touristName}
                    onChange={e => setCommissionForm({ ...commissionForm, touristName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Jumlah Pax *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:border-amber-500 font-bold"
                    value={commissionForm.paxCount}
                    onChange={e => setCommissionForm({ ...commissionForm, paxCount: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Produk / Paket Wisata *</label>
                <input
                  type="text"
                  required
                  placeholder="One Day Trip Labuan Bajo / Paket Bali 3D2N"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:border-amber-500"
                  value={commissionForm.tourPackage}
                  onChange={e => setCommissionForm({ ...commissionForm, tourPackage: e.target.value })}
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Total Nilai Penjualan (Rp) *</label>
                <input
                  type="number"
                  min="0"
                  required
                  placeholder="5000000"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:border-amber-500 font-extrabold text-sm text-slate-900"
                  value={commissionForm.totalSales || ''}
                  onChange={e => setCommissionForm({ ...commissionForm, totalSales: Number(e.target.value) })}
                />
              </div>

              {/* Formula Commission Calculation */}
              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl space-y-3">
                <div className="font-bold text-amber-900 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                  <Sparkles size={14} className="text-amber-600" /> Skema & Perhitungan Komisi
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Metode Komisi *</label>
                    <select
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:border-amber-500"
                      value={commissionForm.commissionMethod}
                      onChange={e => setCommissionForm({ ...commissionForm, commissionMethod: e.target.value as CommissionMethod })}
                    >
                      <option value={CommissionMethod.PERCENTAGE}>Persentase (%)</option>
                      <option value={CommissionMethod.FLAT_PER_PAX}>Flat Nominal (Per Pax)</option>
                      <option value={CommissionMethod.FLAT_PER_GROUP}>Flat Nominal (Per Grup)</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      {commissionForm.commissionMethod === CommissionMethod.PERCENTAGE ? 'Persentase (%) *' : 'Nominal Flat (Rp) *'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:border-amber-500 font-bold"
                      value={commissionForm.commissionRate || ''}
                      onChange={e => setCommissionForm({ ...commissionForm, commissionRate: Number(e.target.value) })}
                    />
                  </div>
                </div>

                {/* Calculation Output Preview */}
                <div className="pt-2 border-t border-amber-200/80 flex justify-between items-center">
                  <span className="text-xs text-amber-900 font-semibold">Total Komisi Terhitung:</span>
                  <span className="text-base font-extrabold text-amber-800">{formatIDR(calculatedCommissionValue)}</span>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Status Pembayaran Komisi</label>
                <select
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:border-amber-500 font-bold"
                  value={commissionForm.status}
                  onChange={e => setCommissionForm({ ...commissionForm, status: e.target.value as CommissionStatus })}
                >
                  <option value={CommissionStatus.PENDING}>PENDING (Belum Dicairkan)</option>
                  <option value={CommissionStatus.PAID}>LUNAS (Sudah Dicairkan)</option>
                  <option value={CommissionStatus.CANCELLED}>DIBATALKAN</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCommissionModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-600 rounded-xl font-medium hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 shadow-md"
                >
                  Simpan Transaksi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL PROSES PENCAIRAN KOMISI (DISBURSEMENT) --- */}
      {disbursingCommission && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-100">
            <div className="p-4 bg-emerald-700 text-white flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2 text-sm">
                <DollarSign size={18} />
                Proses Pencairan Komisi Agen
              </h3>
              <button onClick={() => setDisbursingCommission(null)} className="text-emerald-200 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleProcessDisbursement} className="p-5 space-y-4 text-xs">
              {/* Agent & Booking Info Box */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Penerima Komisi</div>
                <div className="font-extrabold text-slate-900 text-sm">{disbursingCommission.agentName}</div>
                <div className="text-slate-600">Kode Booking: <span className="font-mono font-bold">{disbursingCommission.bookingCode}</span> ({disbursingCommission.touristName})</div>
                
                {(() => {
                  const agent = agents.find(a => a.id === disbursingCommission.agentId);
                  return agent ? (
                    <div className="mt-2 pt-2 border-t border-slate-200 text-[11px] text-slate-700 font-mono">
                      Rekening: <strong>{agent.bankName} - {agent.accountNumber}</strong> (a.n {agent.holderName})
                    </div>
                  ) : null;
                })()}
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex justify-between items-center">
                <span className="font-bold text-emerald-900 text-xs">Nominal Komisi Dicairkan:</span>
                <span className="text-lg font-extrabold text-emerald-700">{formatIDR(disbursingCommission.totalCommission)}</span>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Tanggal Pencairan *</label>
                <input
                  type="date"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:border-emerald-500"
                  value={disbursementForm.paymentDate}
                  onChange={e => setDisbursementForm({ ...disbursementForm, paymentDate: e.target.value })}
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Metode Pembayaran *</label>
                <select
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:border-emerald-500 font-bold"
                  value={disbursementForm.paymentMethod}
                  onChange={e => setDisbursementForm({ ...disbursementForm, paymentMethod: e.target.value as PaymentMethod })}
                >
                  <option value={PaymentMethod.CASH}>Tunai (Kas)</option>
                  <option value={PaymentMethod.TRANSFER}>Transfer Bank</option>
                </select>
              </div>

              {disbursementForm.paymentMethod === PaymentMethod.TRANSFER && (
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Sumber Rekening Bank *</label>
                  <select
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:border-emerald-500"
                    value={disbursementForm.bankId}
                    onChange={e => setDisbursementForm({ ...disbursementForm, bankId: e.target.value })}
                  >
                    <option value="">-- Pilih Rekening Sumber --</option>
                    {banks.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.bankName} - {b.accountNumber} (a.n {b.holderName})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Catatan / No Referensi Transfer</label>
                <input
                  type="text"
                  placeholder="Misal: Ref Transfer 882103"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:border-emerald-500"
                  value={disbursementForm.notes}
                  onChange={e => setDisbursementForm({ ...disbursementForm, notes: e.target.value })}
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDisbursingCommission(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-600 rounded-xl font-medium hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow-md flex items-center gap-1.5"
                >
                  <CheckCircle2 size={16} /> Cairkan Komisi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmation.isOpen}
        title={confirmation.title}
        message={confirmation.message}
        confirmLabel={confirmation.confirmLabel}
        cancelLabel={confirmation.cancelLabel}
        onConfirm={confirmation.onConfirm}
        onClose={() => setConfirmation(prev => ({ ...prev, isOpen: false }))}
        type={confirmation.type}
      />
    </div>
  );
};
