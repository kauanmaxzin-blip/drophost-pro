const express = require('express');
const cors = require('cors');
const multer = require('multer');
const compression = require('compression');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 4000;
const CLOUD_MODE = process.env.CLOUD_MODE === 'true' || !!process.env.RENDER || (!!process.env.PORT && process.env.PORT !== '4000');
const JWT_SECRET = 'drophost-pro-secret-key-2026';

// Diretórios principais
const DATA_DIR = path.join(__dirname, 'data');
const SITES_DIR = path.join(__dirname, 'hosted_sites');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Garantir que os diretórios existam
[DATA_DIR, SITES_DIR, PUBLIC_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Caminhos dos arquivos de banco de dados
const DB_USERS = path.join(DATA_DIR, 'users.json');
const DB_LICENSES = path.join(DATA_DIR, 'licenses.json');
const DB_SITES = path.join(DATA_DIR, 'sites.json');
const DB_STATS = path.join(DATA_DIR, 'stats.json');

// Estado em memória (Banco de Dados)
let db = {
    users: [],
    licenses: [],
    sites: [],
    stats: { visits: 0, totalCreditsUsed: 0 }
};

// Cache de arquivos em RAM
const fileCache = new Map();
const MAX_CACHE_SIZE = 100 * 1024 * 1024; // 100MB
let currentCacheSize = 0;

// Tipos MIME
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'font/otf'
};

// Planos de assinatura (30 créditos = 1 site)
const PLANS = {
    'free':        { credits: 30,     label: 'Gratuito',                 price: 'Grátis',     duration: 'forever', dailyRestore: false },
    'status':      { credits: 30,     label: 'Status',                   price: 'R$ 40/mês',  duration: 'monthly', dailyRestore: true },
    'promo_month': { credits: 300,    label: 'Promoção Mensal',          price: 'R$ 50/mês',  duration: 'monthly', dailyRestore: true },
    'pro':         { credits: 150,    label: 'Pro',                      price: 'R$ 150/mês', duration: 'monthly', dailyRestore: true },
    'family':      { credits: 999999, label: 'Plano Família (5 Pessoas)', price: 'R$ 80/ano',  duration: 'yearly',  dailyRestore: true },
    'unlimited':   { credits: 999999, label: 'Ilimitado Individual',     price: 'R$ 400/ano', duration: 'yearly',  dailyRestore: true }
};

// Carregar banco de dados
function loadDB() {
    try {
        if (fs.existsSync(DB_USERS)) db.users = JSON.parse(fs.readFileSync(DB_USERS, 'utf8'));
        if (fs.existsSync(DB_LICENSES)) db.licenses = JSON.parse(fs.readFileSync(DB_LICENSES, 'utf8'));
        if (fs.existsSync(DB_SITES)) db.sites = JSON.parse(fs.readFileSync(DB_SITES, 'utf8'));
        if (fs.existsSync(DB_STATS)) db.stats = JSON.parse(fs.readFileSync(DB_STATS, 'utf8'));
    } catch (error) {
        console.error('❌ Erro ao carregar banco de dados:', error.message);
    }
}

// Salvar banco de dados no disco de forma assíncrona
let dbDirty = false;
function markDbDirty() {
    dbDirty = true;
}

setInterval(() => {
    if (dbDirty) {
        try {
            fs.writeFileSync(DB_USERS, JSON.stringify(db.users, null, 2));
            fs.writeFileSync(DB_LICENSES, JSON.stringify(db.licenses, null, 2));
            fs.writeFileSync(DB_SITES, JSON.stringify(db.sites, null, 2));
            fs.writeFileSync(DB_STATS, JSON.stringify(db.stats, null, 2));
            dbDirty = false;
            // console.log('💾 Banco de dados salvo no disco.');
        } catch (error) {
            console.error('❌ Erro ao salvar banco de dados:', error.message);
        }
    }
}, 4000);

// Inicializar DB e criar admin padrão
loadDB();

if (db.users.length === 0) {
    const adminHash = bcrypt.hashSync('admin123', 10);
    db.users.push({
        id: crypto.randomUUID(),
        name: 'Admin',
        email: 'admin@drophost.com',
        passwordHash: adminHash,
        role: 'admin',
        credits: PLANS['unlimited'].credits,
        plan: 'unlimited',
        planExpiresAt: null, // null = nunca expira (admin)
        lastRestore: new Date().toISOString().split('T')[0], // data da última restauração
        createdAt: new Date().toISOString(),
        isActive: true
    });
    markDbDirty();
    console.log('👑 Conta de administrador padrão criada!');
}

// Middlewares
app.use(cors());
app.use(express.json());
app.use(compression({ level: 6, threshold: 256 }));

// Configuração do Multer para upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const userDir = path.join(SITES_DIR, `temp_${Date.now()}`);
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }
        cb(null, userDir);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); // Em produção real, é melhor tratar nomes de arquivos
    }
});
const upload = multer({ storage });

// Autenticação (Middlewares)
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Não autorizado. Token ausente.' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = db.users.find(u => u.id === decoded.id);
        if (!user || !user.isActive) {
            return res.status(401).json({ error: 'Usuário não encontrado ou inativo.' });
        }
        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
}

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }
    next();
}

// ----------------------------------------------------
// ROTAS
// ----------------------------------------------------

// 1. Sistema de Autenticação
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Preencha todos os campos.' });

    if (db.users.find(u => u.email === email)) {
        return res.status(400).json({ error: 'Email já registrado.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = {
        id: crypto.randomUUID(),
        name,
        email,
        passwordHash,
        role: 'user',
        credits: PLANS['free'].credits,
        plan: 'free',
        planExpiresAt: null,
        lastRestore: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        isActive: true
    };

    db.users.push(newUser);
    markDbDirty();
    res.status(201).json({ message: 'Usuário registrado com sucesso.' });
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = db.users.find(u => u.email === email);
    
    if (!user || !user.isActive) return res.status(401).json({ error: 'Credenciais inválidas ou usuário inativo.' });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(401).json({ error: 'Credenciais inválidas.' });

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, plan: user.plan } });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    const { id, name, email, role, credits, plan, planExpiresAt, createdAt, isActive } = req.user;
    const planInfo = PLANS[plan] || PLANS['free'];
    res.json({ id, name, email, role, credits, plan, planExpiresAt, planLabel: planInfo.label, planPrice: planInfo.price, maxCredits: planInfo.credits, dailyRestore: planInfo.dailyRestore, createdAt, isActive });
});

// 2. Sistema de Créditos
app.post('/api/credits/add', requireAuth, requireAdmin, (req, res) => {
    const { email, amount } = req.body;
    const user = db.users.find(u => u.email === email);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    
    user.credits += parseInt(amount) || 0;
    markDbDirty();
    res.json({ message: 'Créditos adicionados com sucesso.', newBalance: user.credits });
});

app.get('/api/credits/balance', requireAuth, (req, res) => {
    res.json({ credits: req.user.credits });
});

// 3. Sistema de Licenças
app.post('/api/license/generate', requireAuth, requireAdmin, (req, res) => {
    const { plan } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ error: 'Plano inválido.' });

    const newKey = {
        key: crypto.randomUUID(),
        plan,
        credits: PLANS[plan].credits,
        createdBy: req.user.id,
        redeemedBy: null,
        redeemedAt: null,
        isUsed: false
    };

    db.licenses.push(newKey);
    markDbDirty();
    res.status(201).json({ message: 'Licença gerada com sucesso.', key: newKey.key });
});

app.post('/api/license/redeem', requireAuth, (req, res) => {
    const { key } = req.body;
    const license = db.licenses.find(l => l.key === key);

    if (!license) return res.status(404).json({ error: 'Licença inválida.' });
    if (license.isUsed) return res.status(400).json({ error: 'Licença já foi utilizada.' });

    license.isUsed = true;
    license.redeemedBy = req.user.id;
    license.redeemedAt = new Date().toISOString();

    const planInfo = PLANS[license.plan];
    req.user.plan = license.plan;
    req.user.credits = planInfo.credits;
    req.user.lastRestore = new Date().toISOString().split('T')[0];

    // Calcular expiração do plano
    const now = new Date();
    if (planInfo.duration === 'monthly') {
        req.user.planExpiresAt = new Date(now.setMonth(now.getMonth() + 1)).toISOString();
    } else if (planInfo.duration === 'yearly') {
        req.user.planExpiresAt = new Date(now.setFullYear(now.getFullYear() + 1)).toISOString();
    } else {
        req.user.planExpiresAt = null;
    }
    
    markDbDirty();
    res.json({ message: 'Licença resgatada com sucesso!', newPlan: req.user.plan, newCredits: req.user.credits });
});

// Endpoint de planos (público)
app.get('/api/plans', (req, res) => {
    const plans = Object.entries(PLANS).map(([key, p]) => ({
        id: key, label: p.label, price: p.price, credits: p.credits,
        duration: p.duration, dailyRestore: p.dailyRestore
    }));
    res.json(plans);
});

// 4. Hospedagem de Sites
function generateSlug() {
    return crypto.randomBytes(4).toString('hex');
}

// Upload com suporte a arquivo e código colado (30 créditos por site)
app.post('/api/upload', requireAuth, upload.any(), (req, res) => {
    const creditCost = 30;

    if (req.user.credits < creditCost) {
        return res.status(402).json({ error: `Créditos insuficientes. Publicar custa ${creditCost} créditos. Você tem ${req.user.credits}.` });
    }

    const files = req.files;
    if (!files || files.length === 0) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const customSlug = req.body?.slug?.replace(/[^a-z0-9\-]/g, '') || '';
    const slug = customSlug || generateSlug();
    const title = req.body?.title || slug;
    const siteDir = path.join(SITES_DIR, slug);

    // Verificar se slug já existe
    if (db.sites.find(s => s.slug === slug)) {
        return res.status(400).json({ error: 'Esta URL (slug) já está em uso.' });
    }

    fs.mkdirSync(siteDir, { recursive: true });

    let tempDir = null;
    let totalSize = 0;

    // Verificar se é ZIP
    const file = files[0];
    tempDir = path.dirname(file.path);
    
    if (file.originalname.endsWith('.zip')) {
        try {
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(file.path);
            zip.extractAllTo(siteDir, true);
            fs.unlinkSync(file.path);
            
            // Corrigir subpasta duplicada do ZIP
            const items = fs.readdirSync(siteDir);
            if (items.length === 1) {
                const singleItem = path.join(siteDir, items[0]);
                const stat = fs.statSync(singleItem);
                if (stat.isDirectory()) {
                    const subItems = fs.readdirSync(singleItem);
                    for (const sub of subItems) {
                        const src = path.join(singleItem, sub);
                        const dest = path.join(siteDir, sub);
                        fs.renameSync(src, dest);
                    }
                    fs.rmSync(singleItem, { recursive: true, force: true });
                    console.log(`📦 ZIP corrigido: subpasta "${items[0]}" movida para raiz`);
                }
            }
            
            // Calcular tamanho total
            const calcSize = (dir) => {
                const dirItems = fs.readdirSync(dir);
                for (const item of dirItems) {
                    const fp = path.join(dir, item);
                    const stat = fs.statSync(fp);
                    if (stat.isDirectory()) calcSize(fp);
                    else totalSize += stat.size;
                }
            };
            calcSize(siteDir);
        } catch (e) {
            return res.status(400).json({ error: 'Erro ao extrair o ZIP.' });
        }
    } else {
        // Arquivo simples (HTML)
        files.forEach(f => {
            const destPath = path.join(siteDir, f.originalname);
            totalSize += f.size;
            fs.renameSync(f.path, destPath);
        });
    }

    // Limpar diretório temporário
    if (tempDir && fs.existsSync(tempDir)) {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    }

    // Deduzir créditos baseado no modo
    req.user.credits -= creditCost;
    db.stats.totalCreditsUsed += creditCost;

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const baseUrl = activeTunnel || `${protocol}://${host}`;

    const newSite = {
        slug,
        title,
        ownerId: req.user.id,
        createdAt: new Date().toISOString(),
        size: totalSize,
        url: `${baseUrl}/s/${slug}/`
    };

    db.sites.push(newSite);
    markDbDirty();

    console.log(`📤 Site publicado: ${slug} | ⚡ Turbo | -${creditCost} cr`);

    res.status(201).json({ message: 'Site publicado com sucesso!', site: newSite, remainingCredits: req.user.credits });
});

app.get('/api/sites', requireAuth, (req, res) => {
    const userSites = db.sites.filter(s => s.ownerId === req.user.id);
    res.json(userSites);
});

app.delete('/api/sites/:slug', requireAuth, (req, res) => {
    const { slug } = req.params;
    const siteIndex = db.sites.findIndex(s => s.slug === slug);
    
    if (siteIndex === -1) return res.status(404).json({ error: 'Site não encontrado.' });
    
    const site = db.sites[siteIndex];
    if (site.ownerId !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Sem permissão para deletar este site.' });
    }

    const siteDir = path.join(SITES_DIR, slug);
    if (fs.existsSync(siteDir)) {
        fs.rmSync(siteDir, { recursive: true, force: true });
    }

    db.sites.splice(siteIndex, 1);
    markDbDirty();

    // Limpar cache
    for (const key of fileCache.keys()) {
        if (key.startsWith(siteDir)) {
            fileCache.delete(key);
        }
    }

    res.json({ message: 'Site deletado com sucesso.' });
});

// 5. Painel Admin
app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
    const usersWithStats = db.users.map(u => {
        const { passwordHash, ...safeUser } = u;
        safeUser.siteCount = db.sites.filter(s => s.ownerId === u.id).length;
        return safeUser;
    });
    res.json(usersWithStats);
});

app.get('/api/admin/stats', requireAuth, requireAdmin, (req, res) => {
    res.json({
        totalUsers: db.users.length,
        totalSites: db.sites.length,
        totalVisits: db.stats.visits,
        totalCreditsUsed: db.stats.totalCreditsUsed
    });
});

// Listar todas as licenças (admin)
app.get('/api/admin/licenses', requireAuth, requireAdmin, (req, res) => {
    res.json(db.licenses);
});

app.put('/api/admin/users/:id/plan', requireAuth, requireAdmin, (req, res) => {
    const { plan } = req.body;
    const user = db.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (!PLANS[plan]) return res.status(400).json({ error: 'Plano inválido.' });

    user.plan = plan;
    markDbDirty();
    res.json({ message: 'Plano atualizado com sucesso.', user: { id: user.id, plan: user.plan } });
});

app.put('/api/admin/users/:id/toggle', requireAuth, requireAdmin, (req, res) => {
    const user = db.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    user.isActive = !user.isActive;
    markDbDirty();
    res.json({ message: `Usuário ${user.isActive ? 'ativado' : 'desativado'}.` });
});

app.post('/api/admin/users/:id/credits', requireAuth, requireAdmin, (req, res) => {
    const { amount } = req.body;
    const user = db.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    user.credits += parseInt(amount) || 0;
    markDbDirty();
    res.json({ message: 'Créditos adicionados.', user: { id: user.id, credits: user.credits } });
});

// Liberação exclusiva de Plano Família (exige Gmail do cliente e senha do Admin)
app.post('/api/admin/family-activate', requireAuth, requireAdmin, (req, res) => {
    const { targetEmail, adminPassword } = req.body;
    if (!targetEmail || !adminPassword) {
        return res.status(400).json({ error: 'Informe o Gmail do cliente e a sua senha de Administrador.' });
    }

    // Validar a senha do Administrador que está fazendo a liberação
    const isPasswordValid = bcrypt.compareSync(adminPassword, req.user.passwordHash);
    if (!isPasswordValid) {
        return res.status(401).json({ error: '❌ Senha de Administrador incorreta! Liberação cancelada por segurança.' });
    }

    const cleanEmail = targetEmail.trim().toLowerCase();
    const user = db.users.find(u => u.email.toLowerCase() === cleanEmail);
    if (!user) {
        return res.status(404).json({ error: `❌ Conta com o email "${cleanEmail}" não foi encontrada. O cliente precisa criar a conta primeiro!` });
    }

    // Ativar o Plano Família
    const now = new Date();
    user.plan = 'family';
    user.credits = PLANS['family'].credits; // 999999 créditos
    user.lastRestore = now.toISOString().split('T')[0];
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    user.planExpiresAt = expires.toISOString();

    // Registrar chave de auditoria
    const familyKey = `FAMILIA-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    db.licenses.push({
        key: familyKey,
        plan: 'family',
        credits: PLANS['family'].credits,
        createdBy: req.user.id,
        redeemedBy: user.id,
        redeemedAt: now.toISOString(),
        isUsed: true
    });

    markDbDirty();
    console.log(`👨‍👩‍👧‍👦 PLANO FAMÍLIA LIBERADO: ${user.name} (${user.email}) pelo Admin`);

    res.json({
        message: `✅ Plano Família liberado com sucesso para ${user.name} (${user.email})! Créditos infinitos por 1 ano.`,
        key: familyKey,
        user: { id: user.id, name: user.name, email: user.email, plan: user.plan, credits: user.credits }
    });
});

// Backup completo de contas e dados (Admin)
app.get('/api/admin/backup', requireAuth, requireAdmin, (req, res) => {
    res.json({
        exportDate: new Date().toISOString(),
        users: db.users,
        licenses: db.licenses,
        sites: db.sites,
        stats: db.stats
    });
});

// Restaurar backup de contas e dados (Admin)
app.post('/api/admin/restore', requireAuth, requireAdmin, (req, res) => {
    const { backup } = req.body;
    if (!backup || !Array.isArray(backup.users)) {
        return res.status(400).json({ error: 'Arquivo ou formato de backup inválido.' });
    }

    let count = 0;
    backup.users.forEach(imported => {
        const idx = db.users.findIndex(u => u.email.toLowerCase() === imported.email.toLowerCase());
        if (idx >= 0) {
            // Se já existe e não for o admin logado, atualiza
            if (db.users[idx].id !== req.user.id) {
                db.users[idx] = imported;
                count++;
            }
        } else {
            db.users.push(imported);
            count++;
        }
    });

    if (Array.isArray(backup.licenses)) {
        backup.licenses.forEach(l => {
            if (!db.licenses.some(e => e.key === l.key)) db.licenses.push(l);
        });
    }

    if (Array.isArray(backup.sites)) {
        backup.sites.forEach(s => {
            if (!db.sites.some(e => e.slug === s.slug)) db.sites.push(s);
        });
    }

    markDbDirty();
    res.json({ message: `✅ Sucesso! ${count} contas sincronizadas/restauradas com sucesso.` });
});

// ============================================================
// 6. Cloudflare Tunnel — Acesso mundial automático
// ============================================================
let activeTunnel = null;
let tunnelProcess = null;

function startCloudflareTunnel() {
    return new Promise((resolve) => {
        const { spawn } = require('child_process');
        
        console.log('🌍 Iniciando Cloudflare Tunnel para acesso mundial...');
        
        // Encontrar npx.cmd no PATH
        const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
        
        const proc = spawn(npxCmd, ['cloudflared', 'tunnel', '--url', `http://localhost:${PORT}`], {
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
        });

        tunnelProcess = proc;
        let resolved = false;

        const checkUrl = (data) => {
            const text = data.toString();
            const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
            if (match && !resolved) {
                resolved = true;
                activeTunnel = match[0];
                console.log('');
                console.log('🌐 ════════════════════════════════════════════════');
                console.log(`🌐  LINK MUNDIAL: ${activeTunnel}`);
                console.log('🌐 ════════════════════════════════════════════════');
                console.log('');
                console.log('📱 Qualquer pessoa no mundo pode acessar esse link!');
                console.log('🔑 Contas são salvas no servidor — funciona em qualquer dispositivo.');
                console.log('');
                resolve(activeTunnel);
            }
        };

        proc.stdout.on('data', checkUrl);
        proc.stderr.on('data', checkUrl);

        proc.on('error', (err) => {
            console.error('❌ Erro ao iniciar túnel:', err.message);
            if (!resolved) { resolved = true; resolve(null); }
        });

        proc.on('close', (code) => {
            console.log('🔌 Túnel Cloudflare encerrado (código:', code, ')');
            activeTunnel = null;
            tunnelProcess = null;
            
            // Reconectar automaticamente em 5 segundos
            setTimeout(() => {
                console.log('🔄 Reconectando túnel...');
                startCloudflareTunnel();
            }, 5000);
        });

        // Timeout de 20 segundos
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                console.log('⚠️  Timeout do túnel. Servidor rodando apenas em localhost.');
                resolve(null);
            }
        }, 20000);
    });
}

// Endpoint para obter status do túnel
app.get('/api/tunnel/status', (req, res) => {
    res.json({ url: activeTunnel, active: !!activeTunnel });
});

// Iniciar túnel manualmente (se parou)
app.post('/api/tunnel/start', requireAuth, requireAdmin, async (req, res) => {
    if (activeTunnel) return res.json({ url: activeTunnel, message: 'Túnel já está ativo.' });
    const url = await startCloudflareTunnel();
    res.json({ url, message: url ? 'Túnel iniciado!' : 'Falha ao iniciar túnel.' });
});

// ============================================================
// 7. Servir arquivos estáticos e sites hospedados
// ============================================================
app.use(express.static(PUBLIC_DIR));

// Express 5 regex route compat: /^\/s\/([^\/]+)(?:\/(.*))?$/
app.get(/^\/s\/([^\/]+)(?:\/(.*))?$/, (req, res) => {
    const slug = req.params[0];
    const filepath = req.params[1] || 'index.html';
    
    // Incrementar contador de visitas
    db.stats.visits += 1;
    markDbDirty();
    const siteDir = path.join(SITES_DIR, slug);
    const fullPath = path.resolve(siteDir, filepath);

    // Evitar Path Traversal
    if (!fullPath.startsWith(path.resolve(siteDir))) {
        return res.status(403).send('Acesso Negado');
    }

    // Verificar se arquivo existe
    if (!fs.existsSync(fullPath)) {
        return res.status(404).send(`
            <!DOCTYPE html>
            <html><head><title>404</title></head>
            <body style="background:#0f172a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
                <div style="text-align:center;">
                    <h1 style="font-size:4em;margin:0;">404</h1>
                    <p style="color:#94a3b8;">Página não encontrada</p>
                    <a href="/" style="color:#6366f1;">Voltar ao DropHost Pro</a>
                </div>
            </body></html>
        `);
    }

    const ext = path.extname(fullPath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

    // Cache RAM — resposta instantânea
    if (fileCache.has(fullPath)) {
        const cached = fileCache.get(fullPath);
        const etag = `"${Buffer.byteLength(cached)}"`;
        
        if (req.headers['if-none-match'] === etag) {
            return res.status(304).end();
        }
        
        res.setHeader('Content-Type', mimeType);
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.send(cached);
    }

    // Ler do disco e cachear
    try {
        const fileData = fs.readFileSync(fullPath);
        
        if (fileData.length < 5 * 1024 * 1024) {
            fileCache.set(fullPath, fileData);
            currentCacheSize += fileData.length;
            if (currentCacheSize > MAX_CACHE_SIZE) {
                fileCache.clear();
                currentCacheSize = 0;
            }
        }

        const etag = `"${fileData.length}"`;
        res.setHeader('Content-Type', mimeType);
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.send(fileData);
    } catch (err) {
        res.status(500).send('Erro Interno do Servidor');
    }
});

// ============================================================
// SISTEMA DE RESTAURAÇÃO DIÁRIA E EXPIRAÇÃO DE PLANOS
// Roda a cada 1 hora para verificar:
// 1. Se um novo dia começou → restaura créditos dos planos pagos
// 2. Se algum plano expirou → rebaixa para Free
// ============================================================
function runDailyRestore() {
    const today = new Date().toISOString().split('T')[0];
    let changed = false;

    db.users.forEach(user => {
        const planInfo = PLANS[user.plan];
        if (!planInfo) return;

        // Verificar expiração do plano
        if (user.planExpiresAt && new Date(user.planExpiresAt) < new Date()) {
            console.log(`⏰ Plano expirado: ${user.name} (${user.email}) — ${user.plan} → free`);
            user.plan = 'free';
            user.credits = 0; // Créditos acabam quando o plano expira
            user.planExpiresAt = null;
            user.lastRestore = today;
            changed = true;
            return;
        }

        // Restauração diária (apenas planos pagos com dailyRestore)
        if (planInfo.dailyRestore && user.lastRestore !== today) {
            console.log(`🔄 Restauração diária: ${user.name} — ${planInfo.credits} créditos`);
            user.credits = planInfo.credits;
            user.lastRestore = today;
            changed = true;
        }
    });

    if (changed) markDbDirty();
}

// Rodar ao iniciar e a cada 1 hora
runDailyRestore();
setInterval(runDailyRestore, 60 * 60 * 1000);

// Manipulador de erros global
app.use((err, req, res, next) => {
    console.error('❌ Erro global:', err.stack);
    res.status(500).json({ error: 'Algo deu errado!' });
});

// ============================================================
// Inicialização do Servidor
// ============================================================
app.listen(PORT, '0.0.0.0', async () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║         🚀 DropHost Pro — Servidor Ativo        ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  💻 Porta:   ${PORT}                                ║`);
    console.log(`║  🌐 Modo:    ${CLOUD_MODE ? 'Cloud (24/7)' : 'Local + Túnel'}                  ║`);
    console.log('║  🧠 Cache:   100MB RAM | ETag + Gzip            ║');
    console.log('║  🔐 Auth:    JWT + bcrypt                       ║');
    console.log('║  💰 Créditos: Sistema ativo                     ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
    console.log('👑 Admin: admin@drophost.com / admin123');
    console.log('');

    if (CLOUD_MODE) {
        console.log('☁️  Modo Cloud ativo — servidor acessível pelo IP público.');
    } else {
        // Iniciar túnel Cloudflare apenas no modo local
        await startCloudflareTunnel();
    }
});

// Limpar túnel ao sair
process.on('SIGINT', () => {
    if (tunnelProcess) tunnelProcess.kill();
    // Salvar DB antes de sair
    try {
        fs.writeFileSync(DB_USERS, JSON.stringify(db.users, null, 2));
        fs.writeFileSync(DB_LICENSES, JSON.stringify(db.licenses, null, 2));
        fs.writeFileSync(DB_SITES, JSON.stringify(db.sites, null, 2));
        fs.writeFileSync(DB_STATS, JSON.stringify(db.stats, null, 2));
    } catch (e) {}
    process.exit();
});
