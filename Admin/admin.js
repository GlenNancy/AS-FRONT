// admin.js - adaptado ao seu /api/Users e /api/enquete
(function () {
    const API_BASE = localStorage.getItem('api_base') || 'https://as-api-eegt.onrender.com';
    const TOKEN_KEY = 'token';
    const token = localStorage.getItem(TOKEN_KEY);

    const $ = id => document.getElementById(id);
    function authHeader() { return token ? { 'Authorization': 'Bearer ' + token } : {}; }

    if (!token) {
        // sem token: volta pra página pública (mesma lógica do seu index)
        window.location.href = '../index.html';
        throw new Error('Sem token');
    }

    async function fetchJson(url) {
        try {
            const res = await fetch(url, { headers: { 'Content-Type': 'application/json', ...authHeader() } });
            if (!res.ok) {
                console.warn('fetch error', url, res.status);
                return null;
            }
            return await res.json();
        } catch (e) {
            console.warn('fetch failed', url, e);
            return null;
        }
    }

    // tenta buscar perguntas (para mostrar texto da pergunta ao invés de só perguntaId)
    async function loadPerguntasMap() {
        const enq = await fetchJson(`${API_BASE}/api/enquete`);
        // enq pode ser array de pesquisas; cada pesquisa tem perguntas (ou Perguntas)
        const map = {};
        if (!Array.isArray(enq)) return map;
        enq.forEach(pesq => {
            const perguntas = pesq.perguntas || pesq.Perguntas || pesq.perguntaEnquete || [];
            (perguntas || []).forEach(q => {
                const qObj = q.titulo || q.Texto || q.texto || q.Titulo ? q : (q.Pergunta || q.pergunta || q.Question || q.QuestionText ? (q.Pergunta || q.pergunta || q.Question) : q);
                const id = qObj.id ?? qObj.Id ?? qObj.perguntaId ?? qObj.PerguntaId;
                const texto = qObj.titulo || qObj.Titulo || qObj.Texto || qObj.texto || qObj.question || qObj.questionText || `Pergunta ${id || '?'}`;
                if (id !== undefined && id !== null) map[String(id)] = texto;
            });
        });
        return map;
    }

    // substitua a função drawChart por esta drawPie
    function drawPie(canvas, completed, total) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width = canvas.clientWidth;
        const h = canvas.height = canvas.clientHeight;
        ctx.clearRect(0, 0, w, h);

        // valores seguros
        completed = Number(completed) || 0;
        total = Number(total) || 0;
        const remaining = Math.max(0, total - completed);
        const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

        // centro e raio
        const cx = Math.floor(w / 2);
        const cy = Math.floor(h / 2);
        const radius = Math.min(w, h) * 0.32;

        // ângulos
        const start = -Math.PI / 2;
        const completedAngle = total === 0 ? 0 : (completed / total) * Math.PI * 2;
        const midAngle = start + completedAngle;

        // slice 'completed' (cor principal)
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, start, midAngle, false);
        ctx.closePath();
        ctx.fillStyle = 'rgba(77,168,255,0.95)';
        ctx.fill();

        // slice 'remaining'
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, midAngle, start + Math.PI * 2, false);
        ctx.closePath();
        ctx.fillStyle = 'rgba(70,78,86,0.45)';
        ctx.fill();

        // pequeno círculo interno para dar 'donut'
        const innerR = radius * 0.6;
        ctx.beginPath();
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg') || '#0B0B0D';
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
        ctx.fill();

        // texto central: "60 / 120" e "% 50"
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = '600 18px Arial';
        ctx.fillText(`${completed} / ${total}`, cx, cy - 6);
        ctx.font = '500 13px Arial';
        ctx.fillStyle = '#9fbfe8';
        ctx.fillText(`${percent}% Concluídos`, cx, cy + 16);

        // legenda simples abaixo do gráfico (desenhada no próprio canvas)
        const legendY = h - 18;
        const boxSize = 10;
        const padLeft = 12;
        // completed legend
        ctx.fillStyle = 'rgba(77,168,255,0.95)';
        ctx.fillRect(padLeft, legendY - boxSize + 2, boxSize, boxSize);
        ctx.fillStyle = '#fff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`Concluídos: ${completed}`, padLeft + boxSize + 8, legendY + 2);
        // remaining legend
        const remX = padLeft + 140;
        ctx.fillStyle = 'rgba(70,78,86,0.45)';
        ctx.fillRect(remX, legendY - boxSize + 2, boxSize, boxSize);
        ctx.fillStyle = '#fff';
        ctx.fillText(`Incompleto: ${remaining}`, remX + boxSize + 8, legendY + 2);
    }


    function renderRespondents(container, users, questionMap) {
        container.innerHTML = '';
        const sorted = users.sort((a, b) => b.count - a.count);
        sorted.forEach(u => {
            const div = document.createElement('div');
            div.className = 'item';
            const displayName = u.nome || u.name || u.email || u.id || u.userId;
            div.innerHTML = `<div><strong>${u.count}</strong> respostas</div><div class="small">${escapeHtml(displayName)}</div>`;
            div.addEventListener('click', () => showDetails(u, questionMap));
            container.appendChild(div);
        });
        return sorted;
    }

    function showDetails(user, qmap) {
        $('respondentName').textContent = user.nome || user.name || user.email || `id: ${user.id || user.userId}`;
        const answersNode = $('answersList');
        answersNode.innerHTML = '';
        const respostas = user.respostas || user.Respostas || [];
        if (!respostas.length) {
            answersNode.textContent = 'Nenhuma resposta encontrada para este usuário.';
            return;
        }
        respostas.forEach((r, i) => {
            const pid = r.perguntaId ?? r.PerguntaId ?? r.pergunta?.id ?? r.pergunta?.PerguntaId;
            const qText = (pid !== undefined && qmap && qmap[String(pid)]) ? qmap[String(pid)] : (r.pergunta?.texto || `Pergunta ${pid ?? (i + 1)}`);
            const ans = r.texto || r.Texto || r.answer || r.resposta || '-';
            const el = document.createElement('div');
            el.style.padding = '8px 0';
            el.innerHTML = `<div style="font-weight:600;color:white">${escapeHtml(String(qText))}</div><div class="small">${escapeHtml(String(ans))}</div><hr style="border:none;border-top:1px solid rgba(255,255,255,0.02);margin:8px 0">`;
            answersNode.appendChild(el);
        });
    }

    async function loadData() {
        // 1) get all users
        const users = await fetchJson(`${API_BASE}/api/Users`);
        if (!Array.isArray(users)) {
            alert('Falha ao buscar /api/Users — ver console.');
            console.warn('expected array from /api/Users, got:', users);
            $('completedCount').textContent = '0';
            $('totalAnswers').textContent = '0';
            return;
        }

        // 2) try carregar perguntas para mapear ids -> texto
        const questionMap = await loadPerguntasMap();

        // 3) normaliza users (cada user tem .respostas array conforme exemplo)
        const normalized = users.map(u => {
            const respostas = u.respostas || u.Respostas || [];
            const count = Array.isArray(respostas) ? respostas.length : 0;
            return {
                id: u.id || u.userId || u._id || Math.random().toString(36).slice(2, 8),
                nome: u.nome || u.name || u.email || `User ${u.id || ''}`,
                respostas,
                count
            };
        });

        // calcula totais e quem completou (responderam todas as perguntas)
        const totalAnswers = normalized.reduce((s, u) => s + u.count, 0);
        const maxAnswers = normalized.reduce((m, u) => Math.max(m, u.count), 0);
        const completed = normalized.filter(u => u.count === maxAnswers).length;
        const totalUsers = normalized.length;

        // atualiza UI
        $('completedCount').textContent = completed;
        $('totalAnswers').textContent = totalAnswers;

        // render lista de respondentes
        const usersSorted = renderRespondents($('respondents'), normalized, questionMap);

        // desenha pizza com total de usuários e quantos responderam tudo
        drawPie($('chart'), completed, totalUsers);
    }


    // logout
    $('btnLogout').addEventListener('click', () => {
        localStorage.removeItem(TOKEN_KEY);
        window.location.href = '../index.html';
    });

    // utility
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>"']/g, s => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[s]));
    }

    // start
    loadData();

    document.getElementById('btnRefresh').addEventListener('click', () => {
        const btn = document.getElementById('btnRefresh');
        btn.innerText = "Atualizando...";
        btn.disabled = true;

        loadData().then(() => {
            btn.innerText = "Atualizar dados";
            btn.disabled = false;
        });
    });
})();
