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
    videoPlayer: document.getElementById('interviewer-video'),
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

// 1. Init Lobby
async function initLobby() {
    try {
        const res = await fetch(`${BASE_URL}/api/documents`);
        const docs = await res.json();
        els.docSelect.innerHTML = docs.map(d => `<option value="${d.id}">${d.title || d.originalName}</option>`).join('');
        if (docs.length === 0) {
            els.docSelect.innerHTML = '<option value="">请先在后端导入题库</option>';
            els.startBtn.disabled = true;
        }
    } catch (e) {
        console.error('Failed to load documents:', e);
        els.docSelect.innerHTML = '<option value="">加载失败</option>';
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
        state.questions = await res.json();
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
    els.progressText.textContent = `${state.currentQuestionIndex + 1}/${state.questions.length}`;
    els.questionText.textContent = q.prompt;
    els.recordBtn.classList.add('hidden');
    els.submitBtn.classList.add('hidden');
    els.videoPlayer.classList.add('hidden');
    els.videoPlaceholder.classList.remove('hidden');
    els.interactionStatus.textContent = '正在获取面试官视频...';

    // check media asset
    let videoUrl = q.mediaAsset?.videoUrl;
    
    // If no video, we ask backend to generate it and wait
    if (!videoUrl) {
        els.videoPlaceholder.querySelector('p').textContent = '首次生成数字人视频大概需要15-30秒，请耐心等待...';
        try {
            await fetch(`${BASE_URL}/api/questions/${q.id}/media/generate`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ force: false })
            });
            // Poll
            while(true) {
                await new Promise(r => setTimeout(r, 3000));
                const mRes = await fetch(`${BASE_URL}/api/questions/${q.id}/media`);
                const mData = await mRes.json();
                if (mData.status === 'ready' && mData.videoUrl) {
                    videoUrl = mData.videoUrl;
                    break;
                }
                if (mData.status === 'failed') {
                    throw new Error(mData.errorMessage || "生成失败");
                }
            }
        } catch (e) {
            console.error('Video gen failed', e);
            // fallback to audio if video fails? The backend might just provide audioUrl
            els.interactionStatus.textContent = '视频获取失败，跳过播放。请直接作答。';
            enableRecording();
            return;
        }
    }

    // Play video
    els.videoPlaceholder.classList.add('hidden');
    els.videoPlayer.classList.remove('hidden');
    els.videoPlayer.src = videoUrl;
    els.interactionStatus.textContent = '面试官正在提问...';
    
    try {
        await els.videoPlayer.play();
    } catch(e) {
        // Auto-play blocked
        els.interactionStatus.textContent = '点击视频播放提问';
        els.videoPlayer.controls = true;
    }

    els.videoPlayer.onended = () => {
        els.interactionStatus.textContent = '提问结束，请开始作答';
        enableRecording();
    };
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

        const res = await fetch(`${BASE_URL}/api/interviews/process`, {
            method: 'POST',
            body: formData
        });
        
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        // data.interview.id is the created interview
        state.interviewIds.push(data.interview.id);

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
    els.resultsContainer.innerHTML = '<div class="spinner global-spinner"></div><p style="text-align: center; margin-top: 1rem;">正在AI打分中，请稍候...</p>';
    
    const resultsData = [];
    
    for (let i = 0; i < state.interviewIds.length; i++) {
        const iId = state.interviewIds[i];
        const q = state.questions[i];
        
        let finalData = null;
        // Poll
        while(true) {
            const res = await fetch(`${BASE_URL}/api/interviews/${iId}`);
            const data = await res.json();
            if (data.interview.status === 'analyzed' || data.interview.status === 'failed') {
                finalData = data;
                break;
            }
            await new Promise(r => setTimeout(r, 2000));
        }
        resultsData.push({ question: q, data: finalData });
    }

    renderResults(resultsData);
}

function renderResults(resultsData) {
    els.resultsContainer.innerHTML = resultsData.map((item, idx) => {
        const status = item.data.interview.status;
        if (status === 'failed') {
            return `
            <div class="result-card">
                <h3>问题 ${idx + 1}: ${item.question.prompt}</h3>
                <p style="color: var(--danger-color)">处理失败: ${item.data.interview.errorMessage || '未知错误'}</p>
            </div>`;
        }

        const analysis = item.data.analysis;
        const transcript = item.data.transcripts && item.data.transcripts.length > 0 ? item.data.transcripts[0].text : '无转录文本';
        
        return `
        <div class="result-card">
            <h3>问题 ${idx + 1} <span class="score-badge">${analysis.score} 分</span></h3>
            <div class="text-block"><strong>题目：</strong>${item.question.prompt}</div>
            <div class="text-block"><strong>你的回答：</strong>${transcript}</div>
            
            <div style="margin-top: 1.5rem">
                <h4 style="color: var(--success-color); margin-bottom: 0.5rem">亮点</h4>
                <p style="font-size: 0.95rem; line-height: 1.6">${analysis.strengths || '无'}</p>
            </div>
            <div style="margin-top: 1rem">
                <h4 style="color: var(--danger-color); margin-bottom: 0.5rem">不足与建议</h4>
                <p style="font-size: 0.95rem; line-height: 1.6">${analysis.gaps || analysis.summary || '无'}</p>
            </div>
        </div>
        `;
    }).join('');
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
