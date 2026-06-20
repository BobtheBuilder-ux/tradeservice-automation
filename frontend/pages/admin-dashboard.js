import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { 
  Users, 
  Settings, 
  BarChart3, 
  Target, 
  Building2, 
  Search, 
  Filter, 
  Edit3, 
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
  CalendarDays,
  MessageSquare,
  Bot,
  BookOpen,
  PauseCircle,
  UploadCloud,
  FileText,
  ShieldOff,
  Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../lib/auth';
import {
  assignLeadToTenantAgent,
  deleteAllLeads,
  getBobActivity,
  getCallTranscript,
  listCampaigns,
  listFeedback,
  importLeadsFromCsv,
  listLeads,
  previewLeadCsvImport,
  listMeetings,
  listTenantAgents,
  recordCallOutcome,
  respondToFeedback,
  setFeedbackStatus,
  archiveTenantAgent,
  updateTenantAgentStatus,
  updateLeadReview,
  updateLeadSuppression,
} from '../lib/insforge-product';

export default function AdminDashboard() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // AI agent identity state
  const [aiAgents, setAiAgents] = useState([]);
  const [agentActionBusy, setAgentActionBusy] = useState('');
  const [deleteAgentTarget, setDeleteAgentTarget] = useState(null);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [meetingsError, setMeetingsError] = useState(null);
  
  // Lead Management State
  const [leads, setLeads] = useState([]);
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [leadImportFileName, setLeadImportFileName] = useState('');
  const [leadImportCsv, setLeadImportCsv] = useState('');
  const [leadImportPreview, setLeadImportPreview] = useState(null);
  const [leadImportLoading, setLeadImportLoading] = useState(false);
  const [leadImportMessage, setLeadImportMessage] = useState('');
  const [showDeleteAllLeadsModal, setShowDeleteAllLeadsModal] = useState(false);
  const [deleteAllLeadsConfirmation, setDeleteAllLeadsConfirmation] = useState('');
  const [deleteAllLeadsLoading, setDeleteAllLeadsLoading] = useState(false);
  
  // Campaign Management State
  const [campaigns, setCampaigns] = useState([]);
  const [campaignStats, setCampaignStats] = useState({
    active: 0,
    paused: 0,
    totalSpend: 0,
    totalLeads: 0
  });

  // Feedback Management State
  const [feedbackList, setFeedbackList] = useState([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackStats, setFeedbackStats] = useState({
    total: 0,
    pending: 0,
    inReview: 0,
    responded: 0
  });
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackResponse, setFeedbackResponse] = useState('');

  // Bob Activity State
  const [bobActivity, setBobActivity] = useState({
    actions: [],
    callActions: [],
    callOutcomes: [],
    reviewQueue: [],
    voiceWorker: null,
    stats: {
      totalActions: 0,
      pendingActions: 0,
      failedActions: 0,
      awaitingHuman: 0,
      awaitingCall: 0,
      activeCalls: 0,
      completedCalls: 0,
      reviewLeads: 0
    }
  });
  const [bobActivityLoading, setBobActivityLoading] = useState(false);
  const [bobControlBusy, setBobControlBusy] = useState(false);
  const [selectedCallTranscript, setSelectedCallTranscript] = useState(null);
  const [callTranscriptLoading, setCallTranscriptLoading] = useState(false);
  const [callOutcomeAction, setCallOutcomeAction] = useState(null);
  const [callOutcomeForm, setCallOutcomeForm] = useState({ outcome: 'needs_human_follow_up', notes: '' });

  useEffect(() => {
    // Wait for auth to finish loading before making redirect decisions
    if (authLoading) return;
    
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    
    // Ensure only admins can access this page
    if (user && user.role !== 'admin') {
      router.push('/login');
      return;
    }
    
    fetchDashboardData();
  }, [isAuthenticated, user, router, authLoading]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchAiAgents(),
        fetchLeads(),
        fetchCampaigns(),
        fetchFeedback(),
        fetchBobActivity()
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

  const fetchAiAgents = async () => {
    try {
      setAiAgents(await listTenantAgents(user));
    } catch (err) {
      console.error('Error fetching AI agents:', err);
    }
  };

  const handleAgentStatusChange = async (agent, status) => {
    if (!agent?.id) return;
    try {
      setAgentActionBusy(agent.id);
      setError(null);
      await updateTenantAgentStatus(user, agent.id, status);
      await fetchAiAgents();
    } catch (err) {
      console.error('Error updating AI agent status:', err);
      setError(err.message || 'Failed to update AI agent status');
    } finally {
      setAgentActionBusy('');
    }
  };

  const handleArchiveAgent = async () => {
    if (!deleteAgentTarget?.id) return;
    try {
      setAgentActionBusy(deleteAgentTarget.id);
      setError(null);
      await archiveTenantAgent(user, deleteAgentTarget.id);
      setDeleteAgentTarget(null);
      await fetchAiAgents();
    } catch (err) {
      console.error('Error deleting AI agent:', err);
      setError(err.message || 'Failed to delete AI agent');
    } finally {
      setAgentActionBusy('');
    }
  };

  const fetchLeads = async () => {
    try {
      setLeads(await listLeads(user));
    } catch (err) {
      console.error('Error fetching leads:', err);
    }
  };

  const fetchCampaigns = async () => {
    try {
      const data = await listCampaigns(user);
      setCampaigns(data.campaigns || []);
      setCampaignStats(data.stats || campaignStats);
    } catch (err) {
      console.error('Error fetching campaigns:', err);
    }
  };

  const fetchFeedback = async () => {
    try {
      setFeedbackLoading(true);
      const feedback = await listFeedback(user);
      setFeedbackList(feedback);
      setFeedbackStats({
        total: feedback.length,
        pending: feedback.filter((item) => item.status === 'pending').length,
        inReview: feedback.filter((item) => item.status === 'in_review').length,
        responded: feedback.filter((item) => item.status === 'responded').length,
      });
    } catch (err) {
      console.error('Error fetching feedback:', err);
    } finally {
      setFeedbackLoading(false);
    }
  };

  const fetchBobActivity = async () => {
    try {
      setBobActivityLoading(true);
      setBobActivity(await getBobActivity(user));
    } catch (err) {
      console.error('Error fetching Bob activity:', err);
    } finally {
      setBobActivityLoading(false);
    }
  };

  const handleStartQueuedCalls = async () => {
    setError('Queued call execution is being moved to an InsForge function. It is not available from the dashboard yet.');
  };

  const handleViewCallTranscript = async (action) => {
    try {
      setCallTranscriptLoading(true);
      setSelectedCallTranscript(await getCallTranscript(user, action.id));
    } catch (err) {
      console.error('Error loading call transcript:', err);
      setError('Failed to load call transcript');
    } finally {
      setCallTranscriptLoading(false);
    }
  };

  const openCallOutcomeModal = (action) => {
    const existingOutcome = action.result?.callOutcome || action.result?.outcome;
    const allowedOutcomes = bobActivity.callOutcomes.length
      ? bobActivity.callOutcomes
      : ['booked', 'no_answer', 'callback_requested', 'wrong_number', 'not_interested', 'needs_human_follow_up'];

    setCallOutcomeAction(action);
    setCallOutcomeForm({
      outcome: allowedOutcomes.includes(existingOutcome) ? existingOutcome : 'needs_human_follow_up',
      notes: action.result?.callOutcomeNotes || ''
    });
  };

  const handleRecordCallOutcome = async (e) => {
    e.preventDefault();
    if (!callOutcomeAction) return;

    try {
      setBobControlBusy(true);
      await recordCallOutcome(user, callOutcomeAction.id, callOutcomeForm);

      setCallOutcomeAction(null);
      setCallOutcomeForm({ outcome: 'needs_human_follow_up', notes: '' });
      await Promise.all([fetchBobActivity(), fetchLeads()]);
    } catch (err) {
      console.error('Error recording call outcome:', err);
      setError('Failed to record call outcome');
    } finally {
      setBobControlBusy(false);
    }
  };

  const handleUpdateBobReview = async (leadId, updates) => {
    try {
      await updateLeadReview(user, leadId, updates);
      await Promise.all([fetchBobActivity(), fetchLeads()]);
    } catch (err) {
      console.error('Error updating Bob review status:', err);
      setError('Failed to update Bob review status');
    }
  };

  const handleAssignLeads = async (agentId) => {
    try {
      for (const leadId of selectedLeads) {
        await assignLeadToTenantAgent(user, leadId, agentId);
      }

      await fetchLeads();
      setSelectedLeads([]);
      setShowAssignModal(false);
    } catch (err) {
      console.error('Error assigning leads:', err);
      setError('Failed to assign leads');
    }
  };

  const handleLeadImportFile = async (event) => {
    const file = event.target.files?.[0];
    setLeadImportMessage('');
    setLeadImportPreview(null);
    setLeadImportCsv('');
    setLeadImportFileName(file?.name || '');

    if (!file) return;

    try {
      setLeadImportLoading(true);
      const text = await file.text();
      const preview = await previewLeadCsvImport(user, text);
      setLeadImportCsv(text);
      setLeadImportPreview(preview);
      setLeadImportMessage(preview.importableRows.length
        ? preview.importableRows.length + ' lead(s) ready to import'
        : 'No valid, non-duplicate leads are ready to import');
    } catch (err) {
      console.error('Error previewing lead import:', err);
      setLeadImportMessage(err.message || 'Failed to preview CSV');
    } finally {
      setLeadImportLoading(false);
      event.target.value = '';
    }
  };

  const handleImportPreviewedLeads = async () => {
    if (!leadImportCsv || !leadImportPreview?.importableRows?.length) return;

    try {
      setLeadImportLoading(true);
      const result = await importLeadsFromCsv(user, {
        csvText: leadImportCsv,
        fileName: leadImportFileName,
      });
      setLeadImportPreview(null);
      setLeadImportCsv('');
      setLeadImportFileName('');
      setLeadImportMessage('Imported ' + result.inserted.length + ' lead(s) from CSV');
      await fetchLeads();
    } catch (err) {
      console.error('Error importing leads:', err);
      setLeadImportMessage(err.message || 'Failed to import CSV');
    } finally {
      setLeadImportLoading(false);
    }
  };

  const handleDeleteAllLeads = async () => {
    if (deleteAllLeadsConfirmation !== 'DELETE LEADS') return;

    try {
      setDeleteAllLeadsLoading(true);
      const result = await deleteAllLeads(user);
      setLeads([]);
      setSelectedLeads([]);
      setShowDeleteAllLeadsModal(false);
      setDeleteAllLeadsConfirmation('');
      setLeadImportMessage('Deleted ' + result.deletedCount + ' lead(s)');
      await Promise.all([fetchCampaigns(), fetchBobActivity()]);
    } catch (err) {
      console.error('Error deleting all leads:', err);
      setError(err.message || 'Failed to delete all leads');
    } finally {
      setDeleteAllLeadsLoading(false);
    }
  };

  const handleToggleDoNotContact = async (lead) => {
    try {
      const updatedLead = await updateLeadSuppression(user, lead.id, {
        doNotContact: !lead.doNotContact,
        optOutChannel: !lead.doNotContact ? 'all' : null,
        optOutReason: !lead.doNotContact ? 'Marked from admin dashboard' : null,
      });
      setLeads((current) => current.map((item) => item.id === updatedLead.id ? updatedLead : item));
      setSelectedLead((current) => current?.id === updatedLead.id ? updatedLead : current);
    } catch (err) {
      console.error('Error updating lead suppression:', err);
      setError('Failed to update lead contact status');
    }
  };

  const handleSignOut = async () => {
    try {
      localStorage.removeItem('auth_token');
      router.push('/login');
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
      setMeetings(await listMeetings(user));
    } catch (error) {
      console.error('Error fetching meetings:', error);
      setMeetingsError(error.message);
    } finally {
      setMeetingsLoading(false);
    }
  };

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = !searchTerm || 
      lead.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const unassignedLeads = filteredLeads.filter(lead => !lead.assignedTenantAgentId);

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
                  onClick={() => router.push('/knowledge-base')}
                  className="ops-button-secondary"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Knowledge Base</span>
                </button>
                <button
                  onClick={() => router.push('/settings/company')}
                  className="ops-button-secondary"
                >
                  <Settings className="w-4 h-4" />
                  <span>Settings</span>
                </button>
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
                { id: 'leads', label: 'Appointment Assignment', icon: Target, color: 'from-purple-500 to-pink-500' },
                { id: 'bob', label: 'Bob Activity', icon: Bot, color: 'from-slate-600 to-cyan-600' },
                { id: 'feedback', label: 'Agent Feedback', icon: MessageSquare, color: 'from-indigo-500 to-purple-500' },
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
                        <dt className="text-sm font-medium text-blue-100 truncate">AI Agents</dt>
                        <dd className="text-2xl font-bold text-white">{aiAgents.filter((agent) => agent.status !== 'archived').length}</dd>
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
                        <dt className="text-sm font-medium text-green-100 truncate">Total Appointment</dt>
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
                        <dt className="text-sm font-medium text-orange-100 truncate">Unassigned Appointment</dt>
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
                      <h4 className="text-sm font-medium text-gray-900 mb-3">AI Agent Status</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Live or testing</span>
                          <span className="font-medium">{aiAgents.filter(a => ['live', 'testing'].includes(a.status)).length}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Paused</span>
                          <span className="font-medium">{aiAgents.filter(a => a.status === 'paused').length}</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-3">Appointment Distribution</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Assigned Appointment</span>
                          <span className="font-medium">{leads.filter(l => l.assignedTenantAgentId).length}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Unassigned Appointment</span>
                          <span className="font-medium">{unassignedLeads.length}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="ops-panel">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-text-muted" />
                    <h3 className="text-sm font-semibold text-text-primary">AI Agents</h3>
                  </div>
                  <span className="ops-badge bg-info-soft text-info">
                    {aiAgents.filter((agent) => agent.status !== 'archived').length} active
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {aiAgents.filter((agent) => agent.status !== 'archived').map((agent) => {
                    const busy = agentActionBusy === agent.id;
                    const isDefault = agent.templateKey === 'bob-default';
                    const liveOrTesting = ['live', 'testing'].includes(agent.status);
                    return (
                      <div key={agent.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-text-primary">{agent.displayName || 'AI Agent'}</p>
                            {isDefault && <span className="ops-badge bg-info-soft text-info">Default</span>}
                            <span className={`ops-badge ${liveOrTesting ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>
                              {(agent.status || 'testing').replace(/_/g, ' ')}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-text-muted">{agent.voiceId || 'Voice not assigned'} · {agent.promptVersion || 'v1'}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {isDefault && agent.status !== 'live' && (
                            <button
                              type="button"
                              onClick={() => handleAgentStatusChange(agent, 'live')}
                              disabled={busy}
                              className="ops-button-secondary"
                            >
                              <Check className="h-4 w-4" />
                              <span>Live</span>
                            </button>
                          )}
                          {isDefault && agent.status === 'live' && (
                            <button
                              type="button"
                              onClick={() => handleAgentStatusChange(agent, 'testing')}
                              disabled={busy}
                              className="ops-button-secondary"
                            >
                              <ShieldOff className="h-4 w-4" />
                              <span>Testing</span>
                            </button>
                          )}
                          {!isDefault && (
                            agent.status === 'paused' ? (
                              <button
                                type="button"
                                onClick={() => handleAgentStatusChange(agent, 'live')}
                                disabled={busy}
                                className="ops-button-secondary"
                              >
                                <Check className="h-4 w-4" />
                                <span>Resume</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleAgentStatusChange(agent, 'paused')}
                                disabled={busy}
                                className="ops-button-secondary"
                              >
                                <PauseCircle className="h-4 w-4" />
                                <span>Pause</span>
                              </button>
                            )
                          )}
                          {!isDefault && agent.status !== 'testing' && (
                            <button
                              type="button"
                              onClick={() => handleAgentStatusChange(agent, 'testing')}
                              disabled={busy}
                              className="ops-button-secondary"
                            >
                              <ShieldOff className="h-4 w-4" />
                              <span>Testing</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeleteAgentTarget(agent)}
                            disabled={busy}
                            className="ops-button-secondary text-error"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Lead Assignment Tab */}
          {activeTab === 'leads' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">Appointment Assignment</h2>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedLeads.length > 0 && (
                    <button
                      onClick={() => setShowAssignModal(true)}
                      className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors"
                    >
                      <Target className="w-4 h-4" />
                      <span>Assign Selected ({selectedLeads.length})</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowDeleteAllLeadsModal(true)}
                    disabled={!leads.length}
                    className="ops-button-secondary inline-flex items-center gap-2 border-error text-error disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete all leads
                  </button>
                </div>
              </div>

              <div className="ops-panel p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <UploadCloud className="h-5 w-5 text-accent" />
                      <h3 className="text-sm font-semibold text-text-primary">CSV lead import</h3>
                    </div>
                    <p className="mt-1 text-xs text-text-muted">
                      Upload leads with call, SMS, WhatsApp, and email permission approved by default. Explicit no/false values and duplicates are still respected.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="ops-button-secondary inline-flex cursor-pointer items-center gap-2">
                      <FileText className="h-4 w-4" />
                      <span>{leadImportLoading ? 'Reading...' : 'Choose CSV'}</span>
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        className="sr-only"
                        onChange={handleLeadImportFile}
                        disabled={leadImportLoading}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleImportPreviewedLeads}
                      disabled={leadImportLoading || !leadImportPreview?.importableRows?.length}
                      className="ops-button-primary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Import valid leads
                    </button>
                  </div>
                </div>

                {leadImportMessage && (
                  <div className="mt-3 rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-text-secondary">
                    {leadImportMessage}
                  </div>
                )}

                {leadImportPreview && (
                  <div className="mt-4 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-5">
                      {[
                        ['Rows', leadImportPreview.summary.totalRows],
                        ['Ready', leadImportPreview.summary.validRows],
                        ['Duplicates', leadImportPreview.summary.duplicateRows],
                        ['Errors', leadImportPreview.summary.errorRows],
                        ['Skipped', leadImportPreview.summary.skippedRows],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-border bg-surface px-3 py-2">
                          <div className="text-xs text-text-muted">{label}</div>
                          <div className="text-lg font-semibold text-text-primary">{value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="max-h-72 overflow-auto rounded-lg border border-border">
                      <table className="min-w-full divide-y divide-border text-sm">
                        <thead className="bg-surface-secondary">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Row</th>
                            <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Lead</th>
                            <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Consent</th>
                            <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">State</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border bg-surface">
                          {leadImportPreview.rows.slice(0, 25).map((row) => (
                            <tr key={row.rowNumber}>
                              <td className="whitespace-nowrap px-3 py-2 text-text-muted">{row.rowNumber}</td>
                              <td className="px-3 py-2">
                                <div className="font-medium text-text-primary">{row.lead.fullName || row.lead.company || 'Unnamed lead'}</div>
                                <div className="text-xs text-text-muted">{row.lead.email || row.lead.phone || 'No contact'}</div>
                                {Object.keys(row.lead.customFields?.importedLeadData || {}).length > 0 && (
                                  <div className="mt-1 text-xs text-info">
                                    {Object.keys(row.lead.customFields.importedLeadData).length} extra field(s) saved for AI context
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-1">
                                  {[
                                    ['Call', row.lead.callConsent],
                                    ['SMS', row.lead.smsConsent],
                                    ['WhatsApp', row.lead.whatsappConsent],
                                    ['Email', row.lead.emailConsent],
                                  ].map(([label, allowed]) => (
                                    <span
                                      key={label}
                                      className={'ops-badge ' + (allowed ? 'bg-success-soft text-success' : 'bg-surface-secondary text-text-muted')}
                                    >
                                      {label}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <span className={'ops-badge ' + (
                                  row.status === 'ready'
                                    ? 'bg-success-soft text-success'
                                    : row.status === 'duplicate'
                                      ? 'bg-warning-soft text-warning'
                                      : 'bg-error-soft text-error'
                                )}>
                                  {row.status}
                                </span>
                                {[...row.errors, ...row.warnings].length > 0 && (
                                  <div className="mt-1 text-xs text-text-muted">
                                    {[...row.errors, ...row.warnings].join(', ')}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {leadImportPreview.rows.length > 25 && (
                      <p className="text-xs text-text-muted">Showing first 25 preview rows.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Filters */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input
                        type="text"
                        placeholder="Search Appointment by name or email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                  
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                        <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                          Consent
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Assigned AI Agent
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
                        const assignedAgent = aiAgents.find(agent => agent.id === lead.assignedTenantAgentId);
                        return (
                          <tr key={lead.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleViewLead(lead)}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {!lead.assignedTenantAgentId && (
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
                                  {lead.fullName || 'No name'}
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
                              {lead.doNotContact && (
                                <span className="ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-error-soft text-error">
                                  Do not contact
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex flex-wrap gap-1">
                                {[
                                  ['Call', lead.callConsent],
                                  ['SMS', lead.smsConsent],
                                  ['WA', lead.whatsappConsent],
                                  ['Email', lead.emailConsent],
                                ].map(([label, allowed]) => (
                                  <span
                                    key={label}
                                    className={'ops-badge ' + (allowed ? 'bg-success-soft text-success' : 'bg-surface-secondary text-text-muted')}
                                  >
                                    {label}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {assignedAgent ? (
                                <div className="flex items-center">
                                  <div className="flex-shrink-0 h-6 w-6">
                                    <div className="h-6 w-6 rounded-full bg-gray-300 flex items-center justify-center">
                                      <Bot className="h-3 w-3 text-gray-600" />
                                    </div>
                                  </div>
                                  <div className="ml-2">
                                    <div className="text-sm font-medium text-gray-900">
                                      {assignedAgent.displayName}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-sm text-gray-500">Unassigned</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {lead.createdAt ? format(new Date(lead.createdAt), 'MMM d, yyyy') : 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewLead(lead);
                                  }}
                                  className="flex items-center text-accent hover:text-accent-hover"
                                >
                                  <Eye className="w-4 h-4 mr-1" />
                                  View
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleDoNotContact(lead);
                                  }}
                                  className="flex items-center text-text-muted hover:text-error"
                                >
                                  <ShieldOff className="w-4 h-4 mr-1" />
                                  {lead.doNotContact ? 'Allow' : 'Do not contact'}
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

          {/* Bob Activity Tab */}
          {activeTab === 'bob' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Bob Activity</h2>
                  <p className="text-sm text-gray-600">Review automation decisions, queued outreach, and leads that need admin attention.</p>
                </div>
                <button
                  onClick={fetchBobActivity}
                  className="inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-slate-700 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500"
                >
                  <Bot className="-ml-1 mr-2 h-4 w-4" />
                  Refresh Bob
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { label: 'Total Actions', value: bobActivity.stats.totalActions, icon: Bot, tone: 'text-slate-700' },
                  { label: 'Pending', value: bobActivity.stats.pendingActions, icon: Calendar, tone: 'text-blue-600' },
                  { label: 'Needs Review', value: bobActivity.stats.reviewLeads, icon: AlertCircle, tone: 'text-orange-600' },
                  { label: 'Awaiting Human', value: bobActivity.stats.awaitingHuman, icon: User, tone: 'text-purple-600' },
                  { label: 'Awaiting Call', value: bobActivity.stats.awaitingCall, icon: Phone, tone: 'text-cyan-600' },
                  { label: 'Active Calls', value: bobActivity.stats.activeCalls, icon: Phone, tone: 'text-indigo-600' },
                  { label: 'Failed', value: bobActivity.stats.failedActions, icon: X, tone: 'text-red-600' }
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="bg-white rounded-lg shadow p-5">
                      <div className="flex items-center">
                        <Icon className={`h-7 w-7 ${item.tone}`} />
                        <div className="ml-4 min-w-0">
                          <p className="text-xs font-medium text-gray-500 truncate">{item.label}</p>
                          <p className="text-xl font-semibold text-gray-900">{item.value || 0}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Voice Call Control Center</h3>
                    <p className="text-sm text-gray-500">Monitor queued, active, and completed Bob calls, review transcripts, and record final outcomes.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center px-3 py-2 rounded-md text-xs font-semibold ${
                      bobActivity.voiceWorker?.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                    }`}>
                      Worker {bobActivity.voiceWorker?.enabled ? 'enabled' : 'disabled'}
                    </span>
                    <button
                      onClick={handleStartQueuedCalls}
                      disabled={bobControlBusy || !bobActivity.voiceWorker?.enabled}
                      className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-cyan-700 text-sm font-medium text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      <Phone className="w-4 h-4 mr-2" />
                      Start queued calls
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lead</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Call State</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Extracted Info</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Next Step</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Controls</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {bobActivity.callActions.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500">No call actions are queued or recently completed.</td>
                        </tr>
                      ) : bobActivity.callActions.map((action) => (
                        <tr key={action.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900">{action.leadFullName || action.leadFirstName || 'No name'}</div>
                            <div className="text-sm text-gray-500">{action.leadEmail || 'No email'}</div>
                            {action.leadPhone && <div className="text-xs text-gray-500 mt-1">{action.leadPhone}</div>}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              action.status === 'completed' ? 'bg-green-100 text-green-800' :
                              action.status === 'calling' ? 'bg-indigo-100 text-indigo-800' :
                              action.status === 'failed' ? 'bg-red-100 text-red-800' :
                              action.status === 'awaiting_call' ? 'bg-cyan-100 text-cyan-800' :
                              'bg-blue-100 text-blue-800'
                            }`}>
                              {action.status}
                            </span>
                            <div className="mt-2 text-xs text-gray-500">
                              {action.result?.providerStatus || action.result?.outcome || action.result?.callOutcome || 'No provider status'}
                            </div>
                            {action.result?.callAttemptCount && (
                              <div className="mt-1 text-xs text-gray-500">Attempt {action.result.callAttemptCount}</div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="max-w-xs space-y-1 text-xs text-gray-600">
                              <div>Service: {action.result?.extracted?.serviceInterest || action.leadServiceInterest || 'N/A'}</div>
                              <div>Timeline: {action.result?.extracted?.timeline || 'N/A'}</div>
                              <div>Location: {action.result?.extracted?.locationSummary || 'N/A'}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">{action.result?.currentStep || action.conversationStatus || 'N/A'}</div>
                            <div className="text-xs text-gray-500 max-w-xs">{action.reason || action.lastIntent || 'No reason recorded'}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => handleViewCallTranscript(action)}
                                className="inline-flex items-center px-3 py-2 rounded-md border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <Eye className="w-4 h-4 mr-1" />
                                Transcript
                              </button>
                              <button
                                onClick={() => openCallOutcomeModal(action)}
                                className="inline-flex items-center px-3 py-2 rounded-md bg-slate-700 text-sm text-white hover:bg-slate-800"
                              >
                                <Check className="w-4 h-4 mr-1" />
                                Outcome
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Human Review Queue</h3>
                    <p className="text-sm text-gray-500">Leads Bob has paused or escalated for an admin decision.</p>
                  </div>
                </div>
                {bobActivityLoading ? (
                  <div className="p-8 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700 mx-auto"></div>
                    <p className="mt-2 text-sm text-gray-500">Loading Bob activity...</p>
                  </div>
                ) : bobActivity.reviewQueue.length === 0 ? (
                  <div className="p-8 text-center">
                    <Check className="mx-auto h-10 w-10 text-green-500" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No leads need review</h3>
                    <p className="mt-1 text-sm text-gray-500">Bob has no paused or escalated leads right now.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lead</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qualification</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Updated</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {bobActivity.reviewQueue.map((lead) => (
                          <tr key={lead.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4">
                              <div className="text-sm font-medium text-gray-900">{lead.fullName || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'No name'}</div>
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
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{lead.qualificationStatus || 'unqualified'}</div>
                              <div className="text-xs text-gray-500">Score {lead.qualificationScore || 0} · {lead.schedulingState || 'not_started'}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm text-gray-900 max-w-xs">{lead.escalationReason || 'Review requested'}</div>
                              {lead.automationPaused && (
                                <span className="mt-2 inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                                  <PauseCircle className="w-3 h-3 mr-1" />
                                  Automation paused
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {lead.updatedAt ? format(new Date(lead.updatedAt), 'MMM d, yyyy HH:mm') : 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => handleUpdateBobReview(lead.id, {
                                    requiresHumanReview: false,
                                    automationPaused: false,
                                    escalationReason: '',
                                    leadStage: lead.leadStage === 'escalated' ? 'nurturing' : lead.leadStage,
                                  })}
                                  className="inline-flex items-center px-3 py-2 rounded-md bg-green-600 text-white hover:bg-green-700"
                                >
                                  <Check className="w-4 h-4 mr-1" />
                                  Resolve
                                </button>
                                <button
                                  onClick={() => handleUpdateBobReview(lead.id, {
                                    automationPaused: !lead.automationPaused,
                                    requiresHumanReview: lead.requiresHumanReview,
                                    escalationReason: lead.escalationReason || 'Admin paused automation for manual review'
                                  })}
                                  className="inline-flex items-center px-3 py-2 rounded-md bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                                >
                                  <PauseCircle className="w-4 h-4 mr-1" />
                                  {lead.automationPaused ? 'Resume' : 'Pause'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">Recent Bob Actions</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lead</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {bobActivity.actions.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500">No Bob actions recorded yet.</td>
                        </tr>
                      ) : bobActivity.actions.map((action) => (
                        <tr key={action.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{action.actionType}</div>
                            <div className="text-xs text-gray-500">{action.channel || 'system'}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900">{action.leadFullName || action.leadFirstName || 'No name'}</div>
                            <div className="text-sm text-gray-500">{action.leadEmail || 'No email'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              action.status === 'completed' ? 'bg-green-100 text-green-800' :
                              action.status === 'failed' ? 'bg-red-100 text-red-800' :
                              action.status === 'awaiting_human' ? 'bg-orange-100 text-orange-800' :
                              action.status === 'awaiting_call' ? 'bg-cyan-100 text-cyan-800' :
                              'bg-blue-100 text-blue-800'
                            }`}>
                              {action.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-600 max-w-md">{action.reason || action.lastIntent || 'No reason recorded'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {action.createdAt ? format(new Date(action.createdAt), 'MMM d, yyyy HH:mm') : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Feedback Management Tab */}
          {activeTab === 'feedback' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">Agent Feedback Management</h2>
                <button
                  onClick={fetchFeedback}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <MessageSquare className="-ml-1 mr-2 h-4 w-4" />
                  Refresh Feedback
                </button>
              </div>

              {/* Feedback Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <MessageSquare className="h-8 w-8 text-indigo-600" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Total Feedback</dt>
                        <dd className="text-lg font-medium text-gray-900">{feedbackStats.total}</dd>
                      </dl>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <AlertCircle className="h-8 w-8 text-yellow-600" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Pending Review</dt>
                        <dd className="text-lg font-medium text-gray-900">{feedbackStats.pending}</dd>
                      </dl>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <Eye className="h-8 w-8 text-blue-600" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">In Review</dt>
                        <dd className="text-lg font-medium text-gray-900">{feedbackStats.inReview}</dd>
                      </dl>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <Check className="h-8 w-8 text-green-600" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Responded</dt>
                        <dd className="text-lg font-medium text-gray-900">{feedbackStats.responded}</dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              {/* Feedback Table */}
              <div className="bg-white shadow overflow-hidden sm:rounded-md">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Recent Feedback</h3>
                  
                  {feedbackLoading ? (
                    <div className="text-center py-8">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                      <p className="mt-2 text-sm text-gray-500">Loading feedback...</p>
                    </div>
                  ) : feedbackList.length === 0 ? (
                    <div className="text-center py-8">
                      <MessageSquare className="mx-auto h-12 w-12 text-gray-400" />
                      <h3 className="mt-2 text-sm font-medium text-gray-900">No feedback yet</h3>
                      <p className="mt-1 text-sm text-gray-500">Agents haven't submitted any feedback yet.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Agent & Lead
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Type & Priority
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Status
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Submitted
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {feedbackList.map((feedback) => (
                            <tr key={feedback.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                  <div className="flex-shrink-0 h-10 w-10">
                                    <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                                      <User className="h-5 w-5 text-indigo-600" />
                                    </div>
                                  </div>
                                  <div className="ml-4">
                                    <div className="text-sm font-medium text-gray-900">
                                      {feedback.agent?.name || 'Unknown Agent'}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                      Lead: {feedback.lead?.fullName || feedback.lead?.email || 'Unknown Lead'}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">{feedback.type}</div>
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  feedback.priority === 'high' ? 'bg-red-100 text-red-800' :
                                  feedback.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-green-100 text-green-800'
                                }`}>
                                  {feedback.priority}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  feedback.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                  feedback.status === 'in_review' ? 'bg-blue-100 text-blue-800' :
                                  'bg-green-100 text-green-800'
                                }`}>
                                  {feedback.status.replace('_', ' ')}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {feedback.createdAt ? format(new Date(feedback.createdAt), 'MMM d, yyyy HH:mm') : 'N/A'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <button
                                  onClick={() => {
                                    setSelectedFeedback(feedback);
                                    setShowFeedbackModal(true);
                                  }}
                                  className="text-indigo-600 hover:text-indigo-900 mr-3"
                                >
                                  View Details
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {showDeleteAllLeadsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-surface shadow-lg">
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Trash2 className="h-5 w-5 text-error" />
                  <h3 className="text-sm font-semibold text-text-primary">Delete all leads</h3>
                </div>
                <button
                  type="button"
                  className="rounded-lg p-1 text-text-muted hover:bg-surface-secondary"
                  onClick={() => {
                    setShowDeleteAllLeadsModal(false);
                    setDeleteAllLeadsConfirmation('');
                  }}
                  disabled={deleteAllLeadsLoading}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="space-y-4 px-4 py-4">
              <div className="rounded-lg border border-error bg-error-soft px-3 py-2 text-sm text-error">
                This will permanently delete {leads.length} tenant lead(s). Related lead timelines and campaign lead links may be removed through database cascade rules.
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-text-secondary">
                  Type DELETE LEADS to confirm
                </span>
                <input
                  className="ops-input"
                  value={deleteAllLeadsConfirmation}
                  onChange={(event) => setDeleteAllLeadsConfirmation(event.target.value)}
                  placeholder="DELETE LEADS"
                  disabled={deleteAllLeadsLoading}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              <button
                type="button"
                className="ops-button-secondary"
                onClick={() => {
                  setShowDeleteAllLeadsModal(false);
                  setDeleteAllLeadsConfirmation('');
                }}
                disabled={deleteAllLeadsLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ops-button-primary bg-error text-accent-foreground hover:bg-error disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleDeleteAllLeads}
                disabled={deleteAllLeadsLoading || deleteAllLeadsConfirmation !== 'DELETE LEADS'}
              >
                {deleteAllLeadsLoading ? 'Deleting...' : 'Delete all leads'}
              </button>
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
                  <h3 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Assign Leads to AI Agent</h3>
                  <p className="text-sm text-gray-600 mt-1">Select an AI agent to assign {selectedLeads.length} selected lead(s)</p>
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
                  {aiAgents.filter(agent => agent.status !== 'archived').map((agent) => {
                    const agentLeadCount = leads.filter(lead => lead.assignedTenantAgentId === agent.id).length;
                    return (
                      <button
                        key={agent.id}
                        onClick={() => handleAssignLeads(agent.id)}
                        className="group text-left p-4 border-2 border-gray-200 rounded-xl hover:border-purple-400 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-purple-200 focus:border-purple-500 transition-all duration-200 bg-white hover:bg-gradient-to-br hover:from-purple-50 hover:to-pink-50"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="flex-shrink-0">
                            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow duration-200">
                              <Bot className="h-6 w-6 text-white" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-900 group-hover:text-purple-900">
                              {agent.displayName}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {agent.voiceId || 'Provider default voice'}
                            </div>
                            <div className="flex items-center mt-1 space-x-2">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                {agentLeadCount} leads
                              </span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {agent.status}
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
                      <p className="mt-1 text-sm text-gray-900">{selectedLead.fullName || 'Not provided'}</p>
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
                      <p className="mt-1 text-sm text-gray-900">{selectedLead.jobTitle || selectedLead.job_title || 'Not provided'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Website</label>
                      <p className="mt-1 text-sm text-gray-900">{selectedLead.website || 'Not provided'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Lead Source</label>
                      <p className="mt-1 text-sm text-gray-900">{selectedLead.leadSource || selectedLead.lead_source || 'Not provided'}</p>
                    </div>
                  </div>
                </div>

                {/* Consent and Suppression */}
                <div className="bg-surface-secondary p-4 rounded-lg border border-border">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-md font-semibold text-text-primary">Consent and suppression</h4>
                    <button
                      type="button"
                      onClick={() => handleToggleDoNotContact(selectedLead)}
                      className="ops-button-secondary h-8 px-2"
                    >
                      {selectedLead.doNotContact ? 'Allow contact' : 'Mark do not contact'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {[
                      ['Call consent', selectedLead.callConsent],
                      ['SMS consent', selectedLead.smsConsent],
                      ['WhatsApp consent', selectedLead.whatsappConsent],
                      ['Email consent', selectedLead.emailConsent],
                    ].map(([label, allowed]) => (
                      <div key={label} className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2">
                        <span className="text-sm text-text-secondary">{label}</span>
                        <span className={'ops-badge ' + (allowed ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')}>
                          {allowed ? 'Allowed' : 'Missing'}
                        </span>
                      </div>
                    ))}
                  </div>
                  {(selectedLead.doNotContact || selectedLead.optedOutAt) && (
                    <div className="mt-3 rounded-lg border border-error bg-error-soft px-3 py-2 text-sm text-error">
                      {selectedLead.doNotContact ? 'This lead is marked do not contact.' : 'This lead has an opt-out record.'}
                      {selectedLead.optOutChannel ? ' Channel: ' + selectedLead.optOutChannel + '.' : ''}
                    </div>
                  )}
                </div>

                {/* Assignment Information */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="text-md font-semibold text-gray-900 mb-3">Assignment</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Assigned AI Agent</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {selectedLead.assignedTenantAgentId ?
                      aiAgents.find(agent => agent.id === selectedLead.assignedTenantAgentId)?.displayName || 'Unknown AI agent'
                          : 'Unassigned'
                        }
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Created Date</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {selectedLead.createdAt ? format(new Date(selectedLead.createdAt), 'MMM d, yyyy HH:mm') : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Additional Information */}
                {(selectedLead.notes || selectedLead.tags || Object.keys(selectedLead.customFields?.importedLeadData || {}).length > 0) && (
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
                    {Object.keys(selectedLead.customFields?.importedLeadData || {}).length > 0 && (
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-text-primary">Imported lead context</label>
                        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                          {Object.entries(selectedLead.customFields.importedLeadData).map(([label, value]) => (
                            <div key={label} className="rounded-lg border border-border bg-surface px-3 py-2">
                              <div className="text-xs font-medium text-text-muted">{label}</div>
                              <div className="mt-1 whitespace-pre-wrap text-sm text-text-primary">{String(value)}</div>
                            </div>
                          ))}
                        </div>
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

      {/* Call Transcript Modal */}
      {selectedCallTranscript && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-12 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-2/3 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Call Transcript</h3>
                  <p className="text-sm text-gray-500">
                    {selectedCallTranscript.lead?.fullName || selectedCallTranscript.lead?.firstName || 'Lead'} · {selectedCallTranscript.action?.status}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedCallTranscript(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Call Summary</h4>
                  <div className="space-y-2 text-sm text-gray-700">
                    <div>Status: {selectedCallTranscript.action?.status || 'N/A'}</div>
                    <div>Provider: {selectedCallTranscript.action?.result?.providerStatus || 'N/A'}</div>
                    <div>Step: {selectedCallTranscript.action?.result?.currentStep || 'N/A'}</div>
                    <div>Outcome: {selectedCallTranscript.action?.result?.outcome || selectedCallTranscript.action?.result?.callOutcome || 'N/A'}</div>
                    <div>SMS sent: {selectedCallTranscript.action?.result?.bookingSmsSent ? 'Yes' : 'No'}</div>
                  </div>
                </div>

                <div className="lg:col-span-2 bg-gray-50 p-4 rounded-lg">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Messages</h4>
                  {callTranscriptLoading ? (
                    <div className="p-6 text-center text-sm text-gray-500">Loading transcript...</div>
                  ) : selectedCallTranscript.messages?.length ? (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {selectedCallTranscript.messages.map((message) => (
                        <div key={message.id} className="bg-white border border-gray-200 rounded-md p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-gray-700">{message.channel} · {message.messageType}</span>
                            <span className="text-xs text-gray-500">
                              {message.createdAt ? format(new Date(message.createdAt), 'MMM d, yyyy HH:mm') : 'N/A'}
                            </span>
                          </div>
                          {message.subject && <p className="mt-2 text-sm font-medium text-gray-900">{message.subject}</p>}
                          <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{message.bodyText || 'No text captured'}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-sm text-gray-500">No transcript or SMS messages captured yet.</div>
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setSelectedCallTranscript(null)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Call Outcome Modal */}
      {callOutcomeAction && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-2/3 lg:w-1/2 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Record Call Outcome</h3>
                  <p className="text-sm text-gray-500">{callOutcomeAction.leadFullName || callOutcomeAction.leadFirstName || 'No name'}</p>
                </div>
                <button
                  onClick={() => setCallOutcomeAction(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleRecordCallOutcome} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Outcome</label>
                  <select
                    value={callOutcomeForm.outcome}
                    onChange={(e) => setCallOutcomeForm({ ...callOutcomeForm, outcome: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500"
                  >
                    {(bobActivity.callOutcomes.length ? bobActivity.callOutcomes : ['booked', 'no_answer', 'callback_requested', 'wrong_number', 'not_interested', 'needs_human_follow_up']).map((outcome) => (
                      <option key={outcome} value={outcome}>{outcome.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Notes</label>
                  <textarea
                    value={callOutcomeForm.notes}
                    onChange={(e) => setCallOutcomeForm({ ...callOutcomeForm, notes: e.target.value })}
                    rows={4}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500"
                    placeholder="Add context for the team..."
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCallOutcomeAction(null)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={bobControlBusy}
                    className="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    Save outcome
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {deleteAgentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-surface shadow-lg">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold text-text-primary">Delete AI agent</h3>
            </div>
            <div className="space-y-3 p-4">
              <p className="text-sm text-text-secondary">
                Delete {deleteAgentTarget.displayName || 'this AI agent'} from active use? Historical lead and action records stay intact.
              </p>
              {deleteAgentTarget.templateKey === 'bob-default' && (
                <div className="rounded-md border border-border bg-info-soft px-3 py-2 text-sm text-info">
                  Deleting the default agent will allow the platform to create a fresh Bob agent in testing mode.
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              <button type="button" onClick={() => setDeleteAgentTarget(null)} className="ops-button-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleArchiveAgent}
                disabled={agentActionBusy === deleteAgentTarget.id}
                className="ops-button-secondary text-error"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Detail Modal */}
      {showFeedbackModal && selectedFeedback && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Feedback Details</h3>
                <button
                  onClick={() => {
                    setShowFeedbackModal(false);
                    setSelectedFeedback(null);
                    setFeedbackResponse('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="space-y-6">
                {/* Feedback Information */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="text-md font-semibold text-gray-900 mb-3">Feedback Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Agent</label>
                      <p className="mt-1 text-sm text-gray-900">{selectedFeedback.agent?.name || 'Unknown Agent'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Lead</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {selectedFeedback.lead?.fullName || selectedFeedback.lead?.email || 'Unknown Lead'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Type</label>
                      <p className="mt-1 text-sm text-gray-900">{selectedFeedback.type}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Priority</label>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        selectedFeedback.priority === 'high' ? 'bg-red-100 text-red-800' :
                        selectedFeedback.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {selectedFeedback.priority}
                      </span>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Status</label>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        selectedFeedback.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        selectedFeedback.status === 'in_review' ? 'bg-blue-100 text-blue-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {selectedFeedback.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Submitted</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {selectedFeedback.createdAt ? format(new Date(selectedFeedback.createdAt), 'MMM d, yyyy HH:mm') : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Feedback Content */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="text-md font-semibold text-gray-900 mb-3">Feedback Content</h4>
                  <div className="bg-white p-3 rounded border">
                    <p className="text-sm text-gray-900 whitespace-pre-wrap">
                      {selectedFeedback.message || 'No message provided'}
                    </p>
                  </div>
                </div>

                {/* Admin Response */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="text-md font-semibold text-gray-900 mb-3">Admin Response</h4>
                  {selectedFeedback.adminResponse ? (
                    <div className="bg-white p-3 rounded border mb-3">
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">
                        {selectedFeedback.adminResponse}
                      </p>
                      <p className="text-xs text-gray-500 mt-2">
                        Responded: {selectedFeedback.respondedAt ? format(new Date(selectedFeedback.respondedAt), 'MMM d, yyyy HH:mm') : 'N/A'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <textarea
                        value={feedbackResponse}
                        onChange={(e) => setFeedbackResponse(e.target.value)}
                        placeholder="Enter your response to this feedback..."
                        rows={4}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <div className="flex space-x-2">
                        <button
                          onClick={async () => {
                            try {
                              await respondToFeedback(user, selectedFeedback.id, feedbackResponse);
                              await fetchFeedback();
                              setShowFeedbackModal(false);
                              setSelectedFeedback(null);
                              setFeedbackResponse('');
                            } catch (err) {
                              console.error('Error responding to feedback:', err);
                            }
                          }}
                          disabled={!feedbackResponse.trim()}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Send Response
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              await setFeedbackStatus(user, selectedFeedback.id, 'in_review');
                              await fetchFeedback();
                              setShowFeedbackModal(false);
                              setSelectedFeedback(null);
                            } catch (err) {
                              console.error('Error updating feedback status:', err);
                            }
                          }}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          Mark In Review
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => {
                    setShowFeedbackModal(false);
                    setSelectedFeedback(null);
                    setFeedbackResponse('');
                  }}
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
