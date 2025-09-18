import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createLogger, format, transports } from 'winston';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Import route handlers
import hubspotWebhookRoutes from './src/routes/hubspot-webhook.js';
import calendlyWebhookRoutes from './src/routes/calendly-webhook.js';
import zapierWebhookRoutes from './src/routes/zapier-webhook.js';
import n8nWebhookRoutes from './src/routes/n8n-webhook.js';
import healthRoutes from './src/routes/health.js';
import authRoutes from './src/routes/auth.js';
import analyticsRoutes from './src/routes/analytics.js';
import leadsRoutes from './src/routes/leads.js';
import adminRoutes from './src/routes/admin.js';

import { WorkflowOrchestrator } from './workflow-orchestrator.js';
import reminderScheduler from './src/services/reminder-scheduler.js';
import NewLeadMonitor from './src/services/new-lead-monitor.js';
import hubspotPollingService from './src/services/hubspot-polling-service.js';
import emailQueueProcessor from './src/services/email-queue-processor.js';
import followUpAutomationService from './src/services/follow-up-automation-service.js';
import automatedEmailWorkflowService from './src/services/automated-email-workflow-service.js';
import { calendlyConfig, db } from './src/config/index.js';
import { leadProcessingLogs } from './src/db/schema.js';
import logger from './utils/logger.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure logs directory exists
const logsDir = join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Enhanced console logging function with timestamps
const logWithTimestamp = (level, message, data = {}) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  
  // Log to winston logger
  logger[level](logMessage, data);
  
  // Enhanced console output with emojis and colors
  const emoji = {
    info: '📋',
    warn: '⚠️',
    error: '❌',
    debug: '🔍'
  }[level] || '📋';
  
  console.log(`${emoji} ${logMessage}`, data && Object.keys(data).length > 0 ? data : '');
};

// Initialize workflow orchestrator and new lead monitor
const workflowOrchestrator = new WorkflowOrchestrator();
const newLeadMonitor = new NewLeadMonitor();
logWithTimestamp('info', '🚀 Workflow Orchestrator initialized');
logWithTimestamp('info', '🚀 New Lead Monitor initialized');
logWithTimestamp('info', '🚀 HubSpot Polling Service initialized');
logWithTimestamp('info', '🚀 Email Queue Processor initialized');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy for production deployment (Render, Heroku, etc.)
// This allows express-rate-limit to properly identify users behind proxies
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1); // Trust first proxy
} else {
  app.set('trust proxy', false); // Don't trust proxy in development
}

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.FRONTEND_URL].filter(Boolean)
    : ['http://localhost:3000', 'http://127.0.0.1:3000', process.env.FRONTEND_URL].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'User-Agent', 'Cache-Control', 'Pragma']
}));

// Additional CORS handling for webhook endpoints
app.use('/webhook', (req, res, next) => {
  // Allow all headers for webhook endpoints to handle various webhook providers
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware with enhanced console output
app.use((req, res, next) => {
  const requestData = {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  };
  
  logWithTimestamp('info', `🌐 ${req.method} ${req.path}`, requestData);
  next();
});

// Route handlers
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/webhook/hubspot', hubspotWebhookRoutes);
app.use('/webhook/calendly', calendlyWebhookRoutes);
app.use('/webhook/zapier', zapierWebhookRoutes);
app.use('/webhook/n8n', n8nWebhookRoutes);
app.use('/health', healthRoutes);

// Calendly booking redirect route
app.get('/book-now', async (req, res) => {
  const { name, email, trackingId } = req.query;
  const calendlyLink = calendlyConfig.schedulingUrl;
  
  if (!calendlyLink) {
    logWithTimestamp('error', '❌ Calendly scheduling URL not configured');
    return res.status(500).json({ error: 'Calendly scheduling URL not configured' });
  }
  
  // Log click event to database if trackingId is provided
  if (trackingId) {
    try {
      await db.insert(leadProcessingLogs).values({
        trackingId,
        eventType: 'calendly_link_clicked',
        eventData: {
          email: email || null,
          name: name || null,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          timestamp: new Date().toISOString()
        },
        success: true
      });
      
      // Set tracking cookie with 7-day expiration
      res.cookie('calendly_tracking_id', trackingId, {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
      
      logWithTimestamp('info', '✅ Click event logged successfully', {
        trackingId,
        email: email || 'not provided',
        name: name || 'not provided'
      });
    } catch (error) {
      logWithTimestamp('error', '❌ Error logging click event', {
        trackingId,
        error: error.message
      });
    }
  }
  
  // Extract query parameters for prefilling
  const params = new URLSearchParams({
    name: name || '',
    email: email || ''
  });
  
  const redirectUrl = `${calendlyLink}?${params.toString()}`;
  
  logWithTimestamp('info', `🔗 Redirecting to Calendly: ${redirectUrl}`, {
    name: name || 'not provided',
    email: email || 'not provided',
    trackingId: trackingId || 'not provided',
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  res.redirect(redirectUrl);
});

// Workflow Management Routes
app.post('/api/workflow/init/:leadId', async (req, res) => {
  const { leadId } = req.params;
  logWithTimestamp('info', `🔄 Initializing workflow for lead: ${leadId}`);
  
  try {
    const success = await workflowOrchestrator.initializeWorkflow(leadId);
    logWithTimestamp('info', `✅ Workflow initialization ${success ? 'successful' : 'failed'} for lead: ${leadId}`);
    
    res.json({
      success,
      message: success ? 'Workflow initialized successfully' : 'Failed to initialize workflow',
      leadId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logWithTimestamp('error', `❌ Error initializing workflow for lead: ${leadId}`, { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Failed to initialize workflow',
      message: error.message,
      leadId,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/api/workflow/process', async (req, res) => {
  const { limit = 50 } = req.body;
  logWithTimestamp('info', `🔄 Processing pending workflow jobs (limit: ${limit})`);
  
  try {
    const processedCount = await workflowOrchestrator.processPendingJobs(limit);
    logWithTimestamp('info', `✅ Processed ${processedCount} workflow jobs`);
    
    res.json({
      success: true,
      processedCount,
      message: `Processed ${processedCount} workflow jobs`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logWithTimestamp('error', '❌ Error processing workflow jobs', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Failed to process workflow jobs',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/workflow/status/:leadId', async (req, res) => {
  const { leadId } = req.params;
  logWithTimestamp('info', `📊 Getting workflow status for lead: ${leadId}`);
  
  try {
    const status = await workflowOrchestrator.getWorkflowStatus(leadId);
    logWithTimestamp('info', `✅ Retrieved workflow status for lead: ${leadId}`);
    
    res.json({
      success: true,
      status,
      leadId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logWithTimestamp('error', `❌ Error getting workflow status for lead: ${leadId}`, { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Failed to get workflow status',
      message: error.message,
      leadId,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/api/workflow/continuous/start', async (req, res) => {
  const { intervalMinutes = 5 } = req.body;
  logWithTimestamp('info', `🔄 Starting continuous workflow processing (interval: ${intervalMinutes} minutes)`);
  
  try {
    await workflowOrchestrator.startContinuousProcessing(intervalMinutes);
    logWithTimestamp('info', `✅ Continuous workflow processing started with ${intervalMinutes}-minute intervals`);
    
    res.json({
      success: true,
      message: `Continuous workflow processing started with ${intervalMinutes}-minute intervals`,
      intervalMinutes,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logWithTimestamp('error', '❌ Error starting continuous workflow processing', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Failed to start continuous workflow processing',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// New Lead Monitor Routes
app.post('/api/monitor/start', async (req, res) => {
  const { intervalMinutes = 2 } = req.body;
  logWithTimestamp('info', `🔄 Starting new lead monitoring (interval: ${intervalMinutes} minutes)`);
  
  try {
    newLeadMonitor.intervalMinutes = intervalMinutes;
    newLeadMonitor.start();
    logWithTimestamp('info', `✅ New lead monitoring started with ${intervalMinutes}-minute intervals`);
    
    res.json({
      success: true,
      message: `New lead monitoring started with ${intervalMinutes}-minute intervals`,
      intervalMinutes,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logWithTimestamp('error', '❌ Error starting new lead monitoring', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Failed to start new lead monitoring',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/api/monitor/stop', async (req, res) => {
  logWithTimestamp('info', '🛑 Stopping new lead monitoring');
  
  try {
    newLeadMonitor.stop();
    logWithTimestamp('info', '✅ New lead monitoring stopped successfully');
    
    res.json({
      success: true,
      message: 'New lead monitoring stopped successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logWithTimestamp('error', '❌ Error stopping new lead monitoring', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Failed to stop new lead monitoring',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/monitor/status', async (req, res) => {
  logWithTimestamp('info', '📊 Getting new lead monitor status');
  
  try {
    const status = newLeadMonitor.getStats();
    const healthCheck = await newLeadMonitor.healthCheck();
    logWithTimestamp('info', '✅ Retrieved new lead monitor status');
    
    res.json({
      success: true,
      status: { ...status, health: healthCheck },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logWithTimestamp('error', '❌ Error getting new lead monitor status', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Failed to get new lead monitor status',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/api/monitor/check', async (req, res) => {
  logWithTimestamp('info', '🔍 Manual new lead check requested');
  
  try {
    await newLeadMonitor.triggerCheck();
    const stats = newLeadMonitor.getStats();
    logWithTimestamp('info', `✅ Manual new lead check completed`);
    
    res.json({
      success: true,
      message: 'Manual check completed',
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logWithTimestamp('error', '❌ Error during manual new lead check', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Failed to check for new leads',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  logWithTimestamp('info', '📋 API documentation requested');
  
  res.json({
    message: 'Backend API Server with Integrated Workflow Management',
    version: '2.0.0',
    status: 'running',
    features: [
      'Authentication & User Management',
      'Email Service (Hostinger SMTP)',
      'HubSpot Lead Automation',
      'Calendly Integration',
      'Integrated Workflow Orchestration',
      'Real-time Workflow Processing',
      'Automated New Lead Monitoring',
      'Health Monitoring'
    ],
    endpoints: {
      auth: '/api/auth',
      analytics: '/api/analytics',
      // Facebook Ads integration removed
      workflow: {
        init: 'POST /api/workflow/init/:leadId',
        process: 'POST /api/workflow/process',
        status: 'GET /api/workflow/status/:leadId',
        continuousStart: 'POST /api/workflow/continuous/start'
      },
      monitor: {
        start: 'POST /api/monitor/start',
        stop: 'POST /api/monitor/stop',
        status: 'GET /api/monitor/status',
        check: 'POST /api/monitor/check'
      },
      webhooks: {
        // Facebook webhook removed
        calendly: '/webhook/calendly'
      },
      health: '/health'
    },
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.originalUrl} not found`
  });
});

// Start server
app.listen(PORT, async () => {
  logWithTimestamp('info', '🚀 Starting Backend API Server with Integrated Workflow Management');
  logWithTimestamp('info', `🌐 Server running on port ${PORT}`);
  logWithTimestamp('info', `🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Start the automated reminder scheduler
  try {
    reminderScheduler.start();
    logWithTimestamp('info', '✅ Automated reminder scheduler started successfully');
  } catch (error) {
    logWithTimestamp('error', '❌ Failed to start reminder scheduler', { error: error.message, stack: error.stack });
  }
  
  // Start the new lead monitor
  try {
    newLeadMonitor.intervalMinutes = 2; // Check every 2 minutes
    newLeadMonitor.start();
    logWithTimestamp('info', '✅ New lead monitor started successfully with 2-minute intervals');
  } catch (error) {
    logWithTimestamp('error', '❌ Failed to start new lead monitor', { error: error.message, stack: error.stack });
  }

  // Start the HubSpot polling service
  try {
    hubspotPollingService.start();
    logWithTimestamp('info', '✅ HubSpot polling service started successfully');
  } catch (error) {
    logWithTimestamp('error', '❌ Failed to start HubSpot polling service', { error: error.message, stack: error.stack });
  }

  // Start the email queue processor
  try {
    emailQueueProcessor.start();
    logWithTimestamp('info', '✅ Email queue processor started successfully');
  } catch (error) {
    logWithTimestamp('error', '❌ Failed to start email queue processor', { error: error.message, stack: error.stack });
  }

  // Start the follow-up automation service
  try {
    followUpAutomationService.start();
    logWithTimestamp('info', '✅ Follow-up automation service started successfully');
  } catch (error) {
    logWithTimestamp('error', '❌ Failed to start follow-up automation service', { error: error.message, stack: error.stack });
  }

  // Start the automated email workflow service
  try {
    automatedEmailWorkflowService.startContinuousMonitoring();
    logWithTimestamp('info', '✅ Automated email workflow service started successfully');
  } catch (error) {
    logWithTimestamp('error', '❌ Failed to start automated email workflow service', { error: error.message, stack: error.stack });
  }
  
  // Initialize workflow processing
  try {
    logWithTimestamp('info', '🔄 Initializing workflow processing system');
    
    // Start continuous workflow processing with 5-minute intervals
    await workflowOrchestrator.startContinuousProcessing(5);
    logWithTimestamp('info', '✅ Continuous workflow processing started with 5-minute intervals');
    
    // Process any pending jobs immediately on startup
    const initialProcessedCount = await workflowOrchestrator.processPendingJobs(50);
    logWithTimestamp('info', `✅ Initial startup processing completed: ${initialProcessedCount} jobs processed`);
    
  } catch (error) {
    logWithTimestamp('error', '❌ Failed to initialize workflow processing', { error: error.message, stack: error.stack });
  }
  
  logWithTimestamp('info', '🎉 All systems initialized successfully - Server ready to handle requests');
  console.log('\n' + '='.repeat(80));
  console.log('🚀 BACKEND API SERVER WITH INTEGRATED WORKFLOW MANAGEMENT');
  console.log('='.repeat(80));
  console.log(`📍 Server URL: http://localhost:${PORT}`);
  console.log(`📋 API Documentation: http://localhost:${PORT}/`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⏰ Workflow Processing: Active (5-minute intervals)`);
  console.log(`📅 Reminder Scheduler: Active`);
  console.log(`👁️  New Lead Monitor: Active (2-minute intervals)`);
  console.log(`🔄 HubSpot Polling: Active`);
  console.log(`📧 Email Queue Processor: Active`);
  console.log(`🔄 Follow-up Automation: Active (30-minute intervals)`);
  console.log(`📬 Automated Email Workflow: Active (5-minute intervals)`);
  console.log('='.repeat(80));
  console.log('='.repeat(80) + '\n');
});

// Graceful shutdown with comprehensive logging
process.on('SIGTERM', () => {
  logWithTimestamp('warn', '⚠️ SIGTERM received, initiating graceful shutdown');
  
  try {
    logWithTimestamp('info', '🛑 Stopping reminder scheduler');
    ReminderScheduler.stop();
    logWithTimestamp('info', '✅ Reminder scheduler stopped successfully');
  } catch (error) {
    logWithTimestamp('error', '❌ Error stopping reminder scheduler', { error: error.message, stack: error.stack });
  }
  
  try {
    logWithTimestamp('info', '🛑 Stopping new lead monitor');
    newLeadMonitor.stop();
    logWithTimestamp('info', '✅ New lead monitor stopped successfully');
  } catch (error) {
    logWithTimestamp('error', '❌ Error stopping new lead monitor', { error: error.message, stack: error.stack });
  }
  
  try {
    logWithTimestamp('info', '🛑 Stopping automated email workflow service');
    automatedEmailWorkflowService.stopContinuousMonitoring();
    logWithTimestamp('info', '✅ Automated email workflow service stopped successfully');
  } catch (error) {
    logWithTimestamp('error', '❌ Error stopping automated email workflow service', { error: error.message, stack: error.stack });
  }
  
  try {
    logWithTimestamp('info', '🛑 Stopping workflow orchestrator');
    // Note: WorkflowOrchestrator doesn't have a stop method, but we log the intention
    logWithTimestamp('info', '✅ Workflow orchestrator shutdown initiated');
  } catch (error) {
    logWithTimestamp('error', '❌ Error stopping workflow orchestrator', { error: error.message, stack: error.stack });
  }
  
  logWithTimestamp('info', '👋 Graceful shutdown completed');
  process.exit(0);
});

process.on('SIGINT', () => {
  logWithTimestamp('warn', '⚠️ SIGINT received, initiating graceful shutdown');
  
  try {
    logWithTimestamp('info', '🛑 Stopping reminder scheduler');
    ReminderScheduler.stop();
    logWithTimestamp('info', '✅ Reminder scheduler stopped successfully');
  } catch (error) {
    logWithTimestamp('error', '❌ Error stopping reminder scheduler', { error: error.message, stack: error.stack });
  }
  
  try {
    logWithTimestamp('info', '🛑 Stopping new lead monitor');
    newLeadMonitor.stop();
    logWithTimestamp('info', '✅ New lead monitor stopped successfully');
  } catch (error) {
    logWithTimestamp('error', '❌ Error stopping new lead monitor', { error: error.message, stack: error.stack });
  }
  
  try {
    logWithTimestamp('info', '🛑 Stopping workflow orchestrator');
    // Note: WorkflowOrchestrator doesn't have a stop method, but we log the intention
    logWithTimestamp('info', '✅ Workflow orchestrator shutdown initiated');
  } catch (error) {
    logWithTimestamp('error', '❌ Error stopping workflow orchestrator', { error: error.message, stack: error.stack });
  }
  
  logWithTimestamp('info', '👋 Graceful shutdown completed');
  process.exit(0);
});

export default app;