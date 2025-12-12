const API_BASE = "https://as-api-eegt.onrender.com"; // ajuste se necessário

// Helpers
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

// UI toggle
const tabLogin = qs('#tab-login');
const tabRegister = qs('#tab-register');
const formLogin = qs('#form-login');
const formRegister = qs('#form-register');
const loginMsg = qs('#login-msg');
const regMsg = qs('#reg-msg');

tabLogin.addEventListener('click', () => { showTab('login'); });
tabRegister.addEventListener('click', () => { showTab('register'); });

function showTab(name) {
    if (name === 'login') {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        formLogin.classList.remove('hidden');
        formRegister.classList.add('hidden');
    } else {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        formRegister.classList.remove('hidden');
        formLogin.classList.add('hidden');
    }
}

// safe json parse
async function safeJson(res) {
    try { return await res.json(); } catch { return null; }
}

/* ========== ROLE / REDIRECT HELPERS ========== */

// decodifica o payload do JWT (sem verificar assinatura) e tenta retornar o claim de role
function getRoleFromToken(token) {
    if (!token) return null;
    try {
        // se for token literal 'Admin' / 'admin' tratamos fora
        const parts = token.split('.');
        if (parts.length < 2) return null;
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        const possible = [
            'role', 'roles', 'Role', 'Roles',
            'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
            'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/role'
        ];
        for (const k of possible) {
            if (payload[k] !== undefined && payload[k] !== null) return payload[k];
        }
        if (payload.claims && typeof payload.claims === 'object') {
            for (const k of possible) if (payload.claims[k]) return payload.claims[k];
        }
        return null;
    } catch (e) {
        // token pode não ser JWT — ignora
        return null;
    }
}

// decide para onde ir depois do login baseado na role
function redirectAfterLogin(token) {
    const adminPath = '../Admin/admin.html'; // ajuste se quiser '/Admin/admin.html'
    const mainPath = '../index.html';

    if (!token) { window.location.href = mainPath; return; }

    // token literal 'Admin' ou 'admin' => admin
    if (token === 'Admin' || token === 'admin') {
        window.location.href = adminPath;
        return;
    }

    const role = getRoleFromToken(token);
    if (!role) {
        // sem role detectada — vai pra main
        window.location.href = mainPath;
        return;
    }
    const roleLower = Array.isArray(role) ? String(role[0]).toLowerCase() : String(role).toLowerCase();
    if (roleLower === 'admin' || roleLower === 'administrator' || roleLower === 'adm') {
        window.location.href = adminPath;
    } else {
        window.location.href = mainPath;
    }
}

/* ========== LOGIN ========== */
formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginMsg.textContent = '';

    const nome = qs('#login-nome').value.trim();
    const senha = qs('#login-senha').value;
    if (!nome || !senha) { loginMsg.textContent = 'Preencha nome e senha.'; return; }

    // botão de submit do form de login
    const submitBtn = formLogin.querySelector('button[type="submit"]');
    const originalText = submitBtn ? submitBtn.innerText : null;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Logando…'; // texto mostrado enquanto autentica
        submitBtn.setAttribute('aria-busy', 'true');
    }

    try {
        const password = senha;

        const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, password })
        });

        const body = await safeJson(res);
        if (!res.ok) {
            loginMsg.textContent = body && body.Mensagem ? body.Mensagem : (body && body.message) || 'Falha ao autenticar';
            // restaura botão para permitir nova tentativa
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = originalText;
                submitBtn.removeAttribute('aria-busy');
            }
            return;
        }

        const token = body && (body.token || body.Token || body.tokenJwt || body.accessToken);
        if (!token) {
            loginMsg.textContent = 'Autenticado, mas token não retornado pelo servidor.';
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = originalText;
                submitBtn.removeAttribute('aria-busy');
            }
            return;
        }

        localStorage.setItem('token', token);
        // redireciona com base na role (vai navegar — não precisa restaurar o botão)
        redirectAfterLogin(token);

    } catch (err) {
        console.error(err);
        loginMsg.textContent = 'Erro de rede. Veja console.';
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = originalText;
            submitBtn.removeAttribute('aria-busy');
        }
    }
});


/* ========== REGISTER ========== */
formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    regMsg.textContent = '';
    const nome = qs('#reg-nome').value.trim();
    const email = qs('#reg-email').value.trim();
    const senha = qs('#reg-senha').value;
    if (!nome || !email || !senha) { regMsg.textContent = 'Preencha todos os campos.'; return; }

    const submitBtn = formRegister.querySelector('button[type="submit"]');
    const originalText = submitBtn ? submitBtn.innerText : null;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Criando conta...';
    }

    try {
        const password = senha;

        // 1) chamar register
        const res = await fetch(`${API_BASE}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, email, password })
        });

        const body = await safeJson(res);
        if (!res.ok) {
            regMsg.textContent = body && body.Mensagem ? body.Mensagem : (body && body.message) || 'Falha ao registrar';
            if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = originalText; }
            return;
        }

        // se o register já retornar token, usar diretamente
        const registerToken = body && (body.token || body.Token || body.accessToken);
        if (registerToken) {
            localStorage.setItem('token', registerToken);
            redirectAfterLogin(registerToken);
            return;
        }

        // 2) se register não retornou token: fazer login automático com as mesmas credenciais
        regMsg.textContent = 'Conta criada — realizando login automático...';

        const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, password })
        });

        const loginBody = await safeJson(loginRes);
        if (!loginRes.ok) {
            regMsg.textContent = loginBody && loginBody.Mensagem ? loginBody.Mensagem : (loginBody && loginBody.message) || 'Conta criada, mas falha ao efetuar login automático. Faça login manualmente.';
            setTimeout(() => showTab('login'), 1400);
            if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = originalText; }
            return;
        }

        const token = loginBody && (loginBody.token || loginBody.Token || loginBody.tokenJwt || loginBody.accessToken);
        if (!token) {
            regMsg.textContent = 'Conta criada, porém token não retornado no login automático.';
            setTimeout(() => showTab('login'), 1400);
            if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = originalText; }
            return;
        }

        localStorage.setItem('token', token);
        redirectAfterLogin(token);

    } catch (err) {
        console.error(err);
        regMsg.textContent = 'Erro de rede. Veja console.';
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = originalText;
        }
    }
});

/* inicialização: se já tiver token, redireciona conforme role */
(function init() {
    const t = localStorage.getItem('token');
    if (t) redirectAfterLogin(t);
})();
