let selectedVideoData = null;
let selectedAudioData = null;
let currentOrientation = 'horizontal';
let isDropdownOpen = false;
let isAudioDropdownOpen = false;
const videoSelectorDropdown = document.getElementById('videoSelectorDropdown');
const audioSelectorDropdown = document.getElementById('audioSelectorDropdown');
let desktopVideoPlayer = null;
let mobileVideoPlayer = null;
let streamKeyTimeout = null;
let isStreamKeyValid = true;
let currentPlatform = 'YouTube';
window.openNewStreamModal = function () {
  const modal = document.getElementById('newStreamModal');
  if (!modal) {
    console.error('newStreamModal not found');
    return;
  }
  document.body.style.overflow = 'hidden';
  modal.classList.remove('hidden');
  // Force reflow before adding active class
  modal.offsetHeight;
  modal.classList.add('active');
  
  if (typeof loadGalleryVideos === 'function') {
    loadGalleryVideos();
  }
  
  // Auto-sync YouTube accounts and auto-load stream key
  if (typeof window.syncControlRoomAccounts === 'function') {
    window.syncControlRoomAccounts(true);
  } else {
    const accountSelect = document.getElementById('controlRoomAccountSelect');
    if (accountSelect && accountSelect.value && typeof window.onControlRoomAccountChange === 'function') {
      window.onControlRoomAccountChange(accountSelect.value);
    }
  }
};
function closeNewStreamModal() {
  const modal = document.getElementById('newStreamModal');
  if (!modal) {
    console.error('newStreamModal not found');
    return;
  }
  document.body.style.overflow = '';
  modal.classList.remove('active');
  if (typeof resetModalForm === 'function') {
    resetModalForm();
  }
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 200);
  if (desktopVideoPlayer) {
    desktopVideoPlayer.pause();
    desktopVideoPlayer.dispose();
    desktopVideoPlayer = null;
  }
  if (mobileVideoPlayer) {
    mobileVideoPlayer.pause();
    mobileVideoPlayer.dispose();
    mobileVideoPlayer = null;
  }
}
function toggleVideoSelector() {
  const dropdown = document.getElementById('videoSelectorDropdown');
  if (dropdown.classList.contains('hidden')) {
    dropdown.classList.remove('hidden');
    if (!dropdown.dataset.loaded) {
      loadGalleryVideos();
      dropdown.dataset.loaded = 'true';
    }
    const searchInput = document.getElementById('videoSearchInput');
    if (searchInput) {
      setTimeout(() => searchInput.focus(), 10);
    }
  } else {
    dropdown.classList.add('hidden');
    const searchInput = document.getElementById('videoSearchInput');
    if (searchInput) {
      searchInput.value = '';
    }
  }
}
// Audio Selector Functions
function toggleAudioSelector() {
  const dropdown = document.getElementById('audioSelectorDropdown');
  if (dropdown.classList.contains('hidden')) {
    dropdown.classList.remove('hidden');
    isAudioDropdownOpen = true;
    loadGalleryAudios();
    const searchInput = document.getElementById('audioSearchInput');
    if (searchInput) {
      setTimeout(() => searchInput.focus(), 10);
    }
  } else {
    dropdown.classList.add('hidden');
    isAudioDropdownOpen = false;
    const searchInput = document.getElementById('audioSearchInput');
    if (searchInput) {
      searchInput.value = '';
    }
  }
}

function selectAudio(audio) {
  selectedAudioData = audio;
  window.selectedAudioData = audio;
  document.getElementById('selectedAudio').textContent = audio.title || audio.name;
  document.getElementById('selectedAudioId').value = audio.id;
  document.getElementById('clearAudioBtn').classList.remove('hidden');
  document.getElementById('audioSelectorDropdown').classList.add('hidden');
  isAudioDropdownOpen = false;
}

function clearAudioSelection() {
  selectedAudioData = null;
  window.selectedAudioData = null;
  document.getElementById('selectedAudio').textContent = 'No audio selected';
  document.getElementById('selectedAudioId').value = '';
  document.getElementById('clearAudioBtn').classList.add('hidden');
}

async function loadGalleryAudios() {
  try {
    const container = document.getElementById('audioListContainer');
    if (!container) {
      console.error("Audio list container not found");
      return;
    }
    container.innerHTML = '<div class="text-center py-3"><i class="ti ti-loader animate-spin mr-2"></i>Loading audios...</div>';
    const response = await fetch('/api/stream/audios');
    const audios = await response.json();
    window.allStreamAudios = audios;
    displayFilteredAudios(audios);
    const searchInput = document.getElementById('audioSearchInput');
    if (searchInput) {
      searchInput.removeEventListener('input', handleAudioSearch);
      searchInput.addEventListener('input', handleAudioSearch);
    }
  } catch (error) {
    console.error('Error loading audios:', error);
    const container = document.getElementById('audioListContainer');
    if (container) {
      container.innerHTML = `
        <div class="text-center py-5 text-red-400">
          <i class="ti ti-alert-circle text-2xl mb-2"></i>
          <p>Failed to load audios</p>
          <p class="text-xs text-gray-500 mt-1">Please try again</p>
        </div>
      `;
    }
  }
}

function handleAudioSearch(e) {
  const searchTerm = e.target.value.toLowerCase().trim();
  if (!window.allStreamAudios) {
    return;
  }
  if (searchTerm === '') {
    displayFilteredAudios(window.allStreamAudios);
    return;
  }
  const filteredAudios = filterAudios(window.allStreamAudios, searchTerm);
  displayFilteredAudios(filteredAudios);
}

function filterAudios(audios, query) {
  if (!query) return audios;
  return audios.filter(audio =>
    (audio.title && audio.title.toLowerCase().includes(query.toLowerCase())) ||
    (audio.name && audio.name.toLowerCase().includes(query.toLowerCase()))
  );
}

function displayFilteredAudios(audios) {
  const container = document.getElementById('audioListContainer');
  if (!container) return;
  container.innerHTML = '';
  if (audios && audios.length > 0) {
    audios.forEach(audio => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'w-full flex items-center space-x-3 p-2 rounded hover:bg-dark-600 transition-colors text-left';
      button.onclick = () => selectAudio(audio);
      button.innerHTML = `
        <div class="w-10 h-10 bg-dark-800 rounded flex-shrink-0 flex items-center justify-center">
          <i class="ti ti-music text-primary"></i>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-white truncate">${audio.title || audio.name}</p>
          <p class="text-xs text-gray-400">${audio.duration || 'Unknown'} • ${audio.format || 'audio'}</p>
        </div>
      `;
      container.appendChild(button);
    });
  } else {
    container.innerHTML = `
      <div class="text-center py-5 text-gray-400">
        <i class="ti ti-music-off text-2xl mb-2"></i>
        <p>No audios found</p>
        <p class="text-xs text-gray-500 mt-1">Upload audio files in Gallery</p>
      </div>
    `;
  }
}



function selectVideo(video) {
  selectedVideoData = video;
  window.selectedVideoData = video;
  const displayText = video.type === 'playlist' ? `[Playlist] ${video.name}` : video.name;
  document.getElementById('selectedVideo').textContent = displayText;

  const videoSelector = document.querySelector('[onclick="toggleVideoSelector()"]');
  if (videoSelector) {
    videoSelector.classList.remove('border-red-500');
    videoSelector.classList.add('border-gray-600');
  }

  // Close dropdown immediately after selection (like audio selector)
  document.getElementById('videoSelectorDropdown').classList.add('hidden');
  isDropdownOpen = false;

  // Clear search input
  const searchInput = document.getElementById('videoSearchInput');
  if (searchInput) searchInput.value = '';

  // Update hidden input
  const hiddenVideoInput = document.getElementById('selectedVideoId');
  if (hiddenVideoInput) {
    hiddenVideoInput.value = video.id;
  }

  // Update preview
  const desktopEmptyPreview = document.getElementById('emptyPreview');
  if (desktopEmptyPreview) {
    if (video.type === 'playlist') {
      desktopEmptyPreview.innerHTML = `
        <div class="text-center">
          <i class="ti ti-playlist text-4xl text-blue-400 mb-2"></i>
          <p class="text-sm text-gray-300 font-medium">${video.name}</p>
          <p class="text-xs text-blue-300 mt-1">Playlist • ${video.duration || 'Multiple videos'}</p>
        </div>
      `;
    } else {
      desktopEmptyPreview.innerHTML = `
        <div class="text-center">
          <i class="ti ti-video text-4xl text-green-400 mb-2"></i>
          <p class="text-sm text-gray-300 font-medium">${video.name}</p>
          <p class="text-xs text-gray-400 mt-1">${video.resolution} • ${video.duration}</p>
        </div>
      `;
    }
  }
}
async function loadGalleryVideos() {
  try {
    const container = document.getElementById('videoListContainer');
    if (!container) {
      console.error("Video list container not found");
      return;
    }
    container.innerHTML = '<div class="text-center py-3"><i class="ti ti-loader animate-spin mr-2"></i>Loading content...</div>';
    const response = await fetch('/api/stream/content');
    const content = await response.json();
    window.allStreamVideos = content;
    displayFilteredVideos(content);
    const searchInput = document.getElementById('videoSearchInput');
    if (searchInput) {
      searchInput.removeEventListener('input', handleVideoSearch);
      searchInput.addEventListener('input', handleVideoSearch);
      setTimeout(() => searchInput.focus(), 10);
    } else {
      console.error("Search input element not found");
    }
  } catch (error) {
    console.error('Error loading gallery content:', error);
    const container = document.getElementById('videoListContainer');
    if (container) {
      container.innerHTML = `
        <div class="text-center py-5 text-red-400">
          <i class="ti ti-alert-circle text-2xl mb-2"></i>
          <p>Failed to load content</p>
          <p class="text-xs text-gray-500 mt-1">Please try again</p>
        </div>
      `;
    }
  }
}
function handleVideoSearch(e) {
  const searchTerm = e.target.value.toLowerCase().trim();
  console.log("Searching for:", searchTerm);
  if (!window.allStreamVideos) {
    console.error("No content available for search");
    return;
  }
  if (searchTerm === '') {
    displayFilteredVideos(window.allStreamVideos);
    return;
  }
  const filteredContent = window.allStreamVideos.filter(item =>
    item.name.toLowerCase().includes(searchTerm) ||
    (item.type === 'playlist' && item.description && item.description.toLowerCase().includes(searchTerm))
  );
  console.log(`Found ${filteredContent.length} matching items`);
  displayFilteredVideos(filteredContent);
}
function displayFilteredVideos(videos) {
  const container = document.getElementById('videoListContainer');
  container.innerHTML = '';
  if (videos && videos.length > 0) {
    videos.forEach(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'w-full flex items-start space-x-3 p-2 rounded hover:bg-dark-600 transition-colors text-left';
      button.onclick = () => selectVideo(item);

      if (item.type === 'playlist') {
        button.innerHTML = `
          <div class="w-16 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded flex-shrink-0 overflow-hidden relative">
            <img src="${item.thumbnail}" alt="" 
              class="w-full h-full object-cover rounded" 
              onerror="this.src='/images/playlist-thumbnail.svg'">
            <div class="absolute top-0 right-0 bg-green-500 text-white text-xs px-1 rounded-bl text-[8px] font-bold">PL</div>
          </div>
          <div class="flex-1 min-w-0 ml-3 text-left">
            <p class="text-sm font-medium text-white truncate flex items-center">
              <i class="ti ti-playlist text-blue-400 mr-1 text-xs"></i>
              ${item.name}
            </p>
            <p class="text-xs text-blue-300">${item.resolution} • ${item.duration}</p>
          </div>
        `;
      } else {
        button.innerHTML = `
          <div class="w-16 h-12 bg-dark-800 rounded flex-shrink-0 overflow-hidden">
            <img src="${item.thumbnail || '/images/default-thumbnail.jpg'}" alt="" 
              class="w-full h-full object-cover rounded" 
              onerror="this.src='/images/default-thumbnail.jpg'">
          </div>
          <div class="flex-1 min-w-0 ml-3 text-left">
            <p class="text-sm font-medium text-white truncate">${item.name}</p>
            <p class="text-xs text-gray-400">${item.resolution} • ${item.duration}</p>
          </div>
        `;
      }
      container.appendChild(button);
    });
  } else {
    container.innerHTML = `
      <div class="text-center py-5 text-gray-400">
        <i class="ti ti-search-off text-2xl mb-2"></i>
        <p>No matching content found</p>
        <p class="text-xs text-gray-500 mt-1">Try different keywords</p>
      </div>
    `;
  }
}
function resetModalForm() {
  const form = document.getElementById('newStreamForm');
  if (form) {
    form.reset();
    // Reset edit mode
    delete form.dataset.editId;
  }

  selectedVideoData = null;
  selectedAudioData = null;
  isDropdownOpen = false;
  isAudioDropdownOpen = false;

  // Reset modal title and button
  const modalTitle = document.querySelector('#newStreamModal h3');
  const submitBtn = document.querySelector('button[type="submit"][form="newStreamForm"]');
  if (modalTitle) modalTitle.textContent = 'Create New Stream';
  if (submitBtn) submitBtn.textContent = 'Create Stream';

  // Reset template selector
  const templateSelector = document.getElementById('templateSelector');
  if (templateSelector) templateSelector.value = '';

  // Reset video selection
  const selectedVideoEl = document.getElementById('selectedVideo');
  const selectedVideoIdEl = document.getElementById('selectedVideoId');
  if (selectedVideoEl) selectedVideoEl.textContent = 'Choose a video...';
  if (selectedVideoIdEl) selectedVideoIdEl.value = '';

  // Reset audio selection
  const selectedAudioEl = document.getElementById('selectedAudio');
  const selectedAudioIdEl = document.getElementById('selectedAudioId');
  const clearAudioBtn = document.getElementById('clearAudioBtn');
  if (selectedAudioEl) selectedAudioEl.textContent = 'No audio selected';
  if (selectedAudioIdEl) selectedAudioIdEl.value = '';
  if (clearAudioBtn) clearAudioBtn.classList.add('hidden');

  // Reset duration (hours and minutes)
  const durationHoursInput = document.getElementById('streamDurationHours');
  const durationMinutesInput = document.getElementById('streamDurationMinutes');
  if (durationHoursInput) durationHoursInput.value = '';
  if (durationMinutesInput) durationMinutesInput.value = '';

  // Reset preview
  const desktopEmptyPreview = document.getElementById('emptyPreview');
  if (desktopEmptyPreview) {
    desktopEmptyPreview.innerHTML = `
      <div class="text-center">
        <i class="ti ti-video text-4xl text-gray-600 mb-2"></i>
        <p class="text-sm text-gray-500">Select a video to preview</p>
      </div>
    `;
  }

  // Close dropdowns
  const videoDropdown = document.getElementById('videoSelectorDropdown');
  const audioDropdown = document.getElementById('audioSelectorDropdown');
  if (videoDropdown) videoDropdown.classList.add('hidden');
  if (audioDropdown) audioDropdown.classList.add('hidden');
  
  // Reset Control Room state
  const accountSelect = document.getElementById('controlRoomAccountSelect');
  const manualSection = document.getElementById('controlRoomStreamKeyManual');
  const selectorSection = document.getElementById('controlRoomStreamKeySelector');
  const streamKeyInput = document.getElementById('streamKey');
  const indicator = document.getElementById('controlRoomStreamKeyAutoFillIndicator');
  const streamKeyValue = document.getElementById('controlRoomStreamKeyValue');

  if (accountSelect && accountSelect.value) {
    if (manualSection) manualSection.classList.add('hidden');
    if (selectorSection) selectorSection.classList.remove('hidden');
    if (streamKeyInput) streamKeyInput.removeAttribute('required');
  } else {
    if (manualSection) manualSection.classList.remove('hidden');
    if (selectorSection) selectorSection.classList.add('hidden');
    if (streamKeyInput) streamKeyInput.setAttribute('required', 'required');
  }
  if (indicator) indicator.classList.add('hidden');
  if (streamKeyValue) streamKeyValue.value = '';
}
function initModal() {
  const modal = document.getElementById('newStreamModal');
  if (!modal) return;

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeNewStreamModal();
    }
  });

  if (videoSelectorDropdown) {
    document.addEventListener('click', (e) => {
      const isClickInsideDropdown = videoSelectorDropdown.contains(e.target);
      const isClickOnButton = e.target.closest('[onclick="toggleVideoSelector()"]');
      if (!isClickInsideDropdown && !isClickOnButton && isDropdownOpen) {
        toggleVideoSelector();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isDropdownOpen) {
        toggleVideoSelector();
      } else if (!modal.classList.contains('hidden')) {
        closeNewStreamModal();
      }
    }
  });
  modal.addEventListener('touchmove', (e) => {
    if (e.target === modal) {
      e.preventDefault();
    }
  }, { passive: false });
}
function setVideoOrientation(orientation) {
  currentOrientation = orientation;
  const buttons = document.querySelectorAll('[onclick^="setVideoOrientation"]');
  buttons.forEach(button => {
    if (button.getAttribute('onclick').includes(orientation)) {
      button.classList.add('bg-primary', 'border-primary', 'text-white');
      button.classList.remove('bg-dark-700', 'border-gray-600');
    } else {
      button.classList.remove('bg-primary', 'border-primary', 'text-white');
      button.classList.add('bg-dark-700', 'border-gray-600');
    }
  });
  updateResolutionDisplay();
}
function updateResolutionDisplay() {
  const select = document.getElementById('resolutionSelect');
  const option = select.options[select.selectedIndex];
  const resolution = option.getAttribute(`data-${currentOrientation}`);
  const quality = option.textContent;
  document.getElementById('currentResolution').textContent = `${resolution} (${quality})`;
}
document.addEventListener('DOMContentLoaded', () => {
  const resolutionSelect = document.getElementById('resolutionSelect');
  if (resolutionSelect) {
    resolutionSelect.addEventListener('change', updateResolutionDisplay);
    setVideoOrientation('horizontal');
  }
});
function toggleStreamKeyVisibility() {
  const streamKeyInput = document.getElementById('streamKey');
  const streamKeyToggle = document.getElementById('streamKeyToggle');
  if (streamKeyInput.type === 'password') {
    streamKeyInput.type = 'text';
    streamKeyToggle.className = 'ti ti-eye-off';
  } else {
    streamKeyInput.type = 'password';
    streamKeyToggle.className = 'ti ti-eye';
  }
}
document.addEventListener('DOMContentLoaded', function () {
  const platformSelector = document.getElementById('platformSelector');
  const platformDropdown = document.getElementById('platformDropdown');
  const rtmpInput = document.getElementById('rtmpUrl');
  if (!platformSelector || !platformDropdown || !rtmpInput) return;
  platformSelector.addEventListener('click', function (e) {
    e.stopPropagation();
    platformDropdown.classList.toggle('hidden');
  });
  const platformOptions = document.querySelectorAll('.platform-option');
  platformOptions.forEach(option => {
    option.addEventListener('click', function () {
      const platformUrl = this.getAttribute('data-url');
      const platformName = this.querySelector('span').textContent;
      rtmpInput.value = platformUrl;
      platformDropdown.classList.add('hidden');
      updatePlatformIcon(this.querySelector('i').className);
    });
  });
  document.addEventListener('click', function (e) {
    if (platformDropdown && !platformDropdown.contains(e.target) &&
      !platformSelector.contains(e.target)) {
      platformDropdown.classList.add('hidden');
    }
  });
  function updatePlatformIcon(iconClass) {
    const currentIcon = platformSelector.querySelector('i');
    const iconParts = iconClass.split(' ');
    const brandIconPart = iconParts.filter(part => part.startsWith('ti-'))[0];
    currentIcon.className = `ti ${brandIconPart} text-center`;
    if (brandIconPart.includes('youtube')) {
      currentIcon.classList.add('text-red-500');
    } else if (brandIconPart.includes('twitch')) {
      currentIcon.classList.add('text-purple-500');
    } else if (brandIconPart.includes('facebook')) {
      currentIcon.classList.add('text-blue-500');
    } else if (brandIconPart.includes('instagram')) {
      currentIcon.classList.add('text-pink-500');
    } else if (brandIconPart.includes('tiktok')) {
      currentIcon.classList.add('text-white');
    } else if (brandIconPart.includes('shopee')) {
      currentIcon.classList.add('text-orange-500');
    } else if (brandIconPart.includes('live-photo')) {
      currentIcon.classList.add('text-teal-500');
    }
  }
  if (typeof showToast !== 'function') {
    window.showToast = function (type, message) {
      console.log(`${type}: ${message}`);
    }
  }
  const streamKeyInput = document.getElementById('streamKey');
  if (streamKeyInput && rtmpInput) {
    rtmpInput.addEventListener('input', function () {
      const url = this.value.toLowerCase();
      if (url.includes('youtube.com')) {
        currentPlatform = 'YouTube';
      } else if (url.includes('facebook.com')) {
        currentPlatform = 'Facebook';
      } else if (url.includes('twitch.tv')) {
        currentPlatform = 'Twitch';
      } else if (url.includes('tiktok.com')) {
        currentPlatform = 'TikTok';
      } else if (url.includes('instagram.com')) {
        currentPlatform = 'Instagram';
      } else if (url.includes('shopee.io')) {
        currentPlatform = 'Shopee Live';
      } else if (url.includes('restream.io')) {
        currentPlatform = 'Restream.io';
      } else {
        currentPlatform = 'Custom';
      }
      if (streamKeyInput.value) {
        validateStreamKeyForPlatform(streamKeyInput.value, currentPlatform);
      }
    });
    streamKeyInput.addEventListener('input', function () {
      clearTimeout(streamKeyTimeout);
      const streamKey = this.value.trim();
      if (!streamKey) {
        return;
      }
      streamKeyTimeout = setTimeout(() => {
        validateStreamKeyForPlatform(streamKey, currentPlatform);
      }, 500);
    });
  }
});
function validateStreamKeyForPlatform(streamKey, platform) {
  if (!streamKey.trim()) {
    return;
  }
  fetch(`/api/streams/check-key?key=${encodeURIComponent(streamKey)}`)
    .then(response => response.json())
    .then(data => {
      const streamKeyInput = document.getElementById('streamKey');
      if (data.isInUse) {
        streamKeyInput.classList.add('border-red-500');
        streamKeyInput.classList.remove('border-gray-600', 'focus:border-primary');
        let errorMsg = document.getElementById('streamKeyError');
        if (!errorMsg) {
          errorMsg = document.createElement('div');
          errorMsg.id = 'streamKeyError';
          errorMsg.className = 'text-xs text-red-500 mt-1';
          streamKeyInput.parentNode.appendChild(errorMsg);
        }
        errorMsg.textContent = 'This stream key is already in use. Please use a different key.';
        isStreamKeyValid = false;
      } else {
        streamKeyInput.classList.remove('border-red-500');
        streamKeyInput.classList.add('border-gray-600', 'focus:border-primary');
        const errorMsg = document.getElementById('streamKeyError');
        if (errorMsg) {
          errorMsg.remove();
        }
        isStreamKeyValid = true;
      }
    })
    .catch(error => {
      console.error('Error validating stream key:', error);
    });
}
document.addEventListener('DOMContentLoaded', initModal);

// Form submission handler
document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('newStreamForm');
  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      const editId = form.dataset.editId;
      const isEdit = !!editId;

      // Validate video selection
      if (!selectedVideoData && !document.getElementById('selectedVideoId').value) {
        const videoSelector = document.querySelector('[onclick="toggleVideoSelector()"]');
        if (videoSelector) {
          videoSelector.classList.add('border-red-500');
          videoSelector.classList.remove('border-gray-600');
        }
        if (typeof showToast === 'function') {
          showToast('error', 'Please select a video');
        } else {
          alert('Please select a video');
        }
        return;
      }

      // Get form data
      const formData = new FormData(form);
      const scheduleType = formData.get('scheduleType') || 'once';

      const activeSelectedVideo = window.selectedVideoData || selectedVideoData;
      const activeSelectedAudio = window.selectedAudioData || selectedAudioData;

      const data = {
        videoId: activeSelectedVideo ? activeSelectedVideo.id : document.getElementById('selectedVideoId').value,
        audioId: activeSelectedAudio ? activeSelectedAudio.id : (document.getElementById('selectedAudioId').value || null),
        streamTitle: formData.get('streamTitle'),
        rtmpUrl: formData.get('rtmpUrl') || 'rtmp://a.rtmp.youtube.com/live2',
        // Use actualStreamKey from dropdown if available, otherwise use manual input
        streamKey: formData.get('actualStreamKey') || formData.get('streamKey'),
        loopVideo: formData.get('loopVideo') === 'on',
        // Duration in hours and minutes (new format)
        streamDurationHours: formData.get('streamDurationHours') || 0,
        streamDurationMinutes: formData.get('streamDurationMinutes') || 0,
        scheduleStartTime: formData.get('scheduleStartTime') || null,
        scheduleEndTime: formData.get('scheduleEndTime') || null,
        // Recurring schedule fields
        scheduleType: scheduleType,
        recurringTime: formData.get('recurringTime') || null,
        scheduleDays: scheduleType === 'weekly' ? (formData.get('scheduleDays') || '[]') : null,
        recurringEnabled: formData.get('recurringEnabled') === 'on'
      };

      try {
        const url = isEdit ? `/api/streams/${editId}` : '/api/streams';
        const method = isEdit ? 'PUT' : 'POST';

        const response = await fetch(url, {
          method: method,
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
          closeNewStreamModal();
          if (typeof showToast === 'function') {
            showToast('success', isEdit ? 'Stream updated successfully!' : 'Stream created successfully!');
          }
          // Reset edit mode
          delete form.dataset.editId;
          document.querySelector('#newStreamModal h3').textContent = 'Create New Stream';
          document.querySelector('button[type="submit"][form="newStreamForm"]').textContent = 'Create Stream';

          // Reload streams list
          if (typeof loadStreams === 'function') {
            loadStreams();
          } else {
            window.location.reload();
          }
        } else {
          if (typeof showToast === 'function') {
            showToast('error', result.error || 'Failed to save stream');
          } else {
            alert(result.error || 'Failed to save stream');
          }
        }
      } catch (error) {
        console.error('Error saving stream:', error);
        if (typeof showToast === 'function') {
          showToast('error', 'Failed to save stream. Please try again.');
        } else {
          alert('Failed to save stream. Please try again.');
        }
      }
    });
  }
});


// ============================================
// RECURRING SCHEDULE FUNCTIONS
// ============================================

let currentScheduleType = 'once';
let selectedDays = [];

/**
 * Set schedule type (once, daily, weekly)
 * Handles visibility of schedule settings for both mobile and desktop
 */
function setScheduleType(type) {
  currentScheduleType = type;

  const scheduleTypeInput = document.getElementById('scheduleType');
  if (scheduleTypeInput) {
    scheduleTypeInput.value = type;
  }

  // Update button styles
  const buttons = ['scheduleTypeOnce', 'scheduleTypeDaily', 'scheduleTypeWeekly'];
  buttons.forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (btn) {
      if (btnId === `scheduleType${type.charAt(0).toUpperCase() + type.slice(1)}`) {
        btn.classList.add('border-primary', 'bg-primary', 'text-white');
        btn.classList.remove('border-gray-600', 'bg-dark-700', 'text-gray-300');
      } else {
        btn.classList.remove('border-primary', 'bg-primary', 'text-white');
        btn.classList.add('border-gray-600', 'bg-dark-700', 'text-gray-300');
      }
    }
  });

  // Show/hide appropriate settings - works for both mobile and desktop
  const onceSettings = document.getElementById('onceScheduleSettings');
  const recurringSettings = document.getElementById('recurringScheduleSettings');
  const weeklyDaysSelector = document.getElementById('weeklyDaysSelector');

  if (type === 'once') {
    // Show Start/End Stream fields, hide recurring settings
    if (onceSettings) {
      onceSettings.classList.remove('hidden');
    }
    if (recurringSettings) {
      recurringSettings.classList.add('hidden');
    }
  } else {
    // Hide Start/End Stream fields, show recurring settings
    if (onceSettings) {
      onceSettings.classList.add('hidden');
    }
    if (recurringSettings) {
      recurringSettings.classList.remove('hidden');
    }

    // Show/hide weekly day selector based on type
    if (type === 'weekly') {
      if (weeklyDaysSelector) {
        weeklyDaysSelector.classList.remove('hidden');
      }
    } else {
      // Daily - hide day selector
      if (weeklyDaysSelector) {
        weeklyDaysSelector.classList.add('hidden');
      }
    }
  }
}

/**
 * Toggle day selection for weekly schedule
 */
function toggleDay(day) {
  const dayNum = parseInt(day);
  const index = selectedDays.indexOf(dayNum);

  if (index > -1) {
    selectedDays.splice(index, 1);
  } else {
    selectedDays.push(dayNum);
  }

  // Update hidden input
  document.getElementById('scheduleDays').value = JSON.stringify(selectedDays);

  // Update button style
  const btn = document.querySelector(`[data-day="${day}"]`);
  if (btn) {
    if (selectedDays.includes(dayNum)) {
      btn.classList.add('border-primary', 'bg-primary', 'text-white');
      btn.classList.remove('border-gray-600', 'bg-dark-700', 'text-gray-300');
    } else {
      btn.classList.remove('border-primary', 'bg-primary', 'text-white');
      btn.classList.add('border-gray-600', 'bg-dark-700', 'text-gray-300');
    }
  }
}

/**
 * Reset recurring schedule form fields
 */
function resetRecurringScheduleForm() {
  currentScheduleType = 'once';
  selectedDays = [];

  // Reset schedule type buttons
  setScheduleType('once');

  // Reset day buttons
  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.classList.remove('border-primary', 'bg-primary', 'text-white');
    btn.classList.add('border-gray-600', 'bg-dark-700', 'text-gray-300');
  });

  // Reset inputs
  const recurringTime = document.getElementById('recurringTime');
  const scheduleDays = document.getElementById('scheduleDays');
  const recurringEnabled = document.getElementById('recurringEnabled');

  if (recurringTime) recurringTime.value = '';
  if (scheduleDays) scheduleDays.value = '[]';
  if (recurringEnabled) recurringEnabled.checked = true;
}

/**
 * Load recurring schedule data into form (for edit mode)
 */
function loadRecurringScheduleData(stream) {
  if (!stream) return;

  const scheduleType = stream.schedule_type || 'once';
  setScheduleType(scheduleType);

  if (scheduleType === 'daily' || scheduleType === 'weekly') {
    // Set recurring time
    const recurringTime = document.getElementById('recurringTime');
    if (recurringTime && stream.recurring_time) {
      recurringTime.value = stream.recurring_time;
    }

    // Set recurring enabled
    const recurringEnabled = document.getElementById('recurringEnabled');
    if (recurringEnabled) {
      recurringEnabled.checked = stream.recurring_enabled !== false && stream.recurring_enabled !== 0;
    }

    // Set weekly days
    if (scheduleType === 'weekly' && stream.schedule_days) {
      let days = stream.schedule_days;
      if (typeof days === 'string') {
        try {
          days = JSON.parse(days);
        } catch (e) {
          days = [];
        }
      }

      selectedDays = Array.isArray(days) ? days : [];
      document.getElementById('scheduleDays').value = JSON.stringify(selectedDays);

      // Update day button styles
      selectedDays.forEach(day => {
        const btn = document.querySelector(`[data-day="${day}"]`);
        if (btn) {
          btn.classList.add('border-primary', 'bg-primary', 'text-white');
          btn.classList.remove('border-gray-600', 'bg-dark-700', 'text-gray-300');
        }
      });
    }
  }
}

// Update the original resetModalForm to include recurring schedule reset
const originalResetModalForm = resetModalForm;
resetModalForm = function () {
  originalResetModalForm();
  resetRecurringScheduleForm();
};


// ============================================
// Control Room - YouTube Account Integration
// ============================================

// Toggle between Manual and Auto Stream Key Mode in Control Room
window.toggleControlRoomStreamKeyMode = function() {
  const manualSection = document.getElementById('controlRoomStreamKeyManual');
  const selectorSection = document.getElementById('controlRoomStreamKeySelector');
  const streamKeyInput = document.getElementById('streamKey');
  const accountSelect = document.getElementById('controlRoomAccountSelect');

  if (!manualSection || !selectorSection) return;

  const isManualHidden = manualSection.classList.contains('hidden');
  if (isManualHidden) {
    // Switch to manual mode
    manualSection.classList.remove('hidden');
    selectorSection.classList.add('hidden');
    if (streamKeyInput) streamKeyInput.setAttribute('required', 'required');
  } else {
    // Switch to auto mode
    manualSection.classList.add('hidden');
    selectorSection.classList.remove('hidden');
    if (streamKeyInput) streamKeyInput.removeAttribute('required');
    if (accountSelect && accountSelect.value) {
      window.fetchControlRoomStreamKeys(accountSelect.value);
    }
  }
};

// Sync YouTube accounts list dynamically for Control Room modal
window.syncControlRoomAccounts = async function(autoTrigger = true) {
  const accountSelect = document.getElementById('controlRoomAccountSelect');
  const warningEl = document.getElementById('noYouTubeAccountWarning');
  if (!accountSelect) return;

  try {
    const res = await fetch('/api/youtube/accounts');
    const data = await res.json();
    
    if (data.success && data.accounts && data.accounts.length > 0) {
      const currentVal = accountSelect.value;
      accountSelect.innerHTML = '';
      
      data.accounts.forEach((acc) => {
        const opt = document.createElement('option');
        opt.value = acc.id;
        opt.textContent = `📺 ${acc.channelName || ('YouTube Channel #' + acc.id)}` + (acc.isPrimary ? ' (Primary)' : '');
        accountSelect.appendChild(opt);
      });
      
      const manualOpt = document.createElement('option');
      manualOpt.value = '';
      manualOpt.textContent = '-- Gunakan Stream Key Manual --';
      accountSelect.appendChild(manualOpt);
      
      if (warningEl) warningEl.classList.add('hidden');

      // Keep previous selection if valid, otherwise select the first account
      if (currentVal && data.accounts.some(a => String(a.id) === String(currentVal))) {
        accountSelect.value = currentVal;
      } else {
        accountSelect.value = data.accounts[0].id;
      }
      
      if (autoTrigger && accountSelect.value) {
        await window.onControlRoomAccountChange(accountSelect.value);
      }
    } else {
      accountSelect.innerHTML = '<option value="">-- Stream Key Manual (Belum Ada Akun Terhubung) --</option>';
      if (warningEl) warningEl.classList.remove('hidden');
      if (autoTrigger) {
        await window.onControlRoomAccountChange('');
      }
    }
  } catch (err) {
    console.warn('[Control Room] Could not sync accounts dynamically:', err);
    if (autoTrigger && accountSelect.value) {
      await window.onControlRoomAccountChange(accountSelect.value);
    }
  }
};

// Handle YouTube Account change in Control Room
window.onControlRoomAccountChange = async function(accountId) {
  const manualSection = document.getElementById('controlRoomStreamKeyManual');
  const selectorSection = document.getElementById('controlRoomStreamKeySelector');
  const streamKeyInput = document.getElementById('streamKey');
  
  console.log('[Control Room] Account changed to:', accountId);
  
  if (!manualSection || !selectorSection) {
    console.error('[Control Room] Required elements not found');
    return;
  }
  
  if (accountId) {
    // Account selected - show dropdown selector
    console.log('[Control Room] Switching to AUTO mode');
    manualSection.classList.add('hidden');
    selectorSection.classList.remove('hidden');
    
    if (streamKeyInput) streamKeyInput.removeAttribute('required');
    
    await fetchControlRoomStreamKeys(accountId);
  } else {
    // No account - show manual input
    console.log('[Control Room] Switching to MANUAL mode');
    manualSection.classList.remove('hidden');
    selectorSection.classList.add('hidden');
    
    if (streamKeyInput) streamKeyInput.setAttribute('required', 'required');
    
    const valueInput = document.getElementById('controlRoomStreamKeyValue');
    if (valueInput) valueInput.value = '';
    
    const indicator = document.getElementById('controlRoomStreamKeyAutoFillIndicator');
    if (indicator) indicator.classList.add('hidden');
  }
};

// Fetch stream keys for Control Room from selected YouTube account
window.fetchControlRoomStreamKeys = async function(accountId) {
  const select = document.getElementById('controlRoomStreamKeySelect');
  const loading = document.getElementById('controlRoomStreamKeyLoading');
  const indicator = document.getElementById('controlRoomStreamKeyAutoFillIndicator');
  const manualSection = document.getElementById('controlRoomStreamKeyManual');
  const selectorSection = document.getElementById('controlRoomStreamKeySelector');
  const streamKeyInput = document.getElementById('streamKey');
  
  console.log('[Control Room] fetchControlRoomStreamKeys called with accountId:', accountId);
  
  if (!select) {
    console.error('[Control Room] Stream key select element not found');
    return;
  }
  
  if (loading) loading.classList.remove('hidden');
  if (indicator) indicator.classList.add('hidden');
  
  try {
    const url = `/api/youtube/streams?accountId=${accountId}`;
    console.log('[Control Room] Fetching stream keys from:', url);
    
    const response = await fetch(url, {
      headers: {
        'X-CSRF-Token': getCsrfToken()
      }
    });
    
    const data = await response.json();
    console.log('[Control Room] Stream keys response:', data);
    
    select.innerHTML = '<option value="">🔑 Create new stream key</option>';
    
    if (data.success && data.streams && data.streams.length > 0) {
      console.log('[Control Room] Found', data.streams.length, 'stream keys');
      
      const separator = document.createElement('option');
      separator.disabled = true;
      separator.textContent = '─────────────────────────────';
      select.appendChild(separator);
      
      const reuse = document.createElement('option');
      reuse.disabled = true;
      reuse.textContent = '📋 YouTube Stream Keys Available:';
      select.appendChild(reuse);
      
      let validStreamFound = null;

      data.streams.forEach((stream, index) => {
        const option = document.createElement('option');
        const streamIdVal = stream.id || `stream_${index}`;
        option.value = streamIdVal;
        
        const keySnippet = stream.streamKey ? ` [${stream.streamKey.substring(0, 8)}...]` : '';
        option.textContent = `${index + 1}. ${stream.title}${keySnippet}`;
        option.dataset.streamKey = stream.streamKey || '';
        option.dataset.rtmpUrl = stream.rtmpUrl || 'rtmp://a.rtmp.youtube.com/live2';
        select.appendChild(option);

        if (!validStreamFound && stream.streamKey && stream.streamKey.trim() !== '') {
          validStreamFound = { id: streamIdVal, ...stream };
        }
      });
      
      // Auto-select the first stream key if available
      const targetStream = validStreamFound || data.streams[0];
      if (targetStream) {
        const targetId = targetStream.id || 'stream_0';
        select.value = targetId;
        onControlRoomStreamKeyChange(targetId);
        console.log('[Control Room] Auto-selected stream key:', targetStream.title);
      }
      
      if (indicator) {
        indicator.classList.remove('hidden');
        indicator.textContent = '✓ Stream key auto-loaded';
      }
      
      if (typeof showToast === 'function') {
        showToast('success', '✓ Stream key berhasil di-load dari YouTube');
      }
    } else {
      console.log('[Control Room] No stream keys found or empty list');
      if (manualSection && selectorSection) {
        manualSection.classList.remove('hidden');
        selectorSection.classList.add('hidden');
        if (streamKeyInput) streamKeyInput.setAttribute('required', 'required');
      }
      if (indicator) indicator.classList.add('hidden');
      if (typeof showToast === 'function') {
        showToast('info', 'Belum ada stream key di channel ini. Silakan masukkan stream key secara manual.');
      }
    }
  } catch (error) {
    console.error('[Control Room] Error fetching stream keys:', error);
    if (manualSection && selectorSection) {
      manualSection.classList.remove('hidden');
      selectorSection.classList.add('hidden');
      if (streamKeyInput) streamKeyInput.setAttribute('required', 'required');
    }
    if (typeof showToast === 'function') {
      showToast('error', 'Gagal memuat stream key YouTube. Silakan masukkan secara manual.');
    }
  } finally {
    if (loading) loading.classList.add('hidden');
  }
};

// Handle stream key selection change in Control Room
window.onControlRoomStreamKeyChange = function(streamId) {
  const select = document.getElementById('controlRoomStreamKeySelect');
  const valueInput = document.getElementById('controlRoomStreamKeyValue');
  const manualInput = document.getElementById('streamKey');
  const rtmpInput = document.getElementById('rtmpUrl');
  const indicator = document.getElementById('controlRoomStreamKeyAutoFillIndicator');
  
  console.log('[Control Room] Stream key changed to:', streamId);
  
  if (!select || !valueInput) {
    console.error('[Control Room] Required inputs not found');
    return;
  }
  
  if (streamId) {
    let selectedOption = null;
    try {
      selectedOption = select.querySelector(`option[value="${CSS.escape(streamId)}"]`) || select.options[select.selectedIndex];
    } catch (e) {
      selectedOption = select.options[select.selectedIndex];
    }
    
    const streamKey = selectedOption ? (selectedOption.dataset.streamKey || '') : '';
    const rtmpUrl = selectedOption ? (selectedOption.dataset.rtmpUrl || 'rtmp://a.rtmp.youtube.com/live2') : 'rtmp://a.rtmp.youtube.com/live2';
    
    valueInput.value = streamKey;
    if (manualInput) manualInput.value = streamKey;
    if (rtmpInput) rtmpInput.value = rtmpUrl;
    
    if (indicator && streamKey) {
      indicator.classList.remove('hidden');
      indicator.textContent = '✓ Stream key loaded';
    }
    
    console.log('[Control Room] Selected stream key:', streamKey ? 'SET' : 'EMPTY');
    console.log('[Control Room] RTMP URL:', rtmpUrl);
  } else {
    valueInput.value = '';
    if (rtmpInput) rtmpInput.value = 'rtmp://a.rtmp.youtube.com/live2';
    if (indicator) indicator.classList.add('hidden');
    
    console.log('[Control Room] Will create new stream key');
  }
};

// Get CSRF token
function getCsrfToken() {
  const token = document.querySelector('meta[name="csrf-token"]');
  return token ? token.getAttribute('content') : '';
}
