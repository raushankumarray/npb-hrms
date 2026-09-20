const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyAuth } = require('../middleware/auth');
const { logAudit } = require('../services/audit');

// 1. Initialize Tables for Merchant & Billing
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS billing_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      item_code TEXT,
      unit TEXT DEFAULT 'PCS',
      mrp REAL DEFAULT 0,
      rate REAL DEFAULT 0,
      gst_rate REAL DEFAULT 0,
      stock_qty REAL DEFAULT 100,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_billing_items_comp ON billing_items(company_id, item_name);

    CREATE TABLE IF NOT EXISTS billing_customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      mobile TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, mobile),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_billing_customers_comp_mob ON billing_customers(company_id, mobile);

    CREATE TABLE IF NOT EXISTS billing_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      invoice_no TEXT NOT NULL,
      bill_date DATE NOT NULL,
      customer_mobile TEXT,
      customer_name TEXT,
      customer_address TEXT,
      print_size TEXT DEFAULT 'A4 smart invoice',
      payment_method TEXT DEFAULT 'Cash',
      notes TEXT,
      taxable_value REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      grand_total REAL DEFAULT 0,
      in_words TEXT,
      status TEXT DEFAULT 'completed' CHECK(status IN ('completed', 'draft', 'cancelled')),
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, invoice_no),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_billing_invoices_comp ON billing_invoices(company_id, bill_date);

    CREATE TABLE IF NOT EXISTS billing_invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      item_id INTEGER,
      item_name TEXT NOT NULL,
      unit TEXT DEFAULT 'PCS',
      mrp REAL DEFAULT 0,
      discount_pct REAL DEFAULT 0,
      rate REAL DEFAULT 0,
      qty REAL DEFAULT 1,
      gst_pct REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      FOREIGN KEY (invoice_id) REFERENCES billing_invoices(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_billing_inv_items_inv ON billing_invoice_items(invoice_id);
  `);
} catch (e) {
  console.warn('Billing tables initialization notice:', e.message);
}

// Helper: Pre-seed standard retail inventory catalog if company has 0 items
function ensureCompanyStockItems(companyId) {
  if (!companyId) return;
  const count = db.prepare('SELECT COUNT(*) as c FROM billing_items WHERE company_id = ?').get(companyId).c;
  if (count === 0) {
    const defaultCatalog = [
      { name: 'A4 Copier Paper (75 GSM 500 Sheets)', code: 'PAP-001', unit: 'REAM', mrp: 320.00, rate: 280.00, gst: 12 },
      { name: 'Ballpoint Pen Blue Pack (10 Pcs)', code: 'PEN-010', unit: 'PKT', mrp: 100.00, rate: 85.00, gst: 18 },
      { name: 'Thermal Receipt Paper Roll 58mm', code: 'THM-058', unit: 'ROLL', mrp: 45.00, rate: 35.00, gst: 18 },
      { name: 'Wireless Optical Mouse USB', code: 'MOU-002', unit: 'PCS', mrp: 450.00, rate: 380.00, gst: 18 },
      { name: 'USB Flash Drive 32GB 3.0', code: 'USB-032', unit: 'PCS', mrp: 550.00, rate: 420.00, gst: 18 },
      { name: 'Standard Office Stapler No. 10', code: 'STP-010', unit: 'PCS', mrp: 85.00, rate: 70.00, gst: 12 },
      { name: 'Sticky Notes Neon 3x3 (100 Sheets)', code: 'STK-003', unit: 'PAD', mrp: 50.00, rate: 40.00, gst: 12 },
      { name: 'Standard Box Files Board Quality', code: 'BOX-012', unit: 'DOZ', mrp: 720.00, rate: 600.00, gst: 18 },
      { name: 'Permanent Marker Bullet Tip (10 Pcs)', code: 'MRK-010', unit: 'BOX', mrp: 250.00, rate: 210.00, gst: 18 },
      { name: 'Whiteboard Magnetic Duster', code: 'DST-001', unit: 'PCS', mrp: 60.00, rate: 50.00, gst: 12 },
      { name: 'Executive Spiral Notebook A5', code: 'NTB-005', unit: 'PCS', mrp: 120.00, rate: 95.00, gst: 12 },
      { name: 'Transparent Cello Tape 2 Inch', code: 'TAP-002', unit: 'ROLL', mrp: 55.00, rate: 42.00, gst: 18 }
    ];

    const insert = db.prepare(`
      INSERT INTO billing_items (company_id, item_name, item_code, unit, mrp, rate, gst_rate, stock_qty)
      VALUES (?, ?, ?, ?, ?, ?, ?, 100)
    `);

    const tx = db.transaction(() => {
      for (const itm of defaultCatalog) {
        insert.run(companyId, itm.name, itm.code, itm.unit, itm.mrp, itm.rate, itm.gst);
      }
    });
    tx();
  }
}

// -------------------------------------------------------------
// Stock Items Endpoints
// -------------------------------------------------------------

// GET /api/billing/items - Auto-fetch all stock items for autocomplete
router.get('/items', verifyAuth, (req, res) => {
  const companyId = req.user.company_id || (req.user.company ? req.user.company.id : null);
  if (!companyId) {
    return res.status(400).json({ error: 'Company ID is required.' });
  }

  ensureCompanyStockItems(companyId);

  const { q } = req.query;
  let items;
  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    items = db.prepare(`
      SELECT * FROM billing_items
      WHERE company_id = ? AND (item_name LIKE ? OR item_code LIKE ?)
      ORDER BY item_name ASC
    `).all(companyId, term, term);
  } else {
    items = db.prepare(`
      SELECT * FROM billing_items
      WHERE company_id = ?
      ORDER BY item_name ASC
    `).all(companyId);
  }

  res.json({ items });
});

// POST /api/billing/items - Create or update a stock item
router.post('/items', verifyAuth, (req, res) => {
  const companyId = req.user.company_id || (req.user.company ? req.user.company.id : null);
  if (!companyId) {
    return res.status(400).json({ error: 'Company ID is required.' });
  }

  const { id, item_name, item_code, unit, mrp, rate, gst_rate, stock_qty } = req.body;
  if (!item_name || !item_name.trim()) {
    return res.status(400).json({ error: 'Item name is required.' });
  }

  const numMrp = parseFloat(mrp) || 0;
  const numRate = parseFloat(rate) || numMrp;
  const numGst = parseFloat(gst_rate) || 0;
  const numQty = parseFloat(stock_qty) || 0;
  const cleanUnit = (unit || 'PCS').toUpperCase().trim();

  if (id) {
    db.prepare(`
      UPDATE billing_items
      SET item_name = ?, item_code = ?, unit = ?, mrp = ?, rate = ?, gst_rate = ?, stock_qty = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND company_id = ?
    `).run(item_name.trim(), item_code || null, cleanUnit, numMrp, numRate, numGst, numQty, id, companyId);
    return res.json({ success: true, message: 'Item updated successfully.' });
  } else {
    const result = db.prepare(`
      INSERT INTO billing_items (company_id, item_name, item_code, unit, mrp, rate, gst_rate, stock_qty)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(companyId, item_name.trim(), item_code || null, cleanUnit, numMrp, numRate, numGst, numQty);
    return res.json({ success: true, id: result.lastInsertRowid, message: 'Item added to catalog.' });
  }
});

// DELETE /api/billing/items/:id - Remove item
router.delete('/items/:id', verifyAuth, (req, res) => {
  const companyId = req.user.company_id || (req.user.company ? req.user.company.id : null);
  db.prepare('DELETE FROM billing_items WHERE id = ? AND company_id = ?').run(req.params.id, companyId);
  res.json({ success: true, message: 'Item deleted.' });
});

// -------------------------------------------------------------
// Customers Endpoints
// -------------------------------------------------------------

// GET /api/billing/customers - Auto-fetch customers by mobile number or name
router.get('/customers', verifyAuth, (req, res) => {
  const companyId = req.user.company_id || (req.user.company ? req.user.company.id : null);
  if (!companyId) return res.status(400).json({ error: 'Company ID required.' });

  const { mobile, q } = req.query;
  if (mobile) {
    const customer = db.prepare(`
      SELECT * FROM billing_customers
      WHERE company_id = ? AND mobile = ?
      LIMIT 1
    `).get(companyId, mobile.trim());
    return res.json({ customer: customer || null });
  }

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    const customers = db.prepare(`
      SELECT * FROM billing_customers
      WHERE company_id = ? AND (mobile LIKE ? OR name LIKE ?)
      ORDER BY updated_at DESC LIMIT 20
    `).all(companyId, term, term);
    return res.json({ customers });
  }

  const customers = db.prepare(`
    SELECT * FROM billing_customers
    WHERE company_id = ?
    ORDER BY updated_at DESC LIMIT 50
  `).all(companyId);
  res.json({ customers });
});

// -------------------------------------------------------------
// Invoices Endpoints
// -------------------------------------------------------------

// GET /api/billing/invoices/next-number - Get next sequential invoice number e.g. INV-0001
router.get('/invoices/next-number', verifyAuth, (req, res) => {
  const companyId = req.user.company_id || (req.user.company ? req.user.company.id : null);
  if (!companyId) return res.status(400).json({ error: 'Company ID required.' });

  const lastInv = db.prepare(`
    SELECT invoice_no FROM billing_invoices
    WHERE company_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(companyId);

  let nextNum = 1;
  if (lastInv && lastInv.invoice_no) {
    const match = lastInv.invoice_no.match(/(\d+)$/);
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }

  const nextNumber = `INV-${String(nextNum).padStart(4, '0')}`;
  res.json({ nextNumber });
});

// POST /api/billing/invoices - Save bill or draft
router.post('/invoices', verifyAuth, (req, res) => {
  const companyId = req.user.company_id || (req.user.company ? req.user.company.id : null);
  if (!companyId) return res.status(400).json({ error: 'Company ID required.' });

  const {
    invoice_no,
    bill_date,
    customer_mobile,
    customer_name,
    customer_address,
    print_size,
    payment_method,
    notes,
    items = [],
    taxable_value,
    tax_amount,
    grand_total,
    in_words,
    status = 'completed'
  } = req.body;

  // Auto-generate invoice number if blank
  let finalInvNo = (invoice_no || '').trim();
  if (!finalInvNo) {
    const lastInv = db.prepare('SELECT invoice_no FROM billing_invoices WHERE company_id = ? ORDER BY id DESC LIMIT 1').get(companyId);
    let n = 1;
    if (lastInv && lastInv.invoice_no) {
      const match = lastInv.invoice_no.match(/(\d+)$/);
      if (match) n = parseInt(match[1], 10) + 1;
    }
    finalInvNo = `INV-${String(n).padStart(4, '0')}`;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const finalDate = bill_date || todayStr;
  const finalCustMob = (customer_mobile || '').trim();
  const finalCustName = (customer_name || 'Walk-in Customer').trim();

  // Save or update customer in directory if mobile is provided
  if (finalCustMob && finalCustMob.length >= 5) {
    try {
      db.prepare(`
        INSERT INTO billing_customers (company_id, mobile, name, address, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(company_id, mobile) DO UPDATE SET
          name = excluded.name,
          address = COALESCE(excluded.address, billing_customers.address),
          updated_at = CURRENT_TIMESTAMP
      `).run(companyId, finalCustMob, finalCustName, customer_address || '');
    } catch (e) {
      console.warn('Customer auto-save note:', e.message);
    }
  }

  // Insert invoice & line items in a transaction
  let invoiceId;
  const tx = db.transaction(() => {
    // Check if updating existing draft / invoice with same invoice_no
    const existing = db.prepare('SELECT id FROM billing_invoices WHERE company_id = ? AND invoice_no = ?').get(companyId, finalInvNo);
    if (existing) {
      invoiceId = existing.id;
      db.prepare(`
        UPDATE billing_invoices SET
          bill_date = ?, customer_mobile = ?, customer_name = ?, customer_address = ?,
          print_size = ?, payment_method = ?, notes = ?, taxable_value = ?, tax_amount = ?,
          grand_total = ?, in_words = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        finalDate, finalCustMob, finalCustName, customer_address || '',
        print_size || 'A4 smart invoice', payment_method || 'Cash', notes || '',
        taxable_value || 0, tax_amount || 0, grand_total || 0, in_words || '',
        status, invoiceId
      );
      // Clear previous items to re-insert
      db.prepare('DELETE FROM billing_invoice_items WHERE invoice_id = ?').run(invoiceId);
    } else {
      const ins = db.prepare(`
        INSERT INTO billing_invoices (
          company_id, invoice_no, bill_date, customer_mobile, customer_name, customer_address,
          print_size, payment_method, notes, taxable_value, tax_amount, grand_total, in_words,
          status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        companyId, finalInvNo, finalDate, finalCustMob, finalCustName, customer_address || '',
        print_size || 'A4 smart invoice', payment_method || 'Cash', notes || '',
        taxable_value || 0, tax_amount || 0, grand_total || 0, in_words || '',
        status, req.user.id
      );
      invoiceId = ins.lastInsertRowid;
    }

    const insertItem = db.prepare(`
      INSERT INTO billing_invoice_items (
        invoice_id, item_id, item_name, unit, mrp, discount_pct, rate, qty, gst_pct, amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of items) {
      if (!item.item_name || !item.item_name.trim()) continue;
      insertItem.run(
        invoiceId,
        item.item_id || null,
        item.item_name.trim(),
        item.unit || 'PCS',
        parseFloat(item.mrp) || 0,
        parseFloat(item.discount_pct) || 0,
        parseFloat(item.rate) || 0,
        parseFloat(item.qty) || 1,
        parseFloat(item.gst_pct) || 0,
        parseFloat(item.amount) || 0
      );
    }

    logAudit({
      companyId,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name || req.user.role,
      panel: 'Merchant Billing',
      action: status === 'draft' ? 'INVOICE_DRAFT_SAVED' : 'INVOICE_CREATED',
      targetEntity: 'billing_invoices',
      targetId: invoiceId,
      newValues: { invoice_no: finalInvNo, grand_total, customer_name: finalCustName },
      reason: status === 'draft' ? 'Draft invoice saved' : 'Point of sale bill created'
    });
  });

  tx();

  res.json({
    success: true,
    invoiceId,
    invoiceNo: finalInvNo,
    message: status === 'draft' ? 'Bill saved as draft.' : 'Bill saved successfully!'
  });
});

// GET /api/billing/invoices - List invoices / drafts
router.get('/invoices', verifyAuth, (req, res) => {
  const companyId = req.user.company_id || (req.user.company ? req.user.company.id : null);
  if (!companyId) return res.status(400).json({ error: 'Company ID required.' });

  const { status, q, date } = req.query;
  let sql = 'SELECT * FROM billing_invoices WHERE company_id = ?';
  const params = [companyId];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (date) {
    sql += ' AND bill_date = ?';
    params.push(date);
  }
  if (q && q.trim()) {
    sql += ' AND (invoice_no LIKE ? OR customer_name LIKE ? OR customer_mobile LIKE ?)';
    const term = `%${q.trim()}%`;
    params.push(term, term, term);
  }

  sql += ' ORDER BY id DESC LIMIT 100';

  const invoices = db.prepare(sql).all(...params);
  res.json({ invoices });
});

// GET /api/billing/invoices/:id - Get full invoice with line items
router.get('/invoices/:id', verifyAuth, (req, res) => {
  const companyId = req.user.company_id || (req.user.company ? req.user.company.id : null);
  const invoice = db.prepare('SELECT * FROM billing_invoices WHERE id = ? AND company_id = ?').get(req.params.id, companyId);
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found.' });
  }

  const items = db.prepare('SELECT * FROM billing_invoice_items WHERE invoice_id = ?').all(invoice.id);
  res.json({ invoice, items });
});

// DELETE /api/billing/invoices/:id - Delete an invoice
router.delete('/invoices/:id', verifyAuth, (req, res) => {
  const companyId = req.user.company_id || (req.user.company ? req.user.company.id : null);
  db.prepare('DELETE FROM billing_invoices WHERE id = ? AND company_id = ?').run(req.params.id, companyId);
  res.json({ success: true, message: 'Invoice removed.' });
});

module.exports = router;
