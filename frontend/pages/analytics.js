import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { 
  Calendar, 
  Download, 
  Mail, 
  CheckCircle, 
  XCircle, 
  Eye, 
  MousePointer, 
  TrendingUp, 
  Users,
  BarChart3,
  MessageSquare,
  AlertTriangle,
  Clock,
  Filter
} from 'lucide-react';
import { validatePermissions } from '../lib/auth';
import { format } from 'date-fns';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

export default function Analytics() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState('30d');
  const [dashboardData, setDashboardData] = useState(null);
  const [emailData, setEmailData] = useState(null);
  const [smsData, setSmsData] = useState(null);
  const [emailMetrics, setEmailMetrics] = useState({
    totalSent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    deliveryRate: 0,
    openRate: 0,
    clickRate: 0
  });
  const [smsMetrics, setSmsMetrics] = useState({
    totalSent: 0,
    delivered: 0,
    failed: 0,
    deliveryRate: 0
  });

  useEffect(() => {
    checkAuthentication();
  }, []);

  useEffect(() => {
    if (user) {
      fetchAnalyticsData();
    }
  }, [user, period]);

  const checkAuthentication = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        router.push('/login');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/verify`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        localStorage.removeItem('auth_token');
        router.push('/login');
        return;
      }

      const userData = await response.json();
      setUser(userData.user);
      
      // Check permissions
      const userPermissions = await validatePermissions(userData.user);
      if (!userPermissions.canViewAnalytics) {
        setError('You do not have permission to view analytics');
        return;
      }

    } catch (error) {
      console.error('Authentication error:', error);
      router.push('/login');
    }
  };

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      
      // Fetch dashboard summary
      const summaryResponse = await fetch(
        `${API_BASE_URL}/api/analytics/dashboard-summary?period=${period}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (summaryResponse.ok) {
        const summaryData = await summaryResponse.json();
        setDashboardData(summaryData.data);
      }

      // Fetch email performance
      const emailResponse = await fetch(
        `${API_BASE_URL}/api/analytics/email-performance?period=${period}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (emailResponse.ok) {
        const emailAnalytics = await emailResponse.json();
        setEmailData(emailAnalytics.data);
        setEmailMetrics(emailAnalytics.summary);
      }

      // Fetch SMS performance
      const smsResponse = await fetch(
        `${API_BASE_URL}/api/analytics/sms-performance?period=${period}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (smsResponse.ok) {
        const smsAnalytics = await smsResponse.json();
        setSmsData(smsAnalytics.data);
        setSmsMetrics(smsAnalytics.summary);
      }

    } catch (error) {
      console.error('Error fetching analytics:', error);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const exportData = () => {
    // Simple CSV export functionality
    const csvData = [
      ['Metric', 'Value'],
      ['Total Meetings', dashboardData?.totalMeetings || 0],
      ['Email Reminders Sent', dashboardData?.emailRemindersSent || 0],
      ['SMS Reminders Sent', dashboardData?.smsRemindersSent || 0]
    ];
    
    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${period}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600">{error}</p>
          <button 
            onClick={() => router.push('/')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Analytics Dashboard - Lead Automation</title>
        <meta name="description" content="Analytics and performance metrics" />
      </Head>

      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
              <p className="text-gray-600">Email and SMS performance metrics</p>
            </div>
            <div className="flex items-center space-x-4">
              {/* Period Filter */}
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 bg-white"
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
              
              {/* Export Button */}
              <button
                onClick={exportData}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </button>
              
              {/* Back to Dashboard */}
              <button
                onClick={() => router.push('/')}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Calendar className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Meetings</p>
                <p className="text-2xl font-bold text-gray-900">
                  {dashboardData?.totalMeetings || 0}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Mail className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Email Reminders</p>
                <p className="text-2xl font-bold text-gray-900">
                  {dashboardData?.emailRemindersSent || 0}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <MessageSquare className="h-8 w-8 text-purple-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">SMS Reminders</p>
                <p className="text-2xl font-bold text-gray-900">
                  {dashboardData?.smsRemindersSent || 0}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <TrendingUp className="h-8 w-8 text-orange-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Success Rate</p>
                <p className="text-2xl font-bold text-gray-900">
                  {emailData?.metrics?.[0]?.success_rate || 0}%
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Email Performance Metrics */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Email Performance</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <Mail className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total Emails Sent</p>
                  <p className="text-2xl font-bold text-gray-900">{emailMetrics.totalSent.toLocaleString()}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <CheckCircle className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Delivery Rate</p>
                  <p className="text-2xl font-bold text-gray-900">{emailMetrics.deliveryRate}%</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <Mail className="h-8 w-8 text-purple-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Open Rate</p>
                  <p className="text-2xl font-bold text-gray-900">{emailMetrics.openRate}%</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <TrendingUp className="h-8 w-8 text-orange-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Click Rate</p>
                  <p className="text-2xl font-bold text-gray-900">{emailMetrics.clickRate}%</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* SMS Performance Metrics */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">SMS Performance</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <MessageSquare className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total SMS Sent</p>
                  <p className="text-2xl font-bold text-gray-900">{smsMetrics.totalSent.toLocaleString()}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <CheckCircle className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">SMS Delivery Rate</p>
                  <p className="text-2xl font-bold text-gray-900">{smsMetrics.deliveryRate}%</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <AlertTriangle className="h-8 w-8 text-red-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Failed SMS</p>
                  <p className="text-2xl font-bold text-gray-900">{smsMetrics.failed.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Email Performance Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Email Performance Over Time</h3>
            {emailData && emailData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={emailData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="sent" stroke="#3B82F6" name="Sent" />
                  <Line type="monotone" dataKey="delivered" stroke="#10B981" name="Delivered" />
                  <Line type="monotone" dataKey="opened" stroke="#8B5CF6" name="Opened" />
                  <Line type="monotone" dataKey="clicked" stroke="#F59E0B" name="Clicked" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                No email data available for the selected period
              </div>
            )}
          </div>

          {/* SMS Performance Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">SMS Performance Over Time</h3>
            {smsData && smsData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={smsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="sent" stroke="#3B82F6" name="Sent" />
                  <Line type="monotone" dataKey="delivered" stroke="#10B981" name="Delivered" />
                  <Line type="monotone" dataKey="failed" stroke="#EF4444" name="Failed" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                No SMS data available for the selected period
              </div>
            )}
          </div>
        </div>

        {/* Breakdown Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Email Reminders by Type */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Email Reminders by Type</h3>
            {emailData?.reminderBreakdown && emailData.reminderBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={emailData.reminderBreakdown}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ reminder_type, count }) => `${reminder_type}: ${count}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {emailData.reminderBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                No email data available
              </div>
            )}
          </div>

          {/* SMS Delivery Status */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">SMS Delivery Status</h3>
            {smsData?.deliveryBreakdown && smsData.deliveryBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={smsData.deliveryBreakdown}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ sms_delivery_status, count }) => `${sms_delivery_status}: ${count}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {smsData.deliveryBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                No SMS data available
              </div>
            )}
          </div>
        </div>

        {/* Daily Activity Chart */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Email Activity</h3>
          {emailData?.dailyStats && emailData.dailyStats.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={emailData.dailyStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#3B82F6" name="Email Reminders" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              No daily activity data available
            </div>
          )}
        </div>

        {/* Meeting Status Breakdown */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Meeting Status Breakdown</h3>
          {dashboardData?.meetingStatusBreakdown && dashboardData.meetingStatusBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dashboardData.meetingStatusBreakdown}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="status" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#10B981" name="Meetings" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              No meeting status data available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}