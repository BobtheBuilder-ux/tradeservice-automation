import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { 
  Users, 
  UserPlus, 
  UserMinus, 
  Settings, 
  BarChart3, 
  Target, 
  Building2, 
  Search, 
  Filter, 
  Edit3, 
  Trash2, 
  Plus, 
  X, 
  Check, 
  AlertCircle, 
  LogOut,
  ChevronDown,
  Mail,
  Phone,
  Calendar,
  User,
  Eye,
  CalendarDays
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../lib/auth';

export default function AdminDashboard() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Agent Management State
  const [agents, setAgents] = useState([]);
  const [showCreateAgentModal, setShowCreateAgentModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [meetingsError, setMeetingsError] = useState(null);
  const [agentFormData, setAgentFormData] = useState({
    name: '',
    email: '',
    role: 'agent'
  });
  
  // Lead Management State
  const [leads, setLeads] = useState([]);
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Campaign Management State
  const [campaigns, setCampaigns] = useState([]);
  const [campaignStats, setCampaignStats] = useState({
    active: 0,
    paused: 0,
    totalSpend: 0,
    totalLeads: 0
  });

  useEffect(() => {
    // Wait for auth to finish loading before making redirect decisions
    if (authLoading) return;
    
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    
    // Ensure only admins can access this page
    if (user && user.role !== 'admin') {
      router.push('/agent-dashboard');
      return;
    }
    
    fetchDashboardData();
  }, [isAuthenticated, user, router, authLoading]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchAgents(),
        fetchLeads(),
        fetchCampaigns()
      ]);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && activeTab === 'campaigns') {
      fetchMeetings();
    }
  }, [user, activeTab]);

  const fetchAgents = async () => {
    try {
      const response = await fetch('/api/admin/agents', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAgents(data.agents || []);
      }
    } catch (err) {
      console.error('Error fetching agents:', err);
    }
  };

  const fetchLeads = async () => {
    try {
      const response = await fetch('/api/admin/leads', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setLeads(data.leads || []);
      }
    } catch (err) {
      console.error('Error fetching leads:', err);
    }
  };

  const fetchCampaigns = async () => {
    try {
      const response = await fetch('/api/admin/campaigns', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCampaigns(data.campaigns || []);
        setCampaignStats(data.stats || campaignStats);
      }
    } catch (err) {
      console.error('Error fetching campaigns:', err);
    }
  };

  const handleCreateAgent = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/admin/agents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(agentFormData)
      });
      
      if (response.ok) {
        await fetchAgents();
        setShowCreateAgentModal(false);
        setAgentFormData({ name: '', email: '', role: 'agent' });
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to create agent');
      }
    } catch (err) {
      console.error('Error creating agent:', err);
      setError('Failed to create agent');
    }
  };

  const handleDeleteAgent = async (agentId) => {
    try {
      const response = await fetch(`/api/admin/agents/${agentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        await fetchAgents();
        setShowDeleteConfirm(null);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to delete agent');
      }
    } catch (err) {
      console.error('Error deleting agent:', err);
      setError('Failed to delete agent');
    }
  };

  const handleAssignLeads = async (agentId) => {
    try {
      const response = await fetch('/api/admin/assign-leads', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agentId,
          leadIds: selectedLeads
        })
      });
      
      if (response.ok) {
        await fetchLeads();
        setSelectedLeads([]);
        setShowAssignModal(false);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to assign leads');
      }
    } catch (err) {
      console.error('Error assigning leads:', err);
      setError('Failed to assign leads');
    }
  };

  const handleSignOut = async () => {
    try {
      localStorage.removeItem('auth_token');
      router.push('/');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const handleViewLead = (lead) => {
    setSelectedLead(lead);
    setShowLeadModal(true);
  };

  const handleCloseLeadModal = () => {
    setShowLeadModal(false);
    setSelectedLead(null);
  };

  const fetchMeetings = async () => {
    setMeetingsLoading(true);
    setMeetingsError(null);
    try {
      const response = await fetch('/api/admin/meetings', {
        headers: {
          'Authorization': `Bearer ${user.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch meetings');
      }
      
      const data = await response.json();
      setMeetings(data.meetings || []);
    } catch (error) {
      console.error('Error fetching meetings:', error);
      setMeetingsError(error.message);
    } finally {
      setMeetingsLoading(false);
    }
  };

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = !searchTerm || 
      lead.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const unassignedLeads = filteredLeads.filter(lead => !lead.assignedAgentId);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }
  return (
    <>
      <Head>
        <title>Admin Dashboard - Lead Management</title>
        <meta name="description" content="Admin Dashboard for Lead Management System" />
      </Head>
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50">
        {/* Header */}
        <header className="bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 shadow-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-purple-100">Welcome, {user?.name || user?.email}</span>
                <button
                  onClick={handleSignOut}
                  className="flex items-center space-x-2 text-purple-100 hover:text-white hover:bg-white hover:bg-opacity-20 px-3 py-2 rounded-lg transition-all duration-200"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Navigation Tabs */}
        <div className="bg-white shadow-sm border-b border-purple-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex space-x-8">
              {[
                { id: 'overview', label: 'Overview', icon: BarChart3, color: 'from-blue-500 to-cyan-500' },
                { id: 'agents', label: 'Agent Management', icon: Users, color: 'from-green-500 to-emerald-500' },
                { id: 'leads', label: 'Lead Assignment', icon: Target, color: 'from-purple-500 to-pink-500' },
                { id: 'campaigns', label: 'Confirmed Meetings', icon: CalendarDays, color: 'from-orange-500 to-red-500' }
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center space-x-2 py-4 px-3 border-b-3 font-semibold text-sm transition-all duration-200 rounded-t-lg ${
                      activeTab === tab.id
                        ? `border-transparent bg-gradient-to-r ${tab.color} text-white shadow-lg transform -translate-y-1`
                        : 'border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex">
                <AlertCircle className="h-5 w-5 text-red-400" />
                <div className="ml-3">
                  <p className="text-sm text-red-800">{error}</p>
                  <button
                    onClick={() => setError(null)}
                    className="mt-2 text-sm text-red-600 hover:text-red-800"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 text-white transform hover:scale-105">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="p-3 bg-white bg-opacity-20 rounded-lg">
                        <Users className="h-8 w-8 text-white" />
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-blue-100 truncate">Total Agents</dt>
                        <dd className="text-2xl font-bold text-white">{agents.length}</dd>
                      </dl>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 text-white transform hover:scale-105">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="p-3 bg-white bg-opacity-20 rounded-lg">
                        <Target className="h-8 w-8 text-white" />
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-green-100 truncate">Total Leads</dt>
                        <dd className="text-2xl font-bold text-white">{leads.length}</dd>
                      </dl>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gradient-to-br from-orange-500 to-red-500 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 text-white transform hover:scale-105">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="p-3 bg-white bg-opacity-20 rounded-lg">
                        <AlertCircle className="h-8 w-8 text-white" />
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-orange-100 truncate">Unassigned Leads</dt>
                        <dd className="text-2xl font-bold text-white">{unassignedLeads.length}</dd>
                      </dl>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 text-white transform hover:scale-105">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="p-3 bg-white bg-opacity-20 rounded-lg">
                        <CalendarDays className="h-8 w-8 text-white" />
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-purple-100 truncate">Confirmed Meetings</dt>
                        <dd className="text-2xl font-bold text-white">{campaignStats.active}</dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">System Overview</h3>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-3">Agent Status</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Active Agents</span>
                          <span className="font-medium">{agents.filter(a => a.is_active).length}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Inactive Agents</span>
                          <span className="font-medium">{agents.filter(a => !a.is_active).length}</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-3">Lead Distribution</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Assigned Leads</span>
                          <span className="font-medium">{leads.filter(l => l.assignedAgentId).length}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Unassigned Leads</span>
                          <span className="font-medium">{unassignedLeads.length}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Agent Management Tab */}
          {activeTab === 'agents' && (
            <div className="space-y-8">
              {/* Enhanced Header */}
              <div className="bg-gradient-to-r from-purple-600 via-blue-600 to-cyan-600 rounded-xl shadow-lg p-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-3xl font-bold text-white mb-2">Agent Management</h2>
                    <p className="text-purple-100">Manage your team of agents and their status efficiently</p>
                  </div>
                  <button
                    onClick={() => setShowCreateAgentModal(true)}
                    className="flex items-center space-x-2 bg-white/20 backdrop-blur-sm text-white px-6 py-3 rounded-lg hover:bg-white/30 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                  >
                    <UserPlus className="w-5 h-5" />
                    <span className="font-semibold">Create Agent</span>
                  </button>
                </div>
              </div>

              {/* Agent Status Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl shadow-lg p-6 text-white transform hover:scale-105 transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-emerald-100 text-sm font-medium">Active Agents</p>
                      <p className="text-3xl font-bold">{agents.filter(a => a.is_active).length}</p>
                    </div>
                    <div className="bg-white/20 p-3 rounded-lg">
                      <Users className="w-8 h-8" />
                    </div>
                  </div>
                </div>
                
                <div className="bg-gradient-to-br from-red-500 to-pink-600 rounded-xl shadow-lg p-6 text-white transform hover:scale-105 transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-red-100 text-sm font-medium">Inactive Agents</p>
                      <p className="text-3xl font-bold">{agents.filter(a => !a.is_active).length}</p>
                    </div>
                    <div className="bg-white/20 p-3 rounded-lg">
                      <UserMinus className="w-8 h-8" />
                    </div>
                  </div>
                </div>
                
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg p-6 text-white transform hover:scale-105 transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-blue-100 text-sm font-medium">Total Agents</p>
                      <p className="text-3xl font-bold">{agents.length}</p>
                    </div>
                    <div className="bg-white/20 p-3 rounded-lg">
                      <Building2 className="w-8 h-8" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Agent Information
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Role & Permissions
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Last Activity
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Lead Count
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {agents.map((agent) => {
                        const agentLeadCount = leads.filter(lead => lead.assigned_agent_id === agent.id).length;
                        const isActive = agent.is_active;
                        
                        return (
                          <tr key={agent.id} className={`hover:bg-gradient-to-r transition-all duration-300 ${
                            isActive 
                              ? 'hover:from-green-50 hover:to-emerald-50 border-l-4 border-l-green-400' 
                              : 'hover:from-red-50 hover:to-pink-50 border-l-4 border-l-red-400 opacity-75'
                          }`}>
                            <td className="px-6 py-5 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 h-12 w-12 relative">
                                  <div className={`h-12 w-12 rounded-full flex items-center justify-center shadow-lg ${
                                    isActive 
                                      ? 'bg-gradient-to-br from-green-400 to-emerald-500' 
                                      : 'bg-gradient-to-br from-gray-400 to-gray-500'
                                  }`}>
                                    <User className="h-6 w-6 text-white" />
                                  </div>
                                  {/* Status indicator dot */}
                                  <div className={`absolute -top-1 -right-1 h-4 w-4 rounded-full border-2 border-white ${
                                    isActive ? 'bg-green-400' : 'bg-red-400'
                                  }`}></div>
                                </div>
                                <div className="ml-4">
                                  <div className={`text-sm font-bold ${
                                    isActive ? 'text-gray-900' : 'text-gray-600'
                                  }`}>
                                    {agent.name || 'No name'}
                                  </div>
                                  <div className="text-sm text-gray-500 flex items-center">
                                    <Mail className="w-3 h-3 mr-1" />
                                    {agent.email}
                                  </div>
                                  {agent.email_verified && (
                                    <div className="flex items-center mt-1">
                                      <Check className="w-3 h-3 text-green-500 mr-1" />
                                      <span className="text-xs text-green-600 font-medium">Verified</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap">
                              <span className={`inline-flex items-center px-3 py-1 text-xs font-bold rounded-full shadow-sm ${
                                agent.role === 'admin' 
                                  ? 'bg-gradient-to-r from-purple-100 to-indigo-100 text-purple-800 border border-purple-200' 
                                  : 'bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-800 border border-blue-200'
                              }`}>
                                {agent.role === 'admin' && <Settings className="w-3 h-3 mr-1" />}
                                {agent.role === 'agent' && <User className="w-3 h-3 mr-1" />}
                                {agent.role.charAt(0).toUpperCase() + agent.role.slice(1)}
                              </span>
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap">
                              <div className="flex items-center">
                                <span className={`inline-flex items-center px-3 py-2 text-sm font-bold rounded-lg shadow-sm ${
                                  isActive 
                                    ? 'bg-gradient-to-r from-green-100 to-emerald-100 text-green-800 border border-green-200' 
                                    : 'bg-gradient-to-r from-red-100 to-pink-100 text-red-800 border border-red-200'
                                }`}>
                                  <div className={`w-2 h-2 rounded-full mr-2 ${
                                    isActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                                  }`}></div>
                                  {isActive ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap">
                              <div className="text-sm text-gray-900 font-medium flex items-center">
                                <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                                {agent.last_login 
                                  ? format(new Date(agent.last_login), 'MMM d, yyyy')
                                  : 'Never logged in'
                                }
                              </div>
                              {agent.last_login && (
                                <div className="text-xs text-gray-500">
                                  {format(new Date(agent.last_login), 'HH:mm')}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${
                                  agentLeadCount > 0 
                                    ? 'bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-800 border border-blue-200' 
                                    : 'bg-gray-100 text-gray-600 border border-gray-200'
                                }`}>
                                  <Target className="w-3 h-3 mr-1" />
                                  {agentLeadCount} leads
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap text-sm font-medium">
                              <div className="flex space-x-3">
                                <button
                                  onClick={() => setShowDeleteConfirm(agent.id)}
                                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 hover:text-red-700 transition-all duration-200 border border-red-200 hover:border-red-300"
                                >
                                  <Trash2 className="w-4 h-4 mr-1" />
                                  Delete
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

          {/* Enhanced Lead Assignment Tab */}
          {activeTab === 'leads' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Lead Assignment</h2>
                  <p className="text-gray-600 mt-1">Manage and assign leads to your sales agents</p>
                </div>
                {selectedLeads.length > 0 && (
                  <div className="flex items-center space-x-3">
                    <div className="bg-gradient-to-r from-purple-100 to-pink-100 px-4 py-2 rounded-lg border border-purple-200">
                      <span className="text-sm font-medium text-purple-800">
                        {selectedLeads.length} lead{selectedLeads.length !== 1 ? 's' : ''} selected
                      </span>
                    </div>
                    <button
                      onClick={() => setShowAssignModal(true)}
                      className="flex items-center space-x-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-3 rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                    >
                      <Target className="w-5 h-5" />
                      <span className="font-semibold">Assign Selected</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Enhanced Filters */}
              <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-purple-400 w-5 h-5" />
                      <input
                        type="text"
                        placeholder="Search leads by name or email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-12 pr-4 py-3 w-full border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-purple-200 focus:border-purple-400 transition-all duration-200 bg-gray-50 focus:bg-white"
                      />
                    </div>
                  </div>
                  
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-purple-200 focus:border-purple-400 transition-all duration-200 bg-gray-50 focus:bg-white font-medium"
                  >
                    <option value="all">All Status</option>
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={selectedLeads.length === unassignedLeads.length && unassignedLeads.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedLeads(unassignedLeads.map(lead => lead.id));
                              } else {
                                setSelectedLeads([]);
                              }
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Contact
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Assigned Agent
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Created
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredLeads.map((lead) => {
                        const assignedAgent = agents.find(agent => agent.id === lead.assigned_agent_id);
                        return (
                          <tr key={lead.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleViewLead(lead)}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {!lead.assigned_agent_id && (
                                <input
                                  type="checkbox"
                                  checked={selectedLeads.includes(lead.id)}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    if (e.target.checked) {
                                      setSelectedLeads([...selectedLeads, lead.id]);
                                    } else {
                                      setSelectedLeads(selectedLeads.filter(id => id !== lead.id));
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {lead.full_name || 'No name'}
                                </div>
                                <div className="text-sm text-gray-500 flex items-center mt-1">
                                  <Mail className="w-3 h-3 mr-1" />
                                  {lead.email}
                                </div>
                                {lead.phone && (
                                  <div className="text-sm text-gray-500 flex items-center mt-1">
                                    <Phone className="w-3 h-3 mr-1" />
                                    {lead.phone}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                                {lead.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {assignedAgent ? (
                                <div className="flex items-center">
                                  <div className="flex-shrink-0 h-6 w-6">
                                    <div className="h-6 w-6 rounded-full bg-gray-300 flex items-center justify-center">
                                      <User className="h-3 w-3 text-gray-600" />
                                    </div>
                                  </div>
                                  <div className="ml-2">
                                    <div className="text-sm font-medium text-gray-900">
                                      {assignedAgent.name}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-sm text-gray-500">Unassigned</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {lead.created_at ? format(new Date(lead.created_at), 'MMM d, yyyy') : 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewLead(lead);
                                }}
                                className="text-blue-600 hover:text-blue-900 flex items-center"
                              >
                                <Eye className="w-4 h-4 mr-1" />
                                View
                              </button>
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

          {/* Confirmed Meetings Tab */}
          {activeTab === 'campaigns' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">Confirmed Meetings</h2>
                <button
                  onClick={fetchMeetings}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <CalendarDays className="-ml-1 mr-2 h-4 w-4" />
                  Refresh Meetings
                </button>
              </div>

              {/* Meeting Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <CalendarDays className="h-8 w-8 text-blue-600" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Total Meetings</dt>
                        <dd className="text-lg font-medium text-gray-900">{meetings.length}</dd>
                      </dl>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <Calendar className="h-8 w-8 text-green-600" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Today's Meetings</dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {meetings.filter(meeting => {
                            const today = new Date().toDateString();
                            return new Date(meeting.start_time).toDateString() === today;
                          }).length}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <Users className="h-8 w-8 text-purple-600" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Assigned Agents</dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {new Set(meetings.filter(m => m.agent_name).map(m => m.agent_name)).size}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <Target className="h-8 w-8 text-orange-600" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">This Week</dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {meetings.filter(meeting => {
                            const weekStart = new Date();
                            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
                            const weekEnd = new Date(weekStart);
                            weekEnd.setDate(weekStart.getDate() + 6);
                            const meetingDate = new Date(meeting.start_time);
                            return meetingDate >= weekStart && meetingDate <= weekEnd;
                          }).length}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              {/* Meetings Table */}
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">Meeting Schedule</h3>
                </div>
                <div className="overflow-x-auto">
                  {meetingsLoading ? (
                    <div className="p-6 text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                      <p className="mt-2 text-gray-600">Loading meetings...</p>
                    </div>
                  ) : meetingsError ? (
                    <div className="p-6 text-center">
                      <AlertCircle className="mx-auto h-8 w-8 text-red-500" />
                      <p className="mt-2 text-red-600">Error: {meetingsError}</p>
                      <button
                        onClick={fetchMeetings}
                        className="mt-2 text-blue-600 hover:text-blue-800"
                      >
                        Try again
                      </button>
                    </div>
                  ) : meetings.length === 0 ? (
                    <div className="p-6 text-center">
                      <CalendarDays className="mx-auto h-12 w-12 text-gray-400" />
                      <h3 className="mt-2 text-sm font-medium text-gray-900">No meetings scheduled</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Confirmed meetings will appear here when leads book appointments.
                      </p>
                    </div>
                  ) : (
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Participant
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date & Time
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Assigned Agent
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {meetings.map((meeting) => (
                          <tr key={meeting.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {meeting.lead_name || 'Unknown'}
                                </div>
                                <div className="text-sm text-gray-500 flex items-center mt-1">
                                  <Mail className="w-3 h-3 mr-1" />
                                  {meeting.lead_email || 'No email'}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {format(new Date(meeting.start_time), 'MMM d, yyyy')}
                              </div>
                              <div className="text-sm text-gray-500">
                                {format(new Date(meeting.start_time), 'h:mm a')} - {format(new Date(meeting.end_time), 'h:mm a')}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {meeting.agent_name ? (
                                <div className="flex items-center">
                                  <div className="flex-shrink-0 h-6 w-6">
                                    <div className="h-6 w-6 rounded-full bg-gray-300 flex items-center justify-center">
                                      <User className="h-3 w-3 text-gray-600" />
                                    </div>
                                  </div>
                                  <div className="ml-2">
                                    <div className="text-sm font-medium text-gray-900">
                                      {meeting.agent_name}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-sm text-gray-500">Unassigned</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                {meeting.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              {meeting.zoom_link && (
                                <a
                                  href={meeting.zoom_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-900 mr-3"
                                >
                                  Join Meeting
                                </a>
                              )}
                              <button
                                className="text-gray-600 hover:text-gray-900"
                                title="View Details"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Create Agent Modal */}
      {showCreateAgentModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Create New Agent</h3>
                <button
                  onClick={() => setShowCreateAgentModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <form onSubmit={handleCreateAgent} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    required
                    value={agentFormData.name}
                    onChange={(e) => setAgentFormData({...agentFormData, name: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    required
                    value={agentFormData.email}
                    onChange={(e) => setAgentFormData({...agentFormData, email: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Role</label>
                  <select
                    value={agentFormData.role}
                    onChange={(e) => setAgentFormData({...agentFormData, role: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="agent">Agent</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateAgentModal(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Create Agent
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mt-4">Delete Agent</h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500">
                  Are you sure you want to delete this agent? This action cannot be undone.
                </p>
              </div>
              <div className="flex justify-center space-x-3 mt-4">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteAgent(showDeleteConfirm)}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Assign Leads Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
          <div className="relative mx-auto p-6 border-0 w-full max-w-2xl shadow-2xl rounded-xl bg-white">
            <div className="">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Assign Leads to Agent</h3>
                  <p className="text-sm text-gray-600 mt-1">Select an agent to assign {selectedLeads.length} selected lead(s)</p>
                </div>
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full p-2 transition-all duration-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-4 border border-blue-200">
                  <div className="flex items-center space-x-2">
                    <Target className="w-5 h-5 text-blue-600" />
                    <span className="font-medium text-blue-900">
                      {selectedLeads.length} lead{selectedLeads.length !== 1 ? 's' : ''} ready for assignment
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                  {agents.filter(agent => agent.is_active).map((agent) => {
                    const agentLeadCount = leads.filter(lead => lead.assigned_agent_id === agent.id).length;
                    return (
                      <button
                        key={agent.id}
                        onClick={() => handleAssignLeads(agent.id)}
                        className="group text-left p-4 border-2 border-gray-200 rounded-xl hover:border-purple-400 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-purple-200 focus:border-purple-500 transition-all duration-200 bg-white hover:bg-gradient-to-br hover:from-purple-50 hover:to-pink-50"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="flex-shrink-0">
                            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow duration-200">
                              <User className="h-6 w-6 text-white" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-900 group-hover:text-purple-900">
                              {agent.name}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {agent.email}
                            </div>
                            <div className="flex items-center mt-1 space-x-2">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                {agentLeadCount} leads
                              </span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                Active
                              </span>
                            </div>
                          </div>
                          <div className="flex-shrink-0">
                            <ChevronDown className="h-4 w-4 text-gray-400 group-hover:text-purple-600 transform group-hover:rotate-90 transition-transform duration-200" />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                
                <div className="flex justify-end pt-4">
                  <button
                    onClick={() => setShowAssignModal(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lead Details Modal */}
      {showLeadModal && selectedLead && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Lead Details</h3>
                <button
                  onClick={handleCloseLeadModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="space-y-6">
                {/* Basic Information */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="text-md font-semibold text-gray-900 mb-3">Basic Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Full Name</label>
                      <p className="mt-1 text-sm text-gray-900">{selectedLead.full_name || 'Not provided'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Email</label>
                      <p className="mt-1 text-sm text-gray-900">{selectedLead.email}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Phone</label>
                      <p className="mt-1 text-sm text-gray-900">{selectedLead.phone || 'Not provided'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Status</label>
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        {selectedLead.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Contact Information */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="text-md font-semibold text-gray-900 mb-3">Contact Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Company</label>
                      <p className="mt-1 text-sm text-gray-900">{selectedLead.company || 'Not provided'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Job Title</label>
                      <p className="mt-1 text-sm text-gray-900">{selectedLead.job_title || 'Not provided'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Website</label>
                      <p className="mt-1 text-sm text-gray-900">{selectedLead.website || 'Not provided'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Lead Source</label>
                      <p className="mt-1 text-sm text-gray-900">{selectedLead.lead_source || 'Not provided'}</p>
                    </div>
                  </div>
                </div>

                {/* Assignment Information */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="text-md font-semibold text-gray-900 mb-3">Assignment</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Assigned Agent</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {selectedLead.assigned_agent_id ? 
                          agents.find(agent => agent.id === selectedLead.assigned_agent_id)?.name || 'Unknown Agent'
                          : 'Unassigned'
                        }
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Created Date</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {selectedLead.created_at ? format(new Date(selectedLead.created_at), 'MMM d, yyyy HH:mm') : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Additional Information */}
                {(selectedLead.notes || selectedLead.tags) && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="text-md font-semibold text-gray-900 mb-3">Additional Information</h4>
                    {selectedLead.notes && (
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700">Notes</label>
                        <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{selectedLead.notes}</p>
                      </div>
                    )}
                    {selectedLead.tags && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Tags</label>
                        <p className="mt-1 text-sm text-gray-900">{selectedLead.tags}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleCloseLeadModal}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}