import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import { apiClient } from '../lib/api';

export default function Campaigns() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    objective: 'OUTCOME_LEADS',
    status: 'PAUSED'
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      fetchCampaigns();
    }
  }, [user]);

  const fetchCampaigns = async () => {
    try {
      setLoadingCampaigns(true);
      console.log('Fetching campaigns with apiClient');
      // Facebook Ads integration removed - now using HubSpot CRM
    const response = await apiClient.get('/api/leads');
      console.log('Campaigns response:', response);
      if (response.success) {
        setCampaigns(response.data);
        console.log('Campaigns loaded:', response.data);
      } else {
        setError('Failed to fetch campaigns');
      }
    } catch (err) {
      console.error('Error fetching campaigns:', err);
      setError('Error fetching campaigns: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoadingCampaigns(false);
    }
  };

  const createCampaign = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    setSuccess('');

    try {
      console.log('Creating campaign:', newCampaign);
      // Facebook Ads integration removed - now using HubSpot CRM
    const response = await apiClient.post('/api/leads', newCampaign);
      console.log('Create campaign response:', response);
      if (response.success) {
        setSuccess('Campaign created successfully!');
        setNewCampaign({ name: '', objective: 'OUTCOME_LEADS', status: 'PAUSED' });
        setShowCreateForm(false);
        fetchCampaigns(); // Refresh the list
      } else {
        setError('Failed to create campaign');
      }
    } catch (err) {
      console.error('Error creating campaign:', err);
      setError('Error creating campaign: ' + (err.response?.data?.error || err.message));
    } finally {
      setCreating(false);
    }
  };

  const quickCreateCampaign = async () => {
    setCreating(true);
    setError('');
    setSuccess('');

    try {
      console.log('Creating quick campaign');
      // Facebook Ads integration removed - now using HubSpot CRM
    const response = await apiClient.post('/api/leads/quick-create', {
        name: `Lead Gen ${new Date().toLocaleDateString()}`,
        budget: 50
      });
      console.log('Quick create campaign response:', response);
      if (response.success) {
        setSuccess('Lead generation campaign created successfully!');
        fetchCampaigns(); // Refresh the list
      } else {
        setError('Failed to create quick campaign');
      }
    } catch (err) {
      console.error('Error creating quick campaign:', err);
      setError('Error creating quick campaign: ' + (err.response?.data?.error || err.message));
    } finally {
      setCreating(false);
    }
  };

  const updateCampaignStatus = async (campaignId, newStatus) => {
    try {
      console.log('Updating campaign status:', campaignId, newStatus);
      // Facebook Ads integration removed - now using HubSpot CRM
    const response = await apiClient.put(`/api/leads/${campaignId}/status`, {
        status: newStatus
      });
      console.log('Update campaign status response:', response);
      if (response.success) {
        setSuccess(`Campaign status updated to ${newStatus}`);
        fetchCampaigns(); // Refresh the list
      } else {
        setError('Failed to update campaign status');
      }
    } catch (err) {
      console.error('Error updating campaign:', err);
      setError('Error updating campaign: ' + (err.response?.data?.error || err.message));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="px-4 py-6 sm:px-0">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">HubSpot CRM Integration</h1>
        <p className="mt-2 text-gray-600">Manage your HubSpot leads and contacts</p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={quickCreateCampaign}
                disabled={creating}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Quick Create Lead Gen'}
              </button>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                {showCreateForm ? 'Cancel' : 'Create Campaign'}
              </button>
            </div>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mx-4 mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}
        {success && (
          <div className="mx-4 mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
            {success}
          </div>
        )}

        {/* Create Campaign Form */}
        {showCreateForm && (
          <div className="mx-4 mb-6 bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Create New Campaign</h2>
            <form onSubmit={createCampaign} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Campaign Name</label>
                <input
                  type="text"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter campaign name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Objective</label>
                <select
                  value={newCampaign.objective}
                  onChange={(e) => setNewCampaign({ ...newCampaign, objective: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="OUTCOME_LEADS">Lead Generation</option>
                  <option value="OUTCOME_TRAFFIC">Traffic</option>
                  <option value="OUTCOME_ENGAGEMENT">Engagement</option>
                  <option value="OUTCOME_AWARENESS">Awareness</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <select
                  value={newCampaign.status}
                  onChange={(e) => setNewCampaign({ ...newCampaign, status: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="PAUSED">Paused</option>
                  <option value="ACTIVE">Active</option>
                </select>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Campaign'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Campaigns List */}
        <div className="mx-4">
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Your Campaigns</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {loadingCampaigns ? (
                <div className="p-6 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-gray-600">Loading campaigns...</p>
                </div>
              ) : campaigns.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  No campaigns found. Create your first campaign to get started.
                </div>
              ) : (
                campaigns.map((campaign) => (
                  <div key={campaign.id} className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-medium text-gray-900">{campaign.name}</h3>
                        <div className="mt-1 flex items-center space-x-4 text-sm text-gray-500">
                          <span>ID: {campaign.id}</span>
                          <span>Objective: {campaign.objective}</span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            campaign.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                            campaign.status === 'PAUSED' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {campaign.status}
                          </span>
                        </div>
                        {campaign.created_time && (
                          <p className="mt-1 text-sm text-gray-500">
                            Created: {new Date(campaign.created_time).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <div className="flex space-x-2">
                        {campaign.status === 'PAUSED' && (
                          <button
                            onClick={() => updateCampaignStatus(campaign.id, 'ACTIVE')}
                            className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                          >
                            Activate
                          </button>
                        )}
                        {campaign.status === 'ACTIVE' && (
                          <button
                            onClick={() => updateCampaignStatus(campaign.id, 'PAUSED')}
                            className="px-3 py-1 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700"
                          >
                            Pause
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}