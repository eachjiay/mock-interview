const BASE_URL = window.location.origin;

// State
let state = {
    candidateName: '',
    documentId: null,
    questions: [],
    currentQuestionIndex: 0,
    interviewIds: [], // To store interview IDs for polling later
    mediaRecorder: null,
    audioChunks: [],
    isRecording: false
};

// DOM Elements
const views = {
    lobby: document.getElementById('lobby-view'),
    interview: document.getElementById('interview-view'),
    result: document.getElementById('result-view')
};

const els = {
    docSelect: document.getElementById('document-select'),
    nameInput: document.getElementById('candidate-name'),
    countInput: document.getElementById('question-count'),
    startBtn: document.getElementById('start-btn'),
    
    progressText: document.getElementById('progress-text'),
    videoPlaceholder: document.getElementById('video-placeholder'),
    imagePlayer: document.getElementById('interviewer-image'),
    videoPlayer: document.getElementById('interviewer-video'),
    audioPlayer: document.getElementById('question-audio'),
    questionText: document.getElementById('question-text'),
    interactionStatus: document.getElementById('interaction-status'),
    recordBtn: document.getElementById('record-btn'),
    submitBtn: document.getElementById('submit-answer-btn'),
    recordingDot: document.getElementById('recording-indicator'),
    
    resultsContainer: document.getElementById('results-container'),
    backHomeBtn: document.getElementById('back-home-btn')
};

// Utils
function switchView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    Object.values(views).forEach(v => v.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
    views[viewName].classList.add('active');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getMediaAsset(payload) {
    if (!payload) return null;
    return payload.mediaAsset || payload;
}

function hasPromptMedia(media) {
    return Boolean(media && (media.videoUrl || media.audioUrl || media.imageUrl));
}

function resetPromptMedia() {
    els.videoPlayer.pause();
    els.videoPlayer.removeAttribute('src');
    els.videoPlayer.controls = false;
    els.videoPlayer.onended = null;
    els.videoPlayer.load();
    els.videoPlayer.classList.add('hidden');

    els.audioPlayer.pause();
    els.audioPlayer.removeAttribute('src');
    els.audioPlayer.onended = null;
    els.audioPlayer.onerror = null;
    els.audioPlayer.load();
    els.audioPlayer.classList.add('hidden');

    els.imagePlayer.removeAttribute('src');
    els.imagePlayer.classList.add('hidden');
}

function clearElement(element) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

function createElement(tagName, options = {}) {
    const element = document.createElement(tagName);
    if (options.className) {
        element.className = options.className;
    }
    if (options.text !== undefined) {
        element.textContent = String(options.text);
    }
    return element;
}

function appendTextBlock(parent, label, text) {
    const block = createElement('div', { className: 'text-block' });
    block.appendChild(createElement('strong', { text: label }));
    block.appendChild(createElement('div', {
        className: 'text-content',
        text: text || '无'
    }));
    parent.appendChild(block);
}

function setResultsLoading(message) {
    clearElement(els.resultsContainer);
    els.resultsContainer.appendChild(createElement('div', { className: 'spinner global-spinner' }));
    const text = createElement('p', { text: message });
    text.style.textAlign = 'center';
    text.style.marginTop = '1rem';
    els.resultsContainer.appendChild(text);
}

// 1. Init Lobby
async function initLobby() {
    try {
        const res = await fetch(`${BASE_URL}/api/documents`);
        const docs = await res.json();
        clearElement(els.docSelect);
        if (docs.length === 0) {
            els.docSelect.appendChild(createElement('option', {
                text: '请先在后端导入题库'
            }));
            els.startBtn.disabled = true;
            return;
        }
        docs.forEach(doc => {
            const option = createElement('option', {
                text: doc.title || doc.originalName || `题库 ${doc.id}`
            });
            option.value = String(doc.id);
            els.docSelect.appendChild(option);
        });
        els.startBtn.disabled = false;
    } catch (e) {
        console.error('Failed to load documents:', e);
        clearElement(els.docSelect);
        els.docSelect.appendChild(createElement('option', { text: '加载失败' }));
        els.startBtn.disabled = true;
    }
}

// 2. Start Interview
els.startBtn.addEventListener('click', async () => {
    state.candidateName = els.nameInput.value.trim() || '测试候选人';
    state.documentId = els.docSelect.value;
    const count = parseInt(els.countInput.value) || 3;

    if (!state.documentId) return alert('请选择题库');

    els.startBtn.disabled = true;
    els.startBtn.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px"></div> 准备题目中...';

    try {
        const res = await fetch(`${BASE_URL}/api/documents/${state.documentId}/questions/random?count=${count}`);
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        state.questions = Array.isArray(data.questions) ? data.questions : [];
        state.currentQuestionIndex = 0;
        state.interviewIds = [];
        
        if(state.questions.length === 0) throw new Error("该题库没有题目");

        switchView('interview');
        startQuestion();
    } catch (e) {
        alert('获取题目失败: ' + e.message);
    } finally {
        els.startBtn.disabled = false;
        els.startBtn.innerHTML = '开始面试';
    }
});

// 3. Play Question
async function startQuestion() {
    const q = state.questions[state.currentQuestionIndex];
    if (!q) {
        alert('没有可用题目');
        switchView('lobby');
        return;
    }

    els.progressText.textContent = `${state.currentQuestionIndex + 1}/${state.questions.length}`;
    els.questionText.textContent = q.prompt;
    els.recordBtn.classList.add('hidden');
    els.recordBtn.disabled = true;
    els.submitBtn.classList.add('hidden');
    els.submitBtn.disabled = false;
    els.submitBtn.textContent = '提交回答并进入下一题';
    resetPromptMedia();
    els.videoPlaceholder.classList.remove('hidden');
    els.videoPlaceholder.querySelector('p').textContent = '面试官加载中...';
    els.interactionStatus.textContent = '正在准备面试官提问...';

    let media = getMediaAsset(q.mediaAsset);
    
    if (media?.status !== 'ready' || !hasPromptMedia(media)) {
        els.videoPlaceholder.querySelector('p').textContent = '正在生成面试官提问媒体...';
        try {
            media = await prepareQuestionMedia(q.id);
        } catch (e) {
            console.error('Question media failed', e);
            els.videoPlaceholder.querySelector('p').textContent = '媒体暂不可用';
            els.interactionStatus.textContent = '请阅读题目后直接作答。';
            enableRecording();
            return;
        }
    }

    await playQuestionPrompt(media);
}

async function prepareQuestionMedia(questionId) {
    const generateRes = await fetch(`${BASE_URL}/api/questions/${questionId}/media/generate`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ force: false })
    });
    if (!generateRes.ok) throw new Error(await generateRes.text());

    for (let attempt = 0; attempt < 80; attempt++) {
        await sleep(3000);
        const mRes = await fetch(`${BASE_URL}/api/questions/${questionId}/media`);
        if (!mRes.ok) throw new Error(await mRes.text());
        const mData = await mRes.json();
        const media = getMediaAsset(mData);

        if (media?.status === 'ready' && hasPromptMedia(media)) {
            return media;
        }
        if (media?.status === 'failed') {
            throw new Error(media.errorMessage || "生成失败");
        }
    }

    throw new Error('面试官媒体生成超时');
}

async function playQuestionPrompt(media) {
    if (!media) {
        els.interactionStatus.textContent = '请阅读题目后开始作答';
        enableRecording();
        return;
    }

    if (media.videoUrl) {
        await playVideoPrompt(media.videoUrl);
        return;
    }

    if (media.imageUrl) {
        els.imagePlayer.src = media.imageUrl;
        els.imagePlayer.classList.remove('hidden');
        els.videoPlaceholder.classList.add('hidden');
    }

    if (media.audioUrl) {
        await playAudioPrompt(media.audioUrl);
        return;
    }

    els.interactionStatus.textContent = '请阅读题目后开始作答';
    enableRecording();
}

async function playVideoPrompt(videoUrl) {
    els.videoPlaceholder.classList.add('hidden');
    els.videoPlayer.classList.remove('hidden');
    els.videoPlayer.src = videoUrl;
    els.interactionStatus.textContent = '面试官正在提问...';
    
    try {
        await els.videoPlayer.play();
    } catch (e) {
        els.interactionStatus.textContent = '点击视频播放提问';
        els.videoPlayer.controls = true;
    }

    els.videoPlayer.onended = () => {
        els.interactionStatus.textContent = '提问结束，请开始作答';
        enableRecording();
    };
}

async function playAudioPrompt(audioUrl) {
    els.audioPlayer.src = audioUrl;
    els.audioPlayer.classList.remove('hidden');
    els.interactionStatus.textContent = '面试官正在语音提问...';

    els.audioPlayer.onended = () => {
        els.interactionStatus.textContent = '提问结束，请开始作答';
        enableRecording();
    };
    els.audioPlayer.onerror = () => {
        els.interactionStatus.textContent = '语音播放失败，请阅读题目后开始作答';
        enableRecording();
    };

    try {
        await els.audioPlayer.play();
    } catch (e) {
        els.interactionStatus.textContent = '请点击音频播放器听题，听完后开始作答';
    }
}

// 4. Recording
function enableRecording() {
    els.recordBtn.classList.remove('hidden');
    els.recordBtn.disabled = false;
    els.recordBtn.textContent = '开始回答';
}

els.recordBtn.addEventListener('click', async () => {
    if (state.isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
});

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.mediaRecorder = new MediaRecorder(stream);
        state.audioChunks = [];

        state.mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0) state.audioChunks.push(e.data);
        };

        state.mediaRecorder.onstop = () => {
            els.submitBtn.classList.remove('hidden');
        };

        state.mediaRecorder.start();
        state.isRecording = true;
        
        els.recordBtn.classList.add('recording');
        els.recordBtn.textContent = '结束录音';
        els.recordingDot.classList.remove('hidden');
        els.interactionStatus.textContent = '正在录音...';
    } catch (e) {
        alert('无法访问麦克风: ' + e.message);
    }
}

function stopRecording() {
    if (state.mediaRecorder && state.isRecording) {
        state.mediaRecorder.stop();
        state.mediaRecorder.stream.getTracks().forEach(t => t.stop());
        state.isRecording = false;
        
        els.recordBtn.classList.remove('recording');
        els.recordBtn.textContent = '重新录制';
        els.recordingDot.classList.add('hidden');
        els.interactionStatus.textContent = '录音已完成，可提交或重录';
    }
}

els.submitBtn.addEventListener('click', async () => {
    const q = state.questions[state.currentQuestionIndex];
    const audioBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
    
    els.submitBtn.disabled = true;
    els.submitBtn.textContent = '提交中...';
    els.recordBtn.disabled = true;

    try {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'answer.webm');
        formData.append('candidateName', state.candidateName);
        formData.append('questionText', q.prompt);
        formData.append('referenceText', q.referenceAnswer || '');
        formData.append('providers', 'auto');
        if (q.id) {
            formData.append('questionId', String(q.id));
        }
        if (q.documentId) {
            formData.append('documentId', String(q.documentId));
        }

        const res = await fetch(`${BASE_URL}/api/interviews/process`, {
            method: 'POST',
            body: formData
        });
        
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const interviewId = Number(data.interviewId || data.interview?.id || data.id);
        if (!Number.isInteger(interviewId) || interviewId <= 0) {
            throw new Error('提交成功，但没有返回有效的面试记录 ID');
        }
        state.interviewIds.push(interviewId);

        // Next question or Results
        state.currentQuestionIndex++;
        if (state.currentQuestionIndex < state.questions.length) {
            els.submitBtn.disabled = false;
            els.submitBtn.textContent = '提交回答并进入下一题';
            startQuestion();
        } else {
            showResults();
        }
    } catch (e) {
        alert('提交失败: ' + e.message);
        els.submitBtn.disabled = false;
        els.submitBtn.textContent = '重试提交';
        els.recordBtn.disabled = false;
    }
});

// 5. Results Polling & Rendering
async function showResults() {
    switchView('result');
    setResultsLoading('正在AI打分中，请稍候...');
    
    const resultsData = [];
    
    for (let i = 0; i < state.interviewIds.length; i++) {
        const iId = state.interviewIds[i];
        const q = state.questions[i];

        setResultsLoading(`正在AI打分中 (${i + 1}/${state.interviewIds.length})...`);
        try {
            const finalData = await pollInterviewUntilDone(iId);
            resultsData.push({ question: q, data: finalData });
        } catch (e) {
            resultsData.push({
                question: q,
                data: {
                    interview: {
                        id: iId,
                        status: 'failed',
                        errorMessage: e.message || '结果获取失败'
                    },
                    transcripts: [],
                    analysis: null
                }
            });
        }
    }

    renderResults(resultsData);
}

async function pollInterviewUntilDone(interviewId, options = {}) {
    const timeoutMs = options.timeoutMs || 10 * 60 * 1000;
    const intervalMs = options.intervalMs || 2000;
    const startedAt = Date.now();
    let consecutiveErrors = 0;

    while (Date.now() - startedAt < timeoutMs) {
        try {
            const res = await fetch(`${BASE_URL}/api/interviews/${interviewId}`);
            if (!res.ok) {
                throw new Error(await res.text());
            }
            const data = await res.json();
            const status = data.interview?.status;
            if (status === 'analyzed' || status === 'failed') {
                return data;
            }
            consecutiveErrors = 0;
        } catch (e) {
            consecutiveErrors += 1;
            if (consecutiveErrors >= 3) {
                throw e;
            }
        }
        await sleep(intervalMs);
    }

    throw new Error('等待面试报告超时，请稍后重新检查结果。');
}

function renderResults(resultsData) {
    clearElement(els.resultsContainer);

    resultsData.forEach((item, idx) => {
        const card = createElement('div', { className: 'result-card' });
        const status = item.data.interview?.status;

        if (status === 'failed') {
            card.appendChild(createElement('h3', {
                text: `问题 ${idx + 1}: ${item.question?.prompt || '未知题目'}`
            }));
            const errorText = createElement('p', {
                text: `处理失败: ${item.data.interview?.errorMessage || '未知错误'}`
            });
            errorText.style.color = 'var(--danger-color)';
            card.appendChild(errorText);
            const retryButton = createElement('button', {
                className: 'secondary-btn retry-result-btn',
                text: '重新检查结果'
            });
            retryButton.addEventListener('click', showResults);
            card.appendChild(retryButton);
            els.resultsContainer.appendChild(card);
            return;
        }

        const analysis = item.data.analysis;
        const transcript = item.data.transcripts && item.data.transcripts.length > 0 ? item.data.transcripts[0].text : '无转录文本';

        const title = createElement('h3', { text: `问题 ${idx + 1} ` });
        title.appendChild(createElement('span', {
            className: 'score-badge',
            text: `${analysis?.score ?? 0} 分`
        }));
        card.appendChild(title);
        appendTextBlock(card, '题目：', item.question?.prompt || '未知题目');
        appendTextBlock(card, '你的回答：', transcript);

        appendAnalysisSection(card, '亮点', analysis?.strengths, 'var(--success-color)');
        appendAnalysisSection(card, '不足与建议', analysis?.gaps?.length ? analysis.gaps : analysis?.summary, 'var(--danger-color)');

        els.resultsContainer.appendChild(card);
    });
}

function appendAnalysisSection(parent, titleText, value, color) {
    const section = createElement('div', { className: 'analysis-section' });
    const heading = createElement('h4', { text: titleText });
    heading.style.color = color;
    section.appendChild(heading);

    const values = Array.isArray(value) ? value.filter(Boolean) : [];
    if (values.length > 0) {
        const list = createElement('ul', { className: 'result-list' });
        values.forEach(item => {
            list.appendChild(createElement('li', { text: item }));
        });
        section.appendChild(list);
    } else {
        section.appendChild(createElement('p', {
            className: 'analysis-text',
            text: value || '无'
        }));
    }

    parent.appendChild(section);
}

els.backHomeBtn.addEventListener('click', () => {
    switchView('lobby');
});

els.quitBtn = document.getElementById('quit-btn');
els.quitBtn.addEventListener('click', () => {
    if(confirm('确定要结束当前面试吗？已回答的题目将会被统计。')) {
        if(state.isRecording) stopRecording();
        if(state.interviewIds.length > 0) {
            showResults();
        } else {
            switchView('lobby');
        }
    }
});

// Boot
window.addEventListener('DOMContentLoaded', initLobby);
