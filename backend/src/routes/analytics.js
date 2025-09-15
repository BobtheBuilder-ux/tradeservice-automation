/**
 * Analytics API Routes
 * Provides endpoints for email performance metrics and dashboard data
 */

import express from 'express';
import logger from '../utils/logger.js';
import { supabase } from '../config/index.js';

const router = express.Router();

/**
 * GET /api/analytics/email-performance
 * Get email performance metrics
 */
router.get('/email-performance', async (req, res) => {
  try {
    const { startDate, endDate, period = '30d' } = req.query;
    
    logger.info('Fetching email performance metrics', { period, startDate, endDate });
    
    // Calculate date range
    let dateFilter = '';
    const now = new Date();
    
    if (startDate && endDate) {
      dateFilter = `AND sent_at >= '${startDate}' AND sent_at <= '${endDate}'`;
    } else {
      // Default periods
      const daysBack = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 30;
      const startDateTime = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
      dateFilter = `AND sent_at >= '${startDateTime.toISOString()}'`;
    }
    
    // Get email metrics
    const { data: emailMetrics, error: emailError } = await supabase
      .rpc('get_email_performance_metrics', {
        date_filter: dateFilter
      });
    
    if (emailError) {
      logger.error('Error fetching email metrics:', emailError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch email metrics'
      });
    }
    
    // Get daily email stats for charts
    const { data: dailyStats, error: dailyError } = await supabase
      .from('meeting_reminders')
      .select(`
        sent_at::date as date,
        reminder_type,
        COUNT(*) as count
      `)
      .not('sent_at', 'is', null)
      .gte('sent_at', dateFilter.includes('>=') ? dateFilter.split("'>=")[1].split("'")[0] : new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)).toISOString())
      .order('date', { ascending: true });
    
    if (dailyError) {
      logger.error('Error fetching daily stats:', dailyError);
    }
    
    // Get reminder type breakdown
    const { data: reminderBreakdown, error: breakdownError } = await supabase
      .from('meeting_reminders')
      .select(`
        reminder_type,
        COUNT(*) as count
      `)
      .not('sent_at', 'is', null)
      .gte('sent_at', dateFilter.includes('>=') ? dateFilter.split("'>=")[1].split("'")[0] : new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)).toISOString())
      .group('reminder_type');
    
    if (breakdownError) {
      logger.error('Error fetching reminder breakdown:', breakdownError);
    }
    
    res.json({
      success: true,
      data: {
        metrics: emailMetrics || [],
        dailyStats: dailyStats || [],
        reminderBreakdown: reminderBreakdown || [],
        period,
        dateRange: {
          start: startDate || new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
          end: endDate || now.toISOString().split('T')[0]
        }
      }
    });
    
  } catch (error) {
    logger.error('Error in GET /email-performance:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/analytics/sms-performance
 * Get SMS performance metrics
 */
router.get('/sms-performance', async (req, res) => {
  try {
    const { startDate, endDate, period = '30d' } = req.query;
    
    logger.info('Fetching SMS performance metrics', { period, startDate, endDate });
    
    // Calculate date range
    let dateFilter = '';
    const now = new Date();
    
    if (startDate && endDate) {
      dateFilter = `AND sms_sent_at >= '${startDate}' AND sms_sent_at <= '${endDate}'`;
    } else {
      const daysBack = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 30;
      const startDateTime = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
      dateFilter = `AND sms_sent_at >= '${startDateTime.toISOString()}'`;
    }
    
    // Get SMS metrics
    const { data: smsStats, error: smsError } = await supabase
      .from('meeting_reminders')
      .select(`
        sms_delivered_at::date as date,
        reminder_type,
        sms_status,
        delivery_method,
        COUNT(*) as count
      `)
      .not('sms_delivered_at', 'is', null)
      .gte('sms_delivered_at', dateFilter.includes('>=') ? dateFilter.split("'>=")[1].split("'")[0] : new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)).toISOString())
      .group('date, reminder_type, sms_status, delivery_method')
      .order('date', { ascending: true });
    
    if (smsError) {
      logger.error('Error fetching SMS stats:', smsError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch SMS metrics'
      });
    }
    
    // Get SMS delivery status breakdown
    const { data: deliveryBreakdown, error: deliveryError } = await supabase
      .from('meeting_reminders')
      .select(`
        sms_delivery_status,
        COUNT(*) as count
      `)
      .not('sms_sent_at', 'is', null)
      .gte('sms_sent_at', dateFilter.includes('>=') ? dateFilter.split("'>=")[1].split("'")[0] : new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)).toISOString())
      .group('sms_delivery_status');
    
    if (deliveryError) {
      logger.error('Error fetching delivery breakdown:', deliveryError);
    }
    
    res.json({
      success: true,
      data: {
        smsStats: smsStats || [],
        deliveryBreakdown: deliveryBreakdown || [],
        period,
        dateRange: {
          start: startDate || new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
          end: endDate || now.toISOString().split('T')[0]
        }
      }
    });
    
  } catch (error) {
    logger.error('Error in GET /sms-performance:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/analytics/dashboard-summary
 * Get overall dashboard summary metrics
 */
router.get('/dashboard-summary', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    logger.info('Fetching dashboard summary', { period });
    
    const now = new Date();
    const daysBack = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 30;
    const startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
    
    // Get total meetings
    const { data: totalMeetings, error: meetingsError } = await supabase
      .from('meetings')
      .select('id', { count: 'exact' })
      .gte('created_at', startDate.toISOString());
    
    // Get total email reminders sent
    const { data: emailReminders, error: emailError } = await supabase
      .from('meeting_reminders')
      .select('id', { count: 'exact' })
      .not('sent_at', 'is', null)
      .gte('sent_at', startDate.toISOString());
    
    // Get total SMS reminders sent
    const { data: smsReminders, error: smsError } = await supabase
      .from('meeting_reminders')
      .select('id', { count: 'exact' })
      .not('sms_sent_at', 'is', null)
      .gte('sms_sent_at', startDate.toISOString());
    
    // Get all meetings for status breakdown
    const { data: allMeetings, error: allMeetingsError } = await supabase
      .from('meetings')
      .select('status')
      .gte('created_at', startDate.toISOString());
    
    // Calculate status breakdown manually
    const meetingStatusBreakdown = allMeetings?.reduce((acc, meeting) => {
      const status = meeting.status || 'unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {}) || {};
    
    if (meetingsError || emailError || smsError || allMeetingsError) {
      logger.error('Error fetching summary metrics:', {
        meetingsError,
        emailError,
        smsError,
        allMeetingsError
      });
    }
    
    res.json({
      success: true,
      data: {
        totalMeetings: totalMeetings?.length || 0,
        emailRemindersSent: emailReminders?.length || 0,
        smsRemindersSent: smsReminders?.length || 0,
        meetingStatusBreakdown,
        period,
        dateRange: {
          start: startDate.toISOString().split('T')[0],
          end: now.toISOString().split('T')[0]
        }
      }
    });
    
  } catch (error) {
    logger.error('Error in GET /dashboard-summary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;