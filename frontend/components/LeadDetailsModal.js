import { useState, useEffect } from 'react';
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
  ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';

export default function LeadDetailsModal({ isOpen, onClose, lead }) {
  if (!isOpen || !lead) return null;

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

  const renderCustomFields = (customFields) => {
    if (!customFields || typeof customFields !== 'object') return null;
    
    return Object.entries(customFields).map(([key, value]) => (
      <div key={key} className="flex justify-between py-3 border-b border-gray-100 last:border-b-0">
        <span className="font-medium text-gray-600 capitalize">
          {key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim()}:
        </span>
        <span className="text-gray-900 text-right max-w-xs truncate" title={value}>
          {value || 'N/A'}
        </span>
      </div>
    ));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-600 via-red-600 to-pink-600 px-6 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <User className="w-6 h-6 text-white" />
            <h2 className="text-xl font-bold text-white">Lead Details</h2>
          </div>
          <button
            onClick={onClose}
            className="bg-white/20 text-white hover:bg-white/30 p-2 rounded-lg transition-all duration-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Basic Information */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <User className="w-5 h-5 mr-2 text-orange-600" />
                Basic Information
              </h3>
              
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="font-medium text-gray-600">Full Name:</span>
                  <span className="text-gray-900">{lead.fullName || 'N/A'}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="font-medium text-gray-600">First Name:</span>
                  <span className="text-gray-900">{lead.firstName || 'N/A'}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="font-medium text-gray-600">Last Name:</span>
                  <span className="text-gray-900">{lead.lastName || 'N/A'}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="font-medium text-gray-600">Email:</span>
                  <span className="text-gray-900 flex items-center">
                    <Mail className="w-4 h-4 mr-1 text-teal-600" />
                    {lead.email}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="font-medium text-gray-600">Phone:</span>
                  <span className="text-gray-900 flex items-center">
                    {lead.phone ? (
                      <>
                        <Phone className="w-4 h-4 mr-1 text-orange-600" />
                        {lead.phone}
                      </>
                    ) : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Status & Priority */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <Tag className="w-5 h-5 mr-2 text-orange-600" />
                Status & Priority
              </h3>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-600">Status:</span>
                  <div className="flex items-center">
                    {getStatusIcon(lead.status)}
                    <span className="ml-2 text-gray-900 capitalize">{lead.status}</span>
                  </div>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-600">Priority:</span>
                  <span className={`px-3 py-1 text-xs font-bold rounded-full border ${getPriorityColor(lead.priority)}`}>
                    {lead.priority}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="font-medium text-gray-600">Source:</span>
                  <span className="text-gray-900">{lead.source || 'N/A'}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="font-medium text-gray-600">Processing Status:</span>
                  <span className="text-gray-900">{lead.processingStatus || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Professional Information */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <Briefcase className="w-5 h-5 mr-2 text-orange-600" />
                Professional Information
              </h3>
              
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="font-medium text-gray-600">Job Title:</span>
                  <span className="text-gray-900">{lead.jobTitle || 'N/A'}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="font-medium text-gray-600">Company:</span>
                  <span className="text-gray-900 flex items-center">
                    {lead.company ? (
                      <>
                        <Building className="w-4 h-4 mr-1 text-blue-600" />
                        {lead.company}
                      </>
                    ) : 'N/A'}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="font-medium text-gray-600">Website:</span>
                  <span className="text-gray-900">
                    {lead.website ? (
                      <a 
                        href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-blue-600 hover:text-blue-800"
                      >
                        <Globe className="w-4 h-4 mr-1" />
                        {lead.website}
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    ) : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Location Information */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <MapPin className="w-5 h-5 mr-2 text-orange-600" />
                Location Information
              </h3>
              
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="font-medium text-gray-600">City:</span>
                  <span className="text-gray-900">{lead.city || 'N/A'}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="font-medium text-gray-600">State:</span>
                  <span className="text-gray-900">{lead.state || 'N/A'}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="font-medium text-gray-600">Country:</span>
                  <span className="text-gray-900">{lead.country || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Custom Fields Section - Enhanced */}
          {lead.customFields && Object.keys(lead.customFields).length > 0 && (
            <div className="mt-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
              <h3 className="text-xl font-semibold text-gray-800 mb-6 flex items-center">
                <FileText className="w-6 h-6 mr-3 text-blue-600" />
                Custom Fields
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(lead.customFields).map(([key, value]) => (
                  <div key={key} className="bg-white rounded-lg p-4 shadow-sm border border-blue-100">
                    <div className="flex flex-col space-y-2">
                      <span className="font-semibold text-gray-700 text-sm uppercase tracking-wide">
                        {key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      <span className="text-gray-900 text-base break-words" title={value}>
                        {value || 'N/A'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No Custom Fields Message */}
          {(!lead.customFields || Object.keys(lead.customFields).length === 0) && (
            <div className="mt-6 bg-gray-50 rounded-lg p-6 border border-gray-200">
              <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                <FileText className="w-6 h-6 mr-3 text-gray-600" />
                Custom Fields
              </h3>
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">No custom fields available for this lead</p>
                <p className="text-gray-400 text-sm mt-2">Custom fields will appear here when available from HubSpot</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}