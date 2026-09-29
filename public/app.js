// ====================================================================
// DropHost Pro — Frontend Conectado ao Backend Real
// Todas as chamadas usam a API do server.js com JWT
// ====================================================================

const API = ''; // Mesmo servidor (relativo)
let authToken = localStorage.getItem('dh_token') || null;
let currentUser = null;
let publicUrl = null; // URL pública do Cloudflare Tunnel

const PLANS_INFO = {
    'free':        { label: 'Gratuito',                  total: 30,     price: 'Grátis' },
    'status':      { label: 'Status',                    total: 30,     price: 'R$ 40/mês' },
    'promo_month': { label: 'Promoção Mensal (300 cr)',   total: 300,    price: 'R$ 50/mês' },
    'pro':         { label: 'Pro',                       total: 150,    price: 'R$ 150/mês' },
    'family':      { label: 'Plano Família (5 Pessoas)',  total: 999999, price: 'R$ 80/ano' },
    'unlimited':   { label: 'Ilimitado',                 total: 999999, price: 'R$ 400/ano' }
};

const TEMPLATES = {
    landing: `<!DOCTYPE html>
<html>
<head><title>Minha Landing Page</title></head>
<body style="font-family: sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #0f172a, #1e293b); color: #fff; min-height: 100vh;">
    <h1 style="font-size: 3em; margin-bottom: 20px;">🚀 Bem-vindo</h1>
    <p style="font-size: 1.2em; color: #94a3b8; max-width: 500px; margin: 0 auto 30px;">A melhor solução para hospedar seus projetos na internet de forma rápida e profissional.</p>
    <button style="padding: 15px 30px; background: linear-gradient(to right, #6366f1, #8b5cf6); border: none; color: white; border-radius: 10px; font-size: 1.1em; cursor: pointer;">Começar Agora</button>
</body>
</html>`,
    linkinbio: `<!DOCTYPE html>
<html>
<head><title>Meus Links</title></head>
<body style="font-family: sans-serif; text-align: center; padding: 20px; max-width: 420px; margin: 0 auto; background: #0f172a; color: #fff; min-height: 100vh;">
    <div style="width: 90px; height: 90px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 50%; margin: 30px auto 15px;"></div>
    <h2>@meuperfil</h2>
    <p style="color: #94a3b8; margin-bottom: 30px;">Criador de conteúdo digital</p>
    <div style="display: flex; flex-direction: column; gap: 12px;">
        <a href="#" style="padding: 16px; background: #1e293b; border: 1px solid #334155; border-radius: 12px; text-decoration: none; color: white; font-weight: 500;">📸 Instagram</a>
        <a href="#" style="padding: 16px; background: #1e293b; border: 1px solid #334155; border-radius: 12px; text-decoration: none; color: white; font-weight: 500;">🐦 Twitter</a>
        <a href="#" style="padding: 16px; background: #1e293b; border: 1px solid #334155; border-radius: 12px; text-decoration: none; color: white; font-weight: 500;">▶️ YouTube</a>
    </div>
</body>
</html>`,
    portfolio: `<!DOCTYPE html>
<html>
<head><title>Meu Portfólio</title></head>
<body style="font-family: sans-serif; padding: 40px; background: #0f172a; color: #e2e8f0; min-height: 100vh;">
    <header style="border-bottom: 2px solid #6366f1; padding-bottom: 20px; margin-bottom: 30px;">
        <h1 style="color: #fff;">João Silva</h1>
        <p style="color: #94a3b8;">Desenvolvedor Frontend</p>
    </header>
    <h3 style="color: #6366f1;">Meus Projetos</h3>
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px; margin-top: 20px;">
        <div style="background: #1e293b; padding: 20px; border-radius: 12px; border: 1px solid #334155;">
            <h4 style="color: #fff;">E-commerce</h4>
            <p style="color: #94a3b8; font-size: 14px;">Loja virtual com carrinho e pagamento</p>
        </div>
        <div style="background: #1e293b; padding: 20px; border-radius: 12px; border: 1px solid #334155;">
            <h4 style="color: #fff;">Dashboard</h4>
            <p style="color: #94a3b8; font-size: 14px;">Painel administrativo com gráficos</p>
        </div>
    </div>
</body>
</html>`
};

// ====================================================================
// Funções de API
// ====================================================================
async function api(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    
    const opts = { method, headers };
    if (body && !(body instanceof FormData)) opts.body = JSON.stringify(body);
    if (body instanceof FormData) {
        delete headers['Content-Type'];
        if (authToken) opts.headers = { 'Authorization': `Bearer ${authToken}` };
        opts.body = body;
    }
    
    const res = await fetch(`${API}${path}`, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro desconhecido');
    return data;
}

async function apiUpload(formData) {
    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(`${API}/api/upload`, { method: 'POST', headers, body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro no upload');
    return data;
}

// ====================================================================
// DOM Elements
// ====================================================================
const views = {
    auth: document.getElementById('auth-view'),
    dashboard: document.getElementById('dashboard-view'),
    admin: document.getElementById('admin-view')
};

// ====================================================================
// Inicialização
// ====================================================================
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    setupEventListeners();
    initApp();
});

async function initApp() {
    if (authToken) {
        try {
            currentUser = await api('GET', '/api/auth/me');
            showView('dashboard');
            fetchTunnelUrl();
        } catch (e) {
            // Token inválido/expirado
            authToken = null;
            localStorage.removeItem('dh_token');
            showView('auth');
        }
    } else {
        showView('auth');
    }
}

// ====================================================================
// Views
// ====================================================================
function showView(viewName) {
    Object.values(views).forEach(el => { if (el) el.classList.add('hidden'); });
    if (views[viewName]) {
        views[viewName].classList.remove('hidden');
        if (viewName === 'dashboard') updateDashboardUI();
        if (viewName === 'admin') updateAdminUI();
    }
}

// ====================================================================
// Event Listeners
// ====================================================================
function setupEventListeners() {
    // Auth tabs
    document.getElementById('tab-login')?.addEventListener('click', (e) => switchAuthTab('login', e.target));
    document.getElementById('tab-register')?.addEventListener('click', (e) => switchAuthTab('register', e.target));

    // Auth forms
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    document.getElementById('register-form')?.addEventListener('submit', handleRegister);

    // Nav
    document.getElementById('btn-logout')?.addEventListener('click', handleLogout);
    document.getElementById('btn-admin-panel')?.addEventListener('click', () => showView('admin'));
    document.getElementById('btn-back-dashboard')?.addEventListener('click', () => showView('dashboard'));

    // Upload tabs
    document.getElementById('tab-upload')?.addEventListener('click', () => switchUploadMode('upload'));
    document.getElementById('tab-code')?.addEventListener('click', () => switchUploadMode('code'));

    // Templates
    document.querySelectorAll('.tpl-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tpl = e.target.getAttribute('data-tpl');
            if (TEMPLATES[tpl]) document.getElementById('code-editor').value = TEMPLATES[tpl];
        });
    });

    // File dropzone
    const dropzone = document.getElementById('dropzone-area');
    const fileInput = document.getElementById('file-input');
    
    dropzone?.addEventListener('click', () => fileInput?.click());
    dropzone?.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone?.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFileSelect(fileInput.files[0]);
        }
    });
    fileInput?.addEventListener('change', (e) => {
        if (e.target.files.length) handleFileSelect(e.target.files[0]);
    });

    // Botão X para remover arquivo selecionado
    document.getElementById('btn-clear-file')?.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedFile = null;
        document.getElementById('selected-file-info').classList.add('hidden');
        document.getElementById('file-input').value = '';
        document.getElementById('site-title').value = '';
        document.getElementById('site-slug').value = '';
    });

    // Deploy
    document.getElementById('btn-deploy')?.addEventListener('click', handleDeploy);

    // Modals
    document.getElementById('btn-open-plans')?.addEventListener('click', () => openModal('modal-plans'));
    document.getElementById('btn-open-redeem')?.addEventListener('click', () => openModal('modal-redeem'));
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => { 
            closeModal('modal-redeem'); 
            closeModal('modal-success'); 
            closeModal('modal-plans');
        });
    });

    // Fechar modais ao clicar no fundo escuro ou apertar ESC
    ['modal-redeem', 'modal-success', 'modal-plans'].forEach(modalId => {
        document.getElementById(modalId)?.addEventListener('click', (e) => {
            if (e.target.id === modalId) closeModal(modalId);
        });
    });
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal('modal-redeem');
            closeModal('modal-success');
            closeModal('modal-plans');
        }
    });

    // Redeem
    document.getElementById('btn-submit-redeem')?.addEventListener('click', handleRedeem);

    // Admin
    document.getElementById('btn-generate-license')?.addEventListener('click', handleGenerateLicense);
    document.getElementById('btn-copy-new-license')?.addEventListener('click', () => {
        const code = document.getElementById('new-license-code').innerText;
        navigator.clipboard.writeText(code);
        showToast('Chave copiada! 📋');
    });

    // Admin Liberação Família & Backup
    document.getElementById('btn-activate-family')?.addEventListener('click', handleFamilyActivate);
    document.getElementById('btn-download-backup')?.addEventListener('click', handleDownloadBackup);
    document.getElementById('input-restore-backup')?.addEventListener('change', handleRestoreBackup);

    // Share WhatsApp
    document.getElementById('btn-share-wa')?.addEventListener('click', () => {
        const url = document.getElementById('success-url')?.href;
        if (url) window.open(`https://wa.me/?text=Olha%20meu%20site%20novo!%20${encodeURIComponent(url)}`, '_blank');
    });
}

// ====================================================================
// Auth
// ====================================================================
function switchAuthTab(tab, btnElement) {
    document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
    document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
    
    const loginBtn = document.getElementById('tab-login');
    const regBtn = document.getElementById('tab-register');
    [loginBtn, regBtn].forEach(b => {
        b.className = "flex-1 pb-3 text-sm font-medium text-slate-500 hover:text-slate-300 transition-all";
    });
    btnElement.className = "flex-1 pb-3 text-sm font-medium text-indigo-400 border-b-2 border-indigo-400 transition-all";
    hideAuthError();
}

function showAuthError(msg) {
    const errEl = document.getElementById('auth-error');
    document.getElementById('auth-error-text').innerText = msg;
    errEl.classList.remove('hidden');
}
function hideAuthError() {
    document.getElementById('auth-error')?.classList.add('hidden');
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        const data = await api('POST', '/api/auth/login', { email, password });
        authToken = data.token;
        localStorage.setItem('dh_token', authToken);
        currentUser = await api('GET', '/api/auth/me');
        showView('dashboard');
        fetchTunnelUrl();
    } catch (err) {
        showAuthError(err.message);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;

    if (password !== confirm) { showAuthError('As senhas não coincidem.'); return; }
    if (password.length < 4) { showAuthError('A senha deve ter pelo menos 4 caracteres.'); return; }

    try {
        await api('POST', '/api/auth/register', { name, email, password });
        // Login automático após registro
        const data = await api('POST', '/api/auth/login', { email, password });
        authToken = data.token;
        localStorage.setItem('dh_token', authToken);
        currentUser = await api('GET', '/api/auth/me');
        showView('dashboard');
        fetchTunnelUrl();
    } catch (err) {
        showAuthError(err.message);
    }
}

function handleLogout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('dh_token');
    showView('auth');
}

// ====================================================================
// Tunnel
// ====================================================================
async function fetchTunnelUrl() {
    try {
        const data = await api('GET', '/api/tunnel/status');
        if (data.url) publicUrl = data.url;
    } catch (e) {
        publicUrl = null;
    }
}

// ====================================================================
// Dashboard
// ====================================================================
async function updateDashboardUI() {
    if (!currentUser) return;

    // Atualizar info do usuário
    try { currentUser = await api('GET', '/api/auth/me'); } catch (e) { /* usa cache */ }

    // Navbar
    document.getElementById('nav-user-name').innerText = `Olá, ${currentUser.name.split(' ')[0]}`;
    document.getElementById('nav-credits').innerText = `${currentUser.credits} créditos`;

    // Admin button
    const adminBtn = document.getElementById('btn-admin-panel');
    if (currentUser.role === 'admin') adminBtn.classList.remove('hidden');
    else adminBtn.classList.add('hidden');

    // Esconder botão de planos para admin
    const plansBtn = document.getElementById('btn-open-plans');
    if (plansBtn) {
        if (currentUser.role === 'admin') plansBtn.classList.add('hidden');
        else plansBtn.classList.remove('hidden');
    }

    // Credit card
    const planInfo = PLANS_INFO[currentUser.plan] || PLANS_INFO['free'];
    document.getElementById('dash-plan-name').innerText = `${planInfo.label} — ${planInfo.price}`;
    document.getElementById('dash-credits-count').innerText = currentUser.credits;

    const totalCredits = planInfo.total;
    const used = Math.max(0, totalCredits - currentUser.credits);
    if (totalCredits < 999999) {
        let usageExtra = '';
        if (currentUser.dailyRestore) usageExtra = ' (restaura amanhã)';
        document.getElementById('dash-usage-text').innerText = `${used} / ${totalCredits} usados${usageExtra}`;
        const pct = totalCredits > 0 ? (used / totalCredits) * 100 : 0;
        document.getElementById('dash-usage-bar').style.width = `${Math.min(pct, 100)}%`;
    } else {
        document.getElementById('dash-usage-text').innerText = `Ilimitado ∞`;
        document.getElementById('dash-usage-bar').style.width = `5%`;
    }

    // Zero credits warning
    const hasCredits = currentUser.credits > 0;
    document.getElementById('zero-credits-warning').classList.toggle('hidden', hasCredits);
    document.getElementById('btn-deploy').disabled = !hasCredits;

    // Load sites
    renderSitesList();
}

// ====================================================================
// Upload & Deploy
// ====================================================================
let currentUploadMode = 'upload';
let selectedFile = null;

function switchUploadMode(mode) {
    currentUploadMode = mode;
    document.getElementById('dropzone-area').classList.toggle('hidden', mode !== 'upload');
    document.getElementById('code-area').classList.toggle('hidden', mode !== 'code');

    const btnUpload = document.getElementById('tab-upload');
    const btnCode = document.getElementById('tab-code');

    if (mode === 'upload') {
        btnUpload.className = "px-3 py-1.5 text-sm rounded-md bg-indigo-600/30 text-white shadow-sm transition-all border border-indigo-500/20";
        btnCode.className = "px-3 py-1.5 text-sm rounded-md text-slate-400 hover:text-white transition-all";
    } else {
        btnCode.className = "px-3 py-1.5 text-sm rounded-md bg-indigo-600/30 text-white shadow-sm transition-all border border-indigo-500/20";
        btnUpload.className = "px-3 py-1.5 text-sm rounded-md text-slate-400 hover:text-white transition-all";
    }
}

function handleFileSelect(file) {
    selectedFile = file;
    document.getElementById('selected-file-info').classList.remove('hidden');
    document.getElementById('selected-file-name').innerText = file.name;
    if (!document.getElementById('site-title').value) {
        document.getElementById('site-title').value = file.name.split('.')[0];
        document.getElementById('site-slug').value = file.name.split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '-');
    }
}

async function handleDeploy() {
    if (!currentUser || currentUser.credits <= 0) return;

    const btn = document.getElementById('btn-deploy');
    const errEl = document.getElementById('deploy-error');
    errEl.classList.add('hidden');

    // Preparar FormData
    const formData = new FormData();
    
    if (currentUploadMode === 'upload') {
        if (!selectedFile) {
            document.getElementById('deploy-error-text').innerText = 'Selecione um arquivo para publicar.';
            errEl.classList.remove('hidden');
            return;
        }
        formData.append('file', selectedFile);
    } else {
        const code = document.getElementById('code-editor').value.trim();
        if (!code) {
            document.getElementById('deploy-error-text').innerText = 'Cole seu código HTML para publicar.';
            errEl.classList.remove('hidden');
            return;
        }
        // Criar blob HTML
        const blob = new Blob([code], { type: 'text/html' });
        formData.append('file', blob, 'index.html');
    }

    const slug = document.getElementById('site-slug').value.trim();
    if (slug) formData.append('slug', slug);

    const title = document.getElementById('site-title').value.trim();
    if (title) formData.append('title', title);

    // Animação de loading
    btn.innerHTML = '<svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" stroke-dasharray="31.4" stroke-dashoffset="10" stroke-linecap="round"/></svg> Publicando...';
    btn.disabled = true;

    try {
        const data = await apiUpload(formData);
        
        // Determinar URL pública
        let siteUrl = `${window.location.origin}/s/${data.site?.slug}/`;
        if (publicUrl && window.location.hostname === 'localhost') {
            siteUrl = `${publicUrl}/s/${data.site?.slug}/`;
        }

        // Resetar form
        document.getElementById('site-title').value = '';
        document.getElementById('site-slug').value = '';
        document.getElementById('code-editor').value = '';
        selectedFile = null;
        document.getElementById('selected-file-info')?.classList.add('hidden');

        // Atualizar UI
        currentUser = await api('GET', '/api/auth/me');
        updateDashboardUI();
        showSuccessModal(siteUrl);

        // Confetti! 🎉
        if (typeof confetti === 'function') {
            confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: ['#6366f1', '#8b5cf6', '#10b981'] });
        }
    } catch (err) {
        document.getElementById('deploy-error-text').innerText = err.message;
        errEl.classList.remove('hidden');
    } finally {
        btn.innerHTML = '<i data-lucide="rocket" class="w-4 h-4"></i> Publicar (30 créditos)';
        btn.disabled = false;
        lucide.createIcons();
    }
}

// ====================================================================
// Sites List
// ====================================================================
async function renderSitesList() {
    const grid = document.getElementById('sites-grid');
    const emptyState = document.getElementById('no-sites-empty');

    try {
        const userSites = await api('GET', '/api/sites');

        if (!userSites || userSites.length === 0) {
            grid.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');

        grid.innerHTML = userSites.map(site => {
            const localUrl = `${window.location.origin}/s/${site.slug}/`;
            const worldUrl = (publicUrl && window.location.hostname === 'localhost') ? `${publicUrl}/s/${site.slug}/` : localUrl;
            const displayUrl = worldUrl.length > 40 ? worldUrl.substring(0, 40) + '...' : worldUrl;

            return `
            <div class="glass-card rounded-xl p-4 flex flex-col group hover:border-indigo-500/30 transition-all hover-lift">
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-center gap-2 min-w-0">
                        <div class="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0">
                            <i data-lucide="globe" class="w-4 h-4"></i>
                        </div>
                        <div class="min-w-0">
                            <h4 class="text-slate-200 font-bold text-sm truncate" title="${site.title || site.slug}">${site.title || site.slug}</h4>
                            <a href="${worldUrl}" target="_blank" class="text-xs text-slate-500 hover:text-indigo-400 transition-colors flex items-center gap-1">
                                <span class="truncate">${displayUrl}</span>
                                <i data-lucide="external-link" class="w-3 h-3 shrink-0"></i>
                            </a>
                        </div>
                    </div>
                    <button onclick="deleteSite('${site.slug}')" class="text-slate-500 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" title="Excluir">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
                <div class="flex items-center gap-2 mb-3">
                    <span class="px-2 py-0.5 text-[10px] rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulseNeon">⚡ Online</span>
                    <button onclick="copySiteUrl('${worldUrl}')" class="px-2 py-0.5 text-[10px] rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/50 hover:text-white cursor-pointer hover-glow">📋 Copiar Link</button>
                </div>
                <div class="mt-auto flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/30 pt-3">
                    <span class="flex items-center gap-1"><i data-lucide="calendar" class="w-3 h-3"></i> ${new Date(site.createdAt).toLocaleDateString('pt-BR')}</span>
                    <span class="flex items-center gap-1 text-cyan-400 font-bold"><i data-lucide="zap" class="w-3 h-3"></i> Turbo</span>
                </div>
            </div>`;
        }).join('');
        
        lucide.createIcons();
    } catch (err) {
        grid.innerHTML = '';
        emptyState.classList.remove('hidden');
    }
}

window.deleteSite = async function(slug) {
    if (!confirm('Tem certeza que deseja excluir este site? O crédito NÃO será devolvido.')) return;
    try {
        await api('DELETE', `/api/sites/${slug}`);
        updateDashboardUI();
        showToast('Site excluído! 🗑️');
    } catch (err) {
        alert('Erro: ' + err.message);
    }
};

window.copySiteUrl = function(url) {
    navigator.clipboard.writeText(url);
    showToast('Link copiado! 📋');
};

// ====================================================================
// Modais
// ====================================================================
window.openModal = function(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    setTimeout(() => {
        modal.style.opacity = '1';
        modal.querySelector('div')?.classList?.remove('scale-95');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }, 10);
};

window.closeModal = function(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.style.opacity = '0';
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.style.display = '';
    }, 300);
};

function showSuccessModal(url) {
    const urlEl = document.getElementById('success-url');
    urlEl.href = url;
    urlEl.querySelector('span').innerText = url;

    // QR Code
    const qrContainer = document.getElementById('qrcode-container');
    qrContainer.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
        new QRCode(qrContainer, {
            text: url,
            width: 128,
            height: 128,
            colorDark: '#0f172a',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });
    }

    openModal('modal-success');
}

// ====================================================================
// Redeem License
// ====================================================================
async function handleRedeem() {
    const keyInput = document.getElementById('redeem-key');
    const msgEl = document.getElementById('redeem-msg');
    const key = keyInput.value.trim();

    if (!key) {
        msgEl.className = "block p-3 rounded-lg text-sm bg-red-500/10 text-red-400 border border-red-500/20";
        msgEl.innerText = "Digite a chave de licença.";
        return;
    }

    try {
        const data = await api('POST', '/api/license/redeem', { key });
        msgEl.className = "block p-3 rounded-lg text-sm bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
        msgEl.innerHTML = `<strong>Sucesso!</strong> +${data.newCredits} créditos. Plano: ${PLANS_INFO[data.newPlan]?.label || data.newPlan}`;
        keyInput.value = '';

        // Atualizar
        currentUser = await api('GET', '/api/auth/me');
        updateDashboardUI();

        setTimeout(() => { closeModal('modal-redeem'); msgEl.className = 'hidden'; }, 2500);
    } catch (err) {
        msgEl.className = "block p-3 rounded-lg text-sm bg-red-500/10 text-red-400 border border-red-500/20";
        msgEl.innerText = err.message;
    }
}

// ====================================================================
// Admin Panel
// ====================================================================
async function updateAdminUI() {
    if (!currentUser || currentUser.role !== 'admin') return;

    try {
        // Stats
        const stats = await api('GET', '/api/admin/stats');
        document.getElementById('stat-users').innerText = stats.totalUsers || 0;
        document.getElementById('stat-sites').innerText = stats.totalSites || 0;
        document.getElementById('stat-credits').innerText = stats.totalCreditsUsed || 0;

        // Users
        const users = await api('GET', '/api/admin/users');
        renderAdminUsers(users);

        // Licenses
        const licenses = await api('GET', '/api/admin/licenses');
        document.getElementById('stat-licenses').innerText = licenses?.length || 0;
        renderAdminLicenses(licenses || []);

    } catch (err) {
        console.error('Erro no admin:', err);
    }
}

function renderAdminUsers(users) {
    const tbody = document.getElementById('admin-users-table');
    tbody.innerHTML = users.map(u => `
        <tr class="hover:bg-slate-800/50 transition-colors">
            <td class="px-4 py-3">
                <div class="flex flex-col">
                    <span class="text-slate-200 font-medium">${u.name} ${u.role === 'admin' ? '<span class="text-xs bg-red-500/20 text-red-400 px-1 rounded ml-1">Admin</span>' : ''}</span>
                    <span class="text-xs text-slate-500">${u.email}</span>
                </div>
            </td>
            <td class="px-4 py-3">
                <span class="px-2 py-1 text-xs rounded-full border ${u.plan === 'free' ? 'border-slate-700 text-slate-400' : 'border-primary/30 bg-primary/10 text-primary'}">${PLANS_INFO[u.plan]?.label || u.plan}</span>
            </td>
            <td class="px-4 py-3 text-slate-300 font-mono">${u.credits}</td>
            <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-2">
                    <button onclick="adminAddCredits('${u.id}')" class="text-xs px-2 py-1 rounded border border-primary/30 text-primary hover:bg-primary/10" title="Adicionar créditos">
                        +💰
                    </button>
                    <button onclick="adminToggleUser('${u.id}')" class="text-xs px-2 py-1 rounded border ${u.isActive ? 'border-red-500/30 text-red-400 hover:bg-red-500/10' : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'}">
                        ${u.isActive ? 'Bloquear' : 'Ativar'}
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

window.adminToggleUser = async function(id) {
    try {
        await api('PUT', `/api/admin/users/${id}/toggle`);
        updateAdminUI();
    } catch (err) { alert(err.message); }
};

window.adminAddCredits = async function(id) {
    const amount = prompt('Quantos créditos adicionar?', '10');
    if (!amount || isNaN(amount)) return;
    try {
        await api('POST', `/api/admin/users/${id}/credits`, { amount: parseInt(amount) });
        updateAdminUI();
        showToast(`+${amount} créditos adicionados! 💰`);
    } catch (err) { alert(err.message); }
};

async function handleGenerateLicense() {
    const planSelect = document.getElementById('license-plan-select');
    const plan = planSelect.value;

    try {
        const data = await api('POST', '/api/license/generate', { plan });
        document.getElementById('new-license-code').innerText = data.key;
        document.getElementById('new-license-display').classList.remove('hidden');
        updateAdminUI();
    } catch (err) {
        alert('Erro: ' + err.message);
    }
}

function renderAdminLicenses(licenses) {
    const list = document.getElementById('admin-licenses-list');
    if (!licenses || licenses.length === 0) {
        list.innerHTML = '<p class="text-sm text-slate-500 italic">Nenhuma licença gerada.</p>';
        return;
    }

    list.innerHTML = licenses.map(l => `
        <div class="flex items-center justify-between p-2 rounded-lg border border-slate-800 bg-slate-900/50">
            <div class="min-w-0">
                <code class="text-xs text-slate-300 font-mono truncate block">${l.key}</code>
                <div class="text-[10px] text-slate-500 mt-0.5">${PLANS_INFO[l.plan]?.label || l.plan} (${l.credits} cr)</div>
            </div>
            <div class="shrink-0 ml-2">
                ${l.isUsed
                    ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700">Usada</span>'
                    : '<span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Ativa</span>'
                }
            </div>
        </div>
    `).join('');
}

// ====================================================================
// Toast notification
// ====================================================================
function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-6 right-6 glass-card text-white px-6 py-3 rounded-xl shadow-2xl z-[100] text-sm font-bold animate-fadeInUp border-indigo-500/30';
    toast.style.borderColor = 'rgba(99,102,241,0.3)';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// ====================================================================
// Liberação Exclusiva de Plano Família (Admin)
// ====================================================================
async function handleFamilyActivate() {
    const emailInput = document.getElementById('family-client-email');
    const passInput = document.getElementById('family-admin-password');
    const msgEl = document.getElementById('family-activate-msg');
    const btn = document.getElementById('btn-activate-family');

    const targetEmail = emailInput.value.trim();
    const adminPassword = passInput.value.trim();

    if (!targetEmail || !adminPassword) {
        msgEl.className = 'block p-3 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20';
        msgEl.innerText = 'Preencha o Gmail do cliente e a sua senha de Admin.';
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<svg class="w-4 h-4 animate-spin inline-block mr-1" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" stroke-dasharray="31.4" stroke-dashoffset="10" stroke-linecap="round"/></svg> Liberando...';

    try {
        const data = await api('POST', '/api/admin/family-activate', { targetEmail, adminPassword });
        msgEl.className = 'block p-3 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
        msgEl.innerText = data.message;
        emailInput.value = '';
        passInput.value = '';
        
        // Atualizar lista de usuários e licenças
        const users = await api('GET', '/api/admin/users');
        renderAdminUsers(users);
        const licenses = await api('GET', '/api/admin/licenses');
        renderAdminLicenses(licenses);

        showToast('Plano Família liberado com sucesso! 👨‍👩‍👧‍👦');
    } catch (err) {
        msgEl.className = 'block p-3 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20';
        msgEl.innerText = err.message;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="shield-check" class="w-4 h-4"></i> Liberar Plano Família';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

// ====================================================================
// Backup & Segurança de Dados (Admin)
// ====================================================================
async function handleDownloadBackup() {
    try {
        const data = await api('GET', '/api/admin/backup');
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `drophost-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Backup baixado com sucesso! 💾');
    } catch (err) {
        alert('Erro ao baixar backup: ' + err.message);
    }
}

async function handleRestoreBackup(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const msgEl = document.getElementById('backup-status-msg');
    const reader = new FileReader();

    reader.onload = async (event) => {
        try {
            const backup = JSON.parse(event.target.result);
            const data = await api('POST', '/api/admin/restore', { backup });
            msgEl.className = 'block p-3 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
            msgEl.innerText = data.message;
            
            const users = await api('GET', '/api/admin/users');
            renderAdminUsers(users);
            const licenses = await api('GET', '/api/admin/licenses');
            renderAdminLicenses(licenses);

            showToast('Backup restaurado! ✅');
        } catch (err) {
            msgEl.className = 'block p-3 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20';
            msgEl.innerText = 'Erro ao restaurar: ' + err.message;
        } finally {
            e.target.value = '';
        }
    };
    reader.readAsText(file);
}
