import React, { useState, useEffect, useRef } from 'react';
import {
  ShoppingBag, Plus, Trash2, Printer, Save, RefreshCw,
  Search, CheckCircle2, AlertCircle, FileText, ArrowLeft,
  DollarSign, CreditCard, Smartphone, Banknote, Calendar,
  QrCode, Clock, Tag, User, MapPin, Phone, Hash, ChevronDown,
  Layers, Package, Check, Eye
} from 'lucide-react';
import { apiRequest } from '../api';

// Helper: Indian Currency Number to Words
function numberToWordsIndian(num) {
  if (!num || isNaN(num) || num <= 0) return 'Zero Rupees Only';
  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const inWords = (n) => {
    if (n < 20) return a[n];
    const digit = n % 10;
    return b[Math.floor(n / 10)] + (digit ? ' ' + a[digit] : '');
  };

  let intPart = Math.floor(num);
  let paise = Math.round((num - intPart) * 100);

  let str = '';
  const crore = Math.floor(intPart / 10000000);
  intPart %= 10000000;
  const lakh = Math.floor(intPart / 100000);
  intPart %= 100000;
  const thousand = Math.floor(intPart / 1000);
  intPart %= 1000;
  const hundred = Math.floor(intPart / 100);
  intPart %= 100;

  if (crore > 0) str += inWords(crore) + ' Crore ';
  if (lakh > 0) str += inWords(lakh) + ' Lakh ';
  if (thousand > 0) str += inWords(thousand) + ' Thousand ';
  if (hundred > 0) str += inWords(hundred) + ' Hundred ';
  if (intPart > 0) {
    if (str !== '') str += 'and ';
    str += inWords(intPart) + ' ';
  }

  str = str.trim() + ' Rupees';
  if (paise > 0) {
    str += ' and ' + inWords(paise) + ' Paise';
  }
  return str + ' Only';
}

export default function MerchantBillingView({ company, user }) {
  const [activeTab, setActiveTab] = useState('new_bill'); // 'new_bill' | 'draft_bills' | 'bill_register' | 'stock_items' | 'customers'
  
  // Stock items catalog
  const [catalogItems, setCatalogItems] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  // New Bill Form State
  const [billNo, setBillNo] = useState('');
  const [billDate, setBillDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [printSize, setPrintSize] = useState('A4 smart invoice');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  
  // Customer details
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerAddress, setCustomerAddress] = useState('');
  const [mobileLookupLoading, setMobileLookupLoading] = useState(false);

  // Bill line items
  const [items, setItems] = useState([
    {
      id: 1,
      item_id: null,
      item_name: '',
      unit: 'PCS',
      mrp: 0,
      discount_pct: '',
      rate: 0,
      qty: 1,
      gst_pct: 0,
      amount: 0
    }
  ]);

  // Notes on bill
  const [notes, setNotes] = useState('');

  // Active Dropdown state for item autocomplete
  const [activeItemDropdownRow, setActiveItemDropdownRow] = useState(null);
  const [itemSearchQuery, setItemSearchQuery] = useState('');

  // Status & feedback
  const [saving, setSaving] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleTimeString());
  const [feedback, setFeedback] = useState(null); // { type: 'success'|'error', message: '' }

  // Drafts & Invoices records
  const [invoices, setInvoices] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  // Stock Items Management Modal / State
  const [showItemModal, setShowItemModal] = useState(false);
  const [newItem, setNewItem] = useState({
    item_name: '', item_code: '', unit: 'PCS', mrp: '', rate: '', gst_rate: 18, stock_qty: 100
  });

  // Printing state
  const [printMode, setPrintMode] = useState(null); // 'a4' | '58mm' | null
  const [activeInvoiceForPrint, setActiveInvoiceForPrint] = useState(null);

  // Fetch catalog & next invoice number on mount
  useEffect(() => {
    fetchStockItems();
    fetchNextInvoiceNumber();
    fetchInvoices();
  }, []);

  const fetchStockItems = async () => {
    setCatalogLoading(true);
    try {
      const res = await apiRequest('/billing/items');
      if (res?.items) {
        setCatalogItems(res.items);
      }
    } catch (e) {
      console.error('Failed to load stock items:', e);
    } finally {
      setCatalogLoading(false);
    }
  };

  const fetchNextInvoiceNumber = async () => {
    try {
      const res = await apiRequest('/billing/invoices/next-number');
      if (res?.nextNumber) {
        setBillNo(res.nextNumber);
      }
    } catch (e) {
      console.error('Failed to load invoice number:', e);
    }
  };

  const fetchInvoices = async () => {
    setInvoicesLoading(true);
    try {
      const res = await apiRequest('/billing/invoices');
      if (res?.invoices) {
        setInvoices(res.invoices.filter(i => i.status === 'completed'));
        setDrafts(res.invoices.filter(i => i.status === 'draft'));
      }
    } catch (e) {
      console.error('Failed to load invoices:', e);
    } finally {
      setInvoicesLoading(false);
    }
  };

  // Customer Mobile auto-fetch lookup
  const handleMobileChange = async (val) => {
    setCustomerMobile(val);
    const clean = val.trim();
    if (clean.length >= 10) {
      setMobileLookupLoading(true);
      try {
        const res = await apiRequest(`/billing/customers?mobile=${encodeURIComponent(clean)}`);
        if (res?.customer) {
          setCustomerName(res.customer.name || 'Walk-in Customer');
          setCustomerAddress(res.customer.address || '');
          setFeedback({
            type: 'success',
            message: `Customer "${res.customer.name}" loaded automatically from master list!`
          });
          setTimeout(() => setFeedback(null), 3000);
        }
      } catch (e) {
      } finally {
        setMobileLookupLoading(false);
      }
    }
  };

  // Calculations
  const calculateRowAmount = (row) => {
    const mrp = parseFloat(row.mrp) || 0;
    const discPct = parseFloat(row.discount_pct) || 0;
    const qty = parseFloat(row.qty) || 0;
    const gstPct = parseFloat(row.gst_pct) || 0;

    // Rate: if discount % given, rate = mrp - (mrp * disc / 100). Otherwise rate = row.rate or mrp.
    let rate = parseFloat(row.rate);
    if (discPct > 0) {
      rate = mrp - (mrp * (discPct / 100));
    } else if (isNaN(rate) || rate === 0) {
      rate = mrp;
    }

    const taxable = rate * qty;
    const gstAmt = taxable * (gstPct / 100);
    const amount = taxable + gstAmt;

    return {
      rate: Number(rate.toFixed(2)),
      amount: Number(amount.toFixed(2)),
      taxable: Number(taxable.toFixed(2)),
      gstAmt: Number(gstAmt.toFixed(2))
    };
  };

  const updateRow = (index, field, value) => {
    setItems(prev => {
      const updated = [...prev];
      const row = { ...updated[index], [field]: value };

      // If item name changed, update search query
      if (field === 'item_name') {
        setItemSearchQuery(value);
      }

      // If mrp, discount_pct, rate, qty, or gst_pct changes, recalculate
      if (['mrp', 'discount_pct', 'rate', 'qty', 'gst_pct'].includes(field)) {
        const calc = calculateRowAmount(row);
        row.rate = field === 'rate' ? value : calc.rate;
        row.amount = calc.amount;
      }

      updated[index] = row;
      return updated;
    });
    setLastUpdated(new Date().toLocaleTimeString());
  };

  // Select item from catalog auto-fill
  const selectCatalogItem = (index, catalogItem) => {
    setItems(prev => {
      const updated = [...prev];
      const mrp = parseFloat(catalogItem.mrp) || 0;
      const rate = parseFloat(catalogItem.rate) || mrp;
      const gstPct = parseFloat(catalogItem.gst_rate) || 0;
      const qty = parseFloat(updated[index].qty) || 1;

      const taxable = rate * qty;
      const gstAmt = taxable * (gstPct / 100);
      const amount = Number((taxable + gstAmt).toFixed(2));

      updated[index] = {
        ...updated[index],
        item_id: catalogItem.id,
        item_name: catalogItem.item_name,
        unit: catalogItem.unit || 'PCS',
        mrp: mrp,
        discount_pct: '',
        rate: rate,
        qty: qty,
        gst_pct: gstPct,
        amount: amount
      };
      return updated;
    });
    setActiveItemDropdownRow(null);
    setItemSearchQuery('');
    setLastUpdated(new Date().toLocaleTimeString());
  };

  // Add new item row
  const handleAddRow = () => {
    setItems(prev => [
      ...prev,
      {
        id: Date.now(),
        item_id: null,
        item_name: '',
        unit: 'PCS',
        mrp: 0,
        discount_pct: '',
        rate: 0,
        qty: 1,
        gst_pct: 0,
        amount: 0
      }
    ]);
  };

  // Remove row
  const handleRemoveRow = (index) => {
    if (items.length <= 1) {
      setItems([{
        id: Date.now(),
        item_id: null,
        item_name: '',
        unit: 'PCS',
        mrp: 0,
        discount_pct: '',
        rate: 0,
        qty: 1,
        gst_pct: 0,
        amount: 0
      }]);
      return;
    }
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  // Summary Totals
  const totals = items.reduce((acc, row) => {
    const calc = calculateRowAmount(row);
    acc.taxable += calc.taxable;
    acc.tax += calc.gstAmt;
    acc.grandTotal += calc.amount;
    return acc;
  }, { taxable: 0, tax: 0, grandTotal: 0 });

  const taxableValue = Number(totals.taxable.toFixed(2));
  const taxAmount = Number(totals.tax.toFixed(2));
  const grandTotal = Number(totals.grandTotal.toFixed(2));
  const inWords = numberToWordsIndian(grandTotal);

  // Reset form
  const handleRefresh = () => {
    fetchNextInvoiceNumber();
    fetchStockItems();
    setCustomerMobile('');
    setCustomerName('Walk-in Customer');
    setCustomerAddress('');
    setItems([{
      id: Date.now(),
      item_id: null,
      item_name: '',
      unit: 'PCS',
      mrp: 0,
      discount_pct: '',
      rate: 0,
      qty: 1,
      gst_pct: 0,
      amount: 0
    }]);
    setNotes('');
    setLastUpdated(new Date().toLocaleTimeString());
    setFeedback({ type: 'success', message: 'Bill form refreshed successfully.' });
    setTimeout(() => setFeedback(null), 3000);
  };

  // Save Bill (Status: completed or draft)
  const handleSaveBill = async (saveStatus = 'completed', printFormat = null) => {
    const validItems = items.filter(i => i.item_name && i.item_name.trim());
    if (validItems.length === 0) {
      setFeedback({ type: 'error', message: 'Please add at least one valid item to the bill.' });
      return null;
    }

    setSaving(true);
    try {
      const payload = {
        invoice_no: billNo,
        bill_date: billDate,
        customer_mobile: customerMobile,
        customer_name: customerName,
        customer_address: customerAddress,
        print_size: printSize,
        payment_method: paymentMethod,
        notes: notes,
        items: validItems,
        taxable_value: taxableValue,
        tax_amount: taxAmount,
        grand_total: grandTotal,
        in_words: inWords,
        status: saveStatus
      };

      const res = await apiRequest('/billing/invoices', {
        method: 'POST',
        body: payload
      });

      if (res?.success) {
        setFeedback({
          type: 'success',
          message: saveStatus === 'draft'
            ? `Draft bill #${res.invoiceNo} saved successfully!`
            : `Invoice #${res.invoiceNo} saved successfully!`
        });

        fetchInvoices();

        // If printing requested
        if (printFormat) {
          triggerPrint(payload, printFormat);
        } else if (saveStatus !== 'draft') {
          // Reset form on full save without print
          setTimeout(() => {
            handleRefresh();
          }, 1500);
        }

        return res;
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save bill.' });
    } finally {
      setSaving(false);
    }
    return null;
  };

  // Print Trigger
  const triggerPrint = (invoiceData, mode) => {
    setActiveInvoiceForPrint(invoiceData || {
      invoice_no: billNo,
      bill_date: billDate,
      customer_mobile: customerMobile,
      customer_name: customerName,
      customer_address: customerAddress,
      payment_method: paymentMethod,
      notes: notes,
      items: items.filter(i => i.item_name && i.item_name.trim()),
      taxable_value: taxableValue,
      tax_amount: taxAmount,
      grand_total: grandTotal,
      in_words: inWords
    });

    setPrintMode(mode);

    // Apply print stylesheet trigger
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        setPrintMode(null);
      }, 500);
    }, 200);
  };

  // Add Item to Catalog Handler
  const handleCreateCatalogItem = async (e) => {
    e.preventDefault();
    if (!newItem.item_name.trim()) return;
    try {
      await apiRequest('/billing/items', {
        method: 'POST',
        body: newItem
      });
      setShowItemModal(false);
      setNewItem({
        item_name: '', item_code: '', unit: 'PCS', mrp: '', rate: '', gst_rate: 18, stock_qty: 100
      });
      fetchStockItems();
      setFeedback({ type: 'success', message: 'Item added to inventory catalog.' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    }
  };

  // Load draft into editor
  const loadDraftIntoEditor = async (draftId) => {
    try {
      const res = await apiRequest(`/billing/invoices/${draftId}`);
      if (res?.invoice) {
        const inv = res.invoice;
        setBillNo(inv.invoice_no);
        setBillDate(inv.bill_date);
        setCustomerMobile(inv.customer_mobile || '');
        setCustomerName(inv.customer_name || 'Walk-in Customer');
        setCustomerAddress(inv.customer_address || '');
        setPrintSize(inv.print_size || 'A4 smart invoice');
        setPaymentMethod(inv.payment_method || 'Cash');
        setNotes(inv.notes || '');

        if (res.items && res.items.length > 0) {
          setItems(res.items.map((it, idx) => ({
            id: idx + 1,
            item_id: it.item_id,
            item_name: it.item_name,
            unit: it.unit || 'PCS',
            mrp: it.mrp || 0,
            discount_pct: it.discount_pct || '',
            rate: it.rate || 0,
            qty: it.qty || 1,
            gst_pct: it.gst_pct || 0,
            amount: it.amount || 0
          })));
        }
        setActiveTab('new_bill');
        setFeedback({ type: 'success', message: `Draft #${inv.invoice_no} loaded into editor.` });
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch (e) {
      setFeedback({ type: 'error', message: 'Failed to load draft.' });
    }
  };

  // Filter items for dropdown
  const filteredCatalogItems = catalogItems.filter(item => {
    if (!itemSearchQuery.trim()) return true;
    const q = itemSearchQuery.toLowerCase();
    return (
      (item.item_name || '').toLowerCase().includes(q) ||
      (item.item_code || '').toLowerCase().includes(q)
    );
  });

  const companyName = company?.name || 'VypaarMitra Merchant Store';
  const companyAddress = company?.address || 'Corporate Center, Commercial Hub';
  const companyPhone = company?.phone || '+91 98765 43210';
  const companyEmail = company?.email || 'billing@merchantstore.com';
  const companyGst = company?.gst_number || company?.code || '27AABCU9603R1ZM';

  // UPI payment URI for QR code
  const upiPayUrl = `upi://pay?pa=${encodeURIComponent((company?.code || 'merchant').toLowerCase() + '@upi')}&pn=${encodeURIComponent(companyName)}&am=${grandTotal}&cu=INR&tn=${encodeURIComponent('Bill ' + billNo)}`;
  const upiQrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiPayUrl)}`;

  return (
    <div className="space-y-4 text-slate-800">
      {/* Dynamic Screen/Print Styles */}
      <style>{`
        @media screen {
          .printable-container {
            display: none !important;
          }
        }
        @media print {
          body * {
            visibility: hidden;
          }
          .printable-container, .printable-container * {
            visibility: visible;
          }
          .printable-container {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Top Banner Alert Feedback */}
      {feedback && (
        <div className={`p-3 rounded-xl flex items-center justify-between text-xs font-semibold shadow-sm animate-fade-in ${
          feedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
      )}

      {/* Sub-Navigation Tabs Bar */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 no-print">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('new_bill')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'new_bill'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Bill</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('draft_bills'); fetchInvoices(); }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'draft_bills'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Draft Bills</span>
            {drafts.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 font-extrabold">
                {drafts.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('bill_register'); fetchInvoices(); }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'bill_register'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Bill Register</span>
            {invoices.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-100 text-indigo-800 font-extrabold">
                {invoices.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('stock_items')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'stock_items'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Stock Items</span>
          </button>
        </div>

        <div className="text-[11px] text-slate-500 font-medium">
          Last updated: <span className="text-slate-700 font-semibold">{lastUpdated}</span>
        </div>
      </div>

      {/* VIEW: DRAFT BILLS */}
      {activeTab === 'draft_bills' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4 no-print">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Saved Draft Bills</h3>
              <p className="text-xs text-slate-500">Pick any draft to resume editing or print directly.</p>
            </div>
            <button
              onClick={() => setActiveTab('new_bill')}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-colors"
            >
              + Create New Bill
            </button>
          </div>

          {drafts.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No saved drafts available. When creating a bill, click "Save as draft" to preserve it here.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="p-3">Draft Bill No</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Mobile</th>
                    <th className="p-3">Grand Total</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {drafts.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-bold text-indigo-600">{d.invoice_no}</td>
                      <td className="p-3 text-slate-600">{d.bill_date}</td>
                      <td className="p-3 font-semibold text-slate-800">{d.customer_name}</td>
                      <td className="p-3 text-slate-500">{d.customer_mobile || '--'}</td>
                      <td className="p-3 font-bold text-slate-900">₹{parseFloat(d.grand_total).toFixed(2)}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => loadDraftIntoEditor(d.id)}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium shadow-2xs"
                        >
                          Open & Complete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW: BILL REGISTER */}
      {activeTab === 'bill_register' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4 no-print">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Invoices & Bill Register</h3>
              <p className="text-xs text-slate-500">Historical register of all completed retail sales & POS bills.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchInvoices}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {invoices.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No bills recorded yet. Create and save bills to track your register here.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="p-3">Bill No</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Payment</th>
                    <th className="p-3">Taxable</th>
                    <th className="p-3">GST</th>
                    <th className="p-3">Grand Total</th>
                    <th className="p-3 text-right">Print Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-bold text-indigo-700">{inv.invoice_no}</td>
                      <td className="p-3 text-slate-600">{inv.bill_date}</td>
                      <td className="p-3 font-semibold text-slate-800">
                        {inv.customer_name}
                        {inv.customer_mobile && <span className="block text-[10px] text-slate-400">{inv.customer_mobile}</span>}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {inv.payment_method || 'Cash'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600">₹{parseFloat(inv.taxable_value || 0).toFixed(2)}</td>
                      <td className="p-3 text-slate-600">₹{parseFloat(inv.tax_amount || 0).toFixed(2)}</td>
                      <td className="p-3 font-bold text-slate-900">₹{parseFloat(inv.grand_total).toFixed(2)}</td>
                      <td className="p-3 text-right space-x-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            const full = await apiRequest(`/billing/invoices/${inv.id}`);
                            triggerPrint({ ...full.invoice, items: full.items }, 'a4');
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-md font-medium text-[11px] shadow-2xs"
                        >
                          Print A4
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const full = await apiRequest(`/billing/invoices/${inv.id}`);
                            triggerPrint({ ...full.invoice, items: full.items }, '58mm');
                          }}
                          className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-md font-medium text-[11px]"
                        >
                          Print 58mm
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW: STOCK ITEMS CATALOG */}
      {activeTab === 'stock_items' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4 no-print">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Inventory Stock Catalog</h3>
              <p className="text-xs text-slate-500">Master register of all stock items with custom unit, MRP, rate, and GST %.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowItemModal(true)}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Stock Item</span>
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="p-3">Item Name</th>
                  <th className="p-3">Code / Barcode</th>
                  <th className="p-3">Unit</th>
                  <th className="p-3">MRP</th>
                  <th className="p-3">Rate</th>
                  <th className="p-3">GST %</th>
                  <th className="p-3">In Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {catalogItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-bold text-slate-800">{item.item_name}</td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">{item.item_code || '--'}</td>
                    <td className="p-3 font-semibold text-indigo-600">{item.unit || 'PCS'}</td>
                    <td className="p-3 text-slate-600">₹{parseFloat(item.mrp).toFixed(2)}</td>
                    <td className="p-3 font-bold text-slate-800">₹{parseFloat(item.rate).toFixed(2)}</td>
                    <td className="p-3 text-slate-600">{item.gst_rate}%</td>
                    <td className="p-3 text-slate-600 font-medium">{item.stock_qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW: CREATE NEW BILL (Matching VypaarMitra AI Reference UI Exactly) */}
      {activeTab === 'new_bill' && (
        <div className="space-y-4 no-print">
          {/* Header Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                Create new bill
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Next bill no. <span className="font-bold text-indigo-600">{billNo || 'INV-0001'}</span> · your typing is saved automatically, nothing is lost on refresh.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                className="px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all"
                title="Refresh form"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                <span>Refresh</span>
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={() => handleSaveBill('draft')}
                className="px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all disabled:opacity-50"
              >
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>Save as draft</span>
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={() => handleSaveBill('completed')}
                className="px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5 text-slate-500" />
                <span>Save bill</span>
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={() => handleSaveBill('completed', '58mm')}
                className="px-3.5 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all disabled:opacity-50"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600" />
                <span>Save & print 58mm</span>
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={() => handleSaveBill('completed', 'a4')}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-50"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Save & print A4</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left 2 Cols: Customer & Items */}
            <div className="lg:col-span-2 space-y-4">
              
              {/* CARD 1: Customer Section */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3.5">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Customer
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Type a mobile number or name — saved customers are fetched automatically and new ones are added to your master list.
                  </p>
                </div>

                {/* Customer Row 1: Mobile, Name, Address */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-700 text-[11px]">MOBILE NO.</label>
                      <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.2 rounded">
                        {mobileLookupLoading ? 'fetching...' : 'auto-fetch'}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={customerMobile}
                      onChange={(e) => handleMobileChange(e.target.value)}
                      placeholder="9876543210"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-700 text-[11px]">CUSTOMER NAME</label>
                    </div>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Walk-in Customer"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-700 text-[11px]">ADDRESS</label>
                      <span className="text-[10px] text-slate-400">printed on the bill</span>
                    </div>
                    <input
                      type="text"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      placeholder="Delivery or billing address"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Customer Row 2: Date, Bill No, Print Size, Payment Method */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                  <div>
                    <label className="font-bold text-slate-700 text-[11px] block mb-1">BILL DATE</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={billDate}
                        onChange={(e) => setBillDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-700 text-[11px]">BILL NO.</label>
                      <span className="text-[10px] text-slate-400">auto if blank</span>
                    </div>
                    <input
                      type="text"
                      value={billNo}
                      onChange={(e) => setBillNo(e.target.value)}
                      placeholder="INV-0001"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold text-indigo-700 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 text-[11px] block mb-1">PRINT SIZE</label>
                    <select
                      value={printSize}
                      onChange={(e) => setPrintSize(e.target.value)}
                      className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                    >
                      <option value="A4 smart invoice">A4 smart invoice</option>
                      <option value="58mm thermal bill">58mm thermal bill</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 text-[11px] block mb-1">PAYMENT METHOD</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white font-medium"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Online / UPI">Online / UPI</option>
                      <option value="Card">Card</option>
                      <option value="Credit / Khatabook">Credit / Khatabook</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* CARD 2: Items Table with Auto-Fetch */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Items
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Pick a stock item and every column fills in by itself. Leave Discount % blank and the MRP is charged as the rate. Unit accepts your own custom units from the stock register.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddRow}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add row</span>
                  </button>
                </div>

                {/* Items Table */}
                <div className="overflow-visible border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10.5px] uppercase font-bold text-slate-500">
                      <tr>
                        <th className="p-2.5 w-[34%]">ITEM</th>
                        <th className="p-2.5 w-[11%]">UNIT</th>
                        <th className="p-2.5 w-[10%] text-right">MRP</th>
                        <th className="p-2.5 w-[9%] text-right">DISC %</th>
                        <th className="p-2.5 w-[11%] text-right">RATE</th>
                        <th className="p-2.5 w-[9%] text-center">QTY</th>
                        <th className="p-2.5 w-[8%] text-center">GST %</th>
                        <th className="p-2.5 w-[13%] text-right">AMOUNT</th>
                        <th className="p-2.5 w-[5%] text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((row, idx) => (
                        <tr key={row.id || idx} className="hover:bg-slate-50/60 transition-colors">
                          {/* Item Name Input with Auto-Dropdown */}
                          <td className="p-2 relative">
                            <input
                              type="text"
                              value={row.item_name}
                              onFocus={() => {
                                setActiveItemDropdownRow(idx);
                                setItemSearchQuery(row.item_name || '');
                              }}
                              onChange={(e) => updateRow(idx, 'item_name', e.target.value)}
                              placeholder="Click to see all items or type"
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 font-medium"
                            />

                            {/* Dropdown for stock item auto-fetch */}
                            {activeItemDropdownRow === idx && (
                              <div
                                className="absolute left-2 right-2 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-56 overflow-y-auto"
                                onMouseDown={(e) => e.preventDefault()} // Prevent blur before click
                              >
                                <div className="p-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                                  <span className="font-semibold">Select Stock Item (Auto-fills all columns)</span>
                                  <button
                                    type="button"
                                    onClick={() => setActiveItemDropdownRow(null)}
                                    className="text-slate-400 hover:text-slate-700"
                                  >
                                    ✕
                                  </button>
                                </div>

                                {filteredCatalogItems.length === 0 ? (
                                  <div className="p-3 text-center text-slate-400 text-xs">
                                    No matching stock items found.
                                  </div>
                                ) : (
                                  filteredCatalogItems.map((catItem) => (
                                    <div
                                      key={catItem.id}
                                      onClick={() => selectCatalogItem(idx, catItem)}
                                      className="p-2.5 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0 flex items-center justify-between transition-colors"
                                    >
                                      <div>
                                        <div className="font-bold text-slate-800">{catItem.item_name}</div>
                                        <div className="text-[10px] text-slate-400">
                                          Code: {catItem.item_code || '--'} · Unit: <b className="text-indigo-600">{catItem.unit}</b>
                                        </div>
                                      </div>
                                      <div className="text-right text-[11px]">
                                        <div className="font-extrabold text-slate-900">₹{parseFloat(catItem.rate).toFixed(2)}</div>
                                        <div className="text-[10px] text-slate-400">MRP: ₹{parseFloat(catItem.mrp).toFixed(2)} · GST: {catItem.gst_rate}%</div>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </td>

                          {/* Unit */}
                          <td className="p-2">
                            <input
                              type="text"
                              value={row.unit}
                              onChange={(e) => updateRow(idx, 'unit', e.target.value.toUpperCase())}
                              placeholder="PCS"
                              className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs uppercase font-semibold text-slate-700 focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>

                          {/* MRP */}
                          <td className="p-2">
                            <input
                              type="number"
                              step="0.01"
                              value={row.mrp === 0 ? '' : row.mrp}
                              onChange={(e) => updateRow(idx, 'mrp', e.target.value)}
                              placeholder="0.00"
                              className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs text-right font-medium focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>

                          {/* Discount % */}
                          <td className="p-2">
                            <input
                              type="number"
                              step="0.1"
                              value={row.discount_pct}
                              onChange={(e) => updateRow(idx, 'discount_pct', e.target.value)}
                              placeholder="0"
                              className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs text-right focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>

                          {/* Rate */}
                          <td className="p-2">
                            <input
                              type="number"
                              step="0.01"
                              value={row.rate === 0 ? '' : row.rate}
                              onChange={(e) => updateRow(idx, 'rate', e.target.value)}
                              placeholder="0.00"
                              className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs text-right font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>

                          {/* Qty */}
                          <td className="p-2">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={row.qty}
                              onChange={(e) => updateRow(idx, 'qty', e.target.value)}
                              className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs text-center font-bold focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>

                          {/* GST % */}
                          <td className="p-2">
                            <select
                              value={row.gst_pct}
                              onChange={(e) => updateRow(idx, 'gst_pct', e.target.value)}
                              className="w-full px-1 py-1.5 border border-slate-300 rounded-lg text-xs text-center bg-white font-medium"
                            >
                              <option value="0">0%</option>
                              <option value="5">5%</option>
                              <option value="12">12%</option>
                              <option value="18">18%</option>
                              <option value="28">28%</option>
                            </select>
                          </td>

                          {/* Amount */}
                          <td className="p-2 text-right font-bold text-slate-900 pr-3">
                            ₹{parseFloat(row.amount || 0).toFixed(2)}
                          </td>

                          {/* Delete */}
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(idx)}
                              className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              title="Delete row"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* CARD 3: Notes on Bill */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1.5">
                <label className="font-bold text-[11px] uppercase tracking-wider text-slate-700 block">
                  NOTES ON THE BILL (OPTIONAL)
                </label>
                <textarea
                  rows="2"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Delivery instructions, warranty note, etc."
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs focus:ring-1 focus:ring-indigo-500"
                ></textarea>
              </div>
            </div>

            {/* Right 1 Col: Summary & Print Card */}
            <div className="space-y-4">
              
              {/* CARD: Bill summary */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-2">
                  Bill summary
                </h3>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Taxable value</span>
                    <span className="font-semibold text-slate-800">₹{taxableValue.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between text-slate-600">
                    <span>GST (Tax amount)</span>
                    <span className="font-semibold text-slate-800">₹{taxAmount.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between text-sm font-extrabold text-slate-900 pt-2 border-t border-slate-100">
                    <span>Grand total</span>
                    <span className="text-base text-indigo-700">₹{grandTotal.toFixed(2)}</span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl leading-relaxed">
                  Full payment of <b>₹{grandTotal.toFixed(2)}</b> received by <b>{paymentMethod}</b>. Choose "Pending / Credit" to enter a part payment and send the balance to khatabook.
                </p>

                <div className="text-[11px] text-slate-600 pt-1">
                  <span className="font-bold text-slate-700 block">In words:</span>
                  <span className="italic text-slate-500 font-medium">{inWords}</span>
                </div>
              </div>

              {/* CARD: Print */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Print
                  </h3>
                  <p className="text-[11px] text-slate-400">Printed copies</p>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => triggerPrint(null, 'a4')}
                    className="w-full py-2 px-3 rounded-xl border border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-2xs"
                  >
                    <Printer className="w-4 h-4 text-indigo-600" />
                    <span>A4 smart invoice (watermarked)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerPrint(null, '58mm')}
                    className="w-full py-2 px-3 rounded-xl border border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-2xs"
                  >
                    <Printer className="w-4 h-4 text-slate-600" />
                    <span>58mm thermal bill</span>
                  </button>
                </div>

                <p className="text-[10px] text-slate-400 leading-relaxed pt-1">
                  The A4 invoice carries your business name as a watermark on every page and a UPI QR pre-filled with the amount due.
                </p>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD STOCK ITEM */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs no-print">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
              Add Inventory Stock Item
            </h3>

            <form onSubmit={handleCreateCatalogItem} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Item Full Name *</label>
                <input
                  type="text"
                  required
                  value={newItem.item_name}
                  onChange={(e) => setNewItem({ ...newItem, item_name: e.target.value })}
                  placeholder="e.g. A4 Paper Ream (75 GSM)"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Item Code / Barcode</label>
                  <input
                    type="text"
                    value={newItem.item_code}
                    onChange={(e) => setNewItem({ ...newItem, item_code: e.target.value })}
                    placeholder="PAP-001"
                    className="w-full px-3 py-2 border rounded-lg uppercase focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Unit *</label>
                  <input
                    type="text"
                    required
                    value={newItem.unit}
                    onChange={(e) => setNewItem({ ...newItem, unit: e.target.value.toUpperCase() })}
                    placeholder="PCS, DOZ, REAM, ROLL"
                    className="w-full px-3 py-2 border rounded-lg uppercase font-bold focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">MRP (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newItem.mrp}
                    onChange={(e) => setNewItem({ ...newItem, mrp: e.target.value })}
                    placeholder="120.00"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Selling Rate (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newItem.rate}
                    onChange={(e) => setNewItem({ ...newItem, rate: e.target.value })}
                    placeholder="100.00"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">GST Rate (%)</label>
                  <select
                    value={newItem.gst_rate}
                    onChange={(e) => setNewItem({ ...newItem, gst_rate: e.target.value })}
                    className="w-full px-2 py-2 border rounded-lg bg-white"
                  >
                    <option value="0">0%</option>
                    <option value="5">5%</option>
                    <option value="12">12%</option>
                    <option value="18">18%</option>
                    <option value="28">28%</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-xs"
                >
                  Save Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PRINTABLE CONTAINER: A4 SMART INVOICE (WATERMARKED WITH UPI QR)           */}
      {/* ========================================================================= */}
      <div id="printable-a4-invoice" className={`printable-container ${printMode === 'a4' ? '!block' : '!hidden'}`}>
        <div className="relative bg-white p-8 max-w-[800px] mx-auto text-slate-900 font-sans min-h-[1050px] border border-slate-200">
          
          {/* Faint Watermark of Business Name Across Page */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden opacity-[0.04] z-0">
            <span className="text-[72px] font-black uppercase tracking-widest rotate-[-30deg] whitespace-nowrap text-slate-900">
              {companyName}
            </span>
          </div>

          <div className="relative z-10 space-y-6">
            {/* Header / Branding */}
            <div className="flex items-start justify-between border-b-2 border-indigo-600 pb-4">
              <div>
                <h1 className="text-2xl font-black uppercase tracking-tight text-indigo-900">{companyName}</h1>
                <p className="text-xs text-slate-600 mt-1 max-w-sm">{companyAddress}</p>
                <p className="text-xs text-slate-600">Phone: {companyPhone} · Email: {companyEmail}</p>
                <p className="text-xs font-bold text-slate-800 mt-1">GSTIN: {companyGst}</p>
              </div>

              <div className="text-right">
                <span className="inline-block px-3 py-1 bg-indigo-50 border border-indigo-200 rounded-md text-xs font-black tracking-wider text-indigo-700 uppercase">
                  Tax Invoice
                </span>
                <div className="mt-2 text-xs space-y-0.5">
                  <div><b>Invoice No:</b> <span className="font-mono text-indigo-700 font-bold">{activeInvoiceForPrint?.invoice_no || billNo}</span></div>
                  <div><b>Date:</b> {activeInvoiceForPrint?.bill_date || billDate}</div>
                  <div><b>Payment:</b> {activeInvoiceForPrint?.payment_method || paymentMethod}</div>
                </div>
              </div>
            </div>

            {/* Billed To (Customer Details) */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs grid grid-cols-2 gap-4">
              <div>
                <span className="font-bold uppercase tracking-wider text-[10px] text-slate-500 block mb-1">Billed To</span>
                <div className="font-bold text-slate-900 text-sm">{activeInvoiceForPrint?.customer_name || customerName}</div>
                <div className="text-slate-600">Mobile: {activeInvoiceForPrint?.customer_mobile || customerMobile || '--'}</div>
                <div className="text-slate-600">Address: {activeInvoiceForPrint?.customer_address || customerAddress || '--'}</div>
              </div>

              <div className="text-right flex flex-col justify-end">
                <div className="text-[11px] text-slate-500">Place of Supply: State Jurisdiction</div>
                <div className="text-[11px] text-slate-500">Reverse Charge: No</div>
              </div>
            </div>

            {/* Line Items Table */}
            <table className="w-full text-left text-xs border border-slate-300">
              <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                <tr>
                  <th className="p-2 border-r border-slate-300 w-8 text-center">#</th>
                  <th className="p-2 border-r border-slate-300">Item Description</th>
                  <th className="p-2 border-r border-slate-300 text-center w-16">Unit</th>
                  <th className="p-2 border-r border-slate-300 text-right w-16">MRP</th>
                  <th className="p-2 border-r border-slate-300 text-right w-16">Rate</th>
                  <th className="p-2 border-r border-slate-300 text-center w-12">Qty</th>
                  <th className="p-2 border-r border-slate-300 text-right w-16">Taxable</th>
                  <th className="p-2 border-r border-slate-300 text-center w-14">GST %</th>
                  <th className="p-2 text-right w-20">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {((activeInvoiceForPrint?.items) || items).map((it, idx) => {
                  const mrp = parseFloat(it.mrp) || 0;
                  const rate = parseFloat(it.rate) || mrp;
                  const qty = parseFloat(it.qty) || 1;
                  const gst = parseFloat(it.gst_pct) || 0;
                  const taxable = rate * qty;
                  const amt = taxable + (taxable * (gst / 100));

                  return (
                    <tr key={idx}>
                      <td className="p-2 border-r border-slate-300 text-center text-slate-500">{idx + 1}</td>
                      <td className="p-2 border-r border-slate-300 font-semibold text-slate-900">{it.item_name}</td>
                      <td className="p-2 border-r border-slate-300 text-center text-slate-600">{it.unit || 'PCS'}</td>
                      <td className="p-2 border-r border-slate-300 text-right text-slate-600">₹{mrp.toFixed(2)}</td>
                      <td className="p-2 border-r border-slate-300 text-right font-medium">₹{rate.toFixed(2)}</td>
                      <td className="p-2 border-r border-slate-300 text-center font-bold">{qty}</td>
                      <td className="p-2 border-r border-slate-300 text-right">₹{taxable.toFixed(2)}</td>
                      <td className="p-2 border-r border-slate-300 text-center text-slate-600">{gst}%</td>
                      <td className="p-2 text-right font-bold text-slate-900">₹{amt.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Calculations and UPI QR Code Section */}
            <div className="grid grid-cols-2 gap-6 pt-2">
              {/* Left: UPI QR Code & Notes */}
              <div className="space-y-3">
                <div className="p-3 border border-slate-200 rounded-lg flex items-center gap-3 bg-slate-50/50">
                  <img
                    src={upiQrImageUrl}
                    alt="Scan & Pay UPI QR"
                    className="w-24 h-24 rounded border border-slate-200 p-1 bg-white"
                  />
                  <div className="text-xs space-y-1">
                    <div className="font-bold text-slate-900 flex items-center gap-1">
                      <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Scan & Pay via UPI</span>
                    </div>
                    <div className="text-[11px] text-slate-600">Scan using GPay, PhonePe, Paytm, BHIM</div>
                    <div className="font-mono text-[10px] text-indigo-700 font-bold">Amount: ₹{(activeInvoiceForPrint?.grand_total || grandTotal).toFixed(2)}</div>
                  </div>
                </div>

                {(activeInvoiceForPrint?.notes || notes) && (
                  <div className="text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="font-bold text-slate-700 block text-[10px] uppercase">Notes</span>
                    <span className="text-slate-600">{activeInvoiceForPrint?.notes || notes}</span>
                  </div>
                )}
              </div>

              {/* Right: Totals Table */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Total Taxable Value</span>
                  <span className="font-semibold">₹{(activeInvoiceForPrint?.taxable_value || taxableValue).toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Total GST Amount</span>
                  <span className="font-semibold">₹{(activeInvoiceForPrint?.tax_amount || taxAmount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-2 border-t-2 border-indigo-600 text-sm font-extrabold text-slate-900">
                  <span>Grand Total</span>
                  <span className="text-indigo-700">₹{(activeInvoiceForPrint?.grand_total || grandTotal).toFixed(2)}</span>
                </div>
                <div className="text-[11px] text-slate-600">
                  <span className="font-bold text-slate-700">Amount in words:</span>{' '}
                  <span className="italic">{activeInvoiceForPrint?.in_words || inWords}</span>
                </div>
              </div>
            </div>

            {/* Footer / Terms and Signature */}
            <div className="pt-8 border-t border-slate-200 flex items-end justify-between text-xs">
              <div className="text-[10px] text-slate-500 max-w-sm space-y-0.5">
                <div className="font-bold text-slate-700">Terms & Conditions:</div>
                <div>1. Goods once sold will not be taken back without valid bill.</div>
                <div>2. Subject to local state jurisdiction.</div>
                <div>3. This is a computer generated invoice.</div>
              </div>

              <div className="text-center">
                <div className="w-36 border-b border-slate-400 mb-1"></div>
                <div className="font-bold text-slate-800 text-[11px]">Authorized Signatory</div>
                <div className="text-[10px] text-slate-500">for {companyName}</div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PRINTABLE CONTAINER: 58MM THERMAL BILL (COMPACT POS RECEIPT)              */}
      {/* ========================================================================= */}
      <div id="printable-thermal-58mm" className={`printable-container ${printMode === '58mm' ? '!block' : '!hidden'}`}>
        <div className="bg-white p-2 mx-auto text-slate-950 font-mono text-[11px] leading-tight max-w-[240px]">
          {/* Header */}
          <div className="text-center space-y-0.5">
            <div className="font-extrabold text-[13px] uppercase">{companyName}</div>
            <div className="text-[10px]">{companyAddress}</div>
            <div className="text-[10px]">Ph: {companyPhone}</div>
            {companyGst && <div className="text-[10px]">GSTIN: {companyGst}</div>}
          </div>

          <div className="my-1.5 border-t border-dashed border-slate-400"></div>

          {/* Metadata */}
          <div className="text-[10px] space-y-0.5">
            <div><b>Bill:</b> {activeInvoiceForPrint?.invoice_no || billNo}</div>
            <div><b>Date:</b> {activeInvoiceForPrint?.bill_date || billDate}</div>
            <div><b>Customer:</b> {activeInvoiceForPrint?.customer_name || customerName}</div>
            {customerMobile && <div><b>Mobile:</b> {activeInvoiceForPrint?.customer_mobile || customerMobile}</div>}
            <div><b>Mode:</b> {activeInvoiceForPrint?.payment_method || paymentMethod}</div>
          </div>

          <div className="my-1.5 border-t border-dashed border-slate-400"></div>

          {/* Items Header */}
          <div className="flex justify-between font-bold text-[10px]">
            <span>ITEM</span>
            <span>QTY x RATE</span>
            <span>AMT</span>
          </div>

          <div className="my-1 border-t border-slate-300"></div>

          {/* Items list */}
          <div className="space-y-1 text-[10px]">
            {((activeInvoiceForPrint?.items) || items).map((it, idx) => {
              const rate = parseFloat(it.rate) || parseFloat(it.mrp) || 0;
              const qty = parseFloat(it.qty) || 1;
              const amt = parseFloat(it.amount) || (rate * qty);
              return (
                <div key={idx} className="space-y-0.5">
                  <div className="font-bold truncate">{it.item_name}</div>
                  <div className="flex justify-between text-slate-700">
                    <span>{qty} {it.unit || 'PCS'} x ₹{rate.toFixed(2)}</span>
                    <span className="font-semibold text-slate-950">₹{amt.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="my-1.5 border-t border-dashed border-slate-400"></div>

          {/* Totals */}
          <div className="space-y-0.5 text-[10px]">
            <div className="flex justify-between">
              <span>Taxable Val:</span>
              <span>₹{(activeInvoiceForPrint?.taxable_value || taxableValue).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>GST Total:</span>
              <span>₹{(activeInvoiceForPrint?.tax_amount || taxAmount).toFixed(2)}</span>
            </div>
            <div className="my-1 border-t border-slate-400"></div>
            <div className="flex justify-between font-extrabold text-[12px]">
              <span>GRAND TOTAL:</span>
              <span>₹{(activeInvoiceForPrint?.grand_total || grandTotal).toFixed(2)}</span>
            </div>
          </div>

          <div className="my-1.5 border-t border-dashed border-slate-400"></div>

          {/* Compact UPI QR for scan & pay */}
          <div className="text-center space-y-1 py-1">
            <img
              src={upiQrImageUrl}
              alt="UPI QR"
              className="w-20 h-20 mx-auto rounded border border-slate-300 p-0.5"
            />
            <div className="text-[9px] font-bold">SCAN & PAY VIA UPI</div>
          </div>

          <div className="my-1 border-t border-dashed border-slate-400"></div>

          {/* Receipt Footer */}
          <div className="text-center text-[9px] text-slate-600 space-y-0.5">
            <div>*** THANK YOU! VISIT AGAIN ***</div>
            <div>Powered by VypaarMitra POS</div>
          </div>
        </div>
      </div>

    </div>
  );
}
