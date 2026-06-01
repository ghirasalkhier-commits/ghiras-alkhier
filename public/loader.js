// Global Loader - Only shows if page takes more than 500ms to load
(function() {
    var loaderShown = false;
    var pageLoaded = false;

    // Inject loader CSS + HTML
    var style = document.createElement('style');
    style.textContent = `
        @keyframes loader-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        #global-loader {
            position: fixed; inset: 0; z-index: 99999;
            background: #fbf9f8;
            display: flex; align-items: center; justify-content: center;
            opacity: 0; visibility: hidden;
            transition: opacity 0.4s ease;
        }
        #global-loader.visible { opacity: 1; visibility: visible; }
        #global-loader .loader-ring {
            width: 100px; height: 100px; border-radius: 50%;
            border: 3px solid rgba(19, 92, 56, 0.12);
            border-top: 3px solid #135c38;
            animation: loader-spin 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
        }
    `;
    document.head.appendChild(style);

    var loader = document.createElement('div');
    loader.id = 'global-loader';
    loader.innerHTML = `
    <div style="position:relative;width:110px;height:110px;display:flex;align-items:center;justify-content:center;">
        <div class="loader-ring"></div>
        <svg width="12" height="16" viewBox="0 0 18 22" fill="none" style="position:absolute;top:-5px;left:50%;margin-left:-6px;"><path d="M9 0C9 0 0 6 0 14C0 18.4 4 22 9 22C14 22 18 18.4 18 14C18 6 9 0 9 0Z" fill="#135c38" opacity="0.9"/><path d="M9 6V18M9 10C7 10 5 12 5 14" stroke="#bcebd2" stroke-width="1.2" stroke-linecap="round"/></svg>
        <svg width="10" height="14" viewBox="0 0 18 22" fill="none" style="position:absolute;top:1px;right:8px;transform:rotate(30deg);"><path d="M9 0C9 0 0 6 0 14C0 18.4 4 22 9 22C14 22 18 18.4 18 14C18 6 9 0 9 0Z" fill="#135c38" opacity="0.75"/><path d="M9 6V18M9 10C7 10 5 12 5 14" stroke="#bcebd2" stroke-width="1.2" stroke-linecap="round"/></svg>
        <svg width="13" height="17" viewBox="0 0 18 22" fill="none" style="position:absolute;top:12px;right:-2px;transform:rotate(60deg);"><path d="M9 0C9 0 0 6 0 14C0 18.4 4 22 9 22C14 22 18 18.4 18 14C18 6 9 0 9 0Z" fill="#135c38" opacity="0.85"/><path d="M9 6V18M9 10C7 10 5 12 5 14" stroke="#bcebd2" stroke-width="1.2" stroke-linecap="round"/></svg>
        <svg width="11" height="15" viewBox="0 0 18 22" fill="none" style="position:absolute;right:-6px;top:50%;margin-top:-7px;transform:rotate(90deg);"><path d="M9 0C9 0 0 6 0 14C0 18.4 4 22 9 22C14 22 18 18.4 18 14C18 6 9 0 9 0Z" fill="#135c38" opacity="0.8"/><path d="M9 6V18M9 10C7 10 5 12 5 14" stroke="#bcebd2" stroke-width="1.2" stroke-linecap="round"/></svg>
        <svg width="10" height="14" viewBox="0 0 18 22" fill="none" style="position:absolute;bottom:12px;right:-2px;transform:rotate(120deg);"><path d="M9 0C9 0 0 6 0 14C0 18.4 4 22 9 22C14 22 18 18.4 18 14C18 6 9 0 9 0Z" fill="#135c38" opacity="0.7"/><path d="M9 6V18M9 10C7 10 5 12 5 14" stroke="#bcebd2" stroke-width="1.2" stroke-linecap="round"/></svg>
        <svg width="12" height="16" viewBox="0 0 18 22" fill="none" style="position:absolute;bottom:1px;right:8px;transform:rotate(150deg);"><path d="M9 0C9 0 0 6 0 14C0 18.4 4 22 9 22C14 22 18 18.4 18 14C18 6 9 0 9 0Z" fill="#135c38" opacity="0.65"/><path d="M9 6V18M9 10C7 10 5 12 5 14" stroke="#bcebd2" stroke-width="1.2" stroke-linecap="round"/></svg>
        <svg width="11" height="15" viewBox="0 0 18 22" fill="none" style="position:absolute;bottom:-5px;left:50%;margin-left:-5px;transform:rotate(180deg);"><path d="M9 0C9 0 0 6 0 14C0 18.4 4 22 9 22C14 22 18 18.4 18 14C18 6 9 0 9 0Z" fill="#135c38" opacity="0.8"/><path d="M9 6V18M9 10C7 10 5 12 5 14" stroke="#bcebd2" stroke-width="1.2" stroke-linecap="round"/></svg>
        <svg width="10" height="14" viewBox="0 0 18 22" fill="none" style="position:absolute;bottom:1px;left:8px;transform:rotate(210deg);"><path d="M9 0C9 0 0 6 0 14C0 18.4 4 22 9 22C14 22 18 18.4 18 14C18 6 9 0 9 0Z" fill="#135c38" opacity="0.7"/><path d="M9 6V18M9 10C7 10 5 12 5 14" stroke="#bcebd2" stroke-width="1.2" stroke-linecap="round"/></svg>
        <svg width="13" height="17" viewBox="0 0 18 22" fill="none" style="position:absolute;bottom:12px;left:-2px;transform:rotate(240deg);"><path d="M9 0C9 0 0 6 0 14C0 18.4 4 22 9 22C14 22 18 18.4 18 14C18 6 9 0 9 0Z" fill="#135c38" opacity="0.85"/><path d="M9 6V18M9 10C7 10 5 12 5 14" stroke="#bcebd2" stroke-width="1.2" stroke-linecap="round"/></svg>
        <svg width="11" height="15" viewBox="0 0 18 22" fill="none" style="position:absolute;left:-6px;top:50%;margin-top:-7px;transform:rotate(270deg);"><path d="M9 0C9 0 0 6 0 14C0 18.4 4 22 9 22C14 22 18 18.4 18 14C18 6 9 0 9 0Z" fill="#135c38" opacity="0.8"/><path d="M9 6V18M9 10C7 10 5 12 5 14" stroke="#bcebd2" stroke-width="1.2" stroke-linecap="round"/></svg>
        <svg width="10" height="14" viewBox="0 0 18 22" fill="none" style="position:absolute;top:12px;left:-2px;transform:rotate(300deg);"><path d="M9 0C9 0 0 6 0 14C0 18.4 4 22 9 22C14 22 18 18.4 18 14C18 6 9 0 9 0Z" fill="#135c38" opacity="0.7"/><path d="M9 6V18M9 10C7 10 5 12 5 14" stroke="#bcebd2" stroke-width="1.2" stroke-linecap="round"/></svg>
        <svg width="12" height="16" viewBox="0 0 18 22" fill="none" style="position:absolute;top:1px;left:8px;transform:rotate(330deg);"><path d="M9 0C9 0 0 6 0 14C0 18.4 4 22 9 22C14 22 18 18.4 18 14C18 6 9 0 9 0Z" fill="#135c38" opacity="0.75"/><path d="M9 6V18M9 10C7 10 5 12 5 14" stroke="#bcebd2" stroke-width="1.2" stroke-linecap="round"/></svg>
    </div>`;

    var showTimer;
    
    // We must wait for DOMContentLoaded because script is in <head> and document.body is null
    document.addEventListener('DOMContentLoaded', function() {
        document.body.insertBefore(loader, document.body.firstChild);
        
        // Only show loader if page takes more than 500ms to load
        showTimer = setTimeout(function() {
            if (!pageLoaded) {
                loader.classList.add('visible');
                loaderShown = true;
            }
        }, 500);
    });

    function hideLoader() {
        pageLoaded = true;
        clearTimeout(showTimer);
        if (loaderShown) {
            loader.style.opacity = '0';
            setTimeout(function() {
                loader.remove();
            }, 400);
        } else {
            loader.remove();
        }
    }

    window.addEventListener('load', hideLoader);
})();

// Visitor Tracking
(async function() {
    // console.log('🚀 Tracker script initialized...');
    try {
        let fpId = localStorage.getItem('visitor_fingerprint');
        if (!fpId) {
            fpId = 'fp_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
            localStorage.setItem('visitor_fingerprint', fpId);
        }

        let ipAddress = 'Unknown';
        try {
            const ipResponse = await fetch('https://api.ipify.org?format=json');
            const ipData = await ipResponse.json();
            ipAddress = ipData.ip;
            // console.log('🌍 IP Fetched:', ipAddress);
        } catch (error) {
            // console.error('⚠️ Could not fetch IP', error);
        }

        const payload = {
            fingerprintId: fpId,
            page: window.location.pathname.split('/').pop() || 'index.html',
            userAgent: navigator.userAgent,
            ipAddress: ipAddress
        };

        const webhookUrl = 'https://script.google.com/macros/s/AKfycbxjXQ8qxvnZWVn5Mk3C8sJv9IAijNj7DoVmDvaZ11pfjpCQHlNQzFnFWJ8qauhiCSW2/exec';
        
        // console.log('📤 Sending data to Google Sheets...', payload);

        // navigator.sendBeacon is highly reliable for tracking data and bypasses strict CORS preflights
        const success = navigator.sendBeacon(webhookUrl, JSON.stringify(payload));
        
        if (success) {
            // console.log('✅ Tracking request successfully queued by browser.');
        } else {
            // console.warn('⚠️ sendBeacon failed, trying standard fetch...');
            fetch(webhookUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload)
            }); // .then(() => console.log('✅ Fetch fallback sent.')).catch(e => console.error('❌ Fetch fallback error', e));
        }
    } catch(e) {
        // console.error('❌ Visitor tracking failed', e);
    }
})();

// Global Fetch Interceptor for JWT Authentication
const originalFetch = window.fetch;
window.fetch = async function(...args) {
    let [resource, config] = args;
    
    const url = typeof resource === 'string' ? resource : (resource ? resource.url : '');
    
    if (url && url.includes('/api/')) {
        const token = localStorage.getItem('token');
        if (token) {
            config = config || {};
            
            // Handle different ways headers can be defined
            if (config.headers instanceof Headers) {
                if (!config.headers.has('Authorization')) {
                    config.headers.append('Authorization', `Bearer ${token}`);
                }
            } else {
                config.headers = config.headers || {};
                if (!config.headers['Authorization'] && !config.headers['authorization']) {
                    config.headers['Authorization'] = `Bearer ${token}`;
                }
            }
            args[1] = config; // Update the args array
        }
    }
    
    const response = await originalFetch(...args);
    
    // Global 401 Unauthorized handling
    if (response.status === 401 && url.includes('/api/')) {
        localStorage.removeItem('token');
        localStorage.removeItem('currentUser');
        if (!window.location.href.includes('index.html')) {
            window.location.href = 'index.html';
        }
    }
    
    return response;
};
