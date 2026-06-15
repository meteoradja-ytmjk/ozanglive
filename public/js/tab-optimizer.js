/**
 * Tab Navigation Optimizer
 * Meningkatkan responsivitas perpindahan antar tab dengan:
 * - Instant visual feedback
 * - Prefetching
 * - Loading states
 * - Smooth transitions
 */

(function () {
  'use strict';

  // Cache untuk menyimpan data yang sudah di-load
  const pageCache = new Map();
  const prefetchInFlight = new Map();
  const CACHE_DURATION = 5 * 60 * 1000; // 5 menit

  const PREFETCH_SKIP_PATHS = new Set(['/logout', '/login', '/signup', '/setup-account']);

  function shouldPrefetchLink(link) {
    if (!link || !link.href) {
      return false;
    }

    if (link.dataset && link.dataset.noPrefetch === 'true') {
      return false;
    }

    const url = new URL(link.href, window.location.origin);
    if (PREFETCH_SKIP_PATHS.has(url.pathname)) {
      return false;
    }

    return true;
  }

  // Prefetch links saat hover
  function setupPrefetch() {
    const navLinks = document.querySelectorAll('a[href^="/"]');

    navLinks.forEach(link => {
      if (!shouldPrefetchLink(link)) {
        return;
      }
      // Prefetch saat hover (desktop) atau touchstart (mobile)
      link.addEventListener('mouseenter', () => prefetchPage(link.href, { priority: 'low' }), { once: false, passive: true });
      link.addEventListener('touchstart', () => prefetchPage(link.href, { priority: 'high' }), { once: false, passive: true });
      link.addEventListener('pointerdown', () => prefetchPage(link.href, { priority: 'high' }), { once: false, passive: true });
    });
  }

  // Prefetch halaman di background
  function isCacheValid(timestamp) {
    return typeof timestamp === 'number' && (Date.now() - timestamp) < CACHE_DURATION;
  }

  function shouldSkipPrefetch(priority) {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) {
      return false;
    }

    if (connection.saveData) {
      return priority !== 'high';
    }

    const slowTypes = ['slow-2g', '2g'];
    if (slowTypes.includes(connection.effectiveType || '')) {
      return priority !== 'high';
    }

    return false;
  }

  function prefetchPage(url, options = {}) {
    const { priority = 'low' } = options;
    const cachedAt = pageCache.get(url);

    // Skip jika sudah di-cache atau sedang di-prefetch
    if (isCacheValid(cachedAt) || prefetchInFlight.has(url)) {
      return;
    }

    if (shouldSkipPrefetch(priority)) {
      return;
    }

    // Tambahkan hint browser untuk prefetch
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'document';
    link.href = url;
    link.crossOrigin = 'same-origin';
    document.head.appendChild(link);

    const controller = new AbortController();
    prefetchInFlight.set(url, controller);

    // Gunakan fetch dengan credentials agar session cookie tetap konsisten
    fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'force-cache',
      headers: {
        'X-Prefetch': '1'
      },
      signal: controller.signal
    }).then(response => {
      if (response.ok) {
        pageCache.set(url, Date.now());
      }
    }).catch(() => {
      // Silent fail untuk prefetch
    }).finally(() => {
      prefetchInFlight.delete(url);
      setTimeout(() => {
        if (link && link.parentNode) {
          link.remove();
        }
      }, 1000);
    });
  }

  function prefetchNavLinksOnIdle() {
    const navLinks = document.querySelectorAll('.sidebar-icon[href^="/"], .bottom-nav-item[href^="/"]');
    if (navLinks.length === 0) {
      return;
    }

    const prefetchAll = () => {
      navLinks.forEach(link => {
        if (link.href !== window.location.href && shouldPrefetchLink(link)) {
          prefetchPage(link.href, { priority: 'low' });
        }
      });
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(prefetchAll, { timeout: 1500 });
    } else {
      setTimeout(prefetchAll, 800);
    }
  }

  // Instant visual feedback saat klik navigasi
  function setupInstantFeedback() {
    const navLinks = document.querySelectorAll('.sidebar-icon, .bottom-nav-item');

    navLinks.forEach(link => {
      link.addEventListener('click', function (e) {
        // Hapus active state dari semua link
        navLinks.forEach(l => {
          l.classList.remove('bg-primary', 'bottom-nav-active');
          l.style.color = '';
        });

        // Tambahkan active state ke link yang diklik
        this.classList.add('bg-primary');
        if (this.classList.contains('bottom-nav-item')) {
          this.classList.add('bottom-nav-active');
          // Special handling untuk YouTube tab
          if (this.href && this.href.includes('/youtube')) {
            this.style.color = '#EF4444';
          }
        }

        // DISABLED: Loading overlay mengurangi responsivitas
        // showLoadingOverlay();
      }, { passive: true });
    });
  }

  // Loading overlay dengan smooth animation
  function showLoadingOverlay() {
    // Cek apakah overlay sudah ada
    let overlay = document.getElementById('page-loading-overlay');

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'page-loading-overlay';
      overlay.innerHTML = `
        <div class="loading-spinner">
          <div class="spinner-ring"></div>
          <div class="spinner-text">Loading...</div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    // Trigger reflow untuk animasi
    overlay.offsetHeight;
    overlay.classList.add('active');
  }

  // Hapus loading overlay
  function hideLoadingOverlay() {
    const overlay = document.getElementById('page-loading-overlay');
    if (overlay) {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 300);
    }
  }

  // Optimasi untuk mobile: prevent double-tap zoom
  function preventDoubleTapZoom() {
    let lastTouchEnd = 0;
    document.addEventListener('touchend', function (e) {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    }, { passive: false });
  }

  // Smooth scroll ke top saat pindah halaman
  function smoothScrollToTop() {
    if ('scrollBehavior' in document.documentElement.style) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo(0, 0);
    }
  }

  // Optimasi rendering dengan requestAnimationFrame
  function optimizeRendering(callback) {
    if (window.requestAnimationFrame) {
      requestAnimationFrame(callback);
    } else {
      callback();
    }
  }

  // Lazy load images
  function setupLazyLoading() {
    if ('IntersectionObserver' in window) {
      const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            if (img.dataset.src) {
              img.src = img.dataset.src;
              img.removeAttribute('data-src');
              observer.unobserve(img);
            }
          }
        });
      }, {
        rootMargin: '50px 0px',
        threshold: 0.01
      });

      document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
      });
    }
  }

  // Debounce function untuk optimasi event
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Optimasi scroll performance
  function optimizeScrollPerformance() {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          // Scroll handling logic here
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  // Initialize semua optimasi
  function init() {
    // Tunggu DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }

    // Setup optimasi
    optimizeRendering(() => {
      setupPrefetch();
      setupInstantFeedback();
      setupLazyLoading();
      optimizeScrollPerformance();
      preventDoubleTapZoom();
      prefetchNavLinksOnIdle();
    });

    // Hide loading overlay jika ada
    hideLoadingOverlay();

    // Smooth scroll ke top
    smoothScrollToTop();
  }

  // Auto-init
  init();

  // Expose untuk debugging
  window.TabOptimizer = {
    showLoading: showLoadingOverlay,
    hideLoading: hideLoadingOverlay,
    prefetch: prefetchPage
  };
})();
