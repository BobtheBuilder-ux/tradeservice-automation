import { useState, useEffect, useRef } from 'react';
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
  Trash2,
  Briefcase,
  Layers,
  Library,
  RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import { signOut, useAuth } from '../lib/auth';
import {
  assignLeadToTenantAgent,
  deleteAllLeads,
  getBobActivity,
  getCallTranscript,
  getLeadConversationSummary,
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
  createAssistedTenant,
  createPlatformKnowledgeDocument,
  getCurrentPlatformAdminProfile,
  getTenantOnboardingRedirect,
  listBusinessNiches,
  listPlatformKnowledgeDocuments,
  listSuperAdminSetupSessions,
  listTenantKnowledgeAssignments,
  listTenantsForAdmin,
  updateTenantAgentStatus,
  updateTenantBusinessNiche,
  updatePlatformKnowledgeDocument,
  updateLeadReview,
  updateLeadSuppression,
  updateSuperAdminSetupSession,
  updateTenantKnowledgeAssignment,
  upsertBusinessNiche,
  upsertTenantKnowledgeAssignment,
} from '../lib/insforge-product';
import { invokeFunction } from '../lib/insforge-functions';

export default function AdminDashboard() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const leadDiscussionRequestIdRef = useRef(0);
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
  const [leadRecallBusy, setLeadRecallBusy] = useState('');
  const [leadRecallMessage, setLeadRecallMessage] = useState('');
  const [testCallForm, setTestCallForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    serviceInterest: '',
    callConsent: false,
  });
  const [testCallLoading, setTestCallLoading] = useState(false);
  const [testCallResult, setTestCallResult] = useState(null);
  const [testCallError, setTestCallError] = useState('');
  
  // Campaign Management State
  const [campaigns, setCampaigns] = useState([]);
  const [campaignStats, setCampaignStats] = useState({
    active: 0,
    paused: 0,
    totalSpend: 0,
    totalLeads: 0
  });

  // Legacy super-admin setup and layered knowledge state
  const [platformTenants, setPlatformTenants] = useState([]);
  const [businessNiches, setBusinessNiches] = useState([]);
  const [platformKnowledgeDocuments, setPlatformKnowledgeDocuments] = useState([]);
  const [tenantKnowledgeAssignments, setTenantKnowledgeAssignments] = useState([]);
  const [setupSessions, setSetupSessions] = useState([]);
  const [platformAdminProfile, setPlatformAdminProfile] = useState({ isPlatformAdmin: false });
  const [platformLoading, setPlatformLoading] = useState(false);
  const [platformMessage, setPlatformMessage] = useState('');
  const [tenantSetupForm, setTenantSetupForm] = useState({
    name: '',
    ownerEmail: '',
    industry: '',
    businessNiche: '',
    defaultTimezone: 'America/Toronto',
  });
  const [nicheForm, setNicheForm] = useState({
    name: '',
    key: '',
    description: '',
    defaultPlaybookNotes: '',
  });
  const [platformKnowledgeForm, setPlatformKnowledgeForm] = useState({
    scope: 'global',
    nicheKey: '',
    title: '',
    sourceType: 'text',
    sourceUrl: '',
    bodyText: '',
  });
  const [assignmentForm, setAssignmentForm] = useState({
    tenantId: '',
    platformKnowledgeDocumentId: '',
    tenantAgentId: '',
    assignmentSource: 'super_admin_override',
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
  const [bobCampaignFilter, setBobCampaignFilter] = useState('');
  const [bobControlBusy, setBobControlBusy] = useState(false);
  const [selectedCallTranscript, setSelectedCallTranscript] = useState(null);
  const [callTranscriptLoading, setCallTranscriptLoading] = useState(false);
  const [leadDiscussionSummary, setLeadDiscussionSummary] = useState(null);
  const [leadDiscussionSummaryLoading, setLeadDiscussionSummaryLoading] = useState(false);
  const [leadDiscussionSummaryError, setLeadDiscussionSummaryError] = useState('');
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
      const platformProfile = await getCurrentPlatformAdminProfile();
      setPlatformAdminProfile(platformProfile);
      if (platformProfile.isPlatformAdmin) {
        router.replace('/overview');
        return;
      }
      const onboardingRedirect = await getTenantOnboardingRedirect(user);
      if (onboardingRedirect === '/onboarding') {
        router.replace('/onboarding');
        return;
      }
      await Promise.all([
        fetchAiAgents(),
        fetchLeads(),
        fetchCampaigns(),
        fetchFeedback(),
        fetchBobActivity(),
      ]);
      if (activeTab === 'platform') {
        setActiveTab('overview');
      }
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

  const fetchPlatformAdminData = async (profile = platformAdminProfile) => {
    if (!profile.isPlatformAdmin) return;
    try {
      setPlatformLoading(true);
      const [tenants, niches, documents, assignments, sessions] = await Promise.all([
        listTenantsForAdmin(),
        listBusinessNiches(),
        listPlatformKnowledgeDocuments(),
        listTenantKnowledgeAssignments(),
        listSuperAdminSetupSessions(),
      ]);
      setPlatformTenants(tenants);
      setBusinessNiches(niches);
      setPlatformKnowledgeDocuments(documents);
      setTenantKnowledgeAssignments(assignments);
      setSetupSessions(sessions);
    } catch (err) {
      console.error('Error fetching platform setup data:', err);
      setPlatformMessage(err.message || 'Platform setup data is not available yet.');
    } finally {
      setPlatformLoading(false);
    }
  };

  const handleCreateAssistedTenant = async (event) => {
    event.preventDefault();
    try {
      setPlatformLoading(true);
      setPlatformMessage('');
      const result = await createAssistedTenant(user, tenantSetupForm);
      setPlatformMessage(`Assisted setup started for ${result.tenant.name}.`);
      setTenantSetupForm({
        name: '',
        ownerEmail: '',
        industry: '',
        businessNiche: '',
        defaultTimezone: 'America/Toronto',
      });
      await fetchPlatformAdminData();
    } catch (err) {
      console.error('Error creating assisted tenant:', err);
      setPlatformMessage(err.message || 'Failed to create assisted tenant');
    } finally {
      setPlatformLoading(false);
    }
  };

  const handleSaveBusinessNiche = async (event) => {
    event.preventDefault();
    try {
      setPlatformLoading(true);
      setPlatformMessage('');
      const niche = await upsertBusinessNiche(user, nicheForm);
      setPlatformMessage(`${niche.name} niche saved.`);
      setNicheForm({ name: '', key: '', description: '', defaultPlaybookNotes: '' });
      await fetchPlatformAdminData();
    } catch (err) {
      console.error('Error saving business niche:', err);
      setPlatformMessage(err.message || 'Failed to save business niche');
    } finally {
      setPlatformLoading(false);
    }
  };

  const handleCreatePlatformKnowledge = async (event) => {
    event.preventDefault();
    try {
      setPlatformLoading(true);
      setPlatformMessage('');
      const document = await createPlatformKnowledgeDocument(user, platformKnowledgeForm);
      setPlatformMessage(`${document.title} added to shared knowledge.`);
      setPlatformKnowledgeForm({
        scope: 'global',
        nicheKey: '',
        title: '',
        sourceType: 'text',
        sourceUrl: '',
        bodyText: '',
      });
      await fetchPlatformAdminData();
    } catch (err) {
      console.error('Error creating platform knowledge:', err);
      setPlatformMessage(err.message || 'Failed to create shared knowledge');
    } finally {
      setPlatformLoading(false);
    }
  };

  const handleCreateKnowledgeAssignment = async (event) => {
    event.preventDefault();
    try {
      setPlatformLoading(true);
      setPlatformMessage('');
      const assignment = await upsertTenantKnowledgeAssignment(user, assignmentForm);
      setPlatformMessage(`Knowledge assignment ${assignment.status === 'active' ? 'enabled' : 'updated'}.`);
      setAssignmentForm({
        tenantId: '',
        platformKnowledgeDocumentId: '',
        tenantAgentId: '',
        assignmentSource: 'super_admin_override',
      });
      await fetchPlatformAdminData();
    } catch (err) {
      console.error('Error assigning knowledge:', err);
      setPlatformMessage(err.message || 'Failed to assign shared knowledge');
    } finally {
      setPlatformLoading(false);
    }
  };

  const handleTenantNicheChange = async (tenantId, businessNiche) => {
    try {
      setPlatformLoading(true);
      setPlatformMessage('');
      await updateTenantBusinessNiche(tenantId, businessNiche);
      setPlatformMessage('Tenant niche updated.');
      await fetchPlatformAdminData();
    } catch (err) {
      console.error('Error updating tenant niche:', err);
      setPlatformMessage(err.message || 'Failed to update tenant niche');
    } finally {
      setPlatformLoading(false);
    }
  };

  const handleDocumentStatusChange = async (documentId, status) => {
    try {
      setPlatformLoading(true);
      setPlatformMessage('');
      await updatePlatformKnowledgeDocument(documentId, { status });
      setPlatformMessage('Shared knowledge status updated.');
      await fetchPlatformAdminData();
    } catch (err) {
      console.error('Error updating shared knowledge:', err);
      setPlatformMessage(err.message || 'Failed to update shared knowledge');
    } finally {
      setPlatformLoading(false);
    }
  };

  const handleAssignmentStatusChange = async (assignmentId, status) => {
    try {
      setPlatformLoading(true);
      setPlatformMessage('');
      await updateTenantKnowledgeAssignment(assignmentId, { status });
      setPlatformMessage('Knowledge assignment updated.');
      await fetchPlatformAdminData();
    } catch (err) {
      console.error('Error updating knowledge assignment:', err);
      setPlatformMessage(err.message || 'Failed to update knowledge assignment');
    } finally {
      setPlatformLoading(false);
    }
  };

  const handleSetupSessionStatusChange = async (sessionId, status) => {
    try {
      setPlatformLoading(true);
      setPlatformMessage('');
      await updateSuperAdminSetupSession(sessionId, { status });
      setPlatformMessage('Setup session updated.');
      await fetchPlatformAdminData();
    } catch (err) {
      console.error('Error updating setup session:', err);
      setPlatformMessage(err.message || 'Failed to update setup session');
    } finally {
      setPlatformLoading(false);
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
      const loadedLeads = await listLeads(user);
      setLeads(loadedLeads);
    } catch (err) {
      console.error('Error fetching leads:', err);
    }
  };

  const isCallableAgent = (agent) => (
    agent
    && ['live', 'testing'].includes(agent.status)
    && agent.elevenlabsAgentId
  );

  const resolveRecallAgent = (lead) => {
    const assignedAgent = aiAgents.find((agent) => agent.id === lead?.assignedTenantAgentId);
    if (isCallableAgent(assignedAgent)) return assignedAgent;
    return aiAgents.find((agent) => agent.status === 'live' && agent.elevenlabsAgentId)
      || aiAgents.find((agent) => agent.status === 'testing' && agent.elevenlabsAgentId)
      || null;
  };

  const handleRecallLead = async (lead) => {
    if (!lead?.id || leadRecallBusy) return;
    setError(null);
    setLeadRecallMessage('');

    if (lead.doNotContact) {
      setLeadRecallMessage('This lead is marked do not contact.');
      return;
    }
    if (!lead.phone) {
      setLeadRecallMessage('This lead has no phone number.');
      return;
    }
    if (!lead.callConsent) {
      setLeadRecallMessage('Call consent is missing for this lead.');
      return;
    }

    const recallAgent = resolveRecallAgent(lead);
    if (!recallAgent) {
      setLeadRecallMessage('No synced live or testing AI agent is available. Create and sync an AI agent before recalling leads.');
      return;
    }

    try {
      setLeadRecallBusy(lead.id);
      const response = await invokeFunction('bob-queue-actions', {
        action: 'test-call',
        body: {
          tenantId: user?.tenantId,
          leadId: lead.id,
          tenantAgentId: recallAgent.id,
          reboundCall: true,
          reboundOpening: `Hi ${lead.fullName || 'there'}, this is ${recallAgent.displayName || 'your AI assistant'}. Sorry for the interruption, I am calling back to continue helping with your request.`,
        },
      });
      setLeadRecallMessage(`Recall started${response?.call?.sid ? ` (${response.call.sid})` : ''}.`);
      await Promise.all([fetchLeads(), fetchBobActivity()]);
    } catch (err) {
      console.error('Error starting recall:', err);
      setLeadRecallMessage(err.message || 'Failed to start recall.');
    } finally {
      setLeadRecallBusy('');
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

  const handleTestWhatsapp = async (event) => {
    event.preventDefault();
    setTestCallError('');
    setTestCallResult(null);

    if (!testCallForm.fullName.trim() || !testCallForm.phone.trim()) {
      setTestCallError('Enter the lead name and phone number.');
      return;
    }
    if (!testCallForm.callConsent) {
      setTestCallError('Confirm that you have permission to send this WhatsApp message.');
      return;
    }

    try {
      setTestCallLoading(true);
      const leadResponse = await invokeFunction('bob-queue-actions', {
        action: 'test-lead',
        body: {
          tenantId: user?.tenantId,
          fullName: testCallForm.fullName.trim(),
          phone: testCallForm.phone.trim(),
          email: testCallForm.email.trim() || undefined,
          serviceInterest: testCallForm.serviceInterest.trim() || undefined,
          whatsappConsent: true,
        },
      });
      const response = await invokeFunction('bob-queue-actions', {
        action: 'test-whatsapp',
        body: {
          tenantId: user?.tenantId,
          leadId: leadResponse.lead?.id,
          message: `WhatsApp test from your tenant. Reply STOP to opt out.`,
        },
      });
      setTestCallResult(response.message);
      setTestCallForm({
        fullName: '',
        phone: '',
        email: '',
        serviceInterest: '',
        callConsent: false,
      });
      await Promise.all([fetchBobActivity(), fetchLeads()]);
    } catch (err) {
      console.error('Error sending WhatsApp test:', err);
      setTestCallError(err.message || 'Failed to send the WhatsApp test.');
    } finally {
      setTestCallLoading(false);
    }
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
      setLeadImportMessage('Imported ' + result.inserted.length + ' lead(s) and started Campaign #' + result.campaign.campaignNumber);
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
      await signOut();
      router.replace('/login');
    } catch (err) {
      console.error('Sign out error:', err);
      setError('Failed to sign out. Please try again.');
    }
  };

  const handleViewLead = async (lead) => {
    const requestId = leadDiscussionRequestIdRef.current + 1;
    leadDiscussionRequestIdRef.current = requestId;
    setSelectedLead(lead);
    setShowLeadModal(true);
    setLeadDiscussionSummary(null);
    setLeadDiscussionSummaryError('');

    try {
      setLeadDiscussionSummaryLoading(true);
      const summary = await getLeadConversationSummary(user, lead.id);
      if (leadDiscussionRequestIdRef.current === requestId) {
        setLeadDiscussionSummary(summary);
      }
    } catch (err) {
      console.error('Error loading lead discussion summary:', err);
      if (leadDiscussionRequestIdRef.current === requestId) {
        setLeadDiscussionSummaryError(err.message || 'Failed to load discussion summary');
      }
    } finally {
      if (leadDiscussionRequestIdRef.current === requestId) {
        setLeadDiscussionSummaryLoading(false);
      }
    }
  };

  const handleCloseLeadModal = () => {
    leadDiscussionRequestIdRef.current += 1;
    setShowLeadModal(false);
    setSelectedLead(null);
    setLeadDiscussionSummary(null);
    setLeadDiscussionSummaryError('');
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
  const activePlatformDocuments = platformKnowledgeDocuments.filter((document) => document.status !== 'archived');
  const tenantsById = new Map(platformTenants.map((tenant) => [tenant.id, tenant]));
  const documentsById = new Map(platformKnowledgeDocuments.map((document) => [document.id, document]));
  const selectedAssignmentTenant = platformTenants.find((tenant) => tenant.id === assignmentForm.tenantId);
  const selectedAssignmentTenantAgents = selectedAssignmentTenant?.id === user?.tenantId
    ? aiAgents.filter((agent) => agent.status !== 'archived')
    : [];
  const dashboardTabs = [
    { id: 'overview', label: 'Overview Dashboard', icon: BarChart3 },
    { id: 'leads', label: 'Leads', icon: Target },
    { id: 'campaigns', label: 'Appointments', icon: CalendarDays },
    { id: 'bob', label: 'AI Agent', icon: Bot },
    { id: 'platform', label: 'Platform Setup', icon: Layers },
    { id: 'feedback', label: 'Feedback', icon: MessageSquare },
  ].filter((tab) => tab.id !== 'platform' || platformAdminProfile.isPlatformAdmin);

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
      
      <div className="min-h-screen bg-background text-text-primary">
        <div className="flex min-h-screen">
          <aside className="hidden w-64 shrink-0 border-r border-border bg-surface px-4 py-5 lg:flex lg:flex-col">
            <div className="mb-8 flex items-center gap-3 px-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">SetMyMeet</p>
                <p className="text-xs text-text-muted">Operations</p>
              </div>
            </div>

            <nav className="space-y-1">
              {dashboardTabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-accent text-accent-foreground'
                        : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>

          </aside>

          <div className="min-w-0 flex-1">
            <header className="border-b border-border bg-surface">
              <div className="flex min-h-20 flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold text-text-primary">Overview Dashboard</h1>
                  <p className="mt-1 text-sm text-text-muted">Monitor leads, bookings, AI performance, and tenant activity in one place.</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                    <input
                      type="search"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      className="ops-input pl-9 sm:w-80"
                      placeholder="Search leads, appointments, agents..."
                    />
                  </div>
                  <button type="button" onClick={() => router.push('/knowledge-base')} className="ops-button-secondary">
                    <BookOpen className="h-4 w-4" />
                    <span>Knowledge Base</span>
                  </button>
                  <button type="button" onClick={() => router.push('/lifecycle')} className="ops-button-secondary">
                    <RefreshCw className="h-4 w-4" />
                    <span>Lifecycle</span>
                  </button>
                  <button type="button" onClick={() => router.push('/settings/company')} className="ops-button-secondary">
                    <Settings className="h-4 w-4" />
                    <span>Settings</span>
                  </button>
                  <button type="button" onClick={handleSignOut} className="ops-button-secondary">
                    <LogOut className="h-4 w-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>

              <div className="flex gap-2 overflow-x-auto border-t border-border px-4 py-3 sm:px-6 lg:hidden">
                {dashboardTabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium ${
                        activeTab === tab.id
                          ? 'bg-accent text-accent-foreground'
                          : 'bg-surface-secondary text-text-secondary'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </header>

            <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
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
                    const liveOrTesting = ['live', 'testing'].includes(agent.status);
                    return (
                      <div key={agent.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-text-primary">{agent.displayName || 'AI Agent'}</p>
                            <span className={`ops-badge ${liveOrTesting ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>
                              {(agent.status || 'testing').replace(/_/g, ' ')}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-text-muted">
                            {agent.metadata?.voiceProfile?.selectedVoiceName || agent.metadata?.voiceProfile?.label || agent.voiceId || 'Voice not assigned'}
                            {' · '}
                            {agent.metadata?.personality?.label || 'Professional'}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {agent.status === 'paused' ? (
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
                          }
                          {agent.status !== 'testing' && (
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

              <form onSubmit={handleTestWhatsapp} className="ops-panel p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-info" />
                      <h3 className="text-sm font-semibold text-text-primary">Run WhatsApp test</h3>
                      <span className="ops-badge bg-info-soft text-info">Live providers</span>
                    </div>
                    <p className="mt-1 text-xs text-text-muted">
                      Send one tenant-scoped WhatsApp message through Twilio using the tenant's approved sender.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Lead name</span>
                      <input
                        value={testCallForm.fullName}
                        onChange={(event) => setTestCallForm((current) => ({ ...current, fullName: event.target.value }))}
                        className="ops-input w-full"
                        placeholder="Jane Doe"
                        required
                        disabled={testCallLoading}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Phone number</span>
                      <input
                        value={testCallForm.phone}
                        onChange={(event) => setTestCallForm((current) => ({ ...current, phone: event.target.value }))}
                        className="ops-input w-full"
                        placeholder="+15551234567"
                        inputMode="tel"
                        required
                        disabled={testCallLoading}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Email (optional)</span>
                      <input
                        value={testCallForm.email}
                        onChange={(event) => setTestCallForm((current) => ({ ...current, email: event.target.value }))}
                        className="ops-input w-full"
                        placeholder="jane@example.com"
                        type="email"
                        disabled={testCallLoading}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Service interest</span>
                      <input
                        value={testCallForm.serviceInterest}
                        onChange={(event) => setTestCallForm((current) => ({ ...current, serviceInterest: event.target.value }))}
                        className="ops-input w-full"
                        placeholder="Boiler repair"
                        disabled={testCallLoading}
                      />
                    </label>
                    <label className="flex max-w-sm items-start gap-2 rounded-lg border border-border bg-surface-secondary px-3 py-2 text-xs text-text-secondary">
                      <input
                        type="checkbox"
                        checked={testCallForm.callConsent}
                        onChange={(event) => {
                          setTestCallForm((current) => ({ ...current, callConsent: event.target.checked }));
                          setTestCallError('');
                        }}
                        className="mt-0.5 rounded border-border text-accent focus:ring-accent"
                        disabled={testCallLoading}
                      />
                      <span>I have consent to send this test WhatsApp message.</span>
                    </label>

                    <button
                      type="submit"
                      className="ops-button-primary inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={testCallLoading || !testCallForm.fullName.trim() || !testCallForm.phone.trim() || !testCallForm.callConsent}
                    >
                      <MessageSquare className="h-4 w-4" />
                      {testCallLoading ? 'Sending WhatsApp…' : 'Run test WhatsApp'}
                    </button>
                  </div>
                </div>

                {testCallError && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-error bg-error-soft px-3 py-2 text-sm text-error">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
                    <span>{testCallError}</span>
                  </div>
                )}

                {testCallResult && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-success bg-success-soft px-3 py-2 text-sm text-success">
                    <span className="inline-flex items-center gap-2 font-medium">
                      <Check className="h-4 w-4" />
                      WhatsApp queued
                    </span>
                    <span>To: {testCallResult.to || 'Unknown'}</span>
                    <span>Status: {testCallResult.status || 'queued'}</span>
                  </div>
                )}
              </form>

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

              {leadRecallMessage && (
                <div className="rounded-lg border border-border bg-surface-secondary px-4 py-3 text-sm text-text-secondary">
                  {leadRecallMessage}
                </div>
              )}

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
                                    handleRecallLead(lead);
                                  }}
                                  disabled={Boolean(leadRecallBusy) || !lead.phone || !lead.callConsent || lead.doNotContact}
                                  className="flex items-center text-accent hover:text-accent-hover disabled:cursor-not-allowed disabled:text-text-muted"
                                  title={
                                    lead.doNotContact
                                      ? 'Lead is marked do not contact'
                                      : !lead.phone
                                        ? 'Lead has no phone number'
                                        : !lead.callConsent
                                          ? 'Lead is missing call consent'
                                          : 'Start a rebound call'
                                  }
                                >
                                  <Phone className="w-4 h-4 mr-1" />
                                  {leadRecallBusy === lead.id ? 'Calling...' : 'Recall'}
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

          {/* Automation Activity Tab */}
          {activeTab === 'bob' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Automation Activity</h2>
                  <p className="text-sm text-gray-600">Review automation decisions, queued outreach, and leads that need admin attention.</p>
                </div>
                <button
                  onClick={fetchBobActivity}
                  className="inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-slate-700 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500"
                >
                  <Bot className="-ml-1 mr-2 h-4 w-4" />
                  Refresh activity
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
                  <select value={bobCampaignFilter} onChange={(event) => setBobCampaignFilter(event.target.value)} className="ops-select h-9 text-sm">
                    <option value="">All campaigns</option>
                    {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>Campaign #{campaign.campaignNumber}</option>)}
                  </select>
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
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Campaign</th>
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
                          <td className="px-6 py-4 text-sm text-gray-500">{action.campaignNumber ? `#${action.campaignNumber}` : 'Manual'}</td>
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
                      {bobActivity.actions.filter((action) => !bobCampaignFilter || action.campaignId === bobCampaignFilter).length === 0 ? (
                        <tr>
                          <td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500">No Bob actions recorded yet.</td>
                        </tr>
                      ) : bobActivity.actions.filter((action) => !bobCampaignFilter || action.campaignId === bobCampaignFilter).map((action) => (
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

          {/* Legacy Platform Setup Tab */}
          {activeTab === 'platform' && platformAdminProfile.isPlatformAdmin && (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-text-primary">Platform Setup</h2>
                  <p className="mt-1 text-sm text-text-muted">Create assisted tenants, manage shared knowledge, and assign global or niche playbooks.</p>
                </div>
                <button type="button" onClick={fetchPlatformAdminData} className="ops-button-secondary" disabled={platformLoading}>
                  <RefreshCw className="h-4 w-4" />
                  <span>Refresh</span>
                </button>
              </div>

              {platformMessage && (
                <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-secondary">
                  {platformMessage}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                {[
                  { label: 'Tenants', value: platformTenants.length, icon: Building2, tone: 'bg-accent-soft text-accent' },
                  { label: 'Business Niches', value: businessNiches.filter((niche) => niche.status === 'active').length, icon: Briefcase, tone: 'bg-success-soft text-success' },
                  { label: 'Shared Docs', value: activePlatformDocuments.length, icon: Library, tone: 'bg-info-soft text-info' },
                  { label: 'Assignments', value: tenantKnowledgeAssignments.filter((assignment) => assignment.status === 'active').length, icon: Layers, tone: 'bg-warning-soft text-warning' },
                ].map((metric) => {
                  const Icon = metric.icon;
                  return (
                    <div key={metric.label} className="ops-panel p-4">
                      <div className="flex items-center gap-4">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${metric.tone}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-text-muted">{metric.label}</p>
                          <p className="mt-1 text-2xl font-semibold text-text-primary">{metric.value}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <form onSubmit={handleCreateAssistedTenant} className="ops-panel p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-accent" />
                    <h3 className="text-sm font-semibold text-text-primary">Create Assisted Tenant</h3>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Company name</span>
                      <input className="ops-input" value={tenantSetupForm.name} onChange={(event) => setTenantSetupForm((current) => ({ ...current, name: event.target.value }))} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Owner email</span>
                      <input className="ops-input" value={tenantSetupForm.ownerEmail} onChange={(event) => setTenantSetupForm((current) => ({ ...current, ownerEmail: event.target.value }))} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Industry</span>
                      <input className="ops-input" value={tenantSetupForm.industry} onChange={(event) => setTenantSetupForm((current) => ({ ...current, industry: event.target.value }))} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Business niche</span>
                      <select className="ops-select" value={tenantSetupForm.businessNiche} onChange={(event) => setTenantSetupForm((current) => ({ ...current, businessNiche: event.target.value }))}>
                        <option value="">No niche selected</option>
                        {businessNiches.filter((niche) => niche.status === 'active').map((niche) => (
                          <option key={niche.key} value={niche.key}>{niche.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Default timezone</span>
                      <input className="ops-input" value={tenantSetupForm.defaultTimezone} onChange={(event) => setTenantSetupForm((current) => ({ ...current, defaultTimezone: event.target.value }))} />
                    </label>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button type="submit" className="ops-button-primary" disabled={platformLoading}>
                      <Plus className="h-4 w-4" />
                      <span>Start Setup</span>
                    </button>
                  </div>
                </form>

                <form onSubmit={handleSaveBusinessNiche} className="ops-panel p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-success" />
                    <h3 className="text-sm font-semibold text-text-primary">Business Niche Catalog</h3>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Niche name</span>
                      <input className="ops-input" value={nicheForm.name} onChange={(event) => setNicheForm((current) => ({ ...current, name: event.target.value }))} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Niche key</span>
                      <input className="ops-input" value={nicheForm.key} onChange={(event) => setNicheForm((current) => ({ ...current, key: event.target.value }))} placeholder="insurance" />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Description</span>
                      <input className="ops-input" value={nicheForm.description} onChange={(event) => setNicheForm((current) => ({ ...current, description: event.target.value }))} />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Default playbook notes</span>
                      <textarea className="ops-input h-20 py-2" value={nicheForm.defaultPlaybookNotes} onChange={(event) => setNicheForm((current) => ({ ...current, defaultPlaybookNotes: event.target.value }))} />
                    </label>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button type="submit" className="ops-button-primary" disabled={platformLoading}>
                      <Check className="h-4 w-4" />
                      <span>Save Niche</span>
                    </button>
                  </div>
                </form>
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <form onSubmit={handleCreatePlatformKnowledge} className="ops-panel p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <Library className="h-4 w-4 text-info" />
                    <h3 className="text-sm font-semibold text-text-primary">Shared Knowledge Document</h3>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Scope</span>
                      <select className="ops-select" value={platformKnowledgeForm.scope} onChange={(event) => setPlatformKnowledgeForm((current) => ({ ...current, scope: event.target.value, nicheKey: event.target.value === 'global' ? '' : current.nicheKey }))}>
                        <option value="global">Global</option>
                        <option value="niche">Niche</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Niche</span>
                      <select className="ops-select" value={platformKnowledgeForm.nicheKey} disabled={platformKnowledgeForm.scope === 'global'} onChange={(event) => setPlatformKnowledgeForm((current) => ({ ...current, nicheKey: event.target.value }))}>
                        <option value="">Select niche</option>
                        {businessNiches.filter((niche) => niche.status === 'active').map((niche) => (
                          <option key={niche.key} value={niche.key}>{niche.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Title</span>
                      <input className="ops-input" value={platformKnowledgeForm.title} onChange={(event) => setPlatformKnowledgeForm((current) => ({ ...current, title: event.target.value }))} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Source type</span>
                      <select className="ops-select" value={platformKnowledgeForm.sourceType} onChange={(event) => setPlatformKnowledgeForm((current) => ({ ...current, sourceType: event.target.value }))}>
                        <option value="text">Text</option>
                        <option value="url">URL</option>
                      </select>
                    </label>
                    {platformKnowledgeForm.sourceType === 'url' ? (
                      <label className="block sm:col-span-2">
                        <span className="mb-1 block text-xs font-medium text-text-secondary">Source URL</span>
                        <input className="ops-input" value={platformKnowledgeForm.sourceUrl} onChange={(event) => setPlatformKnowledgeForm((current) => ({ ...current, sourceUrl: event.target.value }))} />
                      </label>
                    ) : (
                      <label className="block sm:col-span-2">
                        <span className="mb-1 block text-xs font-medium text-text-secondary">Document text</span>
                        <textarea className="ops-input h-24 py-2" value={platformKnowledgeForm.bodyText} onChange={(event) => setPlatformKnowledgeForm((current) => ({ ...current, bodyText: event.target.value }))} />
                      </label>
                    )}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button type="submit" className="ops-button-primary" disabled={platformLoading}>
                      <Plus className="h-4 w-4" />
                      <span>Add Document</span>
                    </button>
                  </div>
                </form>

                <form onSubmit={handleCreateKnowledgeAssignment} className="ops-panel p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <Layers className="h-4 w-4 text-warning" />
                    <h3 className="text-sm font-semibold text-text-primary">Assign Shared Knowledge</h3>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Tenant</span>
                      <select className="ops-select" value={assignmentForm.tenantId} onChange={(event) => setAssignmentForm((current) => ({ ...current, tenantId: event.target.value, tenantAgentId: '' }))}>
                        <option value="">Select tenant</option>
                        {platformTenants.map((tenant) => (
                          <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Shared document</span>
                      <select className="ops-select" value={assignmentForm.platformKnowledgeDocumentId} onChange={(event) => setAssignmentForm((current) => ({ ...current, platformKnowledgeDocumentId: event.target.value }))}>
                        <option value="">Select document</option>
                        {activePlatformDocuments.map((document) => (
                          <option key={document.id} value={document.id}>{document.title}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Agent scope</span>
                      <select className="ops-select" value={assignmentForm.tenantAgentId} onChange={(event) => setAssignmentForm((current) => ({ ...current, tenantAgentId: event.target.value }))}>
                        <option value="">All active tenant agents</option>
                        {selectedAssignmentTenantAgents.map((agent) => (
                          <option key={agent.id} value={agent.id}>{agent.displayName}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-text-secondary">Source</span>
                      <select className="ops-select" value={assignmentForm.assignmentSource} onChange={(event) => setAssignmentForm((current) => ({ ...current, assignmentSource: event.target.value }))}>
                        <option value="super_admin_override">Super admin override</option>
                        <option value="global_default">Global default</option>
                        <option value="niche_default">Niche default</option>
                      </select>
                    </label>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button type="submit" className="ops-button-primary" disabled={platformLoading}>
                      <Check className="h-4 w-4" />
                      <span>Assign Knowledge</span>
                    </button>
                  </div>
                </form>
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="ops-panel overflow-hidden">
                  <div className="border-b border-border px-4 py-3">
                    <h3 className="text-sm font-semibold text-text-primary">Tenants and Assisted Setup</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-border text-sm">
                      <thead className="bg-surface-secondary text-xs text-text-muted">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Tenant</th>
                          <th className="px-4 py-3 text-left font-medium">Niche</th>
                          <th className="px-4 py-3 text-left font-medium">Status</th>
                          <th className="px-4 py-3 text-left font-medium">Setup</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border bg-surface">
                        {platformTenants.map((tenant) => {
                          const session = setupSessions.find((row) => row.tenantId === tenant.id);
                          return (
                            <tr key={tenant.id}>
                              <td className="px-4 py-3">
                                <div className="font-medium text-text-primary">{tenant.name}</div>
                                <div className="text-xs text-text-muted">{tenant.slug}</div>
                              </td>
                              <td className="px-4 py-3">
                                <select className="ops-select min-w-36" value={tenant.businessNiche || ''} onChange={(event) => handleTenantNicheChange(tenant.id, event.target.value)}>
                                  <option value="">None</option>
                                  {businessNiches.filter((niche) => niche.status === 'active').map((niche) => (
                                    <option key={niche.key} value={niche.key}>{niche.name}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-4 py-3">
                                <span className="ops-badge bg-info-soft text-info">{tenant.status}</span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="text-xs text-text-secondary">{session?.currentStep || 'Not started'}</div>
                                {session && (
                                  <button type="button" className="mt-2 text-xs font-medium text-accent" onClick={() => handleSetupSessionStatusChange(session.id, session.status === 'complete' ? 'in_progress' : 'complete')}>
                                    {session.status === 'complete' ? 'Reopen' : 'Mark complete'}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="ops-panel overflow-hidden">
                  <div className="border-b border-border px-4 py-3">
                    <h3 className="text-sm font-semibold text-text-primary">Shared Knowledge Assignments</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-border text-sm">
                      <thead className="bg-surface-secondary text-xs text-text-muted">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Document</th>
                          <th className="px-4 py-3 text-left font-medium">Tenant</th>
                          <th className="px-4 py-3 text-left font-medium">Source</th>
                          <th className="px-4 py-3 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border bg-surface">
                        {tenantKnowledgeAssignments.map((assignment) => (
                          <tr key={assignment.id}>
                            <td className="px-4 py-3">
                              <div className="font-medium text-text-primary">{documentsById.get(assignment.platformKnowledgeDocumentId)?.title || 'Shared document'}</div>
                              <div className="text-xs text-text-muted">{documentsById.get(assignment.platformKnowledgeDocumentId)?.scope || 'scope'}</div>
                            </td>
                            <td className="px-4 py-3 text-text-secondary">{tenantsById.get(assignment.tenantId)?.name || 'Tenant'}</td>
                            <td className="px-4 py-3 text-text-secondary">{assignment.assignmentSource?.replace(/_/g, ' ')}</td>
                            <td className="px-4 py-3">
                              <button type="button" className={`ops-badge ${assignment.status === 'active' ? 'bg-success-soft text-success' : 'bg-surface-secondary text-text-secondary'}`} onClick={() => handleAssignmentStatusChange(assignment.id, assignment.status === 'active' ? 'disabled' : 'active')}>
                                {assignment.status}
                              </button>
                            </td>
                          </tr>
                        ))}
                        {!tenantKnowledgeAssignments.length && (
                          <tr>
                            <td className="px-4 py-6 text-center text-sm text-text-muted" colSpan={4}>No shared knowledge has been assigned yet.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="ops-panel overflow-hidden">
                <div className="border-b border-border px-4 py-3">
                  <h3 className="text-sm font-semibold text-text-primary">Platform and Niche Knowledge Library</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-surface-secondary text-xs text-text-muted">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Document</th>
                        <th className="px-4 py-3 text-left font-medium">Scope</th>
                        <th className="px-4 py-3 text-left font-medium">Source</th>
                        <th className="px-4 py-3 text-left font-medium">Version</th>
                        <th className="px-4 py-3 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-surface">
                      {platformKnowledgeDocuments.map((document) => (
                        <tr key={document.id}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-text-primary">{document.title}</div>
                            <div className="text-xs text-text-muted">{document.nicheKey || 'all niches'}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`ops-badge ${document.scope === 'global' ? 'bg-accent-soft text-accent' : 'bg-warning-soft text-warning'}`}>
                              {document.scope === 'global' ? 'Global' : 'Niche'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-text-secondary">{document.sourceType}</td>
                          <td className="px-4 py-3 text-text-secondary">v{document.version || 1}</td>
                          <td className="px-4 py-3">
                            <select className="ops-select min-w-32" value={document.status || 'uploaded'} onChange={(event) => handleDocumentStatusChange(document.id, event.target.value)}>
                              <option value="uploaded">uploaded</option>
                              <option value="processing">processing</option>
                              <option value="ready">ready</option>
                              <option value="failed">failed</option>
                              <option value="archived">archived</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                      {!platformKnowledgeDocuments.length && (
                        <tr>
                          <td className="px-4 py-6 text-center text-sm text-text-muted" colSpan={5}>No platform knowledge documents yet.</td>
                        </tr>
                      )}
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
        </div>
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
          <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-3/4 xl:w-2/3 shadow-lg rounded-md bg-white">
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

                {/* Discussion Summary */}
                <div className="rounded-lg border border-border bg-surface-secondary p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-md font-semibold text-text-primary">Discussion summary</h4>
                      <p className="mt-1 text-sm text-text-muted">Calls, email, text, and chat captured for this lead.</p>
                    </div>
                    {leadDiscussionSummary?.summary?.totals && (
                      <span className="ops-badge bg-primary-soft text-primary">
                        {leadDiscussionSummary.summary.totals.messages + leadDiscussionSummary.summary.totals.emails + leadDiscussionSummary.summary.totals.calls} touchpoints
                      </span>
                    )}
                  </div>

                  {leadDiscussionSummaryLoading ? (
                    <div className="rounded-lg border border-border bg-surface px-3 py-4 text-center text-sm text-text-muted">
                      Loading discussion summary...
                    </div>
                  ) : leadDiscussionSummaryError ? (
                    <div className="rounded-lg border border-error bg-error-soft px-3 py-2 text-sm text-error">
                      {leadDiscussionSummaryError}
                    </div>
                  ) : leadDiscussionSummary?.summary ? (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-border bg-surface px-3 py-3">
                        <p className="text-sm leading-6 text-text-primary">{leadDiscussionSummary.summary.overview}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                        {[
                          ['Calls', leadDiscussionSummary.summary.channelCounts.calls],
                          ['Emails', leadDiscussionSummary.summary.channelCounts.emails],
                          ['Texts', leadDiscussionSummary.summary.channelCounts.texts],
                          ['Chats', leadDiscussionSummary.summary.channelCounts.chats],
                        ].map(([label, count]) => (
                          <div key={label} className="rounded-lg border border-border bg-surface px-3 py-2">
                            <div className="text-xs font-medium text-text-muted">{label}</div>
                            <div className="mt-1 text-lg font-semibold text-text-primary">{count}</div>
                          </div>
                        ))}
                      </div>

                      {leadDiscussionSummary.summary.keyPoints.length > 0 && (
                        <div className="rounded-lg border border-border bg-surface px-3 py-3">
                          <div className="mb-2 text-xs font-semibold uppercase text-text-muted">Key points</div>
                          <div className="space-y-2">
                            {leadDiscussionSummary.summary.keyPoints.map((point) => (
                              <div key={point} className="flex gap-2 text-sm text-text-primary">
                                <Check className="mt-0.5 h-4 w-4 flex-none text-success" />
                                <span>{point}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="rounded-lg border border-border bg-surface px-3 py-3">
                        <div className="mb-3 text-xs font-semibold uppercase text-text-muted">Latest discussion</div>
                        {leadDiscussionSummary.summary.timeline.length > 0 ? (
                          <div className="space-y-3">
                            {leadDiscussionSummary.summary.timeline.slice(0, 6).map((event) => (
                              <div key={event.id} className="border-b border-border pb-3 last:border-b-0 last:pb-0">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="ops-badge bg-info-soft text-info">{event.channel}</span>
                                    <span className="text-sm font-medium text-text-primary">{event.title}</span>
                                  </div>
                                  <span className="text-xs text-text-muted">
                                    {event.occurredAt ? format(new Date(event.occurredAt), 'MMM d, yyyy HH:mm') : 'No date'}
                                  </span>
                                </div>
                                {event.body && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{event.body}</p>}
                                {event.status && <p className="mt-1 text-xs text-text-muted">Status: {event.status}</p>}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-4 text-center text-sm text-text-muted">No calls, emails, texts, or chats have been captured yet.</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border bg-surface px-3 py-4 text-center text-sm text-text-muted">
                      Open a lead to load its discussion summary.
                    </div>
                  )}
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
              <div className="rounded-md border border-border bg-surface-secondary px-3 py-2 text-sm text-text-secondary">
                Deleted agents stay archived and will not be recreated automatically.
              </div>
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
