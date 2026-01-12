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
  
  if (loading) loading.classList.remove('hidden');
  
  try {
    let url = '/api/youtube/streams';
    if (accountId) {
      url += `?accountId=${accountId}`;
    }
    
    console.log('[fetchStreams] Fetching from:', url);
    
    const response = await fetch(url, {
      headers: {
        'X-CSRF-Token': getCsrfToken()
      }
    });
    
    const data = await response.json();
    console.log('[fetchStreams] Response:', data);
    
    // Clear existing options except first
    select.innerHTML = '<option value="">Create new stream key</option>';
    
    if (data.success && data.streams && data.streams.length > 0) {
      console.log('[fetchStreams] Found', data.streams.length, 'stream keys');
      data.streams.forEach(stream => {
        const option = document.createElement('option');
        option.value = stream.id;
        option.textContent = `${stream.title} (${stream.resolution} @ ${stream.frameRate})`;
        select.appendChild(option);
      });
    } else {
      console.log('[fetchStreams] No stream keys found or error:', data.error || 'empty response');
    }
  } catch (error) {
    console.error('[fetchStreams] Error:', error);
  } finally {
    if (loading) loading.classList.add('hidden');
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
  const titleLoading = document.getElementById('titleLoading');
  const descriptionLoading = document.getElementById('descriptionLoading');
  
  // Show loading indicators
  if (tagsLoading) tagsLoading.classList.remove('hidden');
  if (titleLoading) titleLoading.classList.remove('hidden');
  if (descriptionLoading) descriptionLoading.classList.remove('hidden');
  
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
    // Hide auto-fill indicators on failure
    hideAutoFillIndicators();
  } finally {
    // Hide loading indicators
    if (tagsLoading) tagsLoading.classList.add('hidden');
    if (titleLoading) titleLoading.classList.add('hidden');
    if (descriptionLoading) descriptionLoading.classList.add('hidden');
  }
}

// Hide all auto-fill indicators
function hideAutoFillIndicators() {
  const indicators = ['titleAutoFillIndicator', 'descriptionAutoFillIndicator', 'tagsAutoFillIndicator'];
  indicators.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

// Populate form with defaults from YouTube
function populateFormWithDefaults(defaults) {
  // Populate title if available
  const titleInput = document.getElementById('broadcastTitle');
  if (defaults.title && titleInput && !titleInput.value) {
    titleInput.value = defaults.title;
    const indicator = document.getElementById('titleAutoFillIndicator');
    if (indicator) indicator.classList.remove('hidden');
  }
  
  // Populate description if available
  const descInput = document.getElementById('broadcastDescription');
  if (defaults.description && descInput && !descInput.value) {
    descInput.value = defaults.description;
    const indicator = document.getElementById('descriptionAutoFillIndicator');
    if (indicator) indicator.classList.remove('hidden');
  }
  
  // Populate tags
  if (defaults.tags && defaults.tags.length > 0) {
    currentTags = [...defaults.tags];
    renderTags();
    const indicator = document.getElementById('tagsAutoFillIndicator');
    if (indicator) indicator.classList.remove('hidden');
  }
  
  // Note: Category field has been removed from UI
  // Default category (Gaming - 20) is used internally by backend
  
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
  
  // Hide all auto-fill indicators
  hideAutoFillIndicators();
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
      
      // Add category ID (default: 22 - People & Blogs)
      const categoryId = document.getElementById('categoryId').value;
      formData.append('categoryId', categoryId || '22');
      
      // Add Additional Settings (auto-start, auto-stop, and unlist replay) - always true by default
      const enableAutoStart = document.getElementById('enableAutoStart').value === 'true';
      const enableAutoStop = document.getElementById('enableAutoStop').value === 'true';
      const unlistReplayOnEnd = document.getElementById('unlistReplayOnEnd').value === 'true';
      formData.append('enableAutoStart', enableAutoStart);
      formData.append('enableAutoStop', enableAutoStop);
      formData.append('unlistReplayOnEnd', unlistReplayOnEnd);
      
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

// Edit Broadcast Form Handler - includes thumbnail upload and category
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
      
      console.log('[EditBroadcast-Original] Starting update for broadcast:', broadcastId, 'account:', accountId);
      
      // Upload thumbnail first if selected
      if (window.editThumbnailFile) {
        console.log('[EditBroadcast-Original] Uploading thumbnail:', window.editThumbnailFile.name);
        const thumbnailSuccess = await uploadEditThumbnail(broadcastId, accountId);
        if (!thumbnailSuccess) {
          showToast('Thumbnail upload failed', 'error');
        } else {
          showToast('Thumbnail uploaded!', 'success');
        }
      }
      
      // Get category value
      const categorySelect = document.getElementById('editCategoryId');
      const categoryId = categorySelect ? categorySelect.value : '22';
      
      console.log('[EditBroadcast-Original] Category:', categoryId);
      
      const updateData = {
        title: document.getElementById('editBroadcastTitle').value,
        description: document.getElementById('editBroadcastDescription').value,
        scheduledStartTime: document.getElementById('editScheduledStartTime').value,
        privacyStatus: document.getElementById('editPrivacyStatus').value,
        categoryId: categoryId
      };
      
      console.log('[EditBroadcast-Original] Update data:', JSON.stringify(updateData));
      
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
      console.log('[EditBroadcast-Original] Response:', data);
      
      if (data.success) {
        showToast('Broadcast updated successfully!');
        closeEditBroadcastModal();
        setTimeout(() => window.location.reload(), 1500);
      } else {
        showToast(data.error || 'Failed to update broadcast', 'error');
      }
    } catch (error) {
      console.error('[EditBroadcast-Original] Error:', error);
      showToast('An error occurred: ' + error.message, 'error');
    } finally {
      updateBtn.innerHTML = originalText;
      updateBtn.disabled = false;
      window.editThumbnailFile = null;
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
  
  templates.forEach((template, index) => {
    const isMulti = template.isMultiBroadcast && template.broadcasts && template.broadcasts.length > 1;
    const broadcastCount = isMulti ? template.broadcasts.length : 1;
    const hasRecurring = template.recurring_enabled;
    
    // Build recurring info HTML for desktop
    let recurringHtmlDesktop = '';
    if (hasRecurring) {
      const patternText = formatRecurringPattern(template.recurring_pattern, template.recurring_days, template.recurring_time);
      const nextRunText = formatNextRun(template.next_run_at);
      recurringHtmlDesktop = `
        <div class="flex items-center gap-2 mt-2 text-xs">
          <span class="px-2 py-0.5 bg-green-500/20 text-green-400 rounded flex items-center gap-1">
            <i class="ti ti-repeat"></i>
            ${escapeHtml(patternText)}
          </span>
          <span class="text-gray-500">Next: ${escapeHtml(nextRunText)}</span>
        </div>
      `;
    }
    
    const div = document.createElement('div');
    div.className = 'template-list-item';
    div.innerHTML = `
      <!-- Desktop Layout -->
      <div class="hidden md:flex items-start justify-between gap-4 bg-dark-700 rounded-lg p-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <h4 class="font-medium text-white truncate">${escapeHtml(template.name)}</h4>
            ${isMulti ? `<span class="px-1.5 py-0.5 bg-primary/20 text-primary text-xs rounded">${broadcastCount} broadcasts</span>` : ''}
            ${hasRecurring ? `<span class="recurring-badge px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded flex items-center gap-0.5"><i class="ti ti-repeat text-[10px]"></i> Auto</span>` : ''}
          </div>
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
          ${recurringHtmlDesktop}
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          ${!isMulti ? `
          <button onclick="toggleTemplateRecurring('${template.id}', ${hasRecurring})"
            class="recurring-toggle px-3 py-1.5 ${hasRecurring ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'} hover:opacity-80 rounded-lg transition-colors text-sm flex items-center gap-1" title="${hasRecurring ? 'Disable Recurring' : 'Enable Recurring'}" data-recurring="${hasRecurring}">
            <i class="ti ti-repeat"></i>
            <span>${hasRecurring ? 'On' : 'Off'}</span>
          </button>
          ` : ''}
          <button onclick="recreateFromTemplate('${template.id}')"
            class="px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg transition-colors text-sm flex items-center gap-1" title="Re-create Broadcasts">
            <i class="ti ti-refresh"></i>
            <span>Re-create</span>
          </button>
          ${!isMulti ? `
          <button onclick="openBulkCreateModal('${template.id}', '${escapeHtml(template.name)}')"
            class="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-colors text-sm flex items-center gap-1" title="Bulk Create">
            <i class="ti ti-stack-2"></i>
            <span>Bulk</span>
          </button>
          ` : ''}
          <button onclick="editTemplate('${template.id}')"
            class="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors text-sm flex items-center gap-1" title="Edit">
            <i class="ti ti-edit"></i>
          </button>
          <button onclick="deleteTemplate('${template.id}', '${escapeHtml(template.name)}')"
            class="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors text-sm flex items-center gap-1" title="Delete">
            <i class="ti ti-trash"></i>
          </button>
        </div>
      </div>
      
      <!-- Mobile Layout - Simple List -->
      <div class="md:hidden flex items-center gap-2 px-3 py-2.5 bg-dark-700/50 hover:bg-dark-700 rounded-lg transition-colors">
        <span class="text-primary font-semibold text-xs w-5 flex-shrink-0">${index + 1}</span>
        <div class="flex-1 min-w-0">
          <p class="text-sm text-white truncate">${escapeHtml(template.name)}</p>
          <p class="text-[10px] text-gray-500 truncate">${escapeHtml(template.title)}</p>
        </div>
        ${hasRecurring ? `<span class="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[10px] rounded flex-shrink-0"><i class="ti ti-repeat text-[8px]"></i></span>` : ''}
        ${isMulti ? `<span class="px-1.5 py-0.5 bg-primary/20 text-primary text-[10px] rounded flex-shrink-0">${broadcastCount}</span>` : ''}
        <div class="flex items-center gap-0.5 flex-shrink-0">
          <button onclick="recreateFromTemplate('${template.id}')"
            class="w-8 h-8 flex items-center justify-center text-green-400 hover:bg-green-500/20 rounded transition-colors" title="Re-create">
            <i class="ti ti-refresh text-sm"></i>
          </button>
          ${!isMulti ? `
          <button onclick="openBulkCreateModal('${template.id}', '${escapeHtml(template.name)}')"
            class="w-8 h-8 flex items-center justify-center text-primary hover:bg-primary/20 rounded transition-colors" title="Bulk Create">
            <i class="ti ti-stack-2 text-sm"></i>
          </button>
          ` : ''}
          <button onclick="editTemplate('${template.id}')"
            class="w-8 h-8 flex items-center justify-center text-blue-400 hover:bg-blue-500/20 rounded transition-colors" title="Edit">
            <i class="ti ti-edit text-sm"></i>
          </button>
          ${!isMulti ? `
          <button onclick="toggleTemplateRecurring('${template.id}', ${hasRecurring})"
            class="recurring-toggle w-8 h-8 flex items-center justify-center ${hasRecurring ? 'text-green-400 hover:bg-green-500/20' : 'text-gray-400 hover:bg-gray-500/20'} rounded transition-colors" title="${hasRecurring ? 'Disable Recurring' : 'Enable Recurring'}" data-recurring="${hasRecurring}">
            <i class="ti ti-repeat text-sm"></i>
          </button>
          ` : ''}
          <button onclick="deleteTemplate('${template.id}', '${escapeHtml(template.name)}')"
            class="w-8 h-8 flex items-center justify-center text-red-400 hover:bg-red-500/20 rounded transition-colors" title="Delete">
            <i class="ti ti-trash text-sm"></i>
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
  
  // Load stream keys for the selected account
  const accountId = document.getElementById('templateAccountSelect').value;
  if (accountId) {
    fetchTemplateStreamKeys(accountId);
  }
}

// Fetch stream keys for template modal
async function fetchTemplateStreamKeys(accountId) {
  const select = document.getElementById('templateStreamKeySelect');
  const loading = document.getElementById('templateStreamKeyLoading');
  
  if (!select) return;
  
  if (loading) loading.classList.remove('hidden');
  
  try {
    const response = await fetch(`/api/youtube/streams?accountId=${accountId}`, {
      headers: {
        'X-CSRF-Token': getCsrfToken()
      }
    });
    
    const data = await response.json();
    
    // Clear existing options except first
    select.innerHTML = '<option value="">-- Select Stream Key (Optional) --</option>';
    
    if (data.success && data.streams && data.streams.length > 0) {
      data.streams.forEach(stream => {
        const option = document.createElement('option');
        option.value = stream.id;
        option.textContent = `${stream.title} (${stream.resolution} @ ${stream.frameRate})`;
        select.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error fetching stream keys:', error);
  } finally {
    if (loading) loading.classList.add('hidden');
  }
}

// Handle account change in template modal
function onTemplateAccountChange(accountId) {
  if (accountId) {
    fetchTemplateStreamKeys(accountId);
  }
}

function closeCreateTemplateModal() {
  document.getElementById('createTemplateModal').classList.add('hidden');
  document.getElementById('createTemplateForm').reset();
  // Reset recurring fields
  resetRecurringFields();
  // Reset edit mode
  delete document.getElementById('createTemplateForm').dataset.editId;
  document.getElementById('createTemplateBtn').innerHTML = '<i class="ti ti-template"></i><span>Create Template</span>';
  document.querySelector('#createTemplateModal h3').textContent = 'Create New Template';
}

// Create Template Form Handler
const createTemplateForm = document.getElementById('createTemplateForm');
if (createTemplateForm) {
  createTemplateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Validate recurring config
    if (!validateRecurringConfig()) {
      return;
    }
    
    const createBtn = document.getElementById('createTemplateBtn');
    const originalText = createBtn.innerHTML;
    createBtn.innerHTML = '<i class="ti ti-loader animate-spin"></i> Creating...';
    createBtn.disabled = true;
    
    try {
      // Get recurring data
      const recurringData = getRecurringDataFromForm();
      
      const templateData = {
        name: document.getElementById('templateName').value,
        accountId: document.getElementById('templateAccountSelect').value,
        title: document.getElementById('templateTitle').value,
        description: document.getElementById('templateDescription').value,
        privacyStatus: document.getElementById('templatePrivacyStatus').value,
        categoryId: document.getElementById('templateCategoryId').value || '22',
        streamId: document.getElementById('templateStreamKeySelect').value || null,
        // Include recurring data
        recurringEnabled: recurringData.recurring_enabled,
        recurringPattern: recurringData.recurring_pattern,
        recurringTime: recurringData.recurring_time,
        recurringDays: recurringData.recurring_days
      };
      
      // Check if editing
      const editId = createTemplateForm.dataset.editId;
      const url = editId ? `/api/youtube/templates/${editId}` : '/api/youtube/templates';
      const method = editId ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify(templateData)
      });
      
      const data = await response.json();
      
      if (data.success) {
        showToast(editId ? 'Template updated successfully!' : 'Template created successfully!');
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
function openSaveAsTemplateModal(broadcastId, accountId, title, privacyStatus) {
  document.getElementById('saveTemplateBroadcastId').value = broadcastId;
  document.getElementById('saveTemplateAccountId').value = accountId;
  document.getElementById('previewTitle').textContent = title || '-';
  document.getElementById('previewPrivacy').textContent = privacyStatus || '-';
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
      
      console.log('[saveAsTemplate] Fetching broadcast details for:', broadcastId);
      
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
      
      console.log('[saveAsTemplate] All broadcasts:', broadcastData.broadcasts.map(b => ({ id: b.id, title: b.title, streamId: b.streamId, streamKey: b.streamKey })));
      
      const broadcast = broadcastData.broadcasts.find(b => b.id === broadcastId);
      if (!broadcast) {
        throw new Error('Broadcast not found');
      }
      
      console.log('[saveAsTemplate] Found broadcast:', { id: broadcast.id, title: broadcast.title, streamId: broadcast.streamId, streamKey: broadcast.streamKey });
      
      // Create template from broadcast - include streamId for reuse
      const templateData = {
        name: name,
        accountId: accountId,
        title: broadcast.title,
        description: broadcast.description || '',
        privacyStatus: broadcast.privacyStatus || 'unlisted',
        tags: broadcast.tags || null,
        categoryId: broadcast.categoryId || '22',
        thumbnailPath: broadcast.thumbnailPath || null,
        streamId: broadcast.streamId || null  // Save stream ID for reuse
      };
      
      console.log('[saveAsTemplate] Sending templateData:', {
        ...templateData,
        privacyStatus: templateData.privacyStatus
      });
      
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
        console.log('[saveAsTemplate] Template saved successfully with stream_id:', data.template?.stream_id);
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

// Edit Template - Opens simplified modal for recurring schedule only
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
      openEditTemplateModal(data.template);
    } else {
      showToast(data.error || 'Failed to load template', 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('An error occurred', 'error');
  }
}

// Open Edit Template Modal (Recurring Schedule Only)
function openEditTemplateModal(template) {
  document.getElementById('editTemplateId').value = template.id;
  document.getElementById('editTemplateName').textContent = template.name;
  
  // Set recurring enabled
  const recurringEnabled = document.getElementById('editRecurringEnabled');
  recurringEnabled.checked = template.recurring_enabled || false;
  
  // Show/hide recurring fields
  const container = document.getElementById('editRecurringFieldsContainer');
  if (template.recurring_enabled) {
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
  }
  
  // Set pattern
  if (template.recurring_pattern) {
    const patternRadio = document.querySelector(`input[name="editRecurringPattern"][value="${template.recurring_pattern}"]`);
    if (patternRadio) patternRadio.checked = true;
  }
  
  // Set time
  if (template.recurring_time) {
    document.getElementById('editRecurringTime').value = template.recurring_time;
  }
  
  // Set days
  document.querySelectorAll('input[name="editRecurringDays"]').forEach(cb => cb.checked = false);
  if (template.recurring_days && Array.isArray(template.recurring_days)) {
    template.recurring_days.forEach(day => {
      const checkbox = document.querySelector(`input[name="editRecurringDays"][value="${day.toLowerCase()}"]`);
      if (checkbox) checkbox.checked = true;
    });
  }
  
  // Show/hide days container
  const daysContainer = document.getElementById('editRecurringDaysContainer');
  if (template.recurring_pattern === 'weekly') {
    daysContainer.classList.remove('hidden');
  } else {
    daysContainer.classList.add('hidden');
  }
  
  document.getElementById('editTemplateModal').classList.remove('hidden');
}

function closeEditTemplateModal() {
  document.getElementById('editTemplateModal').classList.add('hidden');
  document.getElementById('editTemplateForm').reset();
}

// Toggle recurring fields in edit modal
function toggleEditRecurringFields() {
  const enabled = document.getElementById('editRecurringEnabled').checked;
  const container = document.getElementById('editRecurringFieldsContainer');
  
  if (enabled) {
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
  }
}

// Toggle days selection in edit modal
function toggleEditDaysSelection() {
  const pattern = document.querySelector('input[name="editRecurringPattern"]:checked')?.value;
  const daysContainer = document.getElementById('editRecurringDaysContainer');
  
  if (pattern === 'weekly') {
    daysContainer.classList.remove('hidden');
  } else {
    daysContainer.classList.add('hidden');
  }
}

// Edit Template Form Handler
const editTemplateForm = document.getElementById('editTemplateForm');
if (editTemplateForm) {
  editTemplateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const updateBtn = document.getElementById('updateTemplateBtn');
    const originalText = updateBtn.innerHTML;
    updateBtn.innerHTML = '<i class="ti ti-loader animate-spin"></i> Saving...';
    updateBtn.disabled = true;
    
    try {
      const templateId = document.getElementById('editTemplateId').value;
      const recurringEnabled = document.getElementById('editRecurringEnabled').checked;
      
      const updateData = {
        recurring_enabled: recurringEnabled
      };
      
      if (recurringEnabled) {
        const pattern = document.querySelector('input[name="editRecurringPattern"]:checked')?.value;
        const time = document.getElementById('editRecurringTime').value;
        
        if (!pattern) {
          showToast('Please select a pattern', 'error');
          return;
        }
        if (!time) {
          showToast('Please set a time', 'error');
          return;
        }
        
        updateData.recurring_pattern = pattern;
        updateData.recurring_time = time;
        
        if (pattern === 'weekly') {
          const days = Array.from(document.querySelectorAll('input[name="editRecurringDays"]:checked'))
            .map(cb => cb.value);
          
          if (days.length === 0) {
            document.getElementById('editRecurringDaysError').classList.remove('hidden');
            showToast('Please select at least one day', 'error');
            return;
          }
          
          updateData.recurring_days = days;
        }
      }
      
      const response = await fetch(`/api/youtube/templates/${templateId}/recurring`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify(updateData)
      });
      
      const data = await response.json();
      
      if (data.success) {
        showToast('Template updated successfully!');
        closeEditTemplateModal();
        // Refresh template library if open
        loadTemplates();
      } else {
        showToast(data.error || 'Failed to update template', 'error');
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
      // Note: Category field removed from UI
      
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
function addSaveAsTemplateButton(broadcastId, accountId, title, privacyStatus) {
  openSaveAsTemplateModal(broadcastId, accountId, title, privacyStatus);
}

// ==========================================
// Multi-Select Broadcast Functions
// ==========================================

// Get selected broadcasts
function getSelectedBroadcasts() {
  const checkboxes = document.querySelectorAll('.broadcast-checkbox:checked');
  const broadcasts = [];
  const seenIds = new Set();
  
  checkboxes.forEach(cb => {
    try {
      const data = JSON.parse(cb.dataset.broadcast);
      // Avoid duplicates (desktop + mobile checkboxes)
      if (!seenIds.has(data.id)) {
        seenIds.add(data.id);
        broadcasts.push(data);
      }
    } catch (e) {
      console.error('Error parsing broadcast data:', e);
    }
  });
  return broadcasts;
}

// Sync checkboxes between desktop and mobile views
function syncCheckboxes(checkbox) {
  const broadcastId = checkbox.dataset.broadcastId;
  if (!broadcastId) return;
  
  // Find all checkboxes with the same broadcast ID and sync their state
  const allCheckboxes = document.querySelectorAll(`.broadcast-checkbox[data-broadcast-id="${broadcastId}"]`);
  allCheckboxes.forEach(cb => {
    if (cb !== checkbox) {
      cb.checked = checkbox.checked;
    }
  });
}

// Update selection count display
function updateSelectionCount() {
  const selected = getSelectedBroadcasts();
  const countEl = document.getElementById('selectedCount');
  const actionsEl = document.getElementById('selectionActions');
  
  if (countEl) {
    countEl.textContent = `${selected.length} selected`;
  }
  
  if (actionsEl) {
    if (selected.length > 0) {
      actionsEl.classList.remove('hidden');
      actionsEl.classList.add('flex');
    } else {
      actionsEl.classList.add('hidden');
      actionsEl.classList.remove('flex');
    }
  }
  
  // Update select all checkbox state
  const selectAllCheckbox = document.getElementById('selectAllBroadcasts');
  const allCheckboxes = document.querySelectorAll('.broadcast-checkbox');
  if (selectAllCheckbox && allCheckboxes.length > 0) {
    selectAllCheckbox.checked = selected.length === allCheckboxes.length;
    selectAllCheckbox.indeterminate = selected.length > 0 && selected.length < allCheckboxes.length;
  }
}

// Toggle select all broadcasts
function toggleSelectAll(checkbox) {
  const allCheckboxes = document.querySelectorAll('.broadcast-checkbox');
  allCheckboxes.forEach(cb => {
    cb.checked = checkbox.checked;
  });
  updateSelectionCount();
}

// Clear all selections
function clearSelection() {
  const allCheckboxes = document.querySelectorAll('.broadcast-checkbox');
  allCheckboxes.forEach(cb => {
    cb.checked = false;
  });
  const selectAllCheckbox = document.getElementById('selectAllBroadcasts');
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  }
  updateSelectionCount();
}

// Save selected broadcasts as template
function saveSelectedAsTemplate() {
  const selected = getSelectedBroadcasts();
  
  if (selected.length === 0) {
    showToast('Please select at least one broadcast', 'error');
    return;
  }
  
  // Open multi-save template modal
  openMultiSaveTemplateModal(selected);
}

// Delete selected broadcasts
async function deleteSelectedBroadcasts() {
  const selected = getSelectedBroadcasts();
  
  if (selected.length === 0) {
    showToast('Please select at least one broadcast', 'error');
    return;
  }
  
  if (!confirm(`Are you sure you want to delete ${selected.length} broadcast(s)?`)) {
    return;
  }
  
  let successCount = 0;
  let failCount = 0;
  
  for (const broadcast of selected) {
    try {
      let url = `/api/youtube/broadcasts/${broadcast.id}`;
      if (broadcast.accountId) {
        url += `?accountId=${broadcast.accountId}`;
      }
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'X-CSRF-Token': getCsrfToken()
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        successCount++;
      } else {
        failCount++;
      }
    } catch (error) {
      console.error('Error deleting broadcast:', error);
      failCount++;
    }
  }
  
  if (failCount === 0) {
    showToast(`Successfully deleted ${successCount} broadcast(s)`);
  } else {
    showToast(`Deleted ${successCount}/${selected.length}. ${failCount} failed.`, 'error');
  }
  
  setTimeout(() => window.location.reload(), 1000);
}

// Multi-Save Template Modal
function openMultiSaveTemplateModal(broadcasts) {
  // Store broadcasts data
  window.selectedBroadcastsForTemplate = broadcasts;
  
  // Update preview
  const previewEl = document.getElementById('multiTemplatePreview');
  if (previewEl) {
    previewEl.innerHTML = broadcasts.map((b, i) => `
      <div class="flex items-center gap-2 text-xs">
        <span class="text-gray-500">${i + 1}.</span>
        <span class="text-white truncate">${escapeHtml(b.title)}</span>
        <span class="text-gray-500">(${b.privacyStatus})</span>
      </div>
    `).join('');
  }
  
  document.getElementById('multiSaveTemplateModal').classList.remove('hidden');
}

function closeMultiSaveTemplateModal() {
  document.getElementById('multiSaveTemplateModal').classList.add('hidden');
  document.getElementById('multiSaveTemplateForm').reset();
  window.selectedBroadcastsForTemplate = null;
}

// Multi-Save Template Form Handler
const multiSaveTemplateForm = document.getElementById('multiSaveTemplateForm');
if (multiSaveTemplateForm) {
  multiSaveTemplateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const saveBtn = document.getElementById('multiSaveTemplateBtn');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="ti ti-loader animate-spin"></i> Saving...';
    saveBtn.disabled = true;
    
    try {
      const broadcasts = window.selectedBroadcastsForTemplate;
      const templateName = document.getElementById('multiTemplateName').value;
      
      if (!broadcasts || broadcasts.length === 0) {
        throw new Error('No broadcasts selected');
      }
      
      // Create template with all broadcast data - include streamId for reuse
      const templateData = {
        name: templateName,
        accountId: broadcasts[0].accountId,
        broadcasts: broadcasts.map(b => ({
          title: b.title,
          description: b.description || '',
          privacyStatus: b.privacyStatus || 'unlisted',
          streamId: b.streamId || null,  // Save stream ID for reuse
          streamKey: b.streamKey || '',
          categoryId: b.categoryId || '22',
          tags: b.tags || []
        }))
      };
      
      console.log('[multiSaveTemplate] Saving template with broadcasts:', templateData.broadcasts.map(b => ({ title: b.title, streamId: b.streamId })));
      
      const response = await fetch('/api/youtube/templates/multi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify(templateData)
      });
      
      const data = await response.json();
      
      if (data.success) {
        showToast(`Template "${templateName}" saved with ${broadcasts.length} broadcast(s)!`);
        closeMultiSaveTemplateModal();
        clearSelection();
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

// Re-create broadcasts from template
async function recreateFromTemplate(templateId) {
  try {
    const response = await fetch(`/api/youtube/templates/${templateId}`, {
      headers: {
        'X-CSRF-Token': getCsrfToken()
      }
    });
    
    const data = await response.json();
    
    if (data.success && data.template) {
      closeTemplateLibraryModal();
      
      // Check if template has multiple broadcasts
      if (data.template.broadcasts && data.template.broadcasts.length > 0) {
        openRecreateFromTemplateModal(data.template);
      } else {
        // Single broadcast template - use existing flow
        createFromTemplate(templateId);
      }
    } else {
      showToast(data.error || 'Failed to load template', 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('An error occurred', 'error');
  }
}

// Open Re-create from Template Modal
function openRecreateFromTemplateModal(template) {
  window.currentRecreateTemplate = template;
  
  document.getElementById('recreateTemplateName').textContent = template.name;
  
  // Render broadcast list with schedule inputs
  const listEl = document.getElementById('recreateBroadcastList');
  const broadcasts = template.broadcasts || [template];
  
  listEl.innerHTML = broadcasts.map((b, i) => {
    const minDate = new Date(Date.now() + 11 * 60 * 1000);
    const minDateStr = minDate.toISOString().slice(0, 16);
    
    return `
      <div class="bg-dark-700 rounded-lg p-3 space-y-2">
        <div class="flex items-center justify-between">
          <span class="font-medium text-sm text-white">${i + 1}. ${escapeHtml(b.title)}</span>
          <span class="text-xs text-gray-500">${b.privacyStatus}</span>
        </div>
        ${b.streamKey ? `<div class="text-xs text-gray-400 font-mono truncate">Key: ${escapeHtml(b.streamKey)}</div>` : ''}
        <div>
          <label class="text-xs text-gray-400 block mb-1">Schedule Time</label>
          <input type="datetime-local" name="recreateSchedule[]" required min="${minDateStr}"
            class="w-full px-3 py-2 bg-dark-600 border border-gray-600 rounded-lg focus:border-primary focus:outline-none text-sm [color-scheme:dark]">
        </div>
      </div>
    `;
  }).join('');
  
  document.getElementById('recreateFromTemplateModal').classList.remove('hidden');
}

function closeRecreateFromTemplateModal() {
  document.getElementById('recreateFromTemplateModal').classList.add('hidden');
  window.currentRecreateTemplate = null;
}

// Re-create Form Handler
const recreateFromTemplateForm = document.getElementById('recreateFromTemplateForm');
if (recreateFromTemplateForm) {
  recreateFromTemplateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const createBtn = document.getElementById('recreateBtn');
    const originalText = createBtn.innerHTML;
    createBtn.innerHTML = '<i class="ti ti-loader animate-spin"></i> Creating...';
    createBtn.disabled = true;
    
    try {
      const template = window.currentRecreateTemplate;
      const scheduleInputs = document.querySelectorAll('input[name="recreateSchedule[]"]');
      const schedules = Array.from(scheduleInputs).map(input => input.value).filter(v => v);
      
      const broadcasts = template.broadcasts || [template];
      
      if (schedules.length !== broadcasts.length) {
        showToast('Please set schedule time for all broadcasts', 'error');
        return;
      }
      
      // Create broadcasts one by one
      const results = { total: broadcasts.length, success: 0, failed: 0, errors: [] };
      
      for (let i = 0; i < broadcasts.length; i++) {
        const broadcast = broadcasts[i];
        const schedule = schedules[i];
        
        try {
          const formData = new FormData();
          formData.append('accountId', template.account_id);
          formData.append('title', broadcast.title);
          formData.append('description', broadcast.description || '');
          formData.append('scheduledStartTime', schedule);
          formData.append('privacyStatus', broadcast.privacyStatus || 'unlisted');
          // Note: Category field removed, backend uses default value
          
          if (broadcast.tags && broadcast.tags.length > 0) {
            formData.append('tags', JSON.stringify(broadcast.tags));
          }
          
          // Use streamId to reuse the same stream key
          if (broadcast.streamId) {
            formData.append('streamId', broadcast.streamId);
            console.log('[recreate] Using streamId:', broadcast.streamId);
          } else if (template.stream_id) {
            // Fallback to template's stream_id for single broadcast templates
            formData.append('streamId', template.stream_id);
            console.log('[recreate] Using template stream_id:', template.stream_id);
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
            results.success++;
          } else {
            results.failed++;
            results.errors.push({ title: broadcast.title, error: data.error });
          }
        } catch (err) {
          results.failed++;
          results.errors.push({ title: broadcast.title, error: err.message });
        }
      }
      
      closeRecreateFromTemplateModal();
      
      // Show results
      if (results.failed === 0) {
        showToast(`Successfully created ${results.success} broadcast(s)!`);
        setTimeout(() => window.location.reload(), 1000);
      } else {
        showToast(`Created ${results.success}/${results.total} broadcasts. ${results.failed} failed.`, 'error');
        console.error('Failed broadcasts:', results.errors);
        setTimeout(() => window.location.reload(), 2000);
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

// ============================================
// RECURRING SCHEDULE MANAGEMENT
// ============================================

// Toggle recurring fields visibility
function toggleRecurringFields() {
  const enabled = document.getElementById('templateRecurringEnabled').checked;
  const container = document.getElementById('recurringFieldsContainer');
  
  if (enabled) {
    container.classList.remove('hidden');
    // Set default pattern to daily if none selected
    const dailyRadio = document.querySelector('input[name="recurringPattern"][value="daily"]');
    if (dailyRadio && !document.querySelector('input[name="recurringPattern"]:checked')) {
      dailyRadio.checked = true;
    }
  } else {
    container.classList.add('hidden');
  }
}

// Toggle days selection visibility based on pattern
function toggleDaysSelection() {
  const pattern = document.querySelector('input[name="recurringPattern"]:checked')?.value;
  const daysContainer = document.getElementById('recurringDaysContainer');
  
  if (pattern === 'weekly') {
    daysContainer.classList.remove('hidden');
  } else {
    daysContainer.classList.add('hidden');
    // Clear days selection when switching to daily
    document.querySelectorAll('input[name="recurringDays"]').forEach(cb => cb.checked = false);
  }
}

// Get recurring data from form
function getRecurringDataFromForm() {
  const enabled = document.getElementById('templateRecurringEnabled').checked;
  
  if (!enabled) {
    return {
      recurring_enabled: false,
      recurring_pattern: null,
      recurring_time: null,
      recurring_days: null
    };
  }
  
  const pattern = document.querySelector('input[name="recurringPattern"]:checked')?.value;
  const time = document.getElementById('templateRecurringTime').value;
  const days = pattern === 'weekly' 
    ? Array.from(document.querySelectorAll('input[name="recurringDays"]:checked')).map(cb => cb.value)
    : null;
  
  return {
    recurring_enabled: true,
    recurring_pattern: pattern,
    recurring_time: time,
    recurring_days: days
  };
}

// Validate recurring configuration
function validateRecurringConfig() {
  const enabled = document.getElementById('templateRecurringEnabled').checked;
  
  if (!enabled) return true;
  
  const pattern = document.querySelector('input[name="recurringPattern"]:checked')?.value;
  const time = document.getElementById('templateRecurringTime').value;
  
  if (!pattern) {
    showToast('Please select a recurring pattern', 'error');
    return false;
  }
  
  if (!time) {
    showToast('Please set a recurring time', 'error');
    return false;
  }
  
  if (pattern === 'weekly') {
    const days = document.querySelectorAll('input[name="recurringDays"]:checked');
    if (days.length === 0) {
      document.getElementById('recurringDaysError').classList.remove('hidden');
      showToast('Please select at least one day for weekly schedule', 'error');
      return false;
    }
    document.getElementById('recurringDaysError').classList.add('hidden');
  }
  
  return true;
}

// Populate recurring fields in form (for editing)
function populateRecurringFields(template) {
  const enabledCheckbox = document.getElementById('templateRecurringEnabled');
  
  if (template.recurring_enabled) {
    enabledCheckbox.checked = true;
    toggleRecurringFields();
    
    // Set pattern
    const patternRadio = document.querySelector(`input[name="recurringPattern"][value="${template.recurring_pattern}"]`);
    if (patternRadio) {
      patternRadio.checked = true;
      toggleDaysSelection();
    }
    
    // Set time
    if (template.recurring_time) {
      document.getElementById('templateRecurringTime').value = template.recurring_time;
    }
    
    // Set days for weekly
    if (template.recurring_pattern === 'weekly' && template.recurring_days) {
      const days = Array.isArray(template.recurring_days) ? template.recurring_days : [];
      days.forEach(day => {
        const checkbox = document.querySelector(`input[name="recurringDays"][value="${day}"]`);
        if (checkbox) checkbox.checked = true;
      });
    }
  } else {
    enabledCheckbox.checked = false;
    toggleRecurringFields();
  }
}

// Reset recurring fields
function resetRecurringFields() {
  document.getElementById('templateRecurringEnabled').checked = false;
  document.getElementById('recurringFieldsContainer').classList.add('hidden');
  document.getElementById('recurringDaysContainer').classList.add('hidden');
  document.getElementById('templateRecurringTime').value = '';
  document.querySelectorAll('input[name="recurringPattern"]').forEach(r => r.checked = false);
  document.querySelectorAll('input[name="recurringDays"]').forEach(cb => cb.checked = false);
  document.getElementById('recurringDaysError').classList.add('hidden');
}

// Toggle recurring for a template (quick toggle from list)
async function toggleTemplateRecurring(templateId, currentEnabled) {
  try {
    const response = await fetch(`/api/youtube/templates/${templateId}/recurring/toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCsrfToken()
      },
      body: JSON.stringify({ enabled: !currentEnabled })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast(data.recurring_enabled ? 'Recurring enabled' : 'Recurring disabled');
      loadTemplates(); // Refresh list
    } else {
      showToast(data.error || 'Failed to toggle recurring', 'error');
    }
  } catch (error) {
    console.error('Error toggling recurring:', error);
    showToast('Failed to toggle recurring', 'error');
  }
}

// Format next run time for display
function formatNextRun(nextRunAt) {
  if (!nextRunAt) return 'Not scheduled';
  
  const date = new Date(nextRunAt);
  const now = new Date();
  const diffMs = date - now;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMs < 0) return 'Overdue';
  if (diffHours < 24) {
    return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (diffDays === 1) {
    return `Tomorrow at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + 
         ` at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

// Format recurring pattern for display
function formatRecurringPattern(pattern, days, time) {
  if (pattern === 'daily') {
    return `Daily at ${time}`;
  }
  if (pattern === 'weekly' && days && days.length > 0) {
    const dayNames = {
      monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
      friday: 'Fri', saturday: 'Sat', sunday: 'Sun'
    };
    const dayList = days.map(d => dayNames[d] || d).join(', ');
    return `Weekly (${dayList}) at ${time}`;
  }
  return 'Unknown pattern';
}

// ============================================
// Template Export/Import Functions
// ============================================

// Store parsed import data
let importBackupData = null;

/**
 * Export templates to JSON file
 */
async function exportTemplates() {
  try {
    showToast('Exporting templates...', 'info');
    
    // Trigger download via API
    const response = await fetch('/api/youtube/templates/export', {
      method: 'GET',
      credentials: 'same-origin'
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Export failed');
    }
    
    // Get filename from Content-Disposition header or generate one
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = 'templates-backup.json';
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="(.+)"/);
      if (match) filename = match[1];
    }
    
    // Create blob and download
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    showToast('Templates exported successfully', 'success');
  } catch (error) {
    console.error('Error exporting templates:', error);
    showToast(error.message || 'Failed to export templates', 'error');
  }
}

/**
 * Open import template modal
 */
function openImportTemplateModal() {
  // Reset state
  importBackupData = null;
  document.getElementById('importTemplateFile').value = '';
  document.getElementById('importFileName').classList.add('hidden');
  document.getElementById('importPreview').classList.add('hidden');
  document.getElementById('importError').classList.add('hidden');
  document.getElementById('importOptions').classList.add('hidden');
  document.getElementById('confirmImportBtn').disabled = true;
  document.getElementById('skipDuplicates').checked = true;
  
  document.getElementById('importTemplateModal').classList.remove('hidden');
}

/**
 * Close import template modal
 */
function closeImportTemplateModal() {
  document.getElementById('importTemplateModal').classList.add('hidden');
  importBackupData = null;
}

/**
 * Preview import file and validate
 */
function previewImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  
  // Show filename
  document.getElementById('importFileName').textContent = file.name;
  document.getElementById('importFileName').classList.remove('hidden');
  
  // Hide previous states
  document.getElementById('importPreview').classList.add('hidden');
  document.getElementById('importError').classList.add('hidden');
  document.getElementById('importOptions').classList.add('hidden');
  document.getElementById('confirmImportBtn').disabled = true;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      
      // Validate format
      if (!data.metadata || !Array.isArray(data.templates)) {
        showImportError('Invalid backup format: missing metadata or templates array');
        return;
      }
      
      // Store data for import
      importBackupData = data;
      
      // Show preview
      document.getElementById('importTemplateCount').textContent = data.templates.length;
      document.getElementById('importExportDate').textContent = data.metadata.exportDate 
        ? new Date(data.metadata.exportDate).toLocaleString() 
        : 'Unknown';
      
      document.getElementById('importPreview').classList.remove('hidden');
      document.getElementById('importOptions').classList.remove('hidden');
      document.getElementById('confirmImportBtn').disabled = false;
      
    } catch (parseError) {
      showImportError('Invalid JSON file: ' + parseError.message);
    }
  };
  
  reader.onerror = function() {
    showImportError('Failed to read file');
  };
  
  reader.readAsText(file);
}

/**
 * Show import error message
 */
function showImportError(message) {
  document.getElementById('importErrorMessage').textContent = message;
  document.getElementById('importError').classList.remove('hidden');
  document.getElementById('confirmImportBtn').disabled = true;
  importBackupData = null;
}

/**
 * Confirm and execute import
 */
async function confirmImportTemplates() {
  if (!importBackupData) {
    showToast('No valid file selected', 'error');
    return;
  }
  
  const confirmBtn = document.getElementById('confirmImportBtn');
  const originalText = confirmBtn.innerHTML;
  
  try {
    // Show loading state
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="ti ti-loader animate-spin"></i> Importing...';
    
    const skipDuplicates = document.getElementById('skipDuplicates').checked;
    
    // Create form data
    const formData = new FormData();
    const blob = new Blob([JSON.stringify(importBackupData)], { type: 'application/json' });
    formData.append('file', blob, 'import.json');
    formData.append('skipDuplicates', skipDuplicates);
    
    const response = await fetch('/api/youtube/templates/import', {
      method: 'POST',
      credentials: 'same-origin',
      body: formData
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Import failed');
    }
    
    // Close import modal
    closeImportTemplateModal();
    
    // Show results
    showImportResults(result.results);
    
    // Refresh template list
    loadTemplates();
    
  } catch (error) {
    console.error('Error importing templates:', error);
    showToast(error.message || 'Failed to import templates', 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = originalText;
  }
}

/**
 * Show import results modal
 */
function showImportResults(results) {
  document.getElementById('importedCount').textContent = results.imported || 0;
  document.getElementById('skippedCount').textContent = results.skipped || 0;
  
  const errorsList = document.getElementById('importErrorsList');
  const errorsContent = document.getElementById('importErrorsContent');
  
  if (results.errors && results.errors.length > 0) {
    errorsContent.innerHTML = results.errors.map(err => 
      `<p class="text-yellow-400">${escapeHtml(err)}</p>`
    ).join('');
    errorsList.classList.remove('hidden');
  } else {
    errorsList.classList.add('hidden');
  }
  
  document.getElementById('importResultModal').classList.remove('hidden');
  
  // Show toast based on results
  if (results.imported > 0) {
    showToast(`Successfully imported ${results.imported} template(s)`, 'success');
  } else if (results.skipped > 0) {
    showToast('No templates imported (all skipped)', 'warning');
  }
}

/**
 * Close import result modal
 */
function closeImportResultModal() {
  document.getElementById('importResultModal').classList.add('hidden');
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// Thumbnail Upload for Edit Broadcast
// ============================================

// Global variable to store selected thumbnail file for edit modal
// This MUST be declared at global scope so it persists across function calls
window.editThumbnailFile = null;

/**
 * Preview thumbnail before upload in edit modal
 * Called when user selects a file via the file input
 */
function previewEditThumbnail(input) {
  console.log('[previewEditThumbnail] Called, input:', input);
  console.log('[previewEditThumbnail] Files:', input.files);
  
  const file = input.files[0];
  if (!file) {
    console.log('[previewEditThumbnail] No file selected');
    return;
  }
  
  console.log('[previewEditThumbnail] File selected:', file.name, file.type, file.size);
  
  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
  if (!allowedTypes.includes(file.type)) {
    showToast('Only JPG and PNG files are allowed', 'error');
    input.value = '';
    return;
  }
  
  // Validate file size (max 2MB)
  if (file.size > 2 * 1024 * 1024) {
    showToast('File too large. Maximum size is 2MB', 'error');
    input.value = '';
    return;
  }
  
  // Store file in global variable
  window.editThumbnailFile = file;
  console.log('[previewEditThumbnail] File stored in window.editThumbnailFile:', window.editThumbnailFile.name);
  
  // Show preview
  const reader = new FileReader();
  reader.onload = function(e) {
    const preview = document.getElementById('editThumbnailPreview');
    if (preview) {
      preview.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover">`;
      console.log('[previewEditThumbnail] Preview updated');
    }
  };
  reader.readAsDataURL(file);
  
  showToast('Thumbnail selected. Click "Update Broadcast" to save.', 'info');
}

/**
 * Upload thumbnail for broadcast to YouTube AND save to local gallery
 * @param {string} broadcastId - The broadcast/video ID
 * @param {string} accountId - The YouTube account ID
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
async function uploadEditThumbnail(broadcastId, accountId) {
  console.log('[uploadEditThumbnail] Called with broadcastId:', broadcastId, 'accountId:', accountId);
  console.log('[uploadEditThumbnail] window.editThumbnailFile:', window.editThumbnailFile);
  
  if (!window.editThumbnailFile) {
    console.log('[uploadEditThumbnail] No file to upload, returning true');
    return true; // No file to upload
  }
  
  try {
    console.log('[uploadEditThumbnail] Creating FormData...');
    const formData = new FormData();
    formData.append('thumbnail', window.editThumbnailFile);
    formData.append('accountId', accountId);
    
    console.log('[uploadEditThumbnail] Sending request to /api/youtube/broadcasts/' + broadcastId + '/thumbnail');
    
    const response = await fetch(`/api/youtube/broadcasts/${broadcastId}/thumbnail`, {
      method: 'POST',
      headers: {
        'X-CSRF-Token': getCsrfToken()
      },
      body: formData
    });
    
    console.log('[uploadEditThumbnail] Response status:', response.status);
    
    const data = await response.json();
    console.log('[uploadEditThumbnail] Response data:', data);
    
    if (!data.success) {
      console.error('[uploadEditThumbnail] Upload failed:', data.error);
      return false;
    }
    
    // Save to local gallery for history (only if not already from history)
    if (!window.editThumbnailFromHistory) {
      console.log('[uploadEditThumbnail] Saving to local gallery...');
      await saveToThumbnailHistory(window.editThumbnailFile);
    } else {
      console.log('[uploadEditThumbnail] Thumbnail from history, skipping gallery save');
    }
    
    console.log('[uploadEditThumbnail] Upload successful!');
    return true;
  } catch (error) {
    console.error('[uploadEditThumbnail] Error:', error);
    return false;
  }
}

/**
 * Save thumbnail to local gallery for history
 */
async function saveToThumbnailHistory(file) {
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
      console.log('[saveToThumbnailHistory] Saved to gallery');
      // Refresh history
      loadEditThumbnailHistory();
    }
  } catch (error) {
    console.error('[saveToThumbnailHistory] Error:', error);
  }
}

/**
 * Load thumbnail history for edit modal (max 10)
 */
async function loadEditThumbnailHistory() {
  const historyContainer = document.getElementById('editThumbnailHistory');
  const emptyState = document.getElementById('editThumbnailHistoryEmpty');
  const countEl = document.getElementById('editThumbnailCount');
  
  if (!historyContainer) return;
  
  historyContainer.innerHTML = '<div class="col-span-2 text-center py-2"><i class="ti ti-loader animate-spin text-gray-400"></i></div>';
  
  try {
    const response = await fetch('/api/thumbnails?limit=10', {
      headers: {
        'X-CSRF-Token': getCsrfToken()
      }
    });
    
    const data = await response.json();
    
    // Update count
    const count = Math.min(data.count || 0, 10);
    if (countEl) {
      countEl.textContent = `(${count}/10)`;
    }
    
    historyContainer.innerHTML = '';
    
    if (data.success && data.thumbnails && data.thumbnails.length > 0) {
      // Show only last 10
      const thumbnails = data.thumbnails.slice(0, 10);
      
      thumbnails.forEach(thumb => {
        const div = document.createElement('div');
        div.className = 'thumbnail-history-item aspect-video bg-dark-700 rounded cursor-pointer overflow-hidden border-2 border-transparent hover:border-primary transition-colors';
        div.dataset.path = thumb.path; // Add data-path for auto-rotate selection
        div.dataset.url = thumb.url;
        div.innerHTML = `<img src="${thumb.url}" class="w-full h-full object-cover" alt="Thumbnail">`;
        div.onclick = () => selectHistoryThumbnail(thumb.url, thumb.path);
        historyContainer.appendChild(div);
      });
      
      if (emptyState) emptyState.classList.add('hidden');
    } else {
      if (emptyState) emptyState.classList.remove('hidden');
    }
  } catch (error) {
    console.error('[loadEditThumbnailHistory] Error:', error);
    historyContainer.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
  }
}

/**
 * Select thumbnail from history
 */
function selectHistoryThumbnail(url, path) {
  // Update preview
  const preview = document.getElementById('editThumbnailPreview');
  if (preview) {
    preview.innerHTML = `<img src="${url}" class="w-full h-full object-cover">`;
  }
  
  // Highlight selected
  document.querySelectorAll('.thumbnail-history-item').forEach(item => {
    item.classList.remove('border-primary');
    item.classList.add('border-transparent');
  });
  event.currentTarget.classList.remove('border-transparent');
  event.currentTarget.classList.add('border-primary');
  
  // Load the image as file for upload
  fetch(url)
    .then(res => res.blob())
    .then(blob => {
      const file = new File([blob], 'thumbnail.jpg', { type: blob.type });
      window.editThumbnailFile = file;
      window.editThumbnailFromHistory = true; // Mark as from history, no need to save again
      showToast('Thumbnail selected from history', 'info');
    })
    .catch(err => {
      console.error('Error loading thumbnail:', err);
      showToast('Failed to load thumbnail', 'error');
    });
}

// ============================================
// Title Manager Functions
// ============================================

let titleSuggestions = [];
let titleManagerContext = 'edit'; // 'edit' or 'create'

/**
 * Open Title Manager Modal
 */
function openTitleManagerModal(context = 'edit') {
  titleManagerContext = context;
  document.getElementById('titleManagerModal').classList.remove('hidden');
  loadTitleSuggestions();
}

/**
 * Close Title Manager Modal
 */
function closeTitleManagerModal() {
  document.getElementById('titleManagerModal').classList.add('hidden');
}

/**
 * Load title suggestions from API
 */
async function loadTitleSuggestions(category = null) {
  const listEl = document.getElementById('titleManagerList');
  listEl.innerHTML = '<div class="text-center py-4 text-gray-500 text-sm"><i class="ti ti-loader animate-spin"></i> Loading...</div>';
  
  try {
    let url = '/api/title-suggestions';
    if (category) url += `?category=${encodeURIComponent(category)}`;
    
    const response = await fetch(url, {
      headers: { 'X-CSRF-Token': getCsrfToken() }
    });
    
    const data = await response.json();
    
    if (data.success) {
      titleSuggestions = data.titles || [];
      renderTitleManagerList();
    } else {
      listEl.innerHTML = '<div class="text-center py-4 text-red-400 text-sm">Failed to load titles</div>';
    }
  } catch (error) {
    console.error('Error loading titles:', error);
    listEl.innerHTML = '<div class="text-center py-4 text-red-400 text-sm">Failed to load titles</div>';
  }
}

/**
 * Render title manager list
 */
function renderTitleManagerList() {
  const listEl = document.getElementById('titleManagerList');
  
  if (titleSuggestions.length === 0) {
    listEl.innerHTML = `
      <div class="text-center py-6 text-gray-500">
        <i class="ti ti-list text-2xl mb-2"></i>
        <p class="text-sm">No titles saved yet</p>
        <p class="text-xs">Add your first title above</p>
      </div>
    `;
    return;
  }
  
  listEl.innerHTML = titleSuggestions.map(title => `
    <div class="flex items-center gap-2 p-2 bg-dark-600 rounded-lg hover:bg-dark-500 transition-colors">
      <button type="button" onclick="selectTitle('${escapeHtml(title.id)}', '${escapeHtml(title.title.replace(/'/g, "\\'"))}')"
        class="flex-1 text-left text-sm text-white truncate hover:text-primary">
        ${escapeHtml(title.title)}
      </button>
      <span class="text-xs text-gray-500 px-2">${title.use_count || 0}x</span>
      <button type="button" onclick="deleteTitleSuggestion('${escapeHtml(title.id)}')"
        class="text-red-400 hover:text-red-300 hover:bg-red-500/20 p-1.5 rounded-lg transition-colors"
        title="Delete title">
        <i class="ti ti-trash text-sm"></i>
      </button>
    </div>
  `).join('');
}

/**
 * Add new title suggestion
 */
async function addNewTitle() {
  const input = document.getElementById('newTitleInput');
  const title = input.value.trim();
  
  if (!title) {
    showToast('Please enter a title', 'error');
    return;
  }
  
  const category = document.getElementById('titleCategoryFilter').value || 'general';
  
  try {
    const response = await fetch('/api/title-suggestions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCsrfToken()
      },
      body: JSON.stringify({ title, category })
    });
    
    const data = await response.json();
    
    if (data.success) {
      input.value = '';
      showToast('Title added');
      loadTitleSuggestions(category === '' ? null : category);
    } else {
      showToast(data.error || 'Failed to add title', 'error');
    }
  } catch (error) {
    console.error('Error adding title:', error);
    showToast('Failed to add title', 'error');
  }
}

/**
 * Select title from manager
 */
async function selectTitle(id, title) {
  // Set title in the appropriate input
  const inputId = titleManagerContext === 'edit' ? 'editBroadcastTitle' : 'broadcastTitle';
  const input = document.getElementById(inputId);
  if (input) {
    input.value = title;
  }
  
  // Increment use count
  try {
    await fetch(`/api/title-suggestions/${id}/use`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': getCsrfToken() }
    });
  } catch (error) {
    console.error('Error incrementing use count:', error);
  }
  
  closeTitleManagerModal();
  showToast('Title selected');
}

/**
 * Delete title suggestion
 */
async function deleteTitleSuggestion(id) {
  if (!confirm('Delete this title?')) return;
  
  try {
    const response = await fetch(`/api/title-suggestions/${id}`, {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': getCsrfToken() }
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast('Title deleted');
      const category = document.getElementById('titleCategoryFilter').value;
      loadTitleSuggestions(category === '' ? null : category);
    } else {
      showToast(data.error || 'Failed to delete title', 'error');
    }
  } catch (error) {
    console.error('Error deleting title:', error);
    showToast('Failed to delete title', 'error');
  }
}

/**
 * Filter titles by category
 */
function filterTitlesByCategory(category) {
  loadTitleSuggestions(category === '' ? null : category);
}

/**
 * Search title suggestions (for autocomplete)
 */
let titleSearchTimeout = null;

async function searchTitleSuggestions(keyword, context = 'edit') {
  clearTimeout(titleSearchTimeout);
  
  const dropdownId = context === 'edit' ? 'editTitleSuggestions' : 'titleSuggestions';
  const dropdown = document.getElementById(dropdownId);
  
  if (!keyword || keyword.length < 2) {
    dropdown.classList.add('hidden');
    return;
  }
  
  titleSearchTimeout = setTimeout(async () => {
    try {
      const response = await fetch(`/api/title-suggestions/search?q=${encodeURIComponent(keyword)}`, {
        headers: { 'X-CSRF-Token': getCsrfToken() }
      });
      
      const data = await response.json();
      
      if (data.success && data.titles.length > 0) {
        dropdown.innerHTML = data.titles.map(t => `
          <button type="button" onclick="selectTitleFromDropdown('${escapeHtml(t.id)}', '${escapeHtml(t.title.replace(/'/g, "\\'"))}', '${context}')"
            class="w-full text-left px-3 py-2 text-sm text-white hover:bg-dark-600 transition-colors truncate">
            ${escapeHtml(t.title)}
          </button>
        `).join('');
        dropdown.classList.remove('hidden');
      } else {
        dropdown.classList.add('hidden');
      }
    } catch (error) {
      console.error('Error searching titles:', error);
    }
  }, 300);
}

/**
 * Show title suggestions dropdown
 */
function showTitleSuggestions(context = 'edit') {
  // Load popular titles when focusing
  loadPopularTitles(context);
}

/**
 * Load popular titles for dropdown
 */
async function loadPopularTitles(context = 'edit') {
  const dropdownId = context === 'edit' ? 'editTitleSuggestions' : 'titleSuggestions';
  const dropdown = document.getElementById(dropdownId);
  
  try {
    const response = await fetch('/api/title-suggestions/popular?limit=5', {
      headers: { 'X-CSRF-Token': getCsrfToken() }
    });
    
    const data = await response.json();
    
    if (data.success && data.titles.length > 0) {
      dropdown.innerHTML = `
        <div class="px-3 py-1 text-xs text-gray-500 border-b border-gray-600">Popular Titles</div>
        ${data.titles.map(t => `
          <button type="button" onclick="selectTitleFromDropdown('${escapeHtml(t.id)}', '${escapeHtml(t.title.replace(/'/g, "\\'"))}', '${context}')"
            class="w-full text-left px-3 py-2 text-sm text-white hover:bg-dark-600 transition-colors truncate">
            ${escapeHtml(t.title)}
          </button>
        `).join('')}
      `;
      dropdown.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error loading popular titles:', error);
  }
}

/**
 * Toggle title dropdown
 */
function toggleTitleDropdown(context = 'edit') {
  const dropdownId = context === 'edit' ? 'editTitleSuggestions' : 'titleSuggestions';
  const dropdown = document.getElementById(dropdownId);
  
  if (dropdown.classList.contains('hidden')) {
    loadPopularTitles(context);
  } else {
    dropdown.classList.add('hidden');
  }
}

/**
 * Select title from dropdown
 */
async function selectTitleFromDropdown(id, title, context = 'edit') {
  const inputId = context === 'edit' ? 'editBroadcastTitle' : 'broadcastTitle';
  const dropdownId = context === 'edit' ? 'editTitleSuggestions' : 'titleSuggestions';
  
  document.getElementById(inputId).value = title;
  document.getElementById(dropdownId).classList.add('hidden');
  
  // Increment use count
  try {
    await fetch(`/api/title-suggestions/${id}/use`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': getCsrfToken() }
    });
  } catch (error) {
    console.error('Error incrementing use count:', error);
  }
}

// Hide title dropdown when clicking outside
document.addEventListener('click', function(e) {
  const editDropdown = document.getElementById('editTitleSuggestions');
  const createDropdown = document.getElementById('titleSuggestions');
  
  if (editDropdown && !e.target.closest('#editBroadcastTitle') && !e.target.closest('#editTitleSuggestions')) {
    editDropdown.classList.add('hidden');
  }
  if (createDropdown && !e.target.closest('#broadcastTitle') && !e.target.closest('#titleSuggestions')) {
    createDropdown.classList.add('hidden');
  }
});

// Update Edit Broadcast Form Handler to include thumbnail upload and category
const originalEditBroadcastForm = document.getElementById('editBroadcastForm');
if (originalEditBroadcastForm) {
  // Remove existing listeners by replacing with clone, then add new listener
  const newForm = originalEditBroadcastForm.cloneNode(true);
  originalEditBroadcastForm.parentNode.replaceChild(newForm, originalEditBroadcastForm);
  
  newForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const updateBtn = document.getElementById('updateBroadcastBtn');
    if (!updateBtn) return;
    
    const originalText = updateBtn.innerHTML;
    updateBtn.innerHTML = '<i class="ti ti-loader animate-spin"></i> Updating...';
    updateBtn.disabled = true;
    
    try {
      const broadcastId = document.getElementById('editBroadcastId').value;
      const accountId = document.getElementById('editAccountId').value;
      
      console.log('[EditBroadcast] Starting update for broadcast:', broadcastId, 'account:', accountId);
      console.log('[EditBroadcast] Thumbnail file:', window.editThumbnailFile ? window.editThumbnailFile.name : 'none');
      
      // Upload thumbnail first if selected
      if (window.editThumbnailFile) {
        console.log('[EditBroadcast] Uploading thumbnail...');
        const thumbnailSuccess = await uploadEditThumbnail(broadcastId, accountId);
        if (!thumbnailSuccess) {
          showToast('Thumbnail upload failed', 'error');
        } else {
          showToast('Thumbnail uploaded successfully!', 'success');
        }
      } else {
        console.log('[EditBroadcast] No thumbnail to upload');
      }
      
      // Get category value
      const categorySelect = document.getElementById('editCategoryId');
      const categoryId = categorySelect ? categorySelect.value : '22';
      
      console.log('[EditBroadcast] Category:', categoryId);
      
      const updateData = {
        title: document.getElementById('editBroadcastTitle').value,
        description: document.getElementById('editBroadcastDescription').value,
        scheduledStartTime: document.getElementById('editScheduledStartTime').value,
        privacyStatus: document.getElementById('editPrivacyStatus').value,
        categoryId: categoryId
      };
      
      console.log('[EditBroadcast] Update data:', updateData);
      
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
      console.log('[EditBroadcast] Response:', data);
      
      if (data.success) {
        showToast('Broadcast updated successfully!');
        closeEditBroadcastModal();
        setTimeout(() => window.location.reload(), 1500);
      } else {
        showToast(data.error || 'Failed to update broadcast', 'error');
      }
    } catch (error) {
      console.error('[EditBroadcast] Error:', error);
      showToast('An error occurred: ' + error.message, 'error');
    } finally {
      updateBtn.innerHTML = originalText;
      updateBtn.disabled = false;
      window.editThumbnailFile = null;
    }
  });
}

// Override closeEditBroadcastModal to reset thumbnail
const originalCloseEditBroadcastModal = window.closeEditBroadcastModal;
window.closeEditBroadcastModal = function() {
  document.getElementById('editBroadcastModal').classList.add('hidden');
  document.getElementById('editBroadcastForm').reset();
  
  // Reset thumbnail preview
  const preview = document.getElementById('editThumbnailPreview');
  if (preview) {
    preview.innerHTML = '<i class="ti ti-photo text-gray-500 text-2xl"></i>';
  }
  window.editThumbnailFile = null;
  
  // Reset file input
  const fileInput = document.getElementById('editThumbnailFile');
  if (fileInput) fileInput.value = '';
  
  // Reset category to default
  const categorySelect = document.getElementById('editCategoryId');
  if (categorySelect) categorySelect.value = '22';
  
  console.log('[closeEditBroadcastModal] Modal closed, thumbnail reset');
};

// Override openEditBroadcastModal to show existing thumbnail
const originalOpenEditBroadcastModal = window.openEditBroadcastModal;
window.openEditBroadcastModal = function(broadcast) {
  console.log('[openEditBroadcastModal] Opening modal for broadcast:', broadcast.id);
  
  document.getElementById('editBroadcastId').value = broadcast.id;
  document.getElementById('editAccountId').value = broadcast.accountId;
  document.getElementById('editBroadcastTitle').value = broadcast.title || '';
  document.getElementById('editBroadcastDescription').value = broadcast.description || '';
  document.getElementById('editPrivacyStatus').value = broadcast.privacyStatus || 'unlisted';
  
  // Set category - preserve existing value
  const categorySelect = document.getElementById('editCategoryId');
  if (categorySelect) {
    categorySelect.value = broadcast.categoryId || '22';
    console.log('[openEditBroadcastModal] Category set to:', categorySelect.value);
  }
  
  // Format datetime for input
  if (broadcast.scheduledStartTime) {
    const date = new Date(broadcast.scheduledStartTime);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    document.getElementById('editScheduledStartTime').value = localDate.toISOString().slice(0, 16);
  }
  
  // Show existing thumbnail if available
  const preview = document.getElementById('editThumbnailPreview');
  if (preview) {
    if (broadcast.thumbnailUrl) {
      preview.innerHTML = `<img src="${broadcast.thumbnailUrl}" class="w-full h-full object-cover" onerror="this.parentElement.innerHTML='<i class=\\'ti ti-photo text-gray-500 text-2xl\\'></i>'">`;
    } else {
      preview.innerHTML = '<i class="ti ti-photo text-gray-500 text-2xl"></i>';
    }
  }
  
  // Reset file input and thumbnail file variable
  window.editThumbnailFile = null;
  const fileInput = document.getElementById('editThumbnailFile');
  if (fileInput) fileInput.value = '';
  
  // Load thumbnail history
  loadEditThumbnailHistory();
  
  document.getElementById('editBroadcastModal').classList.remove('hidden');
  console.log('[openEditBroadcastModal] Modal opened');
};


/**
 * Save current title from input to Title Manager
 */
async function saveCurrentTitleToManager(context = 'edit') {
  const inputId = context === 'edit' ? 'editBroadcastTitle' : 'broadcastTitle';
  const input = document.getElementById(inputId);
  const title = input ? input.value.trim() : '';
  
  if (!title) {
    showToast('Please enter a title first', 'error');
    return;
  }
  
  try {
    const response = await fetch('/api/title-suggestions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCsrfToken()
      },
      body: JSON.stringify({ title, category: 'general' })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast('Title saved to manager');
    } else {
      showToast(data.error || 'Failed to save title', 'error');
    }
  } catch (error) {
    console.error('Error saving title:', error);
    showToast('Failed to save title', 'error');
  }
}
