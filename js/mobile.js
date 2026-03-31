/* ===== Mobile UI — Panel Switching & Sidebar Toggle ===== */
(function () {
  'use strict';

  var MOBILE_BREAKPOINT = 768;

  function isMobile() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  /* Switch the active mobile panel by updating body class */
  function setMobileView(panel) {
    var body = document.body;
    var classes = body.className.split(' ').filter(function (c) {
      return c.indexOf('mobile-view--') !== 0;
    });
    classes.push('mobile-view--' + panel);
    body.className = classes.join(' ').trim();

    /* Sync active state on nav items */
    document.querySelectorAll('.mobile-nav__item').forEach(function (item) {
      item.classList.toggle('--active', item.dataset.panel === panel);
    });
  }

  /* Open sidebar overlay */
  function openSidebar() {
    var sidebar   = document.querySelector('.sidebar');
    var backdrop  = document.getElementById('sidebarBackdrop');
    if (sidebar)  sidebar.classList.add('sidebar--open');
    if (backdrop) backdrop.classList.add('sidebar-backdrop--open');
  }

  /* Close sidebar overlay */
  function closeSidebar() {
    var sidebar   = document.querySelector('.sidebar');
    var backdrop  = document.getElementById('sidebarBackdrop');
    if (sidebar)  sidebar.classList.remove('sidebar--open');
    if (backdrop) backdrop.classList.remove('sidebar-backdrop--open');
  }

  function init() {
    /* ---- Chart icon button: enter chart view ---- */
    var chartBtn = document.getElementById('mobileChartBtn');
    if (chartBtn) {
      chartBtn.addEventListener('click', function () {
        setMobileView('chart');
        window.scrollTo(0, 0);
      });
    }

    /* ---- Mobile nav items (back button in chart view) ---- */
    document.querySelectorAll('.mobile-nav__item').forEach(function (item) {
      item.addEventListener('click', function () {
        setMobileView(this.dataset.panel);
      });
    });

    /* ---- Sidebar toggle (hamburger button) ---- */
    var sidebarBtn = document.getElementById('sidebarToggleBtn');
    if (sidebarBtn) {
      sidebarBtn.addEventListener('click', function () {
        var sidebar = document.querySelector('.sidebar');
        if (sidebar && sidebar.classList.contains('sidebar--open')) {
          closeSidebar();
        } else {
          openSidebar();
        }
      });
    }

    /* ---- Backdrop click closes sidebar ---- */
    var backdrop = document.getElementById('sidebarBackdrop');
    if (backdrop) {
      backdrop.addEventListener('click', closeSidebar);
    }

    /* ---- Close sidebar when a coin is selected (mobile) ---- */
    var coinList = document.getElementById('coinList');
    if (coinList) {
      coinList.addEventListener('click', function (e) {
        if (e.target.closest('.sidebar__coin') && isMobile()) {
          closeSidebar();
        }
      });
    }

    /* ---- Ensure a panel is visible on mobile at load ---- */
    if (isMobile() && !document.body.className.match(/mobile-view--\w+/)) {
      setMobileView('main');
    }
  }

  /* ---- Handle orientation / window resize ---- */
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var body = document.body;
      if (!isMobile()) {
        /* Switched to desktop: strip mobile-view-- classes */
        body.className = body.className.split(' ').filter(function (c) {
          return c.indexOf('mobile-view--') !== 0;
        }).join(' ').trim();
        closeSidebar();
      } else if (!body.className.match(/mobile-view--\w+/)) {
        /* Switched to mobile without an active view: default to main */
        setMobileView('main');
      }
    }, 150);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
