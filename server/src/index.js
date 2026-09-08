const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const { seedDatabase } = require('./seed');

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure database is initialized
seedDatabase();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Mount API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/companies', require('./routes/companyRoutes'));
app.use('/api/support', require('./routes/supportRoutes'));
app.use('/api/employees', require('./routes/employeeRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/leave', require('./routes/leaveRoutes'));
app.use('/api/geofences', require('./routes/geofenceRoutes'));
app.use('/api/shifts', require('./routes/shiftRoutes'));
app.use('/api/holidays', require('./routes/holidayRoutes'));
app.use('/api/tracking', require('./routes/trackingRoutes'));
app.use('/api/tickets', require('./routes/ticketRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/system', require('./routes/systemRoutes'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    platform: 'NPB HRMS Production Platform',
    zero_payroll_compliance: true,
    timestamp: new Date().toISOString()
  });
});

// Serve frontend client in production
const fs = require('fs');
const clientDistPath = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Central error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'An unexpected internal error occurred. Please try again or contact support.'
  });
});

app.listen(PORT, () => {
  console.log(`NPB HRMS Backend Server running on http://localhost:${PORT}`);
});
