import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { 
  Search, 
  Filter, 
  Plus, 
  Edit3, 
  Calendar, 
  User, 
  Phone, 
  Mail, 
  MapPin,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  BarChart,
  LogOut,
  MessageSquare,
  Video,
  Link
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuth, authManager } from '../lib/auth';
import FeedbackModal from '../components/FeedbackModal';

// Using backend API instead of Supabase direct connection

export default function AgentDashboard() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [selectedLead, setSelectedLead] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackLead, setFeedbackLead] = useState(null);
  const [integrationStatus, setIntegrationStatus] = useState({
    calendly: { connected: false, connectedAt: null }
  });
  const [integrationLoading, setIntegrationLoading] = useState(false);

  useEffect(() => {
    // Wait for auth to finish loading before making redirect decisions
    if (authLoading) return;
    
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    
    // Ensure only agents and admins can access this page
    if (user && user.role === 'admin') {
      router.push('/admin-dashboard');
      return;
    }
    
    // Only fetch leads if user is authenticated and verified
    if (isAuthenticated && user) {
      fetchLeads();
      fetchIntegrationStatus();
    }
  }, [isAuthenticated, user, router, authLoading]);

  const fetchLeads = async () => {
    // Don't fetch if not authenticated
    if (!isAuthenticated || !localStorage.getItem('auth_token')) {
      console.log('Not authenticated, skipping fetch leads');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/leads', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          // Token is invalid, sign out and redirect
          console.log('Unauthorized, redirecting to login');
          await authManager.signOut();
          router.push('/login');
          return;
        }
        throw new Error('Failed to fetch leads');
      }
      
      const data = await response.json();
      setLeads(data.leads || []);
    } catch (err) {
      console.error('Error fetching leads:', err);
      setError('Failed to load leads');
    } finally {
      setLoading(false);
    }
  };

  const fetchIntegrationStatus = async () => {
    if (!isAuthenticated || !localStorage.getItem('auth_token')) {
      return;
    }

    try {
      const response = await fetch('/api/integrations/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setIntegrationStatus(data);
      }
    } catch (err) {
      console.error('Error fetching integration status:', err);
    }
  };

  const handleIntegrationConnect = async (platform) => {
    setIntegrationLoading(true);
    try {
      const response = await fetch(`/api/integrations/${platform}/start`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        // Redirect to OAuth URL
        window.location.href = data.url;
      } else {
        throw new Error(`Failed to start ${platform} integration`);
      }
    } catch (err) {
      console.error(`Error connecting ${platform}:`, err);
      alert(`Failed to connect ${platform}. Please try again.`);
    } finally {
      setIntegrationLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await authManager.signOut();
      router.push('/');
    } catch (err) {
      console.error('Sign out error:', err);
      // Even if there's an error, clear token and redirect
      localStorage.removeItem('auth_token');
      router.push('/');
    }
  };

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = !searchTerm || 
      lead.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.phone?.includes(searchTerm);
    
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || lead.priority === priorityFilter;
    
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const getStatusIcon = (status) => {
    switch (status) {
      case 'new': return <AlertCircle className="w-5 h-5 text-orange-500 drop-shadow-sm" />;
      case 'contacted': return <Phone className="w-5 h-5 text-teal-500 drop-shadow-sm" />;
      case 'scheduled': return <Calendar className="w-5 h-5 text-emerald-500 drop-shadow-sm" />;
      case 'completed': return <CheckCircle className="w-5 h-5 text-green-600 drop-shadow-sm" />;
      case 'cancelled': return <XCircle className="w-5 h-5 text-red-500 drop-shadow-sm" />;
      default: return <AlertCircle className="w-5 h-5 text-gray-500 drop-shadow-sm" />;
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'bg-gradient-to-r from-red-100 to-pink-100 text-red-800 border border-red-200 shadow-sm';
      case 'medium': return 'bg-gradient-to-r from-orange-100 to-yellow-100 text-orange-800 border border-orange-200 shadow-sm';
      case 'low': return 'bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-800 border border-emerald-200 shadow-sm';
      default: return 'bg-gradient-to-r from-gray-100 to-slate-100 text-gray-800 border border-gray-200 shadow-sm';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-orange-200 border-t-orange-600 mx-auto shadow-lg"></div>
          <p className="mt-6 text-orange-700 font-bold text-lg">🚀 Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Agent Dashboard - Lead Management</title>
        <meta name="description" content="Agent Dashboard for Lead Management" />
      </Head>
      
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-pink-50">
        {/* Header */}
        <header className="bg-gradient-to-r from-orange-600 via-red-600 to-pink-600 shadow-xl border-b border-orange-300">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <h1 className="text-2xl font-bold text-white drop-shadow-lg">🚀 Agent Dashboard</h1>
              </div>
              <div className="flex items-center space-x-4">
                {/* Integration Buttons */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleIntegrationConnect('calendly')}
                    disabled={integrationLoading}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      integrationStatus.calendly.connected
                        ? 'bg-green-500/20 text-green-100 border border-green-400/30'
                        : 'bg-white/20 text-white hover:bg-white/30 border border-white/20 hover:border-white/40'
                    }`}
                  >
                    <Link className="w-4 h-4" />
                    <span>{integrationStatus.calendly.connected ? 'Calendly ✓' : 'Connect Calendly'}</span>
                  </button>
                </div>
                
                <span className="text-orange-100 font-medium">Welcome, {user?.name || user?.email}</span>
                <button
                  onClick={handleSignOut}
                  className="flex items-center space-x-2 bg-white/20 text-white hover:bg-white/30 transition-all duration-200 px-4 py-2 rounded-lg backdrop-blur-sm border border-white/20 hover:border-white/40"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="font-medium">Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {error && (
            <div className="mb-6 bg-gradient-to-r from-red-100 to-pink-100 border-2 border-red-300 rounded-xl p-6 shadow-lg">
              <div className="flex">
                <AlertCircle className="h-6 w-6 text-red-500 drop-shadow-sm" />
                <div className="ml-4">
                  <p className="text-sm font-bold text-red-800">⚠️ {error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl shadow-xl p-6 transform hover:scale-105 transition-all duration-200">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <User className="h-10 w-10 text-white drop-shadow-lg" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-bold text-teal-100 truncate">Total Leads</dt>
                    <dd className="text-2xl font-bold text-white drop-shadow-lg">{leads.length}</dd>
                  </dl>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-orange-500 to-red-600 rounded-xl shadow-xl p-6 transform hover:scale-105 transition-all duration-200">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <AlertCircle className="h-10 w-10 text-white drop-shadow-lg" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-bold text-orange-100 truncate">New Leads</dt>
                    <dd className="text-2xl font-bold text-white drop-shadow-lg">
                      {leads.filter(lead => lead.status === 'new').length}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl shadow-xl p-6 transform hover:scale-105 transition-all duration-200">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Calendar className="h-10 w-10 text-white drop-shadow-lg" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-bold text-emerald-100 truncate">Scheduled</dt>
                    <dd className="text-2xl font-bold text-white drop-shadow-lg">
                      {leads.filter(lead => lead.status === 'scheduled').length}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-xl p-6 transform hover:scale-105 transition-all duration-200">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CheckCircle className="h-10 w-10 text-white drop-shadow-lg" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-bold text-indigo-100 truncate">Completed</dt>
                    <dd className="text-2xl font-bold text-white drop-shadow-lg">
                      {leads.filter(lead => lead.status === 'completed').length}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Filters and Search */}
          <div className="bg-white rounded-xl shadow-xl mb-6 border border-orange-200">
            <div className="p-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-orange-400 w-5 h-5" />
                    <input
                      type="text"
                      placeholder="🔍 Search leads by name, email, or phone..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-12 pr-4 py-3 w-full border-2 border-orange-200 rounded-xl focus:ring-4 focus:ring-orange-200 focus:border-orange-400 transition-all duration-200 bg-orange-50 focus:bg-white font-medium"
                    />
                  </div>
                </div>
                
                <div className="flex gap-4">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-4 py-3 border-2 border-orange-200 rounded-xl focus:ring-4 focus:ring-orange-200 focus:border-orange-400 transition-all duration-200 bg-orange-50 focus:bg-white font-medium"
                  >
                    <option value="all">📊 All Status</option>
                    <option value="new">🆕 New</option>
                    <option value="contacted">📞 Contacted</option>
                    <option value="scheduled">📅 Scheduled</option>
                    <option value="completed">✅ Completed</option>
                    <option value="cancelled">❌ Cancelled</option>
                  </select>
                  
                  <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    className="px-4 py-3 border-2 border-orange-200 rounded-xl focus:ring-4 focus:ring-orange-200 focus:border-orange-400 transition-all duration-200 bg-orange-50 focus:bg-white font-medium"
                  >
                    <option value="all">🎯 All Priority</option>
                    <option value="high">🔥 High</option>
                    <option value="medium">⚡ Medium</option>
                    <option value="low">💚 Low</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Leads Table */}
          <div className="bg-white rounded-xl shadow-xl overflow-hidden border border-orange-200">
            <div className="px-6 py-4 border-b border-orange-200 bg-gradient-to-r from-orange-500 to-red-500">
              <h3 className="text-xl font-bold text-white drop-shadow-lg">🎯 Your Assigned Leads</h3>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gradient-to-r from-orange-100 to-red-100">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-bold text-orange-800 uppercase tracking-wider">
                      👤 Contact
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-orange-800 uppercase tracking-wider">
                      📊 Status
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-orange-800 uppercase tracking-wider">
                      🎯 Priority
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-orange-800 uppercase tracking-wider">
                      📅 Created
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-orange-800 uppercase tracking-wider">
                      ⚡ Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredLeads.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-6 py-16 text-center">
                        <div className="text-center">
                          <div className="text-6xl mb-4">📭</div>
                          <p className="text-lg font-bold text-gray-700">
                            {searchTerm || statusFilter !== 'all' || priorityFilter !== 'all' 
                              ? '🔍 No leads match your current filters.' 
                              : '🎯 No leads assigned to you yet.'}
                          </p>
                          <p className="text-sm text-gray-500 mt-2">Check back later or adjust your filters!</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredLeads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-gradient-to-r hover:from-orange-50 hover:to-red-50 transition-all duration-200">
                        <td className="px-6 py-5 whitespace-nowrap">
                          <div className="flex items-center">
                            <div>
                              <div className="text-sm font-bold text-gray-900">
                                {lead.fullName || 'No name'}
                              </div>
                              <div className="text-sm text-teal-600 flex items-center mt-1 font-medium">
                                <Mail className="w-4 h-4 mr-1" />
                                {lead.email}
                              </div>
                              {lead.phone && (
                                <div className="text-sm text-orange-600 flex items-center mt-1 font-medium">
                                  <Phone className="w-4 h-4 mr-1" />
                                  {lead.phone}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5 whitespace-nowrap">
                          <div className="flex items-center">
                            {getStatusIcon(lead.status)}
                            <span className="ml-3 text-sm font-bold text-gray-900 capitalize">
                              {lead.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-5 whitespace-nowrap">
                          <span className={`inline-flex px-3 py-2 text-xs font-bold rounded-xl ${getPriorityColor(lead.priority)}`}>
                            {lead.priority}
                          </span>
                        </td>
                        <td className="px-6 py-5 whitespace-nowrap text-sm font-medium text-gray-700">
                          {lead.createdAt ? format(new Date(lead.createdAt), 'MMM d, yyyy') : 'N/A'}
                        </td>
                        <td className="px-6 py-5 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => {
                                setSelectedLead(lead);
                                setShowEditModal(true);
                              }}
                              className="bg-gradient-to-r from-teal-500 to-cyan-600 text-white hover:from-teal-600 hover:to-cyan-700 flex items-center px-4 py-2 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105 font-bold"
                            >
                              <Edit3 className="w-4 h-4 mr-2" />
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                setFeedbackLead(lead);
                                setShowFeedbackModal(true);
                              }}
                              className="bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 flex items-center px-4 py-2 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105 font-bold"
                            >
                              <MessageSquare className="w-4 h-4 mr-2" />
                              Feedback
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={showFeedbackModal}
        onClose={() => {
          setShowFeedbackModal(false);
          setFeedbackLead(null);
        }}
        lead={feedbackLead}
        user={user}
        onFeedbackSubmitted={(feedback) => {
          console.log('Feedback submitted:', feedback);
          // Optionally refresh leads or show success message
        }}
      />
    </>
  );
}