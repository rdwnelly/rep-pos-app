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
  Briefcase, AlertCircle, ExternalLink, Sparkles, Target, Trophy, Award,
  ArrowUpRight, Calculator, Check, MessageCircle, ChevronDown, CheckCircle,
  Percent
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
  const categories = useData(() => StorageService.getCategories(), [], 'categories') || [];
  const products = useData(() => StorageService.getProducts(), [], 'products') || [];

  // Available Package & Product Categories from Master Data
  const availablePackageCategories = useMemo(() => {
    const list: string[] = [];

    // 1. Kategori dari Master Data Kategori
    categories.forEach(c => {
      if (c && c.name && !list.includes(c.name)) {
        list.push(c.name);
      }
    });

    // 2. Kategori Produk & Produk Paket Wisata
    products.forEach(p => {
      if (p.categoryName && !list.includes(p.categoryName)) {
        list.push(p.categoryName);
      }
      if (p.name && p.name.toLowerCase().includes('paket') && !list.includes(p.name)) {
        list.push(p.name);
      }
    });

    // Fallbacks
    const defaults = [
      'Paket Sopendo / Saswar / Edukasi',
      'Tiket Masuk',
      'Sewa Kostum',
      'Toko / Souvenir',
      'Kafe & Resto',
      'Kios',
      'Jasa Fotografer',
      'Sewa kostum keluar',
      'Belanja Oleh-oleh Wisatawan'
    ];
    defaults.forEach(d => {
      if (!list.includes(d)) list.push(d);
    });

    return list;
  }, [categories, products]);

  // State Tabs: 'targets' | 'commissions' | 'agents'
  const [activeTab, setActiveTab] = useState<'targets' | 'commissions' | 'agents'>('targets');

  // Month & Year Filter for Targets Tab
  const today = new Date();
  const [targetMonth, setTargetMonth] = useState(today.getMonth());
  const [targetYear, setTargetYear] = useState(today.getFullYear());

  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  // Filter States - Commissions
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [agentFilter, setAgentFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter States - Agents & Targets
  const [agentCategoryFilter, setAgentCategoryFilter] = useState('');
  const [agentSearchQuery, setAgentSearchQuery] = useState('');

  // Modals & Drawers State
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<TravelAgent | null>(null);

  const [isCommissionModalOpen, setIsCommissionModalOpen] = useState(false);
  const [editingCommission, setEditingCommission] = useState<TravelBookingCommission | null>(null);

  const [disbursingCommission, setDisbursingCommission] = useState<TravelBookingCommission | null>(null);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);

  // Live Commission Calculator Simulator State
  const [calcAgentId, setCalcAgentId] = useState<string>('');
  const [calcSalesAmount, setCalcSalesAmount] = useState<string>('1500000');
  const [calcPaxCount, setCalcPaxCount] = useState<string>('2');

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
    onConfirm: () => { },
  });

  // Agent Form State with Target & Commission settings
  const [agentForm, setAgentForm] = useState<Partial<TravelAgent>>({
    name: '',
    phone: '',
    email: '',
    category: 'Driver',
    bankName: '',
    accountNumber: '',
    holderName: '',
    notes: '',
    commissionMethod: CommissionMethod.PERCENTAGE,
    commissionRate: 10,
    monthlyTargetRevenue: 5000000,
    monthlyTargetPax: 20,
    targetBonusRate: 200000
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

  // Automated Commission Calculator for Form
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

  // ========================================================
  // 1. DRIVER & GUIDE TARGET & PERFORMANCE METRICS
  // ========================================================
  const driverTargetMetrics = useMemo(() => {
    return agents.map(agent => {
      // Filter commissions for this agent in the selected targetMonth & targetYear
      const agentCommissions = commissions.filter(c => {
        if (c.agentId !== agent.id) return false;
        if (!c.departureDate) return false;
        const d = new Date(c.departureDate);
        return d.getMonth() === targetMonth && d.getFullYear() === targetYear;
      });

      const totalSalesBrought = agentCommissions.reduce((sum, c) => sum + (c.totalSales || 0), 0);
      const totalPaxBrought = agentCommissions.reduce((sum, c) => sum + (c.paxCount || 0), 0);
      const totalCommissionEarned = agentCommissions.reduce((sum, c) => sum + (c.totalCommission || 0), 0);

      const paidCommission = agentCommissions
        .filter(c => c.status === CommissionStatus.PAID)
        .reduce((sum, c) => sum + (c.totalCommission || 0), 0);

      const pendingCommission = agentCommissions
        .filter(c => c.status === CommissionStatus.PENDING)
        .reduce((sum, c) => sum + (c.totalCommission || 0), 0);

      // Target calculations
      const targetRevenue = agent.monthlyTargetRevenue || 5000000;
      const targetPax = agent.monthlyTargetPax || 20;

      const revenueProgress = targetRevenue > 0 ? (totalSalesBrought / targetRevenue) * 100 : 0;
      const paxProgress = targetPax > 0 ? (totalPaxBrought / targetPax) * 100 : 0;

      const isTargetReached = totalSalesBrought >= targetRevenue && targetRevenue > 0;
      const targetBonus = isTargetReached ? (agent.targetBonusRate || 0) : 0;

      const totalReceivableByDriver = totalCommissionEarned + targetBonus;

      return {
        agent,
        totalSalesBrought,
        totalPaxBrought,
        totalCommissionEarned,
        paidCommission,
        pendingCommission,
        targetRevenue,
        targetPax,
        revenueProgress,
        paxProgress,
        isTargetReached,
        targetBonus,
        totalReceivableByDriver,
        bookingsCount: agentCommissions.length
      };
    }).sort((a, b) => b.totalSalesBrought - a.totalSalesBrought);
  }, [agents, commissions, targetMonth, targetYear]);

  // Overall Target Summary
  const overallTargetSummary = useMemo(() => {
    const totalEarned = driverTargetMetrics.reduce((sum, d) => sum + d.totalReceivableByDriver, 0);
    const totalPending = driverTargetMetrics.reduce((sum, d) => sum + d.pendingCommission, 0);
    const totalPaid = driverTargetMetrics.reduce((sum, d) => sum + d.paidCommission, 0);
    const totalSales = driverTargetMetrics.reduce((sum, d) => sum + d.totalSalesBrought, 0);
    const achieversCount = driverTargetMetrics.filter(d => d.isTargetReached).length;

    return {
      totalEarned,
      totalPending,
      totalPaid,
      totalSales,
      achieversCount,
      totalDrivers: agents.length
    };
  }, [driverTargetMetrics, agents.length]);

  // Live Simulator Calculation
  const simulatorResult = useMemo(() => {
    const selectedAgent = agents.find(a => a.id === calcAgentId) || agents[0];
    const sales = Number(calcSalesAmount) || 0;
    const pax = Number(calcPaxCount) || 1;

    if (!selectedAgent) {
      return {
        agentName: 'Pilih Driver / Guide',
        schemeText: '10%',
        commissionAmt: Math.round(sales * 0.1),
        currentSales: 0,
        targetSales: 5000000,
        projectedSales: sales,
        projectedProgress: (sales / 5000000) * 100,
        willHitTarget: sales >= 5000000,
        bonusAmt: 200000
      };
    }

    const method = selectedAgent.commissionMethod || CommissionMethod.PERCENTAGE;
    const rate = selectedAgent.commissionRate !== undefined && selectedAgent.commissionRate !== null ? selectedAgent.commissionRate : 10;
    const targetRev = selectedAgent.monthlyTargetRevenue || 5000000;
    const bonus = selectedAgent.targetBonusRate || 0;

    let commissionAmt = 0;
    let schemeText = `${rate}% dari Belanja`;
    if (method === CommissionMethod.PERCENTAGE) {
      commissionAmt = Math.round((sales * rate) / 100);
      schemeText = `${rate}% dari Total Belanja`;
    } else if (method === CommissionMethod.FLAT_PER_PAX) {
      commissionAmt = Math.round(rate * pax);
      schemeText = `${formatIDR(rate)} / Pax`;
    } else if (method === CommissionMethod.FLAT_PER_GROUP) {
      commissionAmt = Math.round(rate);
      schemeText = `${formatIDR(rate)} / Rombongan`;
    }

    const driverStats = driverTargetMetrics.find(d => d.agent.id === selectedAgent.id);
    const currentSales = driverStats ? driverStats.totalSalesBrought : 0;
    const projectedSales = currentSales + sales;
    const projectedProgress = targetRev > 0 ? (projectedSales / targetRev) * 100 : 0;
    const willHitTarget = projectedSales >= targetRev && targetRev > 0;

    return {
      agentName: selectedAgent.name,
      schemeText,
      commissionAmt,
      currentSales,
      targetSales: targetRev,
      projectedSales,
      projectedProgress,
      willHitTarget,
      bonusAmt: bonus
    };
  }, [agents, calcAgentId, calcSalesAmount, calcPaxCount, driverTargetMetrics]);

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
        category: 'Driver',
        bankName: 'BCA',
        accountNumber: '',
        holderName: '',
        notes: '',
        commissionMethod: CommissionMethod.PERCENTAGE,
        commissionRate: 10,
        monthlyTargetRevenue: 5000000,
        monthlyTargetPax: 20,
        targetBonusRate: 200000
      });
    }
    setIsAgentModalOpen(true);
  };

  const handleSaveAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentForm.name || !agentForm.phone || !agentForm.bankName || !agentForm.accountNumber) {
      alert("Mohon lengkapi Nama Driver/Guide, Kontak WhatsApp, Nama Bank, dan Nomor Rekening.");
      return;
    }

    const payload: TravelAgent = {
      id: editingAgent?.id || generateId(),
      name: agentForm.name.trim(),
      phone: agentForm.phone.trim(),
      email: agentForm.email?.trim() || '',
      category: agentForm.category || 'Driver',
      bankName: agentForm.bankName.trim(),
      accountNumber: agentForm.accountNumber.trim(),
      holderName: agentForm.holderName?.trim() || agentForm.name.trim(),
      notes: agentForm.notes || '',
      commissionMethod: agentForm.commissionMethod || CommissionMethod.PERCENTAGE,
      commissionRate: Number(agentForm.commissionRate) || 10,
      monthlyTargetRevenue: Number(agentForm.monthlyTargetRevenue) || 5000000,
      monthlyTargetPax: Number(agentForm.monthlyTargetPax) || 20,
      targetBonusRate: Number(agentForm.targetBonusRate) || 0,
      createdAt: editingAgent?.createdAt || new Date().toISOString()
    };

    await StorageService.saveTravelAgent(payload);
    setIsAgentModalOpen(false);
  };

  const handleDeleteAgent = (id: string, name: string) => {
    setConfirmation({
      isOpen: true,
      title: 'Hapus Data Driver / Guide',
      message: `Apakah Anda yakin ingin menghapus mitra "${name}"? Data pemesanan terkait mitra ini akan tetap tersimpan.`,
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
      const firstAgent = agents.length > 0 ? agents[0] : null;
      setCommissionForm({
        bookingCode: generatedCode,
        agentId: firstAgent ? firstAgent.id : '',
        touristName: '',
        paxCount: 1,
        tourPackage: 'Belanja Oleh-oleh Wisatawan',
        departureDate: new Date().toISOString().split('T')[0],
        totalSales: 0,
        commissionMethod: firstAgent?.commissionMethod || CommissionMethod.PERCENTAGE,
        commissionRate: firstAgent?.commissionRate || 10,
        status: CommissionStatus.PENDING,
        notes: ''
      });
    }
    setIsCommissionModalOpen(true);
  };

  const handleSaveCommission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commissionForm.bookingCode || !commissionForm.agentId || !commissionForm.touristName || !commissionForm.tourPackage) {
      alert("Mohon lengkapi Kode Pemesanan, Pilih Driver/Guide, Nama Tamu/Rombongan, dan Jenis Paket Belanja.");
      return;
    }

    const selectedAgent = agents.find(a => a.id === commissionForm.agentId);

    const payload: TravelBookingCommission = {
      id: editingCommission?.id || generateId(),
      bookingCode: commissionForm.bookingCode.trim(),
      agentId: commissionForm.agentId,
      agentName: selectedAgent?.name || commissionForm.agentName || 'Driver / Guide',
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
      title: 'Hapus Catatan Komisi',
      message: `Hapus catatan komisi "${code}"? Tindakan ini tidak dapat dibatalkan.`,
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
  const handleOpenDisbursementModal = (commission: TravelBookingCommission) => {
    setDisbursingCommission(commission);
    setDisbursementForm({
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethod: PaymentMethod.CASH,
      bankId: banks.length > 0 ? banks[0].id : '',
      notes: ''
    });
  };

  const handleProcessDisbursement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disbursingCommission) return;

    const selectedBank = banks.find(b => b.id === disbursementForm.bankId);

    const updatedCommission: TravelBookingCommission = {
      ...disbursingCommission,
      status: CommissionStatus.PAID,
      paymentDate: disbursementForm.paymentDate,
      paymentMethod: disbursementForm.paymentMethod,
      bankId: disbursementForm.paymentMethod === PaymentMethod.TRANSFER ? disbursementForm.bankId : undefined,
      bankName: disbursementForm.paymentMethod === PaymentMethod.TRANSFER ? selectedBank?.bankName : undefined,
      notes: disbursementForm.notes
        ? `${disbursingCommission.notes ? disbursingCommission.notes + ' | ' : ''}Pencairan: ${disbursementForm.notes}`
        : disbursingCommission.notes
    };

    await StorageService.saveTravelCommission(updatedCommission);
    setDisbursingCommission(null);
  };

  // Print Official Voucher / Receipt for Driver Commission
  const handlePrintVoucher = (c: TravelBookingCommission) => {
    const settings = storeSettings || { name: 'RUMAH ETNIK PAPUA', address: '', phone: '' };
    const w = window.open('', '_blank');
    if (!w) return;

    const agentObj = agents.find(a => a.id === c.agentId);

    const html = `
      <html>
        <head>
          <title>Voucher Komisi Driver / Guide - ${c.bookingCode}</title>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; font-size: 11pt; color: #1e293b; }
            .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 16px; }
            .header h1 { margin: 0; font-size: 16pt; font-weight: 800; text-transform: uppercase; }
            .header p { margin: 2px 0 0; font-size: 9pt; color: #64748b; }
            .title { text-align: center; font-size: 13pt; font-weight: 800; margin-bottom: 16px; text-decoration: underline; }
            .info-table { width: 100%; margin-bottom: 16px; font-size: 10pt; }
            .info-table td { padding: 4px 6px; }
            .table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10pt; }
            .table th, .table td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
            .table th { background: #f8fafc; font-weight: bold; }
            .total-row { font-weight: 800; background: #ecfdf5; }
            .sig-section { display: flex; justify-content: space-between; margin-top: 40px; text-align: center; font-size: 10pt; }
            .sig-box { width: 40%; }
            .sig-space { height: 60px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${settings.name}</h1>
            <p>${settings.address || ''} • Telp: ${settings.phone || ''}</p>
          </div>
          <div class="title">SLIP BUKTI PEMBAYARAN KOMISI MITRA</div>
          <table class="info-table">
            <tr>
              <td width="20%"><strong>Kode Voucher:</strong></td>
              <td width="30%">${c.bookingCode}</td>
              <td width="20%"><strong>Tanggal:</strong></td>
              <td width="30%">${formatDate(c.departureDate)}</td>
            </tr>
            <tr>
              <td><strong>Driver / Guide:</strong></td>
              <td>${c.agentName} (${c.agentCategory || 'Driver'})</td>
              <td><strong>Kontak WA:</strong></td>
              <td>${agentObj?.phone || '-'}</td>
            </tr>
            <tr>
              <td><strong>Rekening Bank:</strong></td>
              <td colspan="3">${agentObj ? `${agentObj.bankName} - ${agentObj.accountNumber} (a.n ${agentObj.holderName})` : '-'}</td>
            </tr>
          </table>

          <table class="table">
            <thead>
              <tr>
                <th>Keterangan Transaksi / Wisatawan</th>
                <th>Pax</th>
                <th style="text-align: right;">Total Belanja Toko</th>
                <th style="text-align: center;">Skema Komisi</th>
                <th style="text-align: right;">Komisi Diperoleh</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>${c.touristName}</strong><br/>
                  <span style="font-size: 9pt; color: #64748b;">${c.tourPackage}</span>
                </td>
                <td>${c.paxCount} Pax</td>
                <td style="text-align: right;">${formatIDR(c.totalSales)}</td>
                <td style="text-align: center;">
                  ${c.commissionMethod === CommissionMethod.PERCENTAGE ? `${c.commissionRate}%` : formatIDR(c.commissionRate)}
                </td>
                <td style="text-align: right; font-weight: bold; color: #059669;">${formatIDR(c.totalCommission)}</td>
              </tr>
              <tr class="total-row">
                <td colspan="4" style="text-align: right;">TOTAL KOMISI DITERIMA:</td>
                <td style="text-align: right; font-size: 11pt; color: #047857;">${formatIDR(c.totalCommission)}</td>
              </tr>
            </tbody>
          </table>

          <div style="font-size: 9pt; color: #64748b;">
            <strong>Status:</strong> ${c.status === 'PAID' ? 'LUNAS (SUDAH DIBAYAR)' : 'PENDING'}<br/>
            ${c.paymentDate ? `<strong>Tanggal Bayar:</strong> ${formatDate(c.paymentDate)}<br/>` : ''}
          </div>

          <div class="sig-section">
            <div class="sig-box">
              <div>Penerima (Driver / Guide)</div>
              <div class="sig-space"></div>
              <div>( ${c.agentName} )</div>
            </div>
            <div class="sig-box">
              <div>Kasir / Manajemen</div>
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
    <div className="space-y-6 animate-fade-in p-2 md:p-0">
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4 print:hidden">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-600 text-white rounded-xl shadow-md shadow-amber-600/20">
              <BadgePercent size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                Manajemen Target & Komisi Driver / Guide
                <span className="text-[11px] font-extrabold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Partner System
                </span>
              </h1>
              <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
                Hitung otomatis komisi yang didapatkan Driver & Guide, pantau target bulanan, dan kelola bonus insentif
              </p>
            </div>
          </div>
        </div>

        {/* Tab Switcher & Top Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-0.5 border border-slate-200 shadow-2xs">
            <button
              onClick={() => setActiveTab('targets')}
              className={`flex items-center gap-1.5 px-3.5 py-2 font-black text-xs rounded-lg transition-all ${activeTab === 'targets'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
            >
              <Target size={14} />
              <span>1. Target & Komisi Driver</span>
            </button>

            <button
              onClick={() => setActiveTab('commissions')}
              className={`flex items-center gap-1.5 px-3.5 py-2 font-black text-xs rounded-lg transition-all ${activeTab === 'commissions'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
            >
              <BadgePercent size={14} />
              <span>2. Riwayat Booking</span>
              {commissions.length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${activeTab === 'commissions' ? 'bg-amber-700 text-amber-100' : 'bg-slate-200 text-slate-700'}`}>
                  {commissions.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('agents')}
              className={`flex items-center gap-1.5 px-3.5 py-2 font-black text-xs rounded-lg transition-all ${activeTab === 'agents'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
            >
              <Users size={14} />
              <span>3. Data Mitra</span>
              {agents.length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${activeTab === 'agents' ? 'bg-amber-700 text-amber-100' : 'bg-slate-200 text-slate-700'}`}>
                  {agents.length}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={() => handleOpenAgentModal()}
            className="flex items-center gap-1.5 bg-slate-900 text-white px-3.5 py-2 rounded-xl hover:bg-slate-800 transition-all text-xs font-bold shadow-2xs"
          >
            <Plus size={15} /> Tambah Mitra
          </button>
          <button
            onClick={() => handleOpenCommissionModal()}
            className="flex items-center gap-1.5 bg-amber-600 text-white px-3.5 py-2 rounded-xl hover:bg-amber-700 transition-all text-xs font-black shadow-md shadow-amber-600/20 active:scale-95"
          >
            <Plus size={15} /> Catat Komisi Manual
          </button>
        </div>
      </div>

      {/* Summary KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Total Komisi Berjalan</p>
            <h3 className="text-xl font-black text-emerald-600 font-mono mt-1">{formatIDR(overallTargetSummary.totalEarned)}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Komisi pokok & bonus bulan {months[targetMonth]}</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
            <Trophy size={24} />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Komisi Siap Cair (Pending)</p>
            <h3 className="text-xl font-black text-amber-600 font-mono mt-1">{formatIDR(overallTargetSummary.totalPending)}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Menunggu pencairan kasir</p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
            <Clock size={24} />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Omzet Belanja Tamu</p>
            <h3 className="text-xl font-black text-blue-600 font-mono mt-1">{formatIDR(overallTargetSummary.totalSales)}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Dibawa oleh Driver & Guide</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
            <DollarSign size={24} />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Mitra Tembus Target</p>
            <h3 className="text-xl font-black text-purple-700 font-mono mt-1">
              {overallTargetSummary.achieversCount} / {overallTargetSummary.totalDrivers} <span className="text-xs font-normal text-slate-500">Driver</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Mencapai target omzet bulanan</p>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl shrink-0">
            <Award size={24} />
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: TARGET & ESTIMASI KOMISI PER DRIVER / GUIDE */}
      {/* ======================================================== */}
      {activeTab === 'targets' && (
        <div className="space-y-6">
          {/* Top Month Filter & Simulator Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Target Table Header & Filter */}
            <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                    <Target size={16} className="text-amber-600" />
                    Pencapaian Target & Estimasi Komisi Driver / Guide
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Evaluasi omzet belanja yang dibawa oleh Driver & Guide beserta bonus target
                  </p>
                </div>

                {/* Month & Year Filter */}
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl p-1 text-xs">
                  <Calendar size={13} className="text-amber-600 ml-1" />
                  <select
                    value={targetMonth}
                    onChange={e => setTargetMonth(Number(e.target.value))}
                    className="bg-transparent font-extrabold text-slate-800 outline-none cursor-pointer"
                  >
                    {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                  <span className="text-slate-300">/</span>
                  <select
                    value={targetYear}
                    onChange={e => setTargetYear(Number(e.target.value))}
                    className="bg-transparent font-extrabold text-slate-800 outline-none cursor-pointer"
                  >
                    {[targetYear - 1, targetYear, targetYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              {/* Progress Highlights */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Periode Evaluasi</span>
                  <p className="font-extrabold text-slate-800 font-mono mt-0.5">{months[targetMonth]} {targetYear}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Total Booking Tamu</span>
                  <p className="font-extrabold text-blue-700 font-mono mt-0.5">
                    {driverTargetMetrics.reduce((s, d) => s + d.bookingsCount, 0)} Kedatangan
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Total Tamu (Pax)</span>
                  <p className="font-extrabold text-purple-700 font-mono mt-0.5">
                    {driverTargetMetrics.reduce((s, d) => s + d.totalPaxBrought, 0)} Wisatawan
                  </p>
                </div>
              </div>
            </div>

            {/* Right 1 Col: Live Commission Calculator Simulator */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-5 rounded-2xl shadow-md flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-black text-xs text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Calculator size={14} /> Kalkulator Cepat Komisi
                  </h4>
                  <span className="text-[10px] bg-white/10 text-white px-2 py-0.5 rounded-full font-mono">
                    Live Simulator
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mb-3">
                  Hitung komisi instan yang akan diperoleh Driver saat membawa rombongan belanja
                </p>

                <div className="space-y-2.5 text-xs">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Pilih Driver / Guide:</label>
                    <select
                      value={calcAgentId}
                      onChange={e => setCalcAgentId(e.target.value)}
                      className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-700/80 border border-slate-600 text-white outline-none font-medium"
                    >
                      {agents.map(a => (
                        <option key={a.id} value={a.id}>{a.name} ({a.category})</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Belanja Toko (Rp):</label>
                      <input
                        type="number"
                        value={calcSalesAmount}
                        onChange={e => setCalcSalesAmount(e.target.value)}
                        className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-700/80 border border-slate-600 text-white outline-none font-mono font-bold"
                        placeholder="1500000"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Jumlah Pax:</label>
                      <input
                        type="number"
                        value={calcPaxCount}
                        onChange={e => setCalcPaxCount(e.target.value)}
                        className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-700/80 border border-slate-600 text-white outline-none font-mono font-bold"
                        placeholder="2"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Result Preview Box */}
              <div className="mt-3 pt-3 border-t border-slate-700">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300">Skema: <strong>{simulatorResult.schemeText}</strong></span>
                  <span className="text-[10px] text-amber-400 font-mono font-bold">
                    {simulatorResult.willHitTarget ? '🎉 Tembus Target + Bonus' : 'Target Aktif'}
                  </span>
                </div>
                <div className="flex justify-between items-baseline mt-1">
                  <span className="text-xs text-slate-400">Komisi Didapat:</span>
                  <span className="text-lg font-black text-emerald-400 font-mono">
                    {formatIDR(simulatorResult.commissionAmt)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Driver Target Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3">
              <div>
                <h3 className="font-extrabold text-sm text-slate-800">
                  Daftar Target & Komisi Seluruh Driver & Guide ({driverTargetMetrics.length} Mitra)
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Status pencapaian target, komisi pokok, dan bonus insentif</p>
              </div>

              <div className="text-xs font-bold font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl">
                Periode: {months[targetMonth]} {targetYear}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-600 font-extrabold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-3.5 text-center w-12">No</th>
                    <th className="p-3.5 min-w-[200px]">Driver / Guide</th>
                    <th className="p-3.5 w-32">Skema Komisi</th>
                    <th className="p-3.5 min-w-[180px]">Realisasi vs Target Omzet</th>
                    <th className="p-3.5 text-center w-28">Pencapaian</th>
                    <th className="p-3.5 text-right w-36">Komisi Berjalan</th>
                    <th className="p-3.5 text-right w-32">Bonus Target</th>
                    <th className="p-3.5 text-right w-36 text-emerald-800">Total Didapatkan</th>
                    <th className="p-3.5 text-center w-36">Aksi Cepat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {driverTargetMetrics.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400 italic">
                        Belum ada data driver/guide terdaftar. Silakan tambahkan mitra baru.
                      </td>
                    </tr>
                  ) : driverTargetMetrics.map((item, idx) => (
                    <tr key={item.agent.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                      <td className="p-3">
                        <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                          <Users size={14} className="text-amber-600 shrink-0" />
                          {item.agent.name}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-bold">
                            {item.agent.category || 'Driver'}
                          </span>
                          <a
                            href={`https://web.whatsapp.com/send?phone=${item.agent.phone.replace(/^0/, '62').replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-emerald-600 hover:text-emerald-700 flex items-center gap-0.5"
                            title="Buka Chat di WhatsApp Web"
                          >
                            <Phone size={10} /> {item.agent.phone}
                          </a>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                          {item.agent.bankName} - {item.agent.accountNumber}
                        </div>
                      </td>

                      <td className="p-3 text-slate-700">
                        <span className="font-bold text-slate-800">
                          {item.agent.commissionMethod === CommissionMethod.PERCENTAGE
                            ? `${item.agent.commissionRate || 10}% Belanja`
                            : item.agent.commissionMethod === CommissionMethod.FLAT_PER_PAX
                              ? `${formatIDR(item.agent.commissionRate || 25000)} / Pax`
                              : `${formatIDR(item.agent.commissionRate || 100000)} / Grup`
                          }
                        </span>
                      </td>

                      <td className="p-3">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono">
                            <span className="font-bold text-slate-900">{formatIDR(item.totalSalesBrought)}</span>
                            <span className="text-slate-400">Target: {formatIDR(item.targetRevenue)}</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden flex">
                            <div
                              className={`h-full rounded-full transition-all ${item.revenueProgress >= 100 ? 'bg-emerald-500' : item.revenueProgress >= 50 ? 'bg-amber-500' : 'bg-blue-500'}`}
                              style={{ width: `${Math.min(100, item.revenueProgress)}%` }}
                            />
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {item.bookingsCount} booking • {item.totalPaxBrought} pax
                          </div>
                        </div>
                      </td>

                      <td className="p-3 text-center font-mono">
                        {item.revenueProgress >= 100 ? (
                          <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                            <CheckCircle2 size={11} /> {item.revenueProgress.toFixed(0)}% (Capai)
                          </span>
                        ) : item.revenueProgress > 0 ? (
                          <span className="bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                            {item.revenueProgress.toFixed(0)}%
                          </span>
                        ) : (
                          <span className="bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded-full">
                            0%
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-right font-mono font-bold text-slate-800">
                        {formatIDR(item.totalCommissionEarned)}
                        <div className="text-[10px] text-slate-400">
                          {item.pendingCommission > 0 ? `Pending: ${formatIDR(item.pendingCommission)}` : 'Lunas'}
                        </div>
                      </td>

                      <td className="p-3 text-right font-mono">
                        {item.targetBonus > 0 ? (
                          <span className="font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            +{formatIDR(item.targetBonus)}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      <td className="p-3 text-right font-mono font-black text-emerald-700 text-sm">
                        {formatIDR(item.totalReceivableByDriver)}
                      </td>

                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenAgentModal(item.agent)}
                            className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Atur Target & Skema Komisi"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleOpenCommissionModal();
                              setCommissionForm(prev => ({ ...prev, agentId: item.agent.id }));
                            }}
                            className="px-2 py-1 bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 rounded-lg text-[10px] font-bold transition-colors"
                            title="Catat Transaksi Belanja untuk Driver ini"
                          >
                            + Transaksi
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: RIWAYAT TRANSAKSI & KOMISI */}
      {/* ======================================================== */}
      {activeTab === 'commissions' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200 text-xs">
                <Calendar size={14} className="text-slate-400 ml-1" />
                <input
                  type="date"
                  className="bg-transparent border-0 outline-none text-slate-700 text-xs"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
                <span className="text-slate-400">-</span>
                <input
                  type="date"
                  className="bg-transparent border-0 outline-none text-slate-700 text-xs"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>

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

              <select
                className="px-3.5 py-2 bg-white border border-slate-300 rounded-xl outline-none text-xs text-slate-700 font-medium max-w-[200px]"
                value={agentFilter}
                onChange={e => setAgentFilter(e.target.value)}
              >
                <option value="">Semua Driver / Guide</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.category})</option>
                ))}
              </select>

              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari kode booking, nama tamu, atau driver..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Commissions Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-600 font-extrabold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-3.5 w-12 text-center">No</th>
                    <th className="p-3.5 w-32">Kode Booking</th>
                    <th className="p-3.5 min-w-[160px]">Driver / Guide</th>
                    <th className="p-3.5 min-w-[160px]">Nama Tamu / Rombongan</th>
                    <th className="p-3.5 w-28">Tanggal</th>
                    <th className="p-3.5 text-right w-32">Belanja Toko</th>
                    <th className="p-3.5 text-right w-32 text-emerald-700">Komisi</th>
                    <th className="p-3.5 text-center w-28">Status</th>
                    <th className="p-3.5 text-center w-36">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredCommissions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400 italic">
                        Tidak ada riwayat komisi yang sesuai dengan filter.
                      </td>
                    </tr>
                  ) : filteredCommissions.slice(0, visibleCount).map((c, idx) => (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                      <td className="p-3 font-mono font-extrabold text-slate-900">{c.bookingCode}</td>
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{c.agentName}</div>
                        <div className="text-[10px] text-slate-400">{c.agentCategory || 'Driver'}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-slate-800">{c.touristName}</div>
                        <div className="text-[10px] text-slate-400">{c.paxCount} Pax • {c.tourPackage}</div>
                      </td>
                      <td className="p-3 font-mono text-slate-600">{formatDate(c.departureDate)}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-800">{formatIDR(c.totalSales)}</td>
                      <td className="p-3 text-right font-mono font-extrabold text-emerald-700">{formatIDR(c.totalCommission)}</td>
                      <td className="p-3 text-center">
                        {c.status === CommissionStatus.PAID ? (
                          <span className="bg-emerald-100 text-emerald-800 font-extrabold text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                            <CheckCircle2 size={10} /> Lunas
                          </span>
                        ) : c.status === CommissionStatus.PENDING ? (
                          <span className="bg-amber-100 text-amber-800 font-extrabold text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                            <Clock size={10} /> Pending
                          </span>
                        ) : (
                          <span className="bg-rose-100 text-rose-800 font-extrabold text-[10px] px-2 py-0.5 rounded-full">
                            Batal
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {c.status === CommissionStatus.PENDING && (
                            <button
                              type="button"
                              onClick={() => handleOpenDisbursementModal(c)}
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition-colors shadow-2xs"
                              title="Cairkan Komisi"
                            >
                              Bayar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handlePrintVoucher(c)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Cetak Slip Bukti Komisi"
                          >
                            <Printer size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenCommissionModal(c)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Edit Komisi"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCommission(c.id, c.bookingCode)}
                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                            title="Hapus Komisi"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredCommissions.length > visibleCount && (
              <div className="p-4 border-t border-slate-100 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount(prev => prev + 20)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                >
                  Muat Lebih Banyak ({filteredCommissions.length - visibleCount} tersisa)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: PROFIL MITRA DRIVER & GUIDE */}
      {/* ======================================================== */}
      {activeTab === 'agents' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-3 flex-1">
              <select
                value={agentCategoryFilter}
                onChange={e => setAgentCategoryFilter(e.target.value)}
                className="px-3.5 py-2 bg-white border border-slate-300 rounded-xl outline-none text-xs text-slate-700 font-medium"
              >
                <option value="">Semua Kategori</option>
                <option value="Driver">Driver</option>
                <option value="Tour Guide">Tour Guide</option>
                <option value="Driver & Guide">Driver & Guide</option>
                <option value="Biro Travel / Agency">Biro Travel / Agency</option>
              </select>

              <div className="relative flex-1 max-w-[300px]">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari nama, no WA, atau no rekening..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none"
                  value={agentSearchQuery}
                  onChange={e => setAgentSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <button
              onClick={() => handleOpenAgentModal()}
              className="px-4 py-2 bg-amber-600 text-white rounded-xl font-bold text-xs hover:bg-amber-700 transition-colors shadow-sm flex items-center gap-1.5"
            >
              <Plus size={15} /> Tambah Mitra Baru
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAgents.map(agent => (
              <div key={agent.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-amber-300 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-900">{agent.name}</h4>
                      <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md font-bold mt-1 inline-block">
                        {agent.category || 'Driver'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenAgentModal(agent)}
                        className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
                        title="Edit Data Mitra"
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteAgent(agent.id, agent.name)}
                        className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg"
                        title="Hapus Mitra"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                    <div className="flex items-center gap-2">
                      <Phone size={13} className="text-slate-400" />
                      <a 
                        href={`https://web.whatsapp.com/send?phone=${agent.phone.replace(/^0/, '62').replace(/\D/g, '')}`} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="hover:text-emerald-600 font-mono font-medium"
                        title="Buka Chat di WhatsApp Web"
                      >
                        {agent.phone}
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      <CreditCard size={13} className="text-slate-400" />
                      <span className="font-mono">{agent.bankName} - {agent.accountNumber} ({agent.holderName})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Percent size={13} className="text-slate-400" />
                      <span>
                        Skema: <strong>{agent.commissionMethod === CommissionMethod.PERCENTAGE ? `${agent.commissionRate || 10}% Belanja` : formatIDR(agent.commissionRate || 0)}</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Target size={13} className="text-slate-400" />
                      <span>Target: <strong>{formatIDR(agent.monthlyTargetRevenue || 5000000)}/bln</strong></span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-xs">
                  <span className="text-[10px] text-slate-400 font-mono">
                    Bonus Target: {agent.targetBonusRate ? formatIDR(agent.targetBonusRate) : '-'}
                  </span>
                  <button
                    onClick={() => {
                      setActiveTab('targets');
                      setCalcAgentId(agent.id);
                    }}
                    className="text-amber-700 hover:text-amber-800 font-bold text-[11px] flex items-center gap-1"
                  >
                    Lihat Kinerja <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Tambah / Edit Driver & Guide */}
      {isAgentModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto animate-scale-up">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Users size={18} className="text-amber-600" />
                {editingAgent ? 'Edit Data Driver / Guide' : 'Tambah Mitra Driver / Guide Baru'}
              </h3>
              <button onClick={() => setIsAgentModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveAgent} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nama Lengkap Driver / Guide *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Bpk. Yonas Tabuni"
                  value={agentForm.name || ''}
                  onChange={e => setAgentForm({ ...agentForm, name: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 outline-none text-xs font-semibold focus:border-amber-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kategori / Peran *</label>
                  <select
                    value={agentForm.category || 'Driver'}
                    onChange={e => setAgentForm({ ...agentForm, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none text-xs font-semibold"
                  >
                    <option value="Driver">Driver (Sopir)</option>
                    <option value="Tour Guide">Tour Guide (Pemandu)</option>
                    <option value="Driver & Guide">Driver & Guide</option>
                    <option value="Biro Travel / Agency">Biro Travel / Agency</option>
                    <option value="Tour Leader">Tour Leader (TL)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">No. WhatsApp / HP *</label>
                  <input
                    type="text"
                    required
                    placeholder="08123456789"
                    value={agentForm.phone || ''}
                    onChange={e => setAgentForm({ ...agentForm, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none text-xs font-mono"
                  />
                </div>
              </div>

              {/* Bank Details */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                <span className="font-extrabold text-[11px] text-slate-700 uppercase tracking-wider block">
                  Informasi Rekening Bank untuk Pencairan Komisi
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 font-bold block mb-1">Nama Bank *</label>
                    <input
                      type="text"
                      required
                      placeholder="BCA / BRI / Mandiri"
                      value={agentForm.bankName || ''}
                      onChange={e => setAgentForm({ ...agentForm, bankName: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 outline-none text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-bold block mb-1">No. Rekening *</label>
                    <input
                      type="text"
                      required
                      placeholder="1234567890"
                      value={agentForm.accountNumber || ''}
                      onChange={e => setAgentForm({ ...agentForm, accountNumber: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 outline-none text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-bold block mb-1">Atas Nama *</label>
                    <input
                      type="text"
                      required
                      placeholder="Nama Pemilik"
                      value={agentForm.holderName || ''}
                      onChange={e => setAgentForm({ ...agentForm, holderName: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 outline-none text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Commission Scheme & Target */}
              <div className="p-3 bg-amber-50/70 rounded-2xl border border-amber-200 space-y-2.5">
                <span className="font-extrabold text-[11px] text-amber-900 uppercase tracking-wider block">
                  Skema Komisi & Target Bulanan
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-600 font-bold block mb-1">Metode Komisi</label>
                    <select
                      value={agentForm.commissionMethod || CommissionMethod.PERCENTAGE}
                      onChange={e => setAgentForm({ ...agentForm, commissionMethod: e.target.value as CommissionMethod })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 outline-none text-xs bg-white"
                    >
                      <option value={CommissionMethod.PERCENTAGE}>% Persentase dari Belanja</option>
                      <option value={CommissionMethod.FLAT_PER_PAX}>Flat per Orang (Pax)</option>
                      <option value={CommissionMethod.FLAT_PER_GROUP}>Flat per Rombongan</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-600 font-bold block mb-1">Nilai Komisi (% atau Rp)</label>
                    <input
                      type="number"
                      value={agentForm.commissionRate !== undefined ? agentForm.commissionRate : 10}
                      onChange={e => setAgentForm({ ...agentForm, commissionRate: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 outline-none text-xs font-mono font-bold bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-600 font-bold block mb-1">Target Omzet (Rp)</label>
                    <input
                      type="number"
                      value={agentForm.monthlyTargetRevenue || 5000000}
                      onChange={e => setAgentForm({ ...agentForm, monthlyTargetRevenue: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 outline-none text-xs font-mono bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-600 font-bold block mb-1">Target Pax (Tamu)</label>
                    <input
                      type="number"
                      value={agentForm.monthlyTargetPax || 20}
                      onChange={e => setAgentForm({ ...agentForm, monthlyTargetPax: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 outline-none text-xs font-mono bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-600 font-bold block mb-1">Bonus Tembus Target (Rp)</label>
                    <input
                      type="number"
                      value={agentForm.targetBonusRate || 0}
                      onChange={e => setAgentForm({ ...agentForm, targetBonusRate: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 outline-none text-xs font-mono bg-white text-emerald-700 font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAgentModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 shadow-sm"
                >
                  Simpan Data Mitra
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Catat / Edit Komisi Booking */}
      {isCommissionModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto animate-scale-up">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <BadgePercent size={18} className="text-amber-600" />
                {editingCommission ? 'Edit Komisi Pemesanan' : 'Catat Komisi Driver / Guide Baru'}
              </h3>
              <button onClick={() => setIsCommissionModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCommission} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kode Booking *</label>
                  <input
                    type="text"
                    required
                    value={commissionForm.bookingCode || ''}
                    onChange={e => setCommissionForm({ ...commissionForm, bookingCode: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tanggal Kedatangan *</label>
                  <input
                    type="date"
                    required
                    value={commissionForm.departureDate || ''}
                    onChange={e => setCommissionForm({ ...commissionForm, departureDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Pilih Driver / Guide *</label>
                <select
                  required
                  value={commissionForm.agentId || ''}
                  onChange={e => {
                    const agentId = e.target.value;
                    const found = agents.find(a => a.id === agentId);
                    setCommissionForm({
                      ...commissionForm,
                      agentId,
                      agentName: found?.name,
                      agentCategory: found?.category,
                      commissionMethod: found?.commissionMethod || CommissionMethod.PERCENTAGE,
                      commissionRate: found?.commissionRate !== undefined ? found.commissionRate : 10
                    });
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none text-xs font-semibold"
                >
                  <option value="">-- Pilih Driver / Guide Mitra --</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.category || 'Driver'}) - Rek: {a.bankName}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nama Tamu / Rombongan *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Rombongan PT ABC"
                    value={commissionForm.touristName || ''}
                    onChange={e => setCommissionForm({ ...commissionForm, touristName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Jumlah Pax (Orang) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={commissionForm.paxCount || 1}
                    onChange={e => setCommissionForm({ ...commissionForm, paxCount: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block font-bold text-slate-700">Keterangan Belanja / Kategori Paket *</label>
                  <span className="text-[10px] text-amber-800 font-bold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                    Produk & Inventaris
                  </span>
                </div>

                <div className="space-y-1.5">
                  {/* Dropdown Kategori / Paket dari Master Data Produk & Inventaris */}
                  <select
                    value={availablePackageCategories.includes(commissionForm.tourPackage || '') ? commissionForm.tourPackage : '__CUSTOM__'}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__CUSTOM__') {
                        // User will type custom in the text input below
                      } else {
                        const matchingProd = products.find(p => p.name === val || p.categoryName === val);
                        const currentSales = Number(commissionForm.totalSales) || 0;
                        const pax = Number(commissionForm.paxCount) || 1;
                        const newSales = (currentSales === 0 && matchingProd && matchingProd.price > 0)
                          ? matchingProd.price * pax
                          : commissionForm.totalSales;

                        setCommissionForm({
                          ...commissionForm,
                          tourPackage: val,
                          totalSales: newSales
                        });
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none text-xs font-semibold bg-white text-slate-800 focus:border-amber-600 shadow-2xs cursor-pointer"
                  >
                    <option value="">-- Pilih Kategori / Paket Terdaftar --</option>
                    <optgroup label="📦 Kategori Master Produk & Inventaris">
                      {availablePackageCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </optgroup>
                    <option value="__CUSTOM__">✏️ Tulis Keterangan Kustom Lainnya...</option>
                  </select>

                  {/* Input Teks Manual / Custom Input dengan Datalist */}
                  <div className="relative">
                    <input
                      type="text"
                      list="package-categories-datalist"
                      required
                      placeholder="Ketik atau sesuaikan nama paket belanja..."
                      value={commissionForm.tourPackage || ''}
                      onChange={e => setCommissionForm({ ...commissionForm, tourPackage: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none text-xs text-slate-800 bg-slate-50/70 focus:bg-white focus:border-amber-600"
                    />
                    <datalist id="package-categories-datalist">
                      {availablePackageCategories.map(cat => (
                        <option key={cat} value={cat} />
                      ))}
                    </datalist>
                  </div>
                </div>
              </div>

              {/* Financials */}
              <div className="p-3 bg-emerald-50/80 rounded-2xl border border-emerald-200 space-y-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Total Nilai Belanja Toko (Rp) *</label>
                  <input
                    type="number"
                    required
                    value={commissionForm.totalSales || ''}
                    onChange={e => setCommissionForm({ ...commissionForm, totalSales: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-emerald-300 bg-white outline-none text-sm font-mono font-black text-slate-900"
                    placeholder="0"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Skema Komisi</label>
                    <select
                      value={commissionForm.commissionMethod || CommissionMethod.PERCENTAGE}
                      onChange={e => setCommissionForm({ ...commissionForm, commissionMethod: e.target.value as CommissionMethod })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 outline-none text-xs bg-white"
                    >
                      <option value={CommissionMethod.PERCENTAGE}>% Persentase</option>
                      <option value={CommissionMethod.FLAT_PER_PAX}>Flat per Pax</option>
                      <option value={CommissionMethod.FLAT_PER_GROUP}>Flat per Rombongan</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Tarif Komisi</label>
                    <input
                      type="number"
                      value={commissionForm.commissionRate || 10}
                      onChange={e => setCommissionForm({ ...commissionForm, commissionRate: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 outline-none text-xs font-mono font-bold bg-white"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-emerald-200 flex justify-between items-center">
                  <span className="font-extrabold text-slate-800 text-xs">Total Komisi Driver:</span>
                  <span className="text-base font-black text-emerald-700 font-mono">
                    {formatIDR(calculatedCommissionValue)}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCommissionModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 shadow-sm"
                >
                  Simpan Komisi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Cairkan / Bayar Komisi Driver */}
      {disbursingCommission && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scale-up">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <DollarSign size={18} className="text-emerald-600" />
                Pencairan Komisi Driver / Guide
              </h3>
              <button onClick={() => setDisbursingCommission(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1 text-xs">
              <p>Driver / Guide: <strong className="text-slate-900">{disbursingCommission.agentName}</strong></p>
              <p>Kode Booking: <strong className="font-mono">{disbursingCommission.bookingCode}</strong></p>
              <p>Nominal Komisi: <strong className="text-emerald-700 font-mono text-sm">{formatIDR(disbursingCommission.totalCommission)}</strong></p>
            </div>

            <form onSubmit={handleProcessDisbursement} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Tanggal Pencairan *</label>
                <input
                  type="date"
                  required
                  value={disbursementForm.paymentDate}
                  onChange={e => setDisbursementForm({ ...disbursementForm, paymentDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Metode Pembayaran *</label>
                <select
                  value={disbursementForm.paymentMethod}
                  onChange={e => setDisbursementForm({ ...disbursementForm, paymentMethod: e.target.value as PaymentMethod })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none text-xs font-bold"
                >
                  <option value={PaymentMethod.CASH}>Tunai (Cash Fisik Kasir)</option>
                  <option value={PaymentMethod.TRANSFER}>Transfer Bank</option>
                </select>
              </div>

              {disbursementForm.paymentMethod === PaymentMethod.TRANSFER && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Rekening Kas Toko</label>
                  <select
                    value={disbursementForm.bankId}
                    onChange={e => setDisbursementForm({ ...disbursementForm, bankId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none text-xs"
                  >
                    {banks.map(b => (
                      <option key={b.id} value={b.id}>{b.bankName} - {b.accountNumber} ({b.holderName})</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">Catatan Tambahan (Opsional)</label>
                <input
                  type="text"
                  placeholder="Contoh: Ditransfer via BCA ke rekening Driver"
                  value={disbursementForm.notes}
                  onChange={e => setDisbursementForm({ ...disbursementForm, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 outline-none text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDisbursingCommission(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 shadow-sm"
                >
                  Konfirmasi Pembayaran Lunas
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
        type={confirmation.type}
        onConfirm={confirmation.onConfirm}
        onClose={() => setConfirmation(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
