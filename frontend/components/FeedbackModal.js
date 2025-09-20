import { useState, useEffect } from 'react';
import { X, Send, MessageSquare, AlertCircle, CheckCircle, Clock, User, Mail, Calendar, Tag } from 'lucide-react';

export default function FeedbackModal({ 
  isOpen, 
  onClose, 
  lead, 
  user, 
  onFeedbackSubmitted 
}) {
  const [activeTab, setActiveTab] = useState('submit');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [existingFeedback, setExistingFeedback] = useState([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  // Form state for new feedback
  const [formData, setFormData] = useState({
    subject: '',
    content: '',
    feedbackType: 'general',
    priority: 'medium',
    tags: ''
  });

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setFormData({
        subject: '',
        content: '',
        feedbackType: 'general',
        priority: 'medium',
        tags: ''
      });
      setError(null);
      setSuccess(null);
      setActiveTab('submit');
      
      // Fetch existing feedback for this lead
      if (lead && user) {
        fetchExistingFeedback();
      }
    }
  }, [isOpen, lead, user]);

  const fetchExistingFeedback = async () => {
    if (!lead || !user) return;
    
    setFeedbackLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/feedback/agent/${user.id}?leadId=${lead.id}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setExistingFeedback(data.feedback || []);
      } else {
        console.error('Failed to fetch existing feedback');
      }
    } catch (error) {
      console.error('Error fetching existing feedback:', error);
    } finally {
      setFeedbackLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.subject.trim() || !formData.content.trim()) {
      setError('Subject and content are required');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/feedback`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            leadId: lead.id,
            subject: formData.subject.trim(),
            content: formData.content.trim(),
            feedbackType: formData.feedbackType,
            priority: formData.priority,
            tags: formData.tags.trim() || null,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setSuccess('Feedback submitted successfully!');
        setFormData({
          subject: '',
          content: '',
          feedbackType: 'general',
          priority: 'medium',
          tags: ''
        });
        
        // Refresh existing feedback
        await fetchExistingFeedback();
        
        // Notify parent component
        if (onFeedbackSubmitted) {
          onFeedbackSubmitted(data.feedback);
        }
        
        // Switch to history tab to show the new feedback
        setTimeout(() => {
          setActiveTab('history');
        }, 1000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to submit feedback');
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const getPriorityColor = (priority) => {
    const colors = {
      low: 'bg-green-100 text-green-800 border-green-200',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      high: 'bg-orange-100 text-orange-800 border-orange-200',
      urgent: 'bg-red-100 text-red-800 border-red-200',
    };
    return colors[priority] || colors.medium;
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-gray-100 text-gray-800 border-gray-200',
      in_review: 'bg-blue-100 text-blue-800 border-blue-200',
      responded: 'bg-green-100 text-green-800 border-green-200',
      closed: 'bg-gray-100 text-gray-600 border-gray-200',
    };
    return colors[status] || colors.pending;
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4" />;
      case 'in_review':
        return <AlertCircle className="w-4 h-4" />;
      case 'responded':
        return <CheckCircle className="w-4 h-4" />;
      case 'closed':
        return <X className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-red-500 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <MessageSquare className="w-6 h-6 text-white" />
            <div>
              <h2 className="text-xl font-bold text-white">Lead Feedback</h2>
              <p className="text-orange-100 text-sm">
                {lead?.fullName || lead?.email || 'Unknown Lead'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-orange-200 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Lead Info Bar */}
        <div className="bg-gradient-to-r from-orange-50 to-red-50 px-6 py-3 border-b border-orange-200">
          <div className="flex items-center space-x-6 text-sm">
            <div className="flex items-center space-x-2">
              <User className="w-4 h-4 text-orange-600" />
              <span className="font-medium text-gray-700">
                {lead?.fullName || 'No name'}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <Mail className="w-4 h-4 text-orange-600" />
              <span className="text-gray-600">{lead?.email}</span>
            </div>
            {lead?.phone && (
              <div className="flex items-center space-x-2">
                <span className="text-gray-600">{lead.phone}</span>
              </div>
            )}
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-orange-600" />
              <span className="text-gray-600">
                {lead?.createdAt ? new Date(lead.createdAt).toLocaleDateString() : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('submit')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'submit'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Submit Feedback
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'history'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Feedback History ({existingFeedback.length})
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {activeTab === 'submit' && (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              {success && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center space-x-3">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <p className="text-green-700 text-sm">{success}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Feedback Type
                  </label>
                  <select
                    name="feedbackType"
                    value={formData.feedbackType}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    <option value="general">General</option>
                    <option value="technical">Technical Issue</option>
                    <option value="process">Process Improvement</option>
                    <option value="lead_quality">Lead Quality</option>
                    <option value="communication">Communication</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Priority
                  </label>
                  <select
                    name="priority"
                    value={formData.priority}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Subject *
                </label>
                <input
                  type="text"
                  name="subject"
                  value={formData.subject}
                  onChange={handleInputChange}
                  placeholder="Brief description of your feedback"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Feedback Content *
                </label>
                <textarea
                  name="content"
                  value={formData.content}
                  onChange={handleInputChange}
                  rows={6}
                  placeholder="Provide detailed feedback about this lead..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tags (optional)
                </label>
                <input
                  type="text"
                  name="tags"
                  value={formData.tags}
                  onChange={handleInputChange}
                  placeholder="e.g., follow-up, urgent, quality-issue"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Separate multiple tags with commas
                </p>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:from-orange-600 hover:to-red-600 transition-all duration-200 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Submit Feedback</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'history' && (
            <div className="space-y-4">
              {feedbackLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-orange-500 border-t-transparent mx-auto"></div>
                  <p className="text-gray-500 mt-2">Loading feedback history...</p>
                </div>
              ) : existingFeedback.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No feedback submitted for this lead yet.</p>
                  <button
                    onClick={() => setActiveTab('submit')}
                    className="mt-2 text-orange-600 hover:text-orange-700 font-medium"
                  >
                    Submit your first feedback →
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {existingFeedback.map((feedback) => (
                    <div
                      key={feedback.id}
                      className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 mb-1">
                            {feedback.subject}
                          </h4>
                          <div className="flex items-center space-x-4 text-sm text-gray-500">
                            <span className="flex items-center space-x-1">
                              <Calendar className="w-4 h-4" />
                              <span>
                                {new Date(feedback.createdAt).toLocaleDateString()}
                              </span>
                            </span>
                            <span className="capitalize">
                              {feedback.feedbackType.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getPriorityColor(feedback.priority)}`}>
                            {feedback.priority}
                          </span>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(feedback.status)}`}>
                            {getStatusIcon(feedback.status)}
                            <span className="ml-1 capitalize">
                              {feedback.status.replace('_', ' ')}
                            </span>
                          </span>
                        </div>
                      </div>
                      
                      <p className="text-gray-700 mb-3 whitespace-pre-wrap">
                        {feedback.content}
                      </p>
                      
                      {feedback.tags && (
                        <div className="flex items-center space-x-2 mb-3">
                          <Tag className="w-4 h-4 text-gray-400" />
                          <div className="flex flex-wrap gap-1">
                            {feedback.tags.split(',').map((tag, index) => (
                              <span
                                key={index}
                                className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full"
                              >
                                {tag.trim()}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {feedback.adminResponse && (
                        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                          <div className="flex items-center space-x-2 mb-2">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <span className="text-sm font-medium text-green-800">
                              Admin Response
                            </span>
                            {feedback.adminRespondedAt && (
                              <span className="text-xs text-green-600">
                                {new Date(feedback.adminRespondedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <p className="text-green-700 text-sm whitespace-pre-wrap">
                            {feedback.adminResponse}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}