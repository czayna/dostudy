import { get, post } from '../api.js';
import { $, $$, esc, md, toast, busy, openModal } from '../ui.js';
import { state, subjectName } from '../state.js';
import { showRecitation } from './files.js';

export const meta = { title: 'Tutor & Voice', sub: 'Ask the same question 10 times. Or just talk, hands-free. No judgment, ever.' };

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const MODES = {
  chat: ['💬 Patient tutor', 'Ask anything about your material'],
  socratic: ['🧭 Guided discovery', 'I ask small questions so you find the answer'],
  feynman: ['🧒 Explain it back', 'You teach me; I fill the gaps (Feynman technique)'],
  blitz: ['⚡ Flashcard blitz', 'Rapid-fire oral questions'],
  recitation: ['🙋 Cold-call rehearsal', 'Practice answering like the professor called on you'],
};
const pref = (k, d) => localStorage.getItem(`dostudy.${k}`) || d;

export async function render(root, { params }) {
  const files = await get('/files');
  let tab = ['chat', 'voice', 'recite'].includes(params.tab) ? params.tab : 'chat';
  let fileId = params.file ? Number(params.file) : (files[0]?.id || '');
  let mode = MODES[params.mode] ? params.mode : (tab === 'voice' && params.mode !== undefined ? 'feynman' : 'chat');
  let chatMsgs = [];
  let stopCall = () => {};

  const fileSelect = () => `<div class="field" style="min-width:260px"><label for="file">Study material</label><select id="file"><option value="">General (no file)</option>
    ${files.map((f) => `<option value="${f.id}" ${f.id === fileId ? 'selected' : ''}>${esc(subjectName(f.subject_id))} · ${esc(f.name)}</option>`).join('')}</select></div>`;
  const modeSelect = () => `<div class="field" style="min-width:260px"><label for="mode">How should we practice?</label><select id="mode">${Object.entries(MODES).filter(([k]) => tab === 'voice' || k === 'chat' || k === 'socratic' || k === 'feynman').map(([k, [t, d]]) => `<option value="${k}" ${k === mode ? 'selected' : ''}>${t}: ${d}</option>`).join('')}</select></div>`;

  const shell = () => {
    stopCall();
    root.innerHTML = `<div class="stack"><div class="tabs"><button class="tab ${tab === 'chat' ? 'active' : ''}" data-t="chat">💬 Chat</button><button class="tab ${tab === 'voice' ? 'active' : ''}" data-t="voice">📞 Voice call</button><button class="tab ${tab === 'recite' ? 'active' : ''}" data-t="recite">🙋 Recitation card</button></div>
      <div class="card"><div class="row">${fileSelect()}${tab === 'recite' ? '' : modeSelect()}</div></div><div id="pane"></div></div>`;
    $$('[data-t]', root).forEach((b) => (b.onclick = () => { tab = b.dataset.t; if (!MODES[mode] || (tab !== 'voice' && !['chat', 'socratic', 'feynman'].includes(mode))) mode = 'chat'; shell(); }));
    $('#file', root).onchange = (e) => { fileId = e.target.value ? Number(e.target.value) : ''; chatMsgs = []; shell(); };
    const ms = $('#mode', root); if (ms) ms.onchange = (e) => { mode = e.target.value; chatMsgs = []; shell(); };
    ({ chat: chatPane, voice: voicePane, recite: recitePane })[tab]($('#pane', root));
  };

  /* ---------------- Chat ---------------- */
  const chatPane = (pane) => {
    pane.innerHTML = `<div class="card stack"><div class="chat" id="log"></div>
      <div class="row">${['I still don\'t get it. Explain it even simpler.', 'Give me a real-life example.', 'Quiz me gently, one question.', 'What will likely be asked in the exam?'].map((q) => `<button class="btn ghost small" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <div class="row" style="flex-wrap:nowrap"><textarea id="msg" rows="2" placeholder="Type your question… (Enter to send, Shift+Enter for new line)" maxlength="2000"></textarea><button class="btn" id="send">Send</button></div></div>`;
    const log = $('#log', pane);
    const paint = () => {
      log.innerHTML = chatMsgs.length ? chatMsgs.map((m) => `<div class="bubble ${m.role}">${m.role === 'user' ? esc(m.text) : md(m.text)}</div>`).join('')
        : `<div class="bubble model">Hi! 🌷 I'm your study buddy. Ask me anything. If I explain something and it still doesn't click, just say so and I'll try a different way. No limit, no judgment.</div>`;
      log.scrollTop = log.scrollHeight;
    };
    const send = async (text) => {
      text = text.trim(); if (!text) return;
      chatMsgs.push({ role: 'user', text }); paint(); $('#msg', pane).value = '';
      log.insertAdjacentHTML('beforeend', '<div class="bubble model" id="typing"><span class="spinner"></span>Thinking…</div>'); log.scrollTop = log.scrollHeight;
      try {
        const r = await post('/tutor/chat', { fileId: fileId || null, mode, messages: chatMsgs });
        chatMsgs.push({ role: 'model', text: r.reply });
      } catch (e) { toast(e.message, 'bad'); chatMsgs.pop(); $('#msg', pane).value = text; }
      paint();
    };
    $('#send', pane).onclick = () => send($('#msg', pane).value);
    $('#msg', pane).onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e.target.value); } };
    $$('[data-q]', pane).forEach((b) => (b.onclick = () => send(b.dataset.q)));
    paint();
    if (params.q) { const q = params.q; params.q = ''; send(q); }
  };

  /* ---------------- Recitation card ---------------- */
  const recitePane = (pane) => {
    pane.innerHTML = `<div class="card stack"><h2>🙋 Recitation Wingman</h2><p class="muted">Class participation can be the cushion that gets you to 1.35. Pick today's material and I'll prepare 3 things you can confidently say in class.</p>
      <div class="row"><button class="btn big" id="mk" ${fileId ? '' : 'disabled'}>Make my cheat card</button><a class="btn ghost" href="#/tutor?tab=voice&mode=recitation${fileId ? `&file=${fileId}` : ''}">Practice the cold call 🎙️</a></div>${fileId ? '' : '<p class="muted">Choose a file above first.</p>'}</div>`;
    $('#mk', pane).onclick = (e) => busy(e.target, 'Preparing…', async () => showRecitation(await post(`/files/${fileId}/recitation`)));
  };

  /* ---------------- Voice call ---------------- */
  const voicePane = (pane) => {
    let active = false, speaking = false, thinking = false, listening = false, muted = false;
    let finalText = '', rec = null, msgs = [], seconds = 0, timer = null, voices = [];

    const loadVoices = () => {
      voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
      const sel = $('#voice', pane);
      if (sel) sel.innerHTML = voices.map((v) => `<option value="${esc(v.name)}" ${v.name === pref('voice', '') ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('');
    };

    pane.innerHTML = `<div class="card stack">
      ${SR ? '' : '<div class="callout warn">Your browser can\'t listen to speech. Use <strong>Chrome or Edge</strong> for full speech recognition. You can still hear Buddy and type your answers below.</div>'}
      <div class="orb-wrap"><div class="orb" id="orb"></div></div>
      <div class="live-line" id="status" style="font-weight:600;font-size:16px">Ready when you are. Tap start call. 🌷</div>
      <div class="live-line" id="live" style="min-height:32px;color:var(--text);font-weight:500"></div>

      <!-- Main Interactive Call Controls -->
      <div class="row" style="justify-content:center;gap:12px;margin:10px 0" id="call-controls">
        <button class="btn big" id="start">📞 Start Voice Call</button>
        <button class="btn big" id="speak-btn" style="background:#2D2327;display:none">✋ Tap to Interrupt & Speak</button>
        <button class="btn ghost" id="mute" style="display:none">🎤 Mic on</button>
        <button class="btn danger" id="end" style="display:none">End call</button>
      </div>

      <!-- Quick prompts for the student -->
      <div class="row" id="quick-prompts" style="justify-content:center;display:none;margin-bottom:8px">
        <button class="btn ghost small" data-prompt="Wait, I don't get that. Explain simpler.">😵 Explain simpler</button>
        <button class="btn ghost small" data-prompt="Give me a real-world analogy.">💡 Give analogy</button>
        <button class="btn ghost small" data-prompt="Quiz me with one question.">❓ Quiz me</button>
        <button class="btn ghost small" data-prompt="What should I say for recitation?">🙋 Recitation tip</button>
      </div>

      <!-- Fast text input option if student prefers typing -->
      <div class="row" id="typebox" style="display:none;flex-wrap:nowrap">
        <input id="typed" placeholder="Speak above, or type your answer here…" />
        <button class="btn" id="typesend">Send</button>
      </div>

      <details style="margin-top:14px"><summary style="cursor:pointer;font-weight:600">Voice settings</summary>
        <div class="row" style="margin-top:10px">
          <div class="field"><label for="voice">Buddy's voice</label><select id="voice"></select></div>
          <div class="field"><label for="rate">Speed</label><select id="rate">${[['0.8', 'Slow'], ['0.95', 'Gentle'], ['1.1', 'Normal'], ['1.3', 'Fast']].map(([v, l]) => `<option value="${v}" ${pref('rate', '0.95') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label for="lang">I will speak in</label><select id="lang">${[['en-US', 'English (US)'], ['en-PH', 'English (Philippines)'], ['fil-PH', 'Filipino / Taglish']].map(([v, l]) => `<option value="${v}" ${pref('lang', 'en-US') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>
      </details>
      <div class="chat" id="log" hidden style="margin-top:16px"></div>
      <div id="after"></div>
    </div>`;

    loadVoices();
    if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = loadVoices;
    ['voice', 'rate', 'lang'].forEach((k) => {
      const el = $(`#${k}`, pane);
      if (el) el.onchange = (e) => localStorage.setItem(`dostudy.${k}`, e.target.value);
    });

    const setOrb = (s) => { const el = $('#orb', pane); if (el) el.className = `orb ${s}`; };
    const status = (t) => { const el = $('#status', pane); if (el) el.textContent = t; };
    const live = (t) => { const el = $('#live', pane); if (el) el.textContent = t; };

    const updateControls = () => {
      const startBtn = $('#start', pane);
      const speakBtn = $('#speak-btn', pane);
      const muteBtn = $('#mute', pane);
      const endBtn = $('#end', pane);
      const typebox = $('#typebox', pane);
      const prompts = $('#quick-prompts', pane);

      if (!active) {
        if (startBtn) startBtn.style.display = 'inline-flex';
        if (speakBtn) speakBtn.style.display = 'none';
        if (muteBtn) muteBtn.style.display = 'none';
        if (endBtn) endBtn.style.display = 'none';
        if (typebox) typebox.style.display = 'none';
        if (prompts) prompts.style.display = 'none';
        return;
      }

      if (startBtn) startBtn.style.display = 'none';
      if (endBtn) endBtn.style.display = 'inline-flex';
      if (muteBtn) muteBtn.style.display = 'inline-flex';
      if (typebox) typebox.style.display = 'flex';
      if (prompts) prompts.style.display = 'flex';
      if (speakBtn) speakBtn.style.display = 'inline-flex';

      if (speaking) {
        speakBtn.textContent = '✋ Tap to Interrupt & Speak';
        speakBtn.style.background = '#E0839C';
        speakBtn.style.color = '#fff';
      } else if (listening) {
        speakBtn.textContent = '✅ Done Speaking (Send)';
        speakBtn.style.background = '#2D2327';
        speakBtn.style.color = '#fff';
      } else if (thinking) {
        speakBtn.textContent = '🤔 Buddy is thinking…';
        speakBtn.style.background = '#888';
        speakBtn.style.color = '#fff';
      } else {
        speakBtn.textContent = '🎙️ Tap to Speak';
        speakBtn.style.background = '#2D2327';
        speakBtn.style.color = '#fff';
      }
    };

    const paint = () => {
      const log = $('#log', pane);
      if (!log) return;
      const shown = msgs.slice(1);
      log.hidden = !shown.length;
      log.innerHTML = shown.map((m) => `<div class="bubble ${m.role}"><strong>${m.role === 'user' ? 'You' : 'Buddy'}:</strong> ${m.role === 'user' ? esc(m.text) : md(m.text)}</div>`).join('');
      log.scrollTop = log.scrollHeight;
    };

    const stopSpeech = () => {
      if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
      }
      speaking = false;
    };

    const speak = (text) => {
      if (!active) return;
      stopSpeech();
      if (!('speechSynthesis' in window)) {
        startListening();
        return;
      }
      const u = new SpeechSynthesisUtterance(text.replace(/[*_#`>]/g, '').replace(/\s+/g, ' '));
      const v = voices.find((x) => x.name === $('#voice', pane)?.value);
      if (v) u.voice = v;
      u.rate = parseFloat($('#rate', pane)?.value) || 0.95;
      u.lang = v?.lang || 'en-US';

      u.onstart = () => {
        speaking = true;
        listening = false;
        setOrb('speaking');
        status('Buddy is talking… (Tap button or speak to interrupt)');
        updateControls();
      };

      u.onend = u.onerror = () => {
        speaking = false;
        if (active) {
          startListening();
        } else {
          setOrb('');
          updateControls();
        }
      };

      speechSynthesis.speak(u);
    };

    const startListening = () => {
      if (!active || thinking) return;
      stopSpeech();

      if (!SR || muted) {
        listening = false;
        setOrb('');
        status(muted ? 'Mic is muted. Type your message below 💬' : 'Type your answer below 💬');
        updateControls();
        return;
      }

      try { if (rec) rec.abort(); } catch { /* ignore */ }

      rec = new SR();
      rec.lang = $('#lang', pane)?.value || 'en-US';
      rec.interimResults = true;
      rec.continuous = true;
      finalText = '';

      rec.onstart = () => {
        listening = true;
        setOrb('listening');
        status('🎙️ Your turn! I\'m listening, take your time… 💗');
        live('Speak now or tap "Done Speaking" when finished.');
        updateControls();
      };

      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) {
            finalText += ' ' + t;
          } else {
            interim += ' ' + t;
          }
        }
        live(`“${(finalText + interim).trim()}”`);
      };

      rec.onerror = (e) => {
        if (['not-allowed', 'service-not-allowed'].includes(e.error)) {
          muted = true;
          const muteBtn = $('#mute', pane);
          if (muteBtn) muteBtn.textContent = '🔇 Mic off';
          toast('Microphone access blocked. You can type below anytime!', 'bad');
          status('Microphone unavailable. Type your response below.');
          listening = false;
          setOrb('');
          updateControls();
        }
      };

      rec.onend = () => {
        if (!active) return;
        if (listening && !thinking && !speaking && !muted) {
          try { rec.start(); } catch { /* ignore */ }
        }
      };

      try {
        rec.start();
      } catch (e) {
        // failed to start, prompt text
      }
    };

    const commitStudentSpeech = () => {
      const said = (finalText || $('#live', pane)?.textContent?.replace(/^[“"]|[”"]$/g, '') || '').trim();
      finalText = '';
      live('');
      try { if (rec) rec.abort(); } catch { /* ignore */ }
      listening = false;
      if (said && said !== 'Speak now or tap "Done Speaking" when finished.') {
        turn(said);
      } else {
        toast('Didn\'t catch that. Say something or type below!', 'bad');
        startListening();
      }
    };

    const turn = async (text) => {
      if (!active || thinking) return;
      stopSpeech();
      try { if (rec) rec.abort(); } catch { /* ignore */ }
      listening = false;

      msgs.push({ role: 'user', text });
      paint();
      thinking = true;
      setOrb('thinking');
      status('Buddy is thinking…');
      updateControls();

      try {
        const r = await post('/tutor/chat', { fileId: fileId || null, mode, spoken: true, messages: msgs });
        msgs.push({ role: 'model', text: r.reply });
        paint();
        thinking = false;
        if (active) {
          speak(r.reply);
        }
      } catch (e) {
        thinking = false;
        toast(e.message, 'bad');
        msgs.pop();
        paint();
        if (active) startListening();
      }
    };

    const handleSpeakButton = () => {
      if (!active) return;
      if (speaking) {
        // Interrupt Buddy immediately!
        stopSpeech();
        startListening();
      } else if (listening) {
        // Finish speaking and send
        commitStudentSpeech();
      } else {
        // Start listening
        startListening();
      }
    };

    const start = async () => {
      active = true;
      msgs = [{ role: 'user', text: 'Hi Buddy! I am ready to practice. Please give a warm, brief 1-sentence greeting and ask me what topic we should start with.' }];
      seconds = 0;
      updateControls();
      $('#after', pane).innerHTML = '';

      timer = setInterval(() => { seconds++; }, 1000);
      thinking = true;
      setOrb('thinking');
      status('Connecting to Buddy… 🌷');
      updateControls();

      try {
        const r = await post('/tutor/chat', { fileId: fileId || null, mode, spoken: true, messages: msgs });
        msgs.push({ role: 'model', text: r.reply });
        paint();
        thinking = false;
        speak(r.reply);
      } catch (e) {
        thinking = false;
        toast(e.message, 'bad');
        end();
      }
    };

    const end = () => {
      const was = active;
      active = false;
      clearInterval(timer);
      stopSpeech();
      try { if (rec) rec.abort(); } catch { /* ignore */ }
      listening = false;
      speaking = false;
      thinking = false;
      setOrb('');
      status(was ? 'Call ended. Great work! 💗' : 'Ready when you are. Tap start call. 🌷');
      live('');
      updateControls();

      if (was && msgs.length > 2) {
        $('#after', pane).innerHTML = `<div class="callout good">
          <strong>${Math.max(1, Math.round(seconds / 60))} min practiced.</strong> Want a summary and flashcards for the parts that were tricky? <br>
          <button class="btn small" id="sum" style="margin-top:8px">✨ Summarize &amp; save weak points</button>
        </div>`;

        const sum = $('#sum', pane);
        if (sum) {
          sum.onclick = (e) => busy(e.target, 'Summarizing…', async () => {
            const f = files.find((x) => x.id === fileId);
            const r = await post('/tutor/summary', { messages: msgs, subjectId: f?.subject_id, fileId: fileId || null, saveCards: Boolean(f) });
            $('#after', pane).innerHTML = `<div class="card stack">
              <h2>Session summary</h2><p>${esc(r.summary)}</p>
              ${r.strengths.length ? `<div class="section memo"><h4>💪 You did well</h4><ul>${r.strengths.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
              ${r.gaps.length ? `<div class="section trap"><h4>🌱 Let's strengthen</h4><ul>${r.gaps.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
              ${r.cardsAdded ? `<div class="callout good">Added ${r.cardsAdded} flashcard(s) for your weak points. <a href="#/flashcards">Review them</a></div>` : ''}
            </div>`;
          });
        }
      }
    };
    stopCall = end;

    $('#start', pane).onclick = start;
    $('#end', pane).onclick = end;
    $('#speak-btn', pane).onclick = handleSpeakButton;

    $('#mute', pane).onclick = (e) => {
      muted = !muted;
      e.target.textContent = muted ? '🔇 Mic off' : '🎤 Mic on';
      if (muted) {
        try { if (rec) rec.abort(); } catch { /* ignore */ }
        listening = false;
        status('Mic is muted. Type your message below 💬');
      } else {
        startListening();
      }
      updateControls();
    };

    const sendTyped = () => {
      const i = $('#typed', pane);
      const t = i.value.trim();
      if (!t) return;
      i.value = '';
      stopSpeech();
      turn(t);
    };

    $('#typesend', pane).onclick = sendTyped;
    $('#typed', pane).onkeydown = (e) => { if (e.key === 'Enter') sendTyped(); };

    $$('#quick-prompts button', pane).forEach((b) => {
      b.onclick = () => {
        stopSpeech();
        turn(b.dataset.prompt);
      };
    });
  };

  shell();
  return () => stopCall();
}
