/**
 * Vex AI Chat Widget — DropHost Tech
 * Assistente virtual integrado para o site
 */

(function () {
    const chatHistory = [];
    let isOpen = false;

    // Elementos DOM
    let container, windowEl, toggleBtn, closeBtn, messagesEl, formEl, inputEl, chipsEl;

    function init() {
        container = document.getElementById('vex-widget-container');
        windowEl = document.getElementById('vex-chat-window');
        toggleBtn = document.getElementById('btn-toggle-vex');
        closeBtn = document.getElementById('btn-close-vex');
        messagesEl = document.getElementById('vex-messages');
        formEl = document.getElementById('vex-chat-form');
        inputEl = document.getElementById('vex-input');
        chipsEl = document.getElementById('vex-quick-actions');

        if (!container || !windowEl || !toggleBtn) return;

        // Toggle Abrir / Fechar
        toggleBtn.addEventListener('click', toggleChat);
        closeBtn.addEventListener('click', closeChat);

        // Envio de formulário
        formEl.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = inputEl.value.trim();
            if (!text) return;
            inputEl.value = '';
            sendMessage(text);
        });

        // Quick Chips
        chipsEl.querySelectorAll('.vex-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const text = chip.innerText.replace(/^[^\w\s]+/, '').trim();
                if (text.includes('WhatsApp')) {
                    window.open('https://wa.me/5575987016246?text=Ol%C3%A1%20Kauan%21%20Vim%20pelo%20site%20DropHost%20Tech%20e%20quero%20falar%20com%20voc%C3%AA%21', '_blank');
                    return;
                }
                if (text.includes('Ver Planos')) {
                    sendMessage('Quais são os planos e preços reais?');
                    return;
                }
                sendMessage(chip.innerText);
            });
        });

        // Mensagem inicial de boas-vindas do Vex
        addMessage('model', `Fala! Eu sou **o Vex**, o consultor virtual do **DropHost Tech**! 🚀\n\nPosso te ajudar com dúvidas sobre como publicar seus sites, explicar os planos, preços ou te conectar com o **Kauan** para ativar sua licença no PIX.\n\nComo posso te ajudar hoje?`);
    }

    function toggleChat() {
        isOpen ? closeChat() : openChat();
    }

    function openChat() {
        isOpen = true;
        windowEl.classList.remove('hidden');
        windowEl.classList.add('flex');
        inputEl.focus();
        scrollToBottom();
    }

    function closeChat() {
        isOpen = false;
        windowEl.classList.add('hidden');
        windowEl.classList.remove('flex');
    }

    function scrollToBottom() {
        setTimeout(() => {
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }, 50);
    }

    function formatText(text) {
        // Converte quebras de linha e negrito markdown
        let safe = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Negritos **texto**
        safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>');
        safe = safe.replace(/\*(.*?)\*/g, '<em class="text-slate-300">$1</em>');

        // Quebras de linha
        safe = safe.replace(/\n/g, '<br/>');

        return safe;
    }

    function addMessage(sender, text) {
        const isUser = sender === 'user';
        const msgDiv = document.createElement('div');
        msgDiv.className = `flex flex-col ${isUser ? 'items-end' : 'items-start'} animate-fadeInUp`;

        const bubble = document.createElement('div');
        bubble.className = `max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
            isUser
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-br-none shadow-md'
                : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-bl-none shadow-lg'
        }`;

        bubble.innerHTML = formatText(text);

        // Se o Vex sugerir WhatsApp ou PIX com o Kauan, adiciona botão direto
        if (!isUser && (text.includes('Kauan') || text.includes('PIX') || text.includes('WhatsApp'))) {
            const btn = document.createElement('a');
            btn.href = 'https://wa.me/5575987016246?text=Ol%C3%A1%20Kauan%21%20Vim%20pelo%20site%20DropHost%20Tech%20e%20quero%20falar%20com%20voc%C3%AA%20sobre%20as%20licen%C3%A7as%21';
            btn.target = '_blank';
            btn.className = 'mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow-md transition-transform hover:scale-105';
            btn.innerHTML = `<span>📲 Falar com o Kauan no WhatsApp</span>`;
            bubble.appendChild(btn);
        }

        msgDiv.appendChild(bubble);
        messagesEl.appendChild(msgDiv);
        scrollToBottom();

        chatHistory.push({ sender, text });
    }

    async function sendMessage(text) {
        addMessage('user', text);

        // Indicador de "Vex digitando..."
        const typingIndicator = document.createElement('div');
        typingIndicator.id = 'vex-typing';
        typingIndicator.className = 'flex items-center gap-1 p-2 bg-slate-800/60 rounded-xl w-14 text-indigo-400';
        typingIndicator.innerHTML = `
            <span class="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style="animation-delay:0s"></span>
            <span class="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style="animation-delay:0.2s"></span>
            <span class="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style="animation-delay:0.4s"></span>
        `;
        messagesEl.appendChild(typingIndicator);
        scrollToBottom();

        try {
            const res = await fetch('/api/vex/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, history: chatHistory })
            });

            const data = await res.json();
            typingIndicator.remove();

            if (data.reply) {
                addMessage('model', data.reply);
            } else {
                addMessage('model', 'Ops, tive um imprevisto na resposta. Fale com o Kauan no WhatsApp!');
            }
        } catch (err) {
            typingIndicator.remove();
            addMessage('model', 'Conexão oscilou. Você pode chamar o Kauan diretamente no WhatsApp pelo botão abaixo!');
        }
    }

    // Inicializa quando o DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
