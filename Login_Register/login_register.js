const API_BASE = "http://localhost:5250"; // ajuste se necessário

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

// LOGIN handler (mantive seu fluxo original, com pequenas melhorias)
formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginMsg.textContent = '';
    const nome = qs('#login-nome').value.trim();
    const senha = qs('#login-senha').value;
    if (!nome || !senha) { loginMsg.textContent = 'Preencha nome e senha.'; return; }

    try {
        const password = senha; // enviar senha em texto (backend fará hash se for o caso)

        const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, password })
        });

        const body = await safeJson(res);
        if (!res.ok) {
            loginMsg.textContent = body && body.Mensagem ? body.Mensagem : (body && body.message) || 'Falha ao autenticar';
            return;
        }

        const token = body && (body.token || body.Token || body.tokenJwt || body.accessToken);
        if (!token) {
            loginMsg.textContent = 'Autenticado, mas token não retornado pelo servidor.';
            return;
        }

        localStorage.setItem('token', token);
        window.location.href = '../Main/main.html';

    } catch (err) {
        console.error(err);
        loginMsg.textContent = 'Erro de rede. Veja console.';
    }
});

// REGISTER handler — agora faz login automático após registrar
formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    regMsg.textContent = '';
    const nome = qs('#reg-nome').value.trim();
    const email = qs('#reg-email').value.trim();
    const senha = qs('#reg-senha').value;
    if (!nome || !email || !senha) { regMsg.textContent = 'Preencha todos os campos.'; return; }

    // UI lock
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
            return;
        }

        // se o register já retornar token, usar diretamente
        const registerToken = body && (body.token || body.Token || body.accessToken);
        if (registerToken) {
            localStorage.setItem('token', registerToken);
            // redireciona direto para main
            window.location.href = '../Main/main.html';
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
            // falha ao logar automaticamente: mostrar mensagem e direcionar para tela de login
            regMsg.textContent = loginBody && loginBody.Mensagem ? loginBody.Mensagem : (loginBody && loginBody.message) || 'Conta criada, mas falha ao efetuar login automático. Faça login manualmente.';
            // abrir aba de login para que usuário possa entrar manualmente
            setTimeout(() => showTab('login'), 1400);
            return;
        }

        const token = loginBody && (loginBody.token || loginBody.Token || loginBody.tokenJwt || loginBody.accessToken);
        if (!token) {
            regMsg.textContent = 'Conta criada, porém token não retornado no login automático.';
            setTimeout(() => showTab('login'), 1400);
            return;
        }

        // sucesso: guarda token e redireciona
        localStorage.setItem('token', token);
        window.location.href = '../Main/main.html';

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

// se já tiver token redireciona direto
(function init() {
    const token = localStorage.getItem('token');
    if (token) {
        // já logado -> envia para main
        window.location.href = '../Main/main.html';
    }
})();
