/**
 * YouTube Sync Client-Side JavaScript
 */

// Get CSRF token from meta tag or form
function getCsrfToken() {
  const metaTag = document.querySelector('meta[name="csrf-token"]');
  if (metaTag) return metaTag.getAttribute('content');
  
  const hiddenInput = document.querySelector('input[name="_csrf"]');
  if (hiddenInput) return hiddenInput.value;
  
  return '';
}

// Show toast notification
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `fixed bottom-24 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg z-50 transition-all duration-300 ${
    type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500'
  } text-white`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Credentials Form Handler
const credentialsForm = document.getElementById('credentialsForm');
if (credentialsForm) {
  credentialsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const connectBtn = document.getElementById('connectBtn');
    const originalText = connectBtn.innerHTML;
    connectBtn.innerHTML = '<i class="ti ti-loader animate-spin"></i> Connecting...';
    connectBtn.disabled = true;
    
    try {
      const formData = {
        clientId: document.getElementById('clientId').value,
        clientSecret: document.getElementById('clientSecret').value,
        refreshToken: document.getElementById('refreshToken').value
      };
      
      const response = await fetch('/api/youtube/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify(formData)
      });
      
      const data = await response.json();
      
      if (data.success) {
        showToast('YouTube account connected successfully!');
        setTimeout(() => window.location.reload(), 1000);
      } else {
        showToast(data.error || 'Failed to connect', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showToast('An error occurred', 'error');
    } finally {
      connectBtn.innerHTML = originalText;
      connectBtn.disabled = false;
    }
  });
}

// Disconnect specific YouTube account
async function disconnectAccount(accountId, channelName) {
  if (!confirm(`Are you sure you want to disconnect "${channelName}"?`)) {
    return;
  }
  
  try {
    const response = await fetch(`/api/youtube/credentials/${accountId}`, {
      method: 'DELETE',
      headers: {
        'X-CSRF-Token': getCsrfToken()
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast('YouTube account disconnected');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      showToast(data.error || 'Failed to disconnect', 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('An error occurred', 'error');
  }
}

// Set primary account
async function setPrimaryAccount(accountId) {
  try {
    const response = await fetch(`/api/youtube/credentials/${accountId}/primary`, {
      method: 'PUT',
      headers: {
        'X-CSRF-Token': getCsrfToken()
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast('Primary account updated');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      showToast(data.error || 'Failed to set primary', 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('An error occurred', 'error');
  }
}

// Legacy disconnect function for backward compatibility
async function disconnectYouTube() {
  if (!confirm('Are you sure you want to disconnect your YouTube account?')) {
    return;
  }
  
  try {
    const response = await fetch('/api/youtube/credentials', {
      method: 'DELETE',
      headers: {
        'X-CSRF-Token': getCsrfToken()
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast('YouTube account disconnected');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      showToast(data.error || 'Failed to disconnect', 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('An error occurred', 'error');
  }
}

// Add Account Modal
function openAddAccountModal() {
  document.getElementById('addAccountModal').classList.remove('hidden');
}

function closeAddAccountModal() {
  document.getElementById('addAccountModal').classList.add('hidden');
  document.getElementById('addAccountForm').reset();
}

// Add Account Form Handler
const addAccountForm = document.getElementById('addAccountForm');
if (addAccountForm) {
  addAccountForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const addBtn = document.getElementById('addAccountBtn');
    const originalText = addBtn.innerHTML;
    addBtn.innerHTML = '<i class="ti ti-loader animate-spin"></i> Adding...';
    addBtn.disabled = true;
    
    try {
      const formData = {
        clientId: document.getElementById('newClientId').value,
        clientSecret: document.getElementById('newClientSecret').value,
        refreshToken: document.getElementById('newRefreshToken').value
      };
      
      const response = await fetch('/api/youtube/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify(formData)
      });
      
      const data = await response.json();
      
      if (data.success) {
        showToast('YouTube account added successfully!');
        closeAddAccountModal();
        setTimeout(() => window.location.reload(), 1000);
      } else {
        showToast(data.error || 'Failed to add account', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showToast('An error occurred', 'error');
    } finally {
      addBtn.innerHTML = originalText;
      addBtn.disabled = false;
    }
  });
}

// Fetch available stream keys for specific account
async function fetchStreams(accountId = null) {
  const select = document.getElementById('streamKeySelect');
  const loading = document.getElementById('streamKeyLoading');
  
  if (!select) return;
  
  loading.classList.remove('hidden');
  
  try {
    let url = '/api/youtube/streams';
    if (accountId) {
      url += `?accountId=${accountId}`;
    }
    
    const response = await fetch(url, {
      headers: {
        'X-CSRF-Token': getCsrfToken()
      }
    });
    
    const data = await response.json();
    
    // Clear existing options except first
    select.innerHTML = '<option value="">Create new stream key</option>';
    
    if (data.success && data.streams && data.streams.length > 0) {
      data.streams.forEach(stream => {
        const option = document.createElement('option');
        option.value = stream.id;
        option.textContent = `${stream.title} (${stream.resolution} @ ${stream.frameRate})`;
        select.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error fetching streams:', error);
  } finally {
    loading.classList.add('hidden');
  }
}

// Handle account change in create broadcast modal
function onAccountChange(accountId) {
  if (accountId) {
    fetchStreams(accountId);
    fetchChannelDefaults(accountId);
  }
}

// Fetch available thumbnails from gallery (per user)
async function fetchThumbnails() {
  const grid = document.getElementById('thumbnailGalleryGrid');
  const loading = document.getElementById('thumbnailGalleryLoading');
  const empty = document.getElementById('thumbnailGalleryEmpty');
  const countEl = document.getElementById('thumbnailCount');
  const uploadBtn = document.getElementById('uploadThumbnailGalleryBtn');
  
  if (!grid) return;
  
  grid.innerHTML = '';
  loading.classList.remove('hidden');
  empty.classList.add('hidden');
  
  try {
    const response = await fetch('/api/thumbnails', {
      headers: {
        'X-CSRF-Token': getCsrfToken()
      }
    });
    
    const data = await response.json();
    
    // Update count display
    if (countEl) {
      countEl.textContent = `(${data.count || 0}/${data.maxAllowed || 20})`;
    }
    
    // Disable upload button if at max
    if (uploadBtn && data.count >= data.maxAllowed) {
      uploadBtn.disabled = true;
      uploadBtn.classList.add('opacity-50', 'cursor-not-allowed');
      uploadBtn.title = 'Maximum 20 thumbnails reached. Delete some to upload new ones.';
    } else if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      uploadBtn.title = '';
    }
    
    if (data.success && data.thumbnails && data.thumbnails.length > 0) {
      data.thumbnails.forEach(thumb => {
        const div = document.createElement('div');
        div.className = 'thumbnail-item w-full aspect-video bg-dark-700 rounded cursor-pointer overflow-hidden border-2 border-transparent hover:border-primary transition-colors relative group';
        div.innerHTML = `
          <img src="${thumb.url}" class="w-full h-full object-cover" alt="Thumbnail">
          <button type="button" onclick="event.stopPropagation(); deleteThumbnail('${thumb.filename}')" 
            class="absolute top-1 right-1 w-6 h-6 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            title="Delete thumbnail">
            <i class="ti ti-x text-white text-xs"></i>
          </button>
        `;
        div.dataset.path = thumb.path;
        div.dataset.filename = thumb.filename;
        div.onclick = () => selectGalleryThumbnail(div, thumb.url, thumb.path);
        grid.appendChild(div);
      });
    } else {
      empty.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error fetching thumbnails:', error);
    empty.classList.remove('hidden');
  } finally {
    loading.classList.add('hidden');
  }
}

// Select thumbnail from gallery
function selectGalleryThumbnail(element, url, path) {
  // Remove selection from all thumbnails
  document.querySelectorAll('.thumbnail-item').forEach(item => {
    item.classList.remove('border-primary', 'border-red-500');
    item.classList.add('border-transparent');
  });
  
  // Add selection to clicked thumbnail
  element.classList.remove('border-transparent');
  element.classList.add('border-red-500');
  
  // Update preview
  document.getElementById('thumbnailPreview').innerHTML = 
    `<img src="${url}" class="w-full h-full object-cover">`;
  
  // Set hidden input for path
  document.getElementById('selectedThumbnailPath').value = path;
}

// Upload thumbnail to user's gallery
async function uploadThumbnailToGallery(file) {
  try {
    const formData = new FormData();
    formData.append('thumbnail', file);
    
    const response = await fetch('/api/thumbnails', {
      method: 'POST',
      headers: {
        'X-CSRF-Token': getCsrfToken()
      },
      body: formData
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast('Thumbnail uploaded to gallery');
      // Refresh gallery
      fetchThumbnails();
      // Auto-select the newly uploaded thumbnail
      if (data.thumbnail) {
        document.getElementById('selectedThumbnailPath').value = data.thumbnail.path;
        document.getElementById('thumbnailPreview').innerHTML = 
          `<img src="${data.thumbnail.url}" class="w-full h-full object-cover">`;
      }
      return true;
    } else {
      showToast(data.error || 'Failed to upload thumbnail', 'error');
      return false;
    }
  } catch (error) {
    console.error('Error uploading thumbnail:', error);
    showToast('Failed to upload thumbnail', 'error');
    return false;
  }
}

// Delete thumbnail from user's gallery
async function deleteThumbnail(filename) {
  if (!confirm('Are you sure you want to delete this thumbnail?')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/thumbnails/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
      headers: {
        'X-CSRF-Token': getCsrfToken()
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast('Thumbnail deleted');
      // Clear selection if deleted thumbnail was selected
      const selectedPath = document.getElementById('selectedThumbnailPath').value;
      if (selectedPath && selectedPath.includes(filename)) {
        document.getElementById('selectedThumbnailPath').value = '';
        document.getElementById('thumbnailPreview').innerHTML = '<i class="ti ti-photo text-gray-500 text-2xl"></i>';
      }
      // Refresh gallery
      fetchThumbnails();
    } else {
      showToast(data.error || 'Failed to delete thumbnail', 'error');
    }
  } catch (error) {
    console.error('Error deleting thumbnail:', error);
    showToast('Failed to delete thumbnail', 'error');
  }
}

// Preview and upload thumbnail to gallery
function previewAndUploadThumbnail(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    
    // Validate file type
    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      showToast('Only JPG and PNG files are allowed', 'error');
      input.value = '';
      return;
    }
    
    // Validate file size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      showToast('File size must be less than 2MB', 'error');
      input.value = '';
      return;
    }
    
    // Upload to gallery
    uploadThumbnailToGallery(file);
    
    // Clear input for next upload
    input.value = '';
  }
}

// Tags state
let currentTags = [];

// Fetch channel defaults for auto-fill
async function fetchChannelDefaults(accountId = null) {
  const tagsLoading = document.getElementById('tagsLoading');
  
  if (tagsLoading) tagsLoading.classList.remove('hidden');
  
  try {
    let url = '/api/youtube/channel-defaults';
    if (accountId) {
      url += `?accountId=${accountId}`;
    }
    
    const response = await fetch(url, {
      headers: {
        'X-CSRF-Token': getCsrfToken()
      }
    });
    
    const data = await response.json();
    
    if (data.success && data.defaults) {
      populateFormWithDefaults(data.defaults);
    }
  } catch (error) {
    console.error('Error fetching channel defaults:', error);
    showToast('Could not load YouTube defaults', 'info');
  } finally {
    if (tagsLoading) tagsLoading.classList.add('hidden');
  }
}

// Populate form with defaults from YouTube
function populateFormWithDefaults(defaults) {
  // Populate title if available
  const titleInput = document.getElementById('broadcastTitle');
  if (defaults.title && titleInput && !titleInput.value) {
    titleInput.value = defaults.title;
  }
  
  // Populate description if available
  const descInput = document.getElementById('broadcastDescription');
  if (defaults.description && descInput && !descInput.value) {
    descInput.value = defaults.description;
  }
  
  // Populate tags
  if (defaults.tags && defaults.tags.length > 0) {
    currentTags = [...defaults.tags];
    renderTags();
    const indicator = document.getElementById('tagsAutoFillIndicator');
    if (indicator) indicator.classList.remove('hidden');
  }
  
  // Handle category
  const categorySelect = document.getElementById('categoryId');
  if (categorySelect && defaults.categoryId) {
    categorySelect.value = defaults.categoryId;
    const indicator = document.getElementById('categoryAutoFillIndicator');
    if (indicator) indicator.classList.remove('hidden');
  }
  
  // Note: Monetization, Ad Frequency, and Altered Content settings 
  // are not supported by YouTube API and must be set in YouTube Studio
}

// Render tags as chips
function renderTags() {
  const container = document.getElementById('tagsContainer');
  const input = document.getElementById('tagInput');
  const hiddenInput = document.getElementById('tagsHidden');
  
  if (!container || !input) return;
  
  // Remove existing tag chips
  container.querySelectorAll('.tag-chip').forEach(chip => chip.remove());
  
  // Add tag chips before the input
  currentTags.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip inline-flex items-center gap-1 px-2 py-1 bg-red-500/20 text-red-400 rounded text-sm';
    chip.innerHTML = `
      ${escapeHtml(tag)}
      <button type="button" class="hover:text-red-300" onclick="removeTag('${escapeHtml(tag)}')">
        <i class="ti ti-x text-xs"></i>
      </button>
    `;
    container.insertBefore(chip, input);
  });
  
  // Update hidden input with tags as JSON
  if (hiddenInput) {
    hiddenInput.value = JSON.stringify(currentTags);
  }
}

// Add a new tag
function addTag(tag) {
  const trimmedTag = tag.trim();
  if (!trimmedTag) return;
  
  // Check if tag already exists
  if (currentTags.includes(trimmedTag)) {
    showToast('Tag already exists', 'error');
    return;
  }
  
  // Check total characters limit (500)
  const totalChars = currentTags.join(',').length + trimmedTag.length + (currentTags.length > 0 ? 1 : 0);
  if (totalChars > 500) {
    showToast('Tags exceed 500 character limit', 'error');
    return;
  }
  
  currentTags.push(trimmedTag);
  renderTags();
}

// Remove a tag
function removeTag(tag) {
  currentTags = currentTags.filter(t => t !== tag);
  renderTags();
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize tag input handler
function initTagInput() {
  const tagInput = document.getElementById('tagInput');
  if (!tagInput) return;
  
  tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(tagInput.value);
      tagInput.value = '';
    }
  });
  
  // Also add on blur
  tagInput.addEventListener('blur', () => {
    if (tagInput.value.trim()) {
      addTag(tagInput.value);
      tagInput.value = '';
    }
  });
}

// Create Broadcast Modal
function openCreateBroadcastModal() {
  document.getElementById('createBroadcastModal').classList.remove('hidden');
  
  // Set minimum datetime to 10 minutes from now
  const minDate = new Date(Date.now() + 11 * 60 * 1000);
  const minDateStr = minDate.toISOString().slice(0, 16);
  document.getElementById('scheduledStartTime').min = minDateStr;
  
  // Reset tags
  currentTags = [];
  renderTags();
  
  // Initialize tag input
  initTagInput();
  
  // Get selected account ID
  const accountSelect = document.getElementById('accountSelect');
  const accountId = accountSelect ? accountSelect.value : null;
  
  // Fetch streams, thumbnails, and channel defaults for selected account
  fetchStreams(accountId);
  fetchThumbnails();
  fetchChannelDefaults(accountId);
}

function closeCreateBroadcastModal() {
  document.getElementById('createBroadcastModal').classList.add('hidden');
  document.getElementById('createBroadcastForm').reset();
  document.getElementById('thumbnailPreview').innerHTML = '<i class="ti ti-photo text-gray-500 text-2xl"></i>';
  document.getElementById('selectedThumbnailPath').value = '';
  
  // Clear thumbnail selection
  document.querySelectorAll('.thumbnail-item').forEach(item => {
    item.classList.remove('border-primary', 'border-red-500');
    item.classList.add('border-transparent');
  });
  
  // Reset tags
  currentTags = [];
  renderTags();
  
  // Hide auto-fill indicators
  const indicators = ['tagsAutoFillIndicator', 'categoryAutoFillIndicator'];
  indicators.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}


// Create Broadcast Form Handler
const createBroadcastForm = document.getElementById('createBroadcastForm');
if (createBroadcastForm) {
  createBroadcastForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const createBtn = document.getElementById('createBroadcastBtn');
    const originalText = createBtn.innerHTML;
    createBtn.innerHTML = '<i class="ti ti-loader animate-spin"></i> Creating...';
    createBtn.disabled = true;
    
    try {
      const formData = new FormData();
      
      // Add account ID
      const accountSelect = document.getElementById('accountSelect');
      if (accountSelect && accountSelect.value) {
        formData.append('accountId', accountSelect.value);
      }
      
      formData.append('title', document.getElementById('broadcastTitle').value);
      formData.append('description', document.getElementById('broadcastDescription').value);
      formData.append('scheduledStartTime', document.getElementById('scheduledStartTime').value);
      formData.append('privacyStatus', document.getElementById('privacyStatus').value);
      
      // Add stream key if selected
      const streamId = document.getElementById('streamKeySelect').value;
      if (streamId) {
        formData.append('streamId', streamId);
      }
      
      // Add tags
      if (currentTags.length > 0) {
        formData.append('tags', JSON.stringify(currentTags));
      }
      
      // Add category
      const categorySelect = document.getElementById('categoryId');
      if (categorySelect) {
        formData.append('categoryId', categorySelect.value);
      }
      
      // Note: Monetization, Ad Frequency, and Altered Content are not supported by YouTube API
      // These must be configured in YouTube Studio after creating the broadcast
      
      // Add thumbnail from gallery selection
      const thumbnailPath = document.getElementById('selectedThumbnailPath').value;
      if (thumbnailPath) {
        formData.append('thumbnailPath', thumbnailPath);
      }
      
      const response = await fetch('/api/youtube/broadcasts', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': getCsrfToken()
        },
        body: formData
      });
      
      const data = await response.json();
      
      if (data.success) {
        showToast('Broadcast created successfully!');
        closeCreateBroadcastModal();
        setTimeout(() => window.location.reload(), 1000);
      } else {
        showToast(data.error || 'Failed to create broadcast', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showToast('An error occurred', 'error');
    } finally {
      createBtn.innerHTML = originalText;
      createBtn.disabled = false;
    }
  });
}

// Delete Broadcast
async function deleteBroadcast(broadcastId, title, accountId = null) {
  if (!confirm(`Are you sure you want to delete "${title}"?`)) {
    return;
  }
  
  try {
    let url = `/api/youtube/broadcasts/${broadcastId}`;
    if (accountId) {
      url += `?accountId=${accountId}`;
    }
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'X-CSRF-Token': getCsrfToken()
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast('Broadcast deleted');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      showToast(data.error || 'Failed to delete broadcast', 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('An error occurred', 'error');
  }
}

// Edit Broadcast
async function editBroadcast(broadcastId, accountId) {
  try {
    // Fetch broadcast details
    const response = await fetch(`/api/youtube/broadcasts?accountId=${accountId}`, {
      headers: {
        'X-CSRF-Token': getCsrfToken()
      }
    });
    
    const data = await response.json();
    
    if (data.success && data.broadcasts) {
      const broadcast = data.broadcasts.find(b => b.id === broadcastId);
      if (broadcast) {
        // Add accountId to broadcast object for the modal
        broadcast.accountId = accountId;
        openEditBroadcastModal(broadcast);
      } else {
        showToast('Broadcast not found', 'error');
      }
    } else {
      showToast(data.error || 'Failed to load broadcast', 'error');
    }
  } catch (error) {
    console.error('Error fetching broadcast:', error);
    showToast('Failed to load broadcast', 'error');
  }
}

// Open Edit Broadcast Modal
function openEditBroadcastModal(broadcast) {
  document.getElementById('editBroadcastId').value = broadcast.id;
  document.getElementById('editAccountId').value = broadcast.accountId;
  document.getElementById('editBroadcastTitle').value = broadcast.title || '';
  document.getElementById('editBroadcastDescription').value = broadcast.description || '';
  document.getElementById('editPrivacyStatus').value = broadcast.privacyStatus || 'unlisted';
  
  // Format datetime for input
  if (broadcast.scheduledStartTime) {
    const date = new Date(broadcast.scheduledStartTime);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    document.getElementById('editScheduledStartTime').value = localDate.toISOString().slice(0, 16);
  }
  
  document.getElementById('editBroadcastModal').classList.remove('hidden');
}

function closeEditBroadcastModal() {
  document.getElementById('editBroadcastModal').classList.add('hidden');
  document.getElementById('editBroadcastForm').reset();
}

// Edit Broadcast Form Handler
const editBroadcastForm = document.getElementById('editBroadcastForm');
if (editBroadcastForm) {
  editBroadcastForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const updateBtn = document.getElementById('updateBroadcastBtn');
    const originalText = updateBtn.innerHTML;
    updateBtn.innerHTML = '<i class="ti ti-loader animate-spin"></i> Updating...';
    updateBtn.disabled = true;
    
    try {
      const broadcastId = document.getElementById('editBroadcastId').value;
      const accountId = document.getElementById('editAccountId').value;
      
      const updateData = {
        title: document.getElementById('editBroadcastTitle').value,
        description: document.getElementById('editBroadcastDescription').value,
        scheduledStartTime: document.getElementById('editScheduledStartTime').value,
        privacyStatus: document.getElementById('editPrivacyStatus').value
      };
      
      let url = `/api/youtube/broadcasts/${broadcastId}`;
      if (accountId) {
        url += `?accountId=${accountId}`;
      }
      
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify(updateData)
      });
      
      const data = await response.json();
      
      if (data.success) {
        showToast('Broadcast updated successfully!');
        closeEditBroadcastModal();
        setTimeout(() => window.location.reload(), 1000);
      } else {
        showToast(data.error || 'Failed to update broadcast', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showToast('An error occurred', 'error');
    } finally {
      updateBtn.innerHTML = originalText;
      updateBtn.disabled = false;
    }
  });
}

// Reuse Broadcast - opens create modal with pre-filled data
async function reuseBroadcast(broadcastId, accountId) {
  // Open create modal
  openCreateBroadcastModal();
  
  // Fetch broadcast details and pre-fill
  try {
    const response = await fetch(`/api/youtube/broadcasts?accountId=${accountId}`, {
      headers: {
        'X-CSRF-Token': getCsrfToken()
      }
    });
    
    const data = await response.json();
    
    if (data.success && data.broadcasts) {
      const broadcast = data.broadcasts.find(b => b.id === broadcastId);
      if (broadcast) {
        // Pre-fill form with broadcast data
        document.getElementById('broadcastTitle').value = broadcast.title || '';
        document.getElementById('broadcastDescription').value = broadcast.description || '';
        document.getElementById('privacyStatus').value = broadcast.privacyStatus || 'unlisted';
        
        // Select the account
        const accountSelect = document.getElementById('accountSelect');
        if (accountSelect) {
          accountSelect.value = accountId;
        }
        
        // Clear scheduled time - user must set new time
        document.getElementById('scheduledStartTime').value = '';
        
        showToast('Broadcast settings copied. Please set a new schedule time.', 'info');
      }
    }
  } catch (error) {
    console.error('Error fetching broadcast for reuse:', error);
  }
}

// Copy Stream Key
function copyStreamKey(streamKey) {
  if (!streamKey) {
    showToast('No stream key available', 'error');
    return;
  }
  
  navigator.clipboard.writeText(streamKey).then(() => {
    showToast('Stream key copied to clipboard');
  }).catch(() => {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = streamKey;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('Stream key copied to clipboard');
  });
}

// Change Thumbnail Modal
function changeThumbnail(broadcastId) {
  document.getElementById('changeThumbnailBroadcastId').value = broadcastId;
  document.getElementById('changeThumbnailModal').classList.remove('hidden');
}

function closeChangeThumbnailModal() {
  document.getElementById('changeThumbnailModal').classList.add('hidden');
  document.getElementById('changeThumbnailForm').reset();
  document.getElementById('newThumbnailPreview').innerHTML = '<i class="ti ti-photo text-gray-500 text-3xl"></i>';
}

// Preview new thumbnail
function previewNewThumbnail(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    
    // Validate file type
    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      showToast('Only JPG and PNG files are allowed', 'error');
      input.value = '';
      return;
    }
    
    // Validate file size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      showToast('File size must be less than 2MB', 'error');
      input.value = '';
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById('newThumbnailPreview').innerHTML = 
        `<img src="${e.target.result}" class="w-full h-full object-cover">`;
    };
    reader.readAsDataURL(file);
  }
}

// Change Thumbnail Form Handler
const changeThumbnailForm = document.getElementById('changeThumbnailForm');
if (changeThumbnailForm) {
  changeThumbnailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const uploadBtn = document.getElementById('uploadThumbnailBtn');
    const originalText = uploadBtn.innerHTML;
    uploadBtn.innerHTML = '<i class="ti ti-loader animate-spin"></i> Uploading...';
    uploadBtn.disabled = true;
    
    try {
      const broadcastId = document.getElementById('changeThumbnailBroadcastId').value;
      const formData = new FormData();
      formData.append('thumbnail', document.getElementById('newThumbnailFile').files[0]);
      
      const response = await fetch(`/api/youtube/broadcasts/${broadcastId}/thumbnail`, {
        method: 'POST',
        headers: {
          'X-CSRF-Token': getCsrfToken()
        },
        body: formData
      });
      
      const data = await response.json();
      
      if (data.success) {
        showToast('Thumbnail updated successfully!');
        closeChangeThumbnailModal();
        setTimeout(() => window.location.reload(), 1000);
      } else {
        showToast(data.error || 'Failed to update thumbnail', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showToast('An error occurred', 'error');
    } finally {
      uploadBtn.innerHTML = originalText;
      uploadBtn.disabled = false;
    }
  });
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
    }
  });
});

// Close modals on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.classList.add('hidden');
    });
  }
});

// ==========================================
// Template Management Functions
// ==========================================

// Template Library Modal
function openTemplateLibraryModal() {
  document.getElementById('templateLibraryModal').classList.remove('hidden');
  loadTemplates();
}

function closeTemplateLibraryModal() {
  document.getElementById('templateLibraryModal').classList.add('hidden');
}

// Load templates from API
async function loadTemplates() {
  const loading = document.getElementById('templateListLoading');
  const empty = document.getElementById('templateListEmpty');
  const content = document.getElementById('templateListContent');
  
  loading.classList.remove('hidden');
  empty.classList.add('hidden');
  content.classList.add('hidden');
  
  try {
    const response = await fetch('/api/youtube/templates', {
      headers: {
        'X-CSRF-Token': getCsrfToken()
      }
    });
    
    const data = await response.json();
    
    if (data.success && data.templates && data.templates.length > 0) {
      renderTemplateList(data.templates);
      content.classList.remove('hidden');
    } else {
      empty.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error loading templates:', error);
    showToast('Failed to load templates', 'error');
    empty.classList.remove('hidden');
  } finally {
    loading.classList.add('hidden');
  }
}

// Render template list
function renderTemplateList(templates) {
  const content = document.getElementById('templateListContent');
  content.innerHTML = '';
  
  templates.forEach(template => {
    const div = document.createElement('div');
    div.className = 'bg-dark-700 rounded-lg p-4';
    div.innerHTML = `
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1 min-w-0">
          <h4 class="font-medium text-white truncate">${escapeHtml(template.name)}</h4>
          <p class="text-sm text-gray-400 truncate">${escapeHtml(template.title)}</p>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-xs text-red-400 flex items-center gap-1">
              <i class="ti ti-brand-youtube"></i>
              ${escapeHtml(template.channel_name || 'Unknown Channel')}
            </span>
            <span class="text-xs text-gray-500">
              ${new Date(template.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
          <button onclick="createFromTemplate('${template.id}')"
            class="p-2 text-gray-400 hover:text-green-400 hover:bg-green-500/10 rounded transition-colors" title="Create Broadcast">
            <i class="ti ti-broadcast"></i>
          </button>
          <button onclick="openBulkCreateModal('${template.id}', '${escapeHtml(template.name)}')"
            class="p-2 text-gray-400 hover:text-primary hover:bg-primary/10 rounded transition-colors" title="Bulk Create">
            <i class="ti ti-stack-2"></i>
          </button>
          <button onclick="editTemplate('${template.id}')"
            class="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors" title="Edit">
            <i class="ti ti-edit"></i>
          </button>
          <button onclick="deleteTemplate('${template.id}', '${escapeHtml(template.name)}')"
            class="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors" title="Delete">
            <i class="ti ti-trash"></i>
          </button>
        </div>
      </div>
    `;
    content.appendChild(div);
  });
}

// Create Template Modal
function openCreateTemplateModal() {
  closeTemplateLibraryModal();
  document.getElementById('createTemplateModal').classList.remove('hidden');
}

function closeCreateTemplateModal() {
  document.getElementById('createTemplateModal').classList.add('hidden');
  document.getElementById('createTemplateForm').reset();
}

// Create Template Form Handler
const createTemplateForm = document.getElementById('createTemplateForm');
if (createTemplateForm) {
  createTemplateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const createBtn = document.getElementById('createTemplateBtn');
    const originalText = createBtn.innerHTML;
    createBtn.innerHTML = '<i class="ti ti-loader animate-spin"></i> Creating...';
    createBtn.disabled = true;
    
    try {
      const templateData = {
        name: document.getElementById('templateName').value,
        accountId: document.getElementById('templateAccountSelect').value,
        title: document.getElementById('templateTitle').value,
        description: document.getElementById('templateDescription').value,
        privacyStatus: document.getElementById('templatePrivacyStatus').value,
        categoryId: document.getElementById('templateCategoryId').value
      };
      
      const response = await fetch('/api/youtube/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify(templateData)
      });
      
      const data = await response.json();
      
      if (data.success) {
        showToast('Template created successfully!');
        closeCreateTemplateModal();
        openTemplateLibraryModal();
      } else {
        showToast(data.error || 'Failed to create template', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showToast('An error occurred', 'error');
    } finally {
      createBtn.innerHTML = originalText;
      createBtn.disabled = false;
    }
  });
}

// Save as Template Modal
function openSaveAsTemplateModal(broadcastId, accountId, title, privacyStatus, categoryId) {
  document.getElementById('saveTemplateBroadcastId').value = broadcastId;
  document.getElementById('saveTemplateAccountId').value = accountId;
  document.getElementById('previewTitle').textContent = title || '-';
  document.getElementById('previewPrivacy').textContent = privacyStatus || '-';
  document.getElementById('previewCategory').textContent = categoryId || '-';
  document.getElementById('saveAsTemplateModal').classList.remove('hidden');
}

function closeSaveAsTemplateModal() {
  document.getElementById('saveAsTemplateModal').classList.add('hidden');
  document.getElementById('saveAsTemplateForm').reset();
}

// Save as Template Form Handler
const saveAsTemplateForm = document.getElementById('saveAsTemplateForm');
if (saveAsTemplateForm) {
  saveAsTemplateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const saveBtn = document.getElementById('saveTemplateBtn');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="ti ti-loader animate-spin"></i> Saving...';
    saveBtn.disabled = true;
    
    try {
      const broadcastId = document.getElementById('saveTemplateBroadcastId').value;
      const accountId = document.getElementById('saveTemplateAccountId').value;
      const name = document.getElementById('saveTemplateName').value;
      
      // Fetch broadcast details first
      const broadcastResponse = await fetch(`/api/youtube/broadcasts?accountId=${accountId}`, {
        headers: {
          'X-CSRF-Token': getCsrfToken()
        }
      });
      
      const broadcastData = await broadcastResponse.json();
      
      if (!broadcastData.success) {
        throw new Error('Failed to fetch broadcast details');
      }
      
      const broadcast = broadcastData.broadcasts.find(b => b.id === broadcastId);
      if (!broadcast) {
        throw new Error('Broadcast not found');
      }
      
      // Create template from broadcast
      const templateData = {
        name: name,
        accountId: accountId,
        title: broadcast.title,
        description: broadcast.description || '',
        privacyStatus: broadcast.privacyStatus || 'unlisted',
        tags: broadcast.tags || null,
        categoryId: broadcast.categoryId || '20',
        thumbnailPath: broadcast.thumbnailPath || null
      };
      
      const response = await fetch('/api/youtube/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify(templateData)
      });
      
      const data = await response.json();
      
      if (data.success) {
        showToast('Template saved successfully!');
        closeSaveAsTemplateModal();
      } else {
        showToast(data.error || 'Failed to save template', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showToast(error.message || 'An error occurred', 'error');
    } finally {
      saveBtn.innerHTML = originalText;
      saveBtn.disabled = false;
    }
  });
}

// Delete Template
async function deleteTemplate(templateId, templateName) {
  if (!confirm(`Are you sure you want to delete template "${templateName}"?`)) {
    return;
  }
  
  try {
    const response = await fetch(`/api/youtube/templates/${templateId}`, {
      method: 'DELETE',
      headers: {
        'X-CSRF-Token': getCsrfToken()
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast('Template deleted');
      loadTemplates();
    } else {
      showToast(data.error || 'Failed to delete template', 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('An error occurred', 'error');
  }
}

// Edit Template
async function editTemplate(templateId) {
  try {
    const response = await fetch(`/api/youtube/templates/${templateId}`, {
      headers: {
        'X-CSRF-Token': getCsrfToken()
      }
    });
    
    const data = await response.json();
    
    if (data.success && data.template) {
      closeTemplateLibraryModal();
      
      // Pre-fill create template form for editing
      document.getElementById('templateName').value = data.template.name;
      document.getElementById('templateAccountSelect').value = data.template.account_id;
      document.getElementById('templateTitle').value = data.template.title;
      document.getElementById('templateDescription').value = data.template.description || '';
      document.getElementById('templatePrivacyStatus').value = data.template.privacy_status || 'unlisted';
      document.getElementById('templateCategoryId').value = data.template.category_id || '20';
      
      // Store template ID for update
      document.getElementById('createTemplateForm').dataset.editId = templateId;
      
      // Change button text
      document.getElementById('createTemplateBtn').innerHTML = '<i class="ti ti-check"></i><span>Update Template</span>';
      document.querySelector('#createTemplateModal h3').textContent = 'Edit Template';
      
      document.getElementById('createTemplateModal').classList.remove('hidden');
    } else {
      showToast(data.error || 'Failed to load template', 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('An error occurred', 'error');
  }
}

// Create Broadcast from Template
async function createFromTemplate(templateId) {
  try {
    const response = await fetch(`/api/youtube/templates/${templateId}`, {
      headers: {
        'X-CSRF-Token': getCsrfToken()
      }
    });
    
    const data = await response.json();
    
    if (data.success && data.template) {
      closeTemplateLibraryModal();
      openCreateBroadcastModal();
      
      // Pre-fill form with template data
      const template = data.template;
      document.getElementById('accountSelect').value = template.account_id;
      document.getElementById('broadcastTitle').value = template.title;
      document.getElementById('broadcastDescription').value = template.description || '';
      document.getElementById('privacyStatus').value = template.privacy_status || 'unlisted';
      document.getElementById('categoryId').value = template.category_id || '20';
      
      // Set tags if available
      if (template.tags && Array.isArray(template.tags)) {
        currentTags = [...template.tags];
        renderTags();
      }
      
      showToast('Template loaded. Please set schedule time.', 'info');
    } else {
      showToast(data.error || 'Failed to load template', 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('An error occurred', 'error');
  }
}

// Bulk Create Modal
let bulkScheduleCount = 0;

function openBulkCreateModal(templateId, templateName) {
  closeTemplateLibraryModal();
  document.getElementById('bulkCreateTemplateId').value = templateId;
  document.getElementById('bulkCreateTemplateName').textContent = templateName;
  document.getElementById('bulkScheduleList').innerHTML = '';
  bulkScheduleCount = 0;
  
  // Add initial schedule
  addBulkSchedule();
  
  document.getElementById('bulkCreateModal').classList.remove('hidden');
}

function closeBulkCreateModal() {
  document.getElementById('bulkCreateModal').classList.add('hidden');
  document.getElementById('bulkCreateForm').reset();
  document.getElementById('bulkScheduleList').innerHTML = '';
  bulkScheduleCount = 0;
}

// Add schedule input for bulk create
function addBulkSchedule() {
  bulkScheduleCount++;
  const list = document.getElementById('bulkScheduleList');
  
  const minDate = new Date(Date.now() + 11 * 60 * 1000);
  const minDateStr = minDate.toISOString().slice(0, 16);
  
  const div = document.createElement('div');
  div.className = 'flex items-center gap-2';
  div.id = `bulkSchedule${bulkScheduleCount}`;
  div.innerHTML = `
    <span class="text-sm text-gray-400 w-6">${bulkScheduleCount}.</span>
    <input type="datetime-local" name="schedule[]" required min="${minDateStr}"
      class="flex-1 px-3 py-2 bg-dark-700 border border-gray-600 rounded-lg focus:border-primary focus:outline-none text-sm [color-scheme:dark]">
    <button type="button" onclick="removeBulkSchedule(${bulkScheduleCount})"
      class="p-2 text-gray-400 hover:text-red-400 transition-colors ${bulkScheduleCount === 1 ? 'invisible' : ''}">
      <i class="ti ti-x"></i>
    </button>
  `;
  list.appendChild(div);
}

// Remove schedule input
function removeBulkSchedule(index) {
  const element = document.getElementById(`bulkSchedule${index}`);
  if (element) {
    element.remove();
    // Re-number remaining schedules
    const schedules = document.querySelectorAll('#bulkScheduleList > div');
    schedules.forEach((div, i) => {
      div.querySelector('span').textContent = `${i + 1}.`;
    });
  }
}

// Bulk Create Form Handler
const bulkCreateForm = document.getElementById('bulkCreateForm');
if (bulkCreateForm) {
  bulkCreateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const createBtn = document.getElementById('bulkCreateBtn');
    const originalText = createBtn.innerHTML;
    createBtn.innerHTML = '<i class="ti ti-loader animate-spin"></i> Creating...';
    createBtn.disabled = true;
    
    try {
      const templateId = document.getElementById('bulkCreateTemplateId').value;
      const scheduleInputs = document.querySelectorAll('input[name="schedule[]"]');
      const schedules = Array.from(scheduleInputs).map(input => input.value).filter(v => v);
      
      if (schedules.length === 0) {
        showToast('Please add at least one schedule', 'error');
        return;
      }
      
      const response = await fetch(`/api/youtube/templates/${templateId}/bulk-create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify({ schedules })
      });
      
      const data = await response.json();
      
      closeBulkCreateModal();
      showBulkCreateResult(data);
      
    } catch (error) {
      console.error('Error:', error);
      showToast('An error occurred', 'error');
    } finally {
      createBtn.innerHTML = originalText;
      createBtn.disabled = false;
    }
  });
}

// Show Bulk Create Result
function showBulkCreateResult(result) {
  document.getElementById('bulkResultTotal').textContent = result.total || 0;
  document.getElementById('bulkResultSuccess').textContent = result.success || 0;
  document.getElementById('bulkResultFailed').textContent = result.failed || 0;
  
  const errorsSection = document.getElementById('bulkCreateErrors');
  const errorList = document.getElementById('bulkCreateErrorList');
  
  if (result.errors && result.errors.length > 0) {
    errorsSection.classList.remove('hidden');
    errorList.innerHTML = result.errors.map(err => 
      `<p>${new Date(err.schedule).toLocaleString()}: ${escapeHtml(err.error)}</p>`
    ).join('');
  } else {
    errorsSection.classList.add('hidden');
  }
  
  document.getElementById('bulkCreateResultModal').classList.remove('hidden');
}

function closeBulkCreateResultModal() {
  document.getElementById('bulkCreateResultModal').classList.add('hidden');
  // Reload page to show new broadcasts
  window.location.reload();
}

// Add Save as Template button to broadcast actions
function addSaveAsTemplateButton(broadcastId, accountId, title, privacyStatus, categoryId) {
  openSaveAsTemplateModal(broadcastId, accountId, title, privacyStatus, categoryId);
}
