const API_BASE = "https://as-api-eegt.onrender.com";
const TOKEN = localStorage.getItem("token"); // ajuste se você usa outro local

function mostrarPesquisa() {
    const secao = document.getElementById('pesquisas');
    secao.classList.add('show');

    // garante que o display:block seja aplicado antes da rolagem
    setTimeout(() => {
        secao.scrollIntoView({ behavior: 'smooth' });
    }, 50);
}

// Monitorar mudança nas respostas
document.addEventListener("input", (e) => {
    if (e.target.classList.contains("pergunta")) {
        validarPerguntas();
    }
});

async function carregarPesquisas() {
    try {
        const res = await fetch(`${API_BASE}/api/enquete`, {
            method: "GET",
            headers: { "Content-Type": "application/json", "Authorization": TOKEN ? "Bearer " + TOKEN : "" }
        });

        const pesquisas = await res.json();
        const container = document.getElementById("pesquisas");
        container.innerHTML = "";

        pesquisas.forEach((pesquisa, index) => {
            const sec = document.createElement("section");
            sec.style.marginTop = "22px";
            sec.id = `pesquisa_index_${index}`;

            sec.innerHTML = `
                <div class="card">
                    <h3>${escapeHtml(getField(pesquisa, ['titulo', 'Titulo']))}</h3>
                    <p class="muted">${escapeHtml(getField(pesquisa, ['descricao', 'Descricao']))}</p>

                    <div class="q-grid" style="margin-top:12px;">
                        ${renderizarPerguntas(pesquisa.perguntas || pesquisa.Perguntas || pesquisa.perguntaEnquete || [])}
                    </div>

                    <div style="margin-top:14px; display:flex; gap:10px; align-items:center;">
                        <button class="botao" id="salvar_tudo_${index}">Salvar tudo</button>
                        <div class="muted">Suas respostas serão salvas no servidor.</div>
                    </div>
                </div>
            `;

            container.appendChild(sec);

            document.getElementById(`salvar_tudo_${index}`).onclick = () => salvarTudoDaPesquisaIndex(index);
            initHandlersParaSecao(sec); // adiciona debounce/autosave opcional
        });
    } catch (err) {
        console.error("Erro ao carregar pesquisas", err);
        document.getElementById("pesquisas").innerHTML = `<p class="muted">Falha ao carregar pesquisas. Veja console.</p>`;
    }
}

/* Render perguntas - mantém data-pergunta-id (útil para salvar) */
function renderizarPerguntas(perguntas) {
    if (!perguntas || perguntas.length === 0) {
        return `<p class="muted">Nenhuma pergunta cadastrada para esta pesquisa.</p>`;
    }

    return perguntas.map((p, i) => {
        const q = normalizePerguntaObject(p);
        const qId = q.id ?? q.Id ?? q.perguntaId ?? q.PerguntaId ?? `idx_${i}`;

        // Texto principal da pergunta (vem de Texto/Text)
        const titulo = getField(q, ['titulo', 'Titulo', 'Texto', 'texto']) || `Pergunta ${i + 1}`;

        // Aqui pegamos o TextoProvocativo ou Descricao, se existir
        const descricao = getField(q, [
            'descricao',
            'Descricao',
            'textoProvocativo',
            'TextoProvocativo'
        ]) || "";

        return `
        <div class="q-card" style="margin-bottom:12px;">
            <h4>${i + 1}. ${escapeHtml(titulo)}</h4>
            ${descricao ? `<p class="muted" style="margin:4px 0 10px 0;">${escapeHtml(descricao)}</p>` : ''}
            <textarea placeholder="Escreva sua resposta..." data-pergunta-id="${escapeHtml(String(qId))}" data-resposta-id="" data-dirty="false"></textarea>
            <div class="save-indicator" style="font-size:12px; margin-top:6px; display:none;">...</div>
        </div>
        `;
    }).join("");
}

/* Inicializa handlers (autosave opcional e marca dirty) */
function initHandlersParaSecao(secElement) {
    const textareas = secElement.querySelectorAll("textarea[data-pergunta-id]");
    textareas.forEach(t => {
        // marca dirty ao digitar
        let debounceTimer = null;
        t.addEventListener("input", (e) => {
            t.dataset.dirty = "true";
            // debounce opcional: salva automaticamente após 1.5s de inatividade
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                if (t.value.trim()) salvarRespostaIndividual(t);
            }, 1500);
        });

        // ao sair do campo tenta salvar (opcional)
        t.addEventListener("blur", (e) => {
            if (t.value.trim()) salvarRespostaIndividual(t);
        });
    });
}

/* Salva uma resposta individual: se data-resposta-id existe faz PUT, senão POST */
async function salvarRespostaIndividual(textareaEl) {
    const perguntaId = parseInt(textareaEl.dataset.perguntaId.toString().replace(/^idx_/, ""), 10) || textareaEl.dataset.perguntaId;
    const respostaId = textareaEl.dataset.respostaId ? parseInt(textareaEl.dataset.respostaId, 10) : null;
    const texto = textareaEl.value ?? "";
    const indicator = textareaEl.parentElement.querySelector(".save-indicator");
    indicator.style.display = "inline";
    indicator.textContent = "Salvando...";
    textareaEl.dataset.saving = "true";

    try {
        if (respostaId) {
            // atualizar
            const res = await fetch(`${API_BASE}/api/respostas/${respostaId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": TOKEN ? "Bearer " + TOKEN : ""
                },
                body: JSON.stringify({ Texto: texto })
            });

            if (!res.ok) {
                const txt = await res.text();
                console.warn("Erro ao atualizar resposta:", res.status, txt);
                indicator.textContent = "Erro ao salvar";
                setTimeout(() => indicator.style.display = "none", 1200);
                textareaEl.dataset.saving = "false";
                return { ok: false, status: res.status, text: txt };
            }

            indicator.textContent = "Salvo";
            textareaEl.dataset.dirty = "false";
            setTimeout(() => indicator.style.display = "none", 900);
            return { ok: true };
        } else {
            // criar
            const res = await fetch(`${API_BASE}/api/respostas`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": TOKEN ? "Bearer " + TOKEN : ""
                },
                body: JSON.stringify({ PerguntaId: perguntaId, Texto: texto })
            });

            const body = await safeParseJson(res);
            if (res.ok) {
                // tenta obter id retornado
                const newId = body && (body.Id ?? body.id ?? body.IdResposta ?? body.idResposta);
                if (newId) textareaEl.dataset.respostaId = newId;
                indicator.textContent = "Salvo";
                textareaEl.dataset.dirty = "false";
                setTimeout(() => indicator.style.display = "none", 900);
                return { ok: true, created: true, id: newId };
            } else {
                console.warn("Erro ao criar resposta:", res.status, body);
                indicator.textContent = body && body.Mensagem ? body.Mensagem : "Erro ao salvar";
                setTimeout(() => indicator.style.display = "none", 1500);
                return { ok: false, status: res.status, body };
            }
        }
    } catch (err) {
        console.error("Falha ao salvar resposta:", err);
        indicator.textContent = "Erro de rede";
        setTimeout(() => indicator.style.display = "none", 1500);
        return { ok: false, error: err };
    } finally {
        textareaEl.dataset.saving = "false";
    }
}

/* Helpers de utilidade */
function getField(obj, keys) {
    if (!obj) return null;
    for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null) return obj[k];
        const lower = Object.keys(obj || {}).find(x => x.toLowerCase() === k.toLowerCase());
        if (lower) return obj[lower];
    }
    return null;
}

function normalizePerguntaObject(p) {
    if (!p) return {};
    if (p.titulo || p.texto || p.descricao || p.id || p.Id || p.question) return p;
    for (const key of Object.keys(p)) {
        if (key.toLowerCase().includes('pergunta') || key.toLowerCase().includes('question')) {
            const inner = p[key];
            if (inner && typeof inner === 'object') return inner;
        }
    }
    if (p.Pergunta && typeof p.Pergunta === 'object') return p.Pergunta;
    if (p.pergunta && typeof p.pergunta === 'object') return p.pergunta;
    return p;
}

async function safeParseJson(response) {
    try {
        return await response.json();
    } catch {
        try { return await response.text(); } catch { return null; }
    }
}

function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/[&<>"']/g, s => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[s]));
}

/* inicializa */
carregarPesquisas();

// botão de logout
document.getElementById("btnLogout")?.addEventListener("click", () => {
    localStorage.removeItem("token");
    window.location.href = "Login_Register/login_register.html";
});

// bloqueio de acesso sem token
if (!TOKEN) {
    window.location.href = "../Login_Register/login_register.html";
}


// ======== Gerar acesso por email (Front) ========

function getToken() {
    return localStorage.getItem('token') || null;
}

// pega o userId do JWT
function getUserIdFromToken() {
    const token = getToken();
    if (!token) return null;
    try {
        const parts = token.split('.');
        if (parts.length < 2) return null;
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        return payload.nameid
            || payload.sub
            || payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier']
            || null;
    } catch (e) {
        console.warn("Não foi possível decodificar token:", e);
        return null;
    }
}

async function gerarAcesso() {
    const token = getToken();
    const userId = getUserIdFromToken();

    if (!userId) {
        return {
            ok: false,
            status: 400,
            body: { mensagem: "Não foi possível identificar o usuário logado." }
        };
    }

    const body = { userId: parseInt(userId, 10) };

    const res = await fetch(`${API_BASE}/api/UserAcessos/gerar`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        },
        body: JSON.stringify(body)
    });

    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }

    return { ok: res.ok, status: res.status, body: parsed };
}



// hookup UI
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnGenerateAccess');
    const msg = document.getElementById('access-msg');

    if (!btn) return;

    btn.addEventListener('click', async () => {
        msg.textContent = "";
        btn.disabled = true;
        const oldText = btn.innerText;
        btn.innerText = "Gerando...";

        try {
            const result = await gerarAcesso();

            if (result.ok) {
                msg.textContent = result.body.mensagem || "Acesso gerado com sucesso. Veja abaixo.";
                renderAccessResult(result.body);
            } else {
                let userMsg = "Erro ao gerar acesso.";
                const body = result.body;
                if (body) {
                    if (typeof body === 'object') {
                        userMsg = body.mensagem || body.message || JSON.stringify(body);
                    } else {
                        userMsg = String(body);
                    }
                }
                msg.textContent = userMsg;
                console.warn("Resposta da API:", result);
            }
        } catch (err) {
            console.error(err);
            msg.textContent = "Erro de rede ao tentar gerar o acesso.";
        } finally {
            btn.disabled = false;
            btn.innerText = oldText;
        }
    });
});


function renderAccessResult(data) {
    const container = document.getElementById('access-result');
    if (!container) return;

    const login = data && (data.login || data.email || data.userName || data.usuario || "");
    const senha = data && (data.senha || data.password || data.senhaAcesso || data.senhaGerada || data.tokenAcesso);

    container.innerHTML = `
        <h5 class="access-result-title">Guarde bem esse acesso</h5>
        <p class="muted access-result-sub">
            Ele é exclusivo e pode não ser exibido novamente da mesma forma. Tire um print ou copie para um lugar seguro.
        </p>

        <div class="access-cred-box">
            <div class="access-field">
                <span class="access-field-label">Login</span>
                <div class="access-field-value">${escapeHtml(login)}</div>
            </div>
            <div class="access-field">
                <span class="access-field-label">Senha</span>
                <div class="access-field-value">
                    ${senha ? escapeHtml(String(senha)) : "<em>Senha não retornada pela API</em>"}
                </div>
            </div>
        </div>

        <p class="muted access-tip">
            ➜ Recomendamos salvar esse acesso em um gerenciador de senhas ou bloco de notas seguro.
        </p>
    `;

    container.classList.remove('hidden');
}
