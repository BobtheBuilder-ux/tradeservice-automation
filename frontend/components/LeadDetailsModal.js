import { useEffect, useState } from 'react';
import {
  X,
  User,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Globe,
  AlertCircle,
  CheckCircle,
  XCircle,
  Building,
  Tag,
  FileText,
  ExternalLink,
  Calendar,
  Save,
} from 'lucide-react';

const qualificationOptions = ['unqualified', 'partially_qualified', 'qualified', 'disqualified'];
const leadStageOptions = ['new_inquiry', 'awaiting_information', 'ready_to_book', 'nurturing', 'escalated'];
const schedulingOptions = ['not_started', 'needs_follow_up', 'booking_invited', 'booking_requested', 'booked', 'reschedule_requested'];
const contactChannelOptions = ['email', 'phone', 'whatsapp', 'sms'];

export default function LeadDetailsModal({ isOpen, onClose, lead, onLeadUpdate }) {
  const [formData, setFormData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');

  useEffect(() => {
    if (!lead) return;
    setFormData({
      qualificationStatus: lead.qualificationStatus || 'unqualified',
      qualificationScore: lead.qualificationScore ?? 0,
      leadStage: lead.leadStage || 'new_inquiry',
      schedulingState: lead.schedulingState || 'not_started',
      preferredContactChannel: lead.preferredContactChannel || 'email',
      preferredMeetingWindow: lead.preferredMeetingWindow || '',
      serviceInterest: lead.serviceInterest || '',
      timeline: lead.timeline || '',
      budgetRange: lead.budgetRange || '',
      locationSummary: lead.locationSummary || '',
      qualificationNotes: lead.qualificationNotes || '',
      requiresHumanReview: !!lead.requiresHumanReview,
      automationPaused: !!lead.automationPaused,
      escalationReason: lead.escalationReason || '',
    });
    setSaveError('');
    setSaveSuccess('');
  }, [lead]);

  if (!isOpen || !lead || !formData) return null;

  const getStatusIcon = (status) => {
    switch (status) {
      case 'new': return <AlertCircle className="w-5 h-5 text-orange-500" />;
      case 'contacted': return <Phone className="w-5 h-5 text-teal-500" />;
      case 'scheduled': return <Calendar className="w-5 h-5 text-emerald-500" />;
      case 'completed': return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'cancelled': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'assigned': return <User className="w-5 h-5 text-blue-500" />;
      default: return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getQualificationColor = (status) => {
    switch (status) {
      case 'qualified': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'partially_qualified': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'disqualified': return 'bg-rose-100 text-rose-800 border-rose-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const renderCustomFields = (customFields) => {
    if (!customFields || typeof customFields !== 'object' || Object.keys(customFields).length === 0) return null;

    return Object.entries(customFields).map(([key, value]) => (
      <div key={key} className="flex justify-between py-3 border-b border-gray-100 last:border-b-0">
        <span className="font-medium text-gray-600 capitalize">
          {key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim()}:
        </span>
        <span className="text-gray-900 text-right max-w-xs truncate" title={String(value)}>
          {String(value || 'N/A')}
        </span>
      </div>
    ));
  };

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setSaveError('');
    setSaveSuccess('');
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    setSaveSuccess('');
    try {
      const response = await fetch(`/api/leads/${lead.id}/qualification`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          qualificationScore: Number(formData.qualificationScore || 0),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save qualification details');
      }

      setSaveSuccess('Qualification details saved.');
      if (onLeadUpdate) onLeadUpdate(data.lead);
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
        <div className="bg-gradient-to-r from-orange-600 via-red-600 to-pink-600 px-6 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <User className="w-6 h-6 text-white" />
            <h2 className="text-xl font-bold text-white">Lead Details</h2>
          </div>
          <button onClick={onClose} className="bg-white/20 text-white hover:bg-white/30 p-2 rounded-lg transition-all duration-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)] space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <User className="w-5 h-5 mr-2 text-orange-600" />
                Basic Information
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between"><span className="font-medium text-gray-600">Full Name:</span><span className="text-gray-900">{lead.fullName || 'N/A'}</span></div>
                <div className="flex justify-between"><span className="font-medium text-gray-600">First Name:</span><span className="text-gray-900">{lead.firstName || 'N/A'}</span></div>
                <div className="flex justify-between"><span className="font-medium text-gray-600">Last Name:</span><span className="text-gray-900">{lead.lastName || 'N/A'}</span></div>
                <div className="flex justify-between"><span className="font-medium text-gray-600">Email:</span><span className="text-gray-900 flex items-center"><Mail className="w-4 h-4 mr-1 text-teal-600" />{lead.email}</span></div>
                <div className="flex justify-between"><span className="font-medium text-gray-600">Phone:</span><span className="text-gray-900 flex items-center">{lead.phone ? <><Phone className="w-4 h-4 mr-1 text-orange-600" />{lead.phone}</> : 'N/A'}</span></div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <Tag className="w-5 h-5 mr-2 text-orange-600" />
                Status & Priority
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center"><span className="font-medium text-gray-600">Status:</span><div className="flex items-center">{getStatusIcon(lead.status)}<span className="ml-2 text-gray-900 capitalize">{lead.status}</span></div></div>
                <div className="flex justify-between items-center"><span className="font-medium text-gray-600">Priority:</span><span className={`px-3 py-1 text-xs font-bold rounded-full border ${getPriorityColor(lead.priority)}`}>{lead.priority}</span></div>
                <div className="flex justify-between"><span className="font-medium text-gray-600">Source:</span><span className="text-gray-900">{lead.source || 'N/A'}</span></div>
                <div className="flex justify-between"><span className="font-medium text-gray-600">Processing Status:</span><span className="text-gray-900">{lead.processingStatus || 'N/A'}</span></div>
                <div className="flex justify-between items-center"><span className="font-medium text-gray-600">Qualification:</span><span className={`px-3 py-1 text-xs font-bold rounded-full border ${getQualificationColor(lead.qualificationStatus)}`}>{(lead.qualificationStatus || 'unqualified').replace(/_/g, ' ')}</span></div>
                <div className="flex justify-between"><span className="font-medium text-gray-600">Lead Stage:</span><span className="text-gray-900">{(lead.leadStage || 'new_inquiry').replace(/_/g, ' ')}</span></div>
                <div className="flex justify-between"><span className="font-medium text-gray-600">Scheduling State:</span><span className="text-gray-900">{(lead.schedulingState || 'not_started').replace(/_/g, ' ')}</span></div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <Briefcase className="w-5 h-5 mr-2 text-orange-600" />
                Professional Information
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between"><span className="font-medium text-gray-600">Job Title:</span><span className="text-gray-900">{lead.jobTitle || 'N/A'}</span></div>
                <div className="flex justify-between"><span className="font-medium text-gray-600">Company:</span><span className="text-gray-900 flex items-center">{lead.company ? <><Building className="w-4 h-4 mr-1 text-blue-600" />{lead.company}</> : 'N/A'}</span></div>
                <div className="flex justify-between"><span className="font-medium text-gray-600">Website:</span><span className="text-gray-900">{lead.website ? <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center text-blue-600 hover:text-blue-800"><Globe className="w-4 h-4 mr-1" />{lead.website}<ExternalLink className="w-3 h-3 ml-1" /></a> : 'N/A'}</span></div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <MapPin className="w-5 h-5 mr-2 text-orange-600" />
                Location Information
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between"><span className="font-medium text-gray-600">City:</span><span className="text-gray-900">{lead.city || 'N/A'}</span></div>
                <div className="flex justify-between"><span className="font-medium text-gray-600">State:</span><span className="text-gray-900">{lead.state || 'N/A'}</span></div>
                <div className="flex justify-between"><span className="font-medium text-gray-600">Country:</span><span className="text-gray-900">{lead.country || 'N/A'}</span></div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg p-6 border border-emerald-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-gray-800 flex items-center"><CheckCircle className="w-6 h-6 mr-3 text-emerald-600" />Qualification & Scheduling</h3>
              <button onClick={handleSave} disabled={saving} className="inline-flex items-center px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60">
                <Save className="w-4 h-4 mr-2" />{saving ? 'Saving...' : 'Save'}
              </button>
            </div>
            {saveError && <div className="mb-4 rounded-lg bg-rose-100 text-rose-700 px-4 py-3 text-sm font-medium">{saveError}</div>}
            {saveSuccess && <div className="mb-4 rounded-lg bg-emerald-100 text-emerald-700 px-4 py-3 text-sm font-medium">{saveSuccess}</div>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Qualification Status</label>
                <select value={formData.qualificationStatus} onChange={(e) => updateField('qualificationStatus', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
                  {qualificationOptions.map((option) => <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Qualification Score</label>
                <input type="number" min="0" max="100" value={formData.qualificationScore} onChange={(e) => updateField('qualificationScore', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Lead Stage</label>
                <select value={formData.leadStage} onChange={(e) => updateField('leadStage', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
                  {leadStageOptions.map((option) => <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Scheduling State</label>
                <select value={formData.schedulingState} onChange={(e) => updateField('schedulingState', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
                  {schedulingOptions.map((option) => <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Preferred Contact Channel</label>
                <select value={formData.preferredContactChannel} onChange={(e) => updateField('preferredContactChannel', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
                  {contactChannelOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Preferred Meeting Window</label>
                <input value={formData.preferredMeetingWindow} onChange={(e) => updateField('preferredMeetingWindow', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="e.g. Tue–Thu mornings" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Service Interest</label>
                <input value={formData.serviceInterest} onChange={(e) => updateField('serviceInterest', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="e.g. roofing, consultation" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Timeline</label>
                <input value={formData.timeline} onChange={(e) => updateField('timeline', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="e.g. asap, 30 days" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Budget Range</label>
                <input value={formData.budgetRange} onChange={(e) => updateField('budgetRange', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="e.g. $2k-$5k" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Location Summary</label>
                <input value={formData.locationSummary} onChange={(e) => updateField('locationSummary', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="e.g. Brooklyn, NY" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <label className="flex items-center gap-3 text-sm font-medium text-gray-700"><input type="checkbox" checked={formData.requiresHumanReview} onChange={(e) => updateField('requiresHumanReview', e.target.checked)} />Requires human review</label>
              <label className="flex items-center gap-3 text-sm font-medium text-gray-700"><input type="checkbox" checked={formData.automationPaused} onChange={(e) => updateField('automationPaused', e.target.checked)} />Pause automation</label>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Escalation Reason</label>
              <input value={formData.escalationReason} onChange={(e) => updateField('escalationReason', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="Why this lead needs human review" />
            </div>
            <div className="mt-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Qualification Notes</label>
              <textarea value={formData.qualificationNotes} onChange={(e) => updateField('qualificationNotes', e.target.value)} rows={4} className="w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="Important context, objections, or timeline details" />
            </div>
          </div>

          {lead.customFields && Object.keys(lead.customFields).length > 0 ? (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
              <h3 className="text-xl font-semibold text-gray-800 mb-6 flex items-center"><FileText className="w-6 h-6 mr-3 text-blue-600" />Custom Fields</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{Object.entries(lead.customFields).map(([key, value]) => (
                <div key={key} className="bg-white rounded-lg p-4 shadow-sm border border-blue-100">
                  <div className="flex flex-col space-y-2"><span className="font-semibold text-gray-700 text-sm uppercase tracking-wide">{key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim()}</span><span className="text-gray-900 text-base break-words">{String(value || 'N/A')}</span></div>
                </div>
              ))}</div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
              <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center"><FileText className="w-6 h-6 mr-3 text-gray-600" />Custom Fields</h3>
              <div className="text-center py-8"><FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" /><p className="text-gray-500 text-lg">No custom fields available for this lead</p></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
