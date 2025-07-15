// Audio context and analyzer
let audioContext;
let analyzer;
let dataArray;
let bufferLength;
let audio;
let source;
let isPlaying = false;
let currentMode = 'bars';
let colorMode = 'mono';
let raveStartTime = 0;
let audioSource = 'file'; // 'file' or 'microphone'
let micStream = null;
let isFullwidth = false;
let animationId;

// Audio effects
let convolver = null;
let gainNode = null;
let dryGainNode = null;
let wetGainNode = null;
let reverbEnabled = false;
let reverbBuffer = null;

// Recording
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recordingDestination = null;

// Canvas elements
const canvas = document.getElementById('visualizerCanvas');
const ctx = canvas.getContext('2d');
const canvasContainer = document.getElementById('canvasContainer');

// Control elements
const audioFile = document.getElementById('audioFile');
const playBtn = document.getElementById('playBtn');
const micBtn = document.getElementById('micBtn');
const fullwidthBtn = document.getElementById('fullwidthBtn');
const volumeSlider = document.getElementById('volumeSlider');
const pitchSlider = document.getElementById('pitchSlider');
const pitchValue = document.getElementById('pitchValue');
const pitchReset = document.getElementById('pitchReset');
const pitchControlGroup = document.getElementById('pitchControlGroup');
const reverbSlider = document.getElementById('reverbSlider');
const reverbValue = document.getElementById('reverbValue');
const reverbToggle = document.getElementById('reverbToggle');
const reverbControlGroup = document.getElementById('reverbControlGroup');
const downloadBtn = document.getElementById('downloadBtn');
const downloadAudioBtn = document.getElementById('downloadAudioBtn');
const recordBtn = document.getElementById('recordBtn');

// Fullscreen elements
const fullscreenTrigger = document.getElementById('fullscreenTrigger');
const fullscreenControls = document.getElementById('fullscreenControls');
const fullscreenCloseBtn = document.getElementById('fullscreenCloseBtn');
const fullscreenPlayBtn = document.getElementById('fullscreenPlayBtn');
const fullscreenExitBtn = document.getElementById('fullscreenExitBtn');
const fullscreenVolumeSlider = document.getElementById('fullscreenVolumeSlider');
const fullscreenVolumeValue = document.getElementById('fullscreenVolumeValue');
const fullscreenPitchSlider = document.getElementById('fullscreenPitchSlider');
const fullscreenPitchValue = document.getElementById('fullscreenPitchValue');
const fullscreenReverbSlider = document.getElementById('fullscreenReverbSlider');
const fullscreenReverbValue = document.getElementById('fullscreenReverbValue');
const fullscreenDownloadBtn = document.getElementById('fullscreenDownloadBtn');
const fullscreenDownloadAudioBtn = document.getElementById('fullscreenDownloadAudioBtn');
const fullscreenTrackName = document.getElementById('fullscreenTrackName');
const fullscreenCurrentTime = document.getElementById('fullscreenCurrentTime');
const fullscreenDuration = document.getElementById('fullscreenDuration');
const trackInfo = document.getElementById('trackInfo');
const trackName = document.getElementById('trackName');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const progressHandle = document.getElementById('progressHandle');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');
const loading = document.getElementById('loading');
const dataDisplay = document.getElementById('dataDisplay');
const fileControls = document.getElementById('fileControls');
const micControls = document.getElementById('micControls');

// Resize canvas
function resizeCanvas() {
    const rect = canvasContainer.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}

// Initialize
function init() {
    resizeCanvas();
    animate();
    updatePitchControlVisibility();
}

// Update pitch control visibility based on audio source
function updatePitchControlVisibility() {
    if (audioSource === 'file') {
        if (pitchControlGroup) pitchControlGroup.style.display = 'flex';
        if (reverbControlGroup) reverbControlGroup.style.display = 'flex';
    } else {
        if (pitchControlGroup) pitchControlGroup.style.display = 'none';
        if (reverbControlGroup) reverbControlGroup.style.display = 'flex';
    }
}

// Create reverb impulse response
function createReverbImpulse(duration, decay, reverse = false) {
    const sampleRate = audioContext.sampleRate;
    const length = sampleRate * duration;
    const impulse = audioContext.createBuffer(2, length, sampleRate);
    
    for (let channel = 0; channel < 2; channel++) {
        const channelData = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
            let sample = (Math.random() * 2 - 1) * Math.pow(1 - (i / length), decay);
            channelData[reverse ? length - i - 1 : i] = sample;
        }
    }
    
    return impulse;
}

// Setup reverb effect
function setupReverb() {
    if (!audioContext) return;
    
    try {
        convolver = audioContext.createConvolver();
        gainNode = audioContext.createGain();
        dryGainNode = audioContext.createGain();
        wetGainNode = audioContext.createGain();
        
        recordingDestination = audioContext.createMediaStreamDestination();
        
        reverbBuffer = createReverbImpulse(3, 2);
        convolver.buffer = reverbBuffer;
        
        dryGainNode.gain.value = 1;
        wetGainNode.gain.value = 0;
        
        console.log('Reverb effect setup complete');
    } catch (error) {
        console.error('Error setting up reverb:', error);
    }
}

// Connect reverb in audio chain - FIXED VERSION
function connectReverb() {
    if (!source || !analyzer) return;
    
    try {
        // Disconnect existing connections
        source.disconnect();
        
        if (convolver && gainNode && dryGainNode && wetGainNode) {
            // Connect with reverb
            source.connect(gainNode);
            gainNode.connect(dryGainNode);
            dryGainNode.connect(analyzer);
            gainNode.connect(convolver);
            convolver.connect(wetGainNode);
            wetGainNode.connect(analyzer);
            
            // Connect to destination for file playback
            if (audioSource === 'file') {
                analyzer.connect(audioContext.destination);
                if (recordingDestination) {
                    dryGainNode.connect(recordingDestination);
                    wetGainNode.connect(recordingDestination);
                }
            }
        } else {
            // Simple connection if reverb not available
            source.connect(analyzer);
            if (audioSource === 'file') {
                analyzer.connect(audioContext.destination);
            }
        }
        
        console.log('Audio chain connected for', audioSource);
    } catch (error) {
        console.error('Error connecting audio chain:', error);
        // Fallback connection
        try {
            source.disconnect();
            source.connect(analyzer);
            if (audioSource === 'file') {
                analyzer.connect(audioContext.destination);
            }
        } catch (fallbackError) {
            console.error('Fallback connection failed:', fallbackError);
        }
    }
}

// Update reverb settings
function updateReverb() {
    if (!dryGainNode || !wetGainNode) {
        console.log('Reverb nodes not available yet');
        return;
    }
    
    const reverbAmount = parseFloat(reverbSlider.value) / 100;
    
    if (reverbEnabled && reverbAmount > 0) {
        const dryLevel = Math.max(0.3, 1 - (reverbAmount * 0.6));
        const wetLevel = reverbAmount * 0.7;
        
        dryGainNode.gain.setValueAtTime(dryLevel, audioContext.currentTime);
        wetGainNode.gain.setValueAtTime(wetLevel, audioContext.currentTime);
        
        if (reverbValue) reverbValue.textContent = Math.round(reverbAmount * 100) + '%';
        if (reverbToggle) {
            reverbToggle.textContent = 'On';
            reverbToggle.classList.add('active');
        }
    } else {
        dryGainNode.gain.setValueAtTime(1, audioContext.currentTime);
        wetGainNode.gain.setValueAtTime(0, audioContext.currentTime);
        
        if (reverbValue) reverbValue.textContent = '0%';
        if (reverbToggle) {
            reverbToggle.textContent = 'Off';
            reverbToggle.classList.remove('active');
        }
    }
    
    // Update displays
    const reverbLevelEl = document.getElementById('reverbLevel');
    if (reverbLevelEl && reverbValue) {
        reverbLevelEl.textContent = reverbValue.textContent;
    }
    
    if (isFullwidth && fullscreenReverbValue && reverbValue) {
        fullscreenReverbValue.textContent = reverbValue.textContent;
    }
}

// Download current visualization as PNG
function downloadVisualization() {
    try {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        
        tempCtx.fillStyle = '#ffffff';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(canvas, 0, 0);
        
        const link = document.createElement('a');
        link.download = `audio-visualization-${Date.now()}.png`;
        link.href = tempCanvas.toDataURL('image/png');
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log('Visualization downloaded');
    } catch (error) {
        console.error('Error downloading visualization:', error);
        alert('Error downloading visualization. Please try again.');
    }
}

// Setup audio - COMPLETELY FIXED VERSION
async function setupAudio(file) {
    if (loading) loading.classList.remove('hidden');
    console.log('Starting audio setup for:', file.name);
    
    try {
        // Clean up any existing audio
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
            if (audio.src) {
                URL.revokeObjectURL(audio.src);
            }
        }
        
        // Clean up existing audio context and connections
        if (source) {
            try {
                source.disconnect();
            } catch (e) {
                console.log('Source already disconnected');
            }
            source = null;
        }
        
        if (audioContext && audioContext.state !== 'closed') {
            try {
                await audioContext.close();
            } catch (e) {
                console.log('AudioContext already closed');
            }
        }
        
        // Create or get audio element
        audio = document.getElementById('audioElement');
        if (!audio) {
            audio = document.createElement('audio');
            audio.id = 'audioElement';
            audio.preload = 'metadata';
            document.body.appendChild(audio);
        }
        
        // Reset audio element
        audio.pause();
        audio.currentTime = 0;
        if (audio.src) {
            URL.revokeObjectURL(audio.src);
            audio.src = '';
        }
        
        // Create new object URL and set source
        const objectURL = URL.createObjectURL(file);
        audio.src = objectURL;
        audio.crossOrigin = 'anonymous';
        
        // Wait for audio to load with better error handling
        await new Promise((resolve, reject) => {
            const cleanup = () => {
                audio.removeEventListener('loadedmetadata', onLoaded);
                audio.removeEventListener('canplaythrough', onLoaded);
                audio.removeEventListener('error', onError);
                clearTimeout(timeoutId);
            };
            
            const onLoaded = () => {
                console.log('Audio loaded successfully, duration:', audio.duration);
                cleanup();
                resolve();
            };
            
            const onError = () => {
                console.error('Audio load error:', audio.error);
                cleanup();
                reject(new Error(`Failed to load audio file: ${audio.error ? audio.error.message : 'Unknown error'}`));
            };
            
            const timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error('Audio load timeout - file may be corrupted or too large'));
            }, 15000);
            
            audio.addEventListener('loadedmetadata', onLoaded);
            audio.addEventListener('canplaythrough', onLoaded);
            audio.addEventListener('error', onError);
            
            // Start loading
            audio.load();
        });
        
        // Create new audio context
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('Audio context created, state:', audioContext.state);
        
        // Resume audio context if suspended
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        
        // Setup analyzer
        analyzer = audioContext.createAnalyser();
        analyzer.fftSize = 512;
        analyzer.smoothingTimeConstant = 0.8;
        bufferLength = analyzer.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        
        // Create source from audio element
        source = audioContext.createMediaElementSource(audio);
        
        // Setup reverb
        setupReverb();
        
        // Connect audio chain
        connectReverb();
        
        // Setup UI
        if (trackName) trackName.textContent = file.name.replace(/\.[^/.]+$/, "");
        if (trackInfo) trackInfo.classList.remove('hidden');
        if (dataDisplay) dataDisplay.style.display = 'grid';
        if (playBtn) playBtn.disabled = false;
        
        // Update displays
        const sampleRateEl = document.getElementById('sampleRate');
        const freqRangeEl = document.getElementById('freqRange');
        
        if (sampleRateEl) sampleRateEl.textContent = `${audioContext.sampleRate} Hz`;
        if (freqRangeEl) freqRangeEl.textContent = `0 - ${Math.round(audioContext.sampleRate / 2)} Hz`;
        
        if (durationEl) durationEl.textContent = formatTime(audio.duration || 0);
        
        // Setup event listeners (remove existing ones first)
        audio.removeEventListener('timeupdate', updateProgress);
        audio.removeEventListener('ended', handleAudioEnded);
        
        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('ended', handleAudioEnded);
        
        // Set initial values
        if (volumeSlider) audio.volume = volumeSlider.value / 100;
        if (pitchSlider) audio.playbackRate = parseFloat(pitchSlider.value);
        updatePlaybackRateDisplay();
        
        // Clean up URL after a delay
        setTimeout(() => {
            try {
                URL.revokeObjectURL(objectURL);
            } catch (e) {
                console.log('URL already revoked');
            }
        }, 1000);
        
        console.log('Audio setup complete!');
        
    } catch (error) {
        console.error('Error setting up audio:', error);
        
        // Reset UI on error
        if (playBtn) playBtn.disabled = true;
        if (trackInfo) trackInfo.classList.add('hidden');
        if (dataDisplay) dataDisplay.style.display = 'none';
        if (trackName) trackName.textContent = 'No track loaded';
        
        // Clean up on error
        if (audio && audio.src) {
            URL.revokeObjectURL(audio.src);
            audio.src = '';
        }
        
        alert(`Error loading audio file: ${error.message}`);
    } finally {
        if (loading) loading.classList.add('hidden');
    }
}

// Handle audio ended event
function handleAudioEnded() {
    isPlaying = false;
    if (playBtn) playBtn.textContent = 'Play';
    if (isFullwidth && fullscreenPlayBtn) {
        fullscreenPlayBtn.textContent = 'Play';
    }
}

// Setup microphone
async function setupMicrophone() {
    if (loading) loading.classList.remove('hidden');
    console.log('Setting up microphone...');
    
    try {
        micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                sampleRate: 44100
            }
        });
        
        console.log('Microphone access granted');
        
        if (audioContext && audioContext.state !== 'closed') {
            await audioContext.close();
        }

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('Audio context created for microphone');
        
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        
        analyzer = audioContext.createAnalyser();
        analyzer.fftSize = 512;
        analyzer.smoothingTimeConstant = 0.3;
        bufferLength = analyzer.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        source = audioContext.createMediaStreamSource(micStream);
        
        setupReverb();
        
        if (convolver && gainNode && dryGainNode && wetGainNode) {
            source.connect(gainNode);
            gainNode.connect(dryGainNode);
            dryGainNode.connect(analyzer);
            gainNode.connect(convolver);
            convolver.connect(wetGainNode);
            wetGainNode.connect(analyzer);
        } else {
            source.connect(analyzer);
        }

        if (trackName) trackName.textContent = 'Live Microphone Input';
        if (trackInfo) trackInfo.classList.remove('hidden');
        if (dataDisplay) dataDisplay.style.display = 'grid';
        if (micBtn) {
            micBtn.textContent = 'Disable Microphone';
            micBtn.classList.remove('btn');
            micBtn.classList.add('btn-secondary');
        }
        
        const sampleRateEl = document.getElementById('sampleRate');
        const freqRangeEl = document.getElementById('freqRange');
        
        if (sampleRateEl) sampleRateEl.textContent = `${audioContext.sampleRate} Hz`;
        if (freqRangeEl) freqRangeEl.textContent = `0 - ${Math.round(audioContext.sampleRate / 2)} Hz`;
        
        if (durationEl) durationEl.textContent = 'Live';
        if (currentTimeEl) currentTimeEl.textContent = 'Live';
        
        if (progressBar) progressBar.style.display = 'none';
        
        isPlaying = true;
        
        if (loading) loading.classList.add('hidden');
        console.log('Microphone setup complete!');
        
    } catch (error) {
        console.error('Error setting up microphone:', error);
        if (loading) loading.classList.add('hidden');
        
        let errorMessage = 'Error accessing microphone: ';
        if (error.name === 'NotAllowedError') {
            errorMessage += 'Permission denied. Please allow microphone access and try again.';
        } else if (error.name === 'NotFoundError') {
            errorMessage += 'No microphone found. Please check your device.';
        } else {
            errorMessage += error.message;
        }
        
        alert(errorMessage);
    }
}

// Stop microphone
function stopMicrophone() {
    console.log('Stopping microphone...');
    
    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }
    
    if (source) {
        try {
            source.disconnect();
        } catch (e) {
            console.log('Source already disconnected');
        }
        source = null;
    }
    
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
        audioContext = null;
    }
    
    isPlaying = false;
    if (trackInfo) trackInfo.classList.add('hidden');
    if (dataDisplay) dataDisplay.style.display = 'none';
    if (micBtn) {
        micBtn.textContent = 'Enable Microphone';
        micBtn.classList.remove('btn-secondary');
        micBtn.classList.add('btn');
    }
    
    const width = canvas.width / window.devicePixelRatio;
    const height = canvas.height / window.devicePixelRatio;
    ctx.clearRect(0, 0, width, height);
    
    console.log('Microphone stopped');
}

// Switch audio source
function switchAudioSource(newSource) {
    console.log('Switching audio source to:', newSource);
    
    if (audioSource === 'file' && audio) {
        audio.pause();
        audio.currentTime = 0;
        isPlaying = false;
        if (playBtn) playBtn.textContent = 'Play';
    } else if (audioSource === 'microphone') {
        stopMicrophone();
    }
    
    audioSource = newSource;
    
    if (newSource === 'file') {
        if (fileControls) fileControls.classList.remove('hidden');
        if (micControls) micControls.classList.add('hidden');
        if (playBtn) playBtn.style.display = 'inline-block';
        if (progressBar) progressBar.style.display = 'block';
    } else {
        if (fileControls) fileControls.classList.add('hidden');
        if (micControls) micControls.classList.remove('hidden');
        if (playBtn) playBtn.style.display = 'none';
        if (progressBar) progressBar.style.display = 'none';
    }
    
    updatePitchControlVisibility();
    
    if (trackInfo) trackInfo.classList.add('hidden');
    if (dataDisplay) dataDisplay.style.display = 'none';
}

// Update playback rate display
function updatePlaybackRateDisplay() {
    if (!pitchSlider || !pitchValue) return;
    
    const rate = parseFloat(pitchSlider.value);
    pitchValue.textContent = rate.toFixed(1) + 'x';
    const playbackRateEl = document.getElementById('playbackRate');
    if (playbackRateEl) {
        playbackRateEl.textContent = rate.toFixed(2) + 'x';
    }
}

// Format time
function formatTime(seconds) {
    if (!isFinite(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Update progress
function updateProgress() {
    if (audio && audio.duration && audioSource === 'file') {
        const progress = (audio.currentTime / audio.duration) * 100;
        if (progressFill) progressFill.style.width = progress + '%';
        if (progressHandle) progressHandle.style.setProperty('--progress', progress + '%');
        if (currentTimeEl) currentTimeEl.textContent = formatTime(audio.currentTime);
        
        if (isFullwidth && fullscreenCurrentTime) {
            fullscreenCurrentTime.textContent = formatTime(audio.currentTime);
        }
    }
}

// Sync fullscreen controls with main controls
function syncFullscreenControls() {
    if (!volumeSlider || !fullscreenVolumeSlider) return;
    
    fullscreenVolumeSlider.value = volumeSlider.value;
    if (fullscreenVolumeValue) fullscreenVolumeValue.textContent = volumeSlider.value + '%';
    
    if (pitchSlider && fullscreenPitchSlider) {
        fullscreenPitchSlider.value = pitchSlider.value;
        if (fullscreenPitchValue && pitchValue) fullscreenPitchValue.textContent = pitchValue.textContent;
    }
    
    if (reverbSlider && fullscreenReverbSlider) {
        fullscreenReverbSlider.value = reverbSlider.value;
        if (fullscreenReverbValue && reverbValue) fullscreenReverbValue.textContent = reverbValue.textContent;
    }
    
    if (playBtn && fullscreenPlayBtn) {
        fullscreenPlayBtn.textContent = playBtn.textContent;
        fullscreenPlayBtn.disabled = playBtn.disabled;
    }
    
    if (trackName && fullscreenTrackName) fullscreenTrackName.textContent = trackName.textContent;
    if (durationEl && fullscreenDuration) fullscreenDuration.textContent = durationEl.textContent;
    if (currentTimeEl && fullscreenCurrentTime) fullscreenCurrentTime.textContent = currentTimeEl.textContent;
    
    document.querySelectorAll('.mode-btn').forEach(btn => {
        const fullscreenBtn = document.getElementById('fullscreen' + btn.id.charAt(0).toUpperCase() + btn.id.slice(1));
        if (fullscreenBtn) {
            if (btn.classList.contains('active')) {
                fullscreenBtn.classList.add('active');
            } else {
                fullscreenBtn.classList.remove('active');
            }
        }
    });
}

// Visualization functions (keeping the existing ones with null checks)
function drawBars() {
    if (!analyzer || !dataArray) return;
    
    analyzer.getByteFrequencyData(dataArray);
    
    const width = canvas.width / window.devicePixelRatio;
    const height = canvas.height / window.devicePixelRatio;
    
    ctx.clearRect(0, 0, width, height);
    
    if (colorMode === 'rave') {
        const time = (Date.now() - raveStartTime) * 0.01;
        const gradient = ctx.createRadialGradient(
            width/2, height/2, 0,
            width/2, height/2, Math.max(width, height)/2
        );
        gradient.addColorStop(0, `hsla(${(time * 2) % 360}, 100%, 20%, 0.3)`);
        gradient.addColorStop(0.5, `hsla(${(time * 3 + 120) % 360}, 100%, 15%, 0.2)`);
        gradient.addColorStop(1, `hsla(${(time * 4 + 240) % 360}, 100%, 10%, 0.1)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }
    
    const barCount = colorMode === 'rave' ? 128 : 64;
    const barWidth = width / barCount;
    const spacing = colorMode === 'rave' ? 1 : 2;
    
    let totalRMS = 0;
    let peakFreq = 0;
    let peakValue = 0;

    for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor((i / barCount) * bufferLength);
        const amplitude = dataArray[dataIndex] / 255;
        const barHeight = amplitude * height * (colorMode === 'rave' ? 0.9 : 0.8);
        
        totalRMS += amplitude * amplitude;
        
        if (dataArray[dataIndex] > peakValue) {
            peakValue = dataArray[dataIndex];
            if (audioContext) {
                peakFreq = (dataIndex / bufferLength) * (audioContext.sampleRate / 2);
            }
        }
        
        if (colorMode === 'rave') {
            const time = (Date.now() - raveStartTime) * 0.01;
            const hue = (i / barCount) * 360 + time * 5 + amplitude * 180;
            const saturation = 90 + amplitude * 10;
            const lightness = 50 + amplitude * 40 + Math.sin(time + i * 0.1) * 20;
            ctx.fillStyle = `hsl(${hue % 360}, ${saturation}%, ${lightness}%)`;
            
            ctx.shadowColor = ctx.fillStyle;
            ctx.shadowBlur = 20 + amplitude * 30;
        } else if (colorMode === 'colorful') {
            const hue = (i / barCount) * 360;
            const saturation = 70 + amplitude * 30;
            const lightness = 45 + amplitude * 25;
            ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        } else {
            ctx.fillStyle = '#000000';
            ctx.shadowBlur = 0;
        }
        
        ctx.fillRect(
            i * barWidth + spacing / 2,
            height - barHeight,
            barWidth - spacing,
            barHeight
        );
    }
    
    ctx.shadowBlur = 0;
    
    // Update data display with null checks
    if (audioContext && analyzer) {
        const rmsLevelEl = document.getElementById('rmsLevel');
        const peakFreqEl = document.getElementById('peakFreq');
        
        if (rmsLevelEl) rmsLevelEl.textContent = Math.sqrt(totalRMS / barCount).toFixed(3);
        if (peakFreqEl) peakFreqEl.textContent = `${Math.round(peakFreq)} Hz`;
    }
}

function drawWave() {
    if (!analyzer || !dataArray) return;
    
    analyzer.getByteTimeDomainData(dataArray);
    
    const width = canvas.width / window.devicePixelRatio;
    const height = canvas.height / window.devicePixelRatio;
    
    ctx.clearRect(0, 0, width, height);
    
    if (colorMode === 'rave') {
        const time = (Date.now() - raveStartTime) * 0.01;
        
        for (let layer = 0; layer < 3; layer++) {
            const gradient = ctx.createLinearGradient(0, 0, width, 0);
            const offset = layer * 120;
            gradient.addColorStop(0, `hsla(${(time * 3 + offset) % 360}, 100%, 60%, 0.8)`);
            gradient.addColorStop(0.5, `hsla(${(time * 4 + offset + 60) % 360}, 100%, 70%, 0.6)`);
            gradient.addColorStop(1, `hsla(${(time * 5 + offset + 120) % 360}, 100%, 80%, 0.4)`);
            ctx.strokeStyle = gradient;
            ctx.lineWidth = 3 + layer;
            ctx.shadowColor = gradient;
            ctx.shadowBlur = 15;
            
            ctx.beginPath();
            const sliceWidth = width / bufferLength;
            let x = 0;
            
            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * height / 2 + Math.sin(time + i * 0.02 + layer) * 20;
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
                
                x += sliceWidth;
            }
            ctx.stroke();
        }
        ctx.shadowBlur = 0;
    } else if (colorMode === 'colorful') {
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, '#ff6b6b');
        gradient.addColorStop(0.2, '#4ecdc4');
        gradient.addColorStop(0.4, '#45b7d1');
        gradient.addColorStop(0.6, '#96ceb4');
        gradient.addColorStop(0.8, '#ffeaa7');
        gradient.addColorStop(1, '#dda0dd');
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const sliceWidth = width / bufferLength;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = v * height / 2;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            
            x += sliceWidth;
        }
        ctx.stroke();
    } else {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        
        const sliceWidth = width / bufferLength;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = v * height / 2;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            
            x += sliceWidth;
        }
        ctx.stroke();
    }
}

function drawCircle() {
    if (!analyzer || !dataArray) return;
    
    analyzer.getByteFrequencyData(dataArray);
    
    const width = canvas.width / window.devicePixelRatio;
    const height = canvas.height / window.devicePixelRatio;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(centerX, centerY) * 0.6;
    
    ctx.clearRect(0, 0, width, height);
    
    if (colorMode === 'rave') {
        const time = (Date.now() - raveStartTime) * 0.01;
        
        for (let ring = 0; ring < 5; ring++) {
            ctx.beginPath();
            const ringRadius = radius * (0.2 + ring * 0.2) + Math.sin(time + ring) * 10;
            ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
            ctx.strokeStyle = `hsla(${(time * 2 + ring * 60) % 360}, 100%, 50%, ${0.3 - ring * 0.05})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }
    
    // Draw center circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, 2, 0, Math.PI * 2);
    if (colorMode === 'rave') {
        const time = (Date.now() - raveStartTime) * 0.01;
        ctx.fillStyle = `hsl(${time * 10 % 360}, 100%, 80%)`;
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 20;
    } else {
        ctx.fillStyle = colorMode === 'colorful' ? '#ff6b6b' : '#000000';
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    
    const angleStep = (Math.PI * 2) / (colorMode === 'rave' ? 128 : 64);
    const maxSpikes = colorMode === 'rave' ? 128 : 64;
    
    for (let i = 0; i < maxSpikes; i++) {
        const dataIndex = Math.floor((i / maxSpikes) * bufferLength);
        const amplitude = dataArray[dataIndex] / 255;
        const angle = i * angleStep;
        
        let dynamicRadius = radius;
        if (colorMode === 'rave') {
            const time = (Date.now() - raveStartTime) * 0.01;
            dynamicRadius += Math.sin(time * 2 + i * 0.1) * 15;
        }
        
        const x1 = centerX + Math.cos(angle) * dynamicRadius;
        const y1 = centerY + Math.sin(angle) * dynamicRadius;
        const lineLength = amplitude * (colorMode === 'rave' ? 80 : 60);
        const x2 = centerX + Math.cos(angle) * (dynamicRadius + lineLength);
        const y2 = centerY + Math.sin(angle) * (dynamicRadius + lineLength);
        
        if (colorMode === 'rave') {
            const time = (Date.now() - raveStartTime) * 0.01;
            const hue = (i / maxSpikes) * 360 + time * 8 + amplitude * 180;
            const saturation = 90 + amplitude * 10;
            const lightness = 60 + amplitude * 30;
            ctx.strokeStyle = `hsl(${hue % 360}, ${saturation}%, ${lightness}%)`;
            ctx.shadowColor = ctx.strokeStyle;
            ctx.shadowBlur = 10 + amplitude * 20;
            ctx.lineWidth = 2 + amplitude * 2;
        } else if (colorMode === 'colorful') {
            const hue = (i / maxSpikes) * 360;
            const saturation = 70 + amplitude * 30;
            const lightness = 45 + amplitude * 25;
            ctx.strokeStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
            ctx.lineWidth = 1.5;
        } else {
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
        }
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
    
    ctx.shadowBlur = 0;
}

function drawDots() {
    if (!analyzer || !dataArray) return;
    
    analyzer.getByteFrequencyData(dataArray);
    
    const width = canvas.width / window.devicePixelRatio;
    const height = canvas.height / window.devicePixelRatio;
    
    ctx.clearRect(0, 0, width, height);
    
    const cols = colorMode === 'rave' ? 48 : 32;
    const rows = colorMode === 'rave' ? 24 : 16;
    const cellWidth = width / cols;
    const cellHeight = height / rows;
    
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const dataIndex = Math.floor(((row * cols + col) / (rows * cols)) * bufferLength);
            const amplitude = dataArray[dataIndex] / 255;
            
            if (amplitude > 0.1) {
                const x = col * cellWidth + cellWidth / 2;
                const y = row * cellHeight + cellHeight / 2;
                let size = amplitude * 8;
                
                if (colorMode === 'rave') {
                    const time = (Date.now() - raveStartTime) * 0.01;
                    size += Math.sin(time * 3 + col * 0.1 + row * 0.1) * 3;
                }
                
                if (colorMode === 'rave') {
                    const time = (Date.now() - raveStartTime) * 0.01;
                    const hue = ((col + row) / (cols + rows)) * 360 + time * 5 + amplitude * 180;
                    const saturation = 90 + amplitude * 10;
                    const lightness = 60 + amplitude * 30 + Math.sin(time + col + row) * 15;
                    ctx.fillStyle = `hsl(${hue % 360}, ${saturation}%, ${lightness}%)`;
                    ctx.shadowColor = ctx.fillStyle;
                    ctx.shadowBlur = 10 + amplitude * 15;
                } else if (colorMode === 'colorful') {
                    const hue = ((col + row) / (cols + rows)) * 360;
                    const saturation = 70 + amplitude * 30;
                    const lightness = 45 + amplitude * 25;
                    ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
                } else {
                    ctx.fillStyle = '#000000';
                }
                
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    ctx.shadowBlur = 0;
}

function drawGrid() {
    if (!analyzer || !dataArray) return;
    
    analyzer.getByteFrequencyData(dataArray);
    
    const width = canvas.width / window.devicePixelRatio;
    const height = canvas.height / window.devicePixelRatio;
    
    ctx.clearRect(0, 0, width, height);
    
    const cols = 16;
    const rows = 12;
    const cellWidth = width / cols;
    const cellHeight = height / rows;
    
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const dataIndex = Math.floor(((row * cols + col) / (rows * cols)) * bufferLength);
            const amplitude = dataArray[dataIndex] / 255;
            
            const x = col * cellWidth;
            const y = row * cellHeight;
            
            if (amplitude > 0.2) {
                if (colorMode === 'rave') {
                    const time = (Date.now() - raveStartTime) * 0.01;
                    const hue = ((col + row) / (cols + rows)) * 360 + time * 6 + amplitude * 120;
                    const saturation = 85 + amplitude * 15;
                    const lightness = 50 + amplitude * 35 + Math.sin(time * 2 + col * 0.2 + row * 0.2) * 20;
                    ctx.fillStyle = `hsl(${hue % 360}, ${saturation}%, ${lightness}%)`;
                    ctx.shadowColor = ctx.fillStyle;
                    ctx.shadowBlur = 8 + amplitude * 12;
                    const pulseSize = 1 + Math.sin(time * 4 + col + row) * 0.3;
                    ctx.fillRect(
                        x + 2 - (cellWidth - 4) * (pulseSize - 1) / 2,
                        y + 2 - (cellHeight - 4) * (pulseSize - 1) / 2,
                        (cellWidth - 4) * pulseSize,
                        (cellHeight - 4) * pulseSize
                    );
                } else if (colorMode === 'colorful') {
                    const hue = ((col + row) / (cols + rows)) * 360;
                    const saturation = 70 + amplitude * 30;
                    const lightness = 45 + amplitude * 25;
                    ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
                    ctx.fillRect(x + 2, y + 2, cellWidth - 4, cellHeight - 4);
                } else {
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(x + 2, y + 2, cellWidth - 4, cellHeight - 4);
                }
            } else {
                if (colorMode !== 'rave') {
                    ctx.strokeStyle = '#e0e0e0';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(x + 2, y + 2, cellWidth - 4, cellHeight - 4);
                }
            }
        }
    }
    
    ctx.shadowBlur = 0;
}

// Animation loop
function animate() {
    animationId = requestAnimationFrame(animate);
    
    if (colorMode === 'rave') {
        if (canvasContainer) canvasContainer.classList.add('rave');
    } else {
        if (canvasContainer) canvasContainer.classList.remove('rave');
    }
    
    if (analyzer && isPlaying) {
        if ((audioSource === 'microphone' && micStream) || (audioSource === 'file' && audio && !audio.paused)) {
            try {
                switch (currentMode) {
                    case 'bars':
                        drawBars();
                        break;
                    case 'wave':
                        drawWave();
                        break;
                    case 'circle':
                        drawCircle();
                        break;
                    case 'dots':
                        drawDots();
                        break;
                    case 'grid':
                        drawGrid();
                        break;
                }
            } catch (error) {
                console.error('Animation error:', error);
            }
        }
    } else {
        const width = canvas.width / window.devicePixelRatio;
        const height = canvas.height / window.devicePixelRatio;
        ctx.clearRect(0, 0, width, height);
    }
}

// Event listeners with null checks
if (audioFile) {
    audioFile.addEventListener('change', async (e) => {
        if (e.target.files[0] && audioSource === 'file') {
            const file = e.target.files[0];
            console.log('File selected:', file.name, 'Size:', (file.size / 1024 / 1024).toFixed(2) + 'MB', 'Type:', file.type);
            
            const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/aac'];
            if (!validTypes.some(type => file.type.includes(type.split('/')[1]))) {
                alert('Please select a valid audio file (MP3, WAV, OGG, M4A, or AAC)');
                e.target.value = '';
                return;
            }
            
            if (file.size > 50 * 1024 * 1024) {
                alert('File is too large. Please select a file smaller than 50MB.');
                e.target.value = '';
                return;
            }
            
            isPlaying = false;
            if (playBtn) {
                playBtn.textContent = 'Play';
                playBtn.disabled = true;
            }
            
            if (isFullwidth && fullscreenPlayBtn) {
                fullscreenPlayBtn.textContent = 'Play';
                fullscreenPlayBtn.disabled = true;
            }
            
            if (audio) {
                audio.pause();
                audio.currentTime = 0;
            }
            
            await setupAudio(file);
        }
    });
}

if (playBtn) {
    playBtn.addEventListener('click', async () => {
        if (audioSource !== 'file') return;
        
        try {
            if (audioContext && audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            
            if (!audio) {
                alert('Please select an audio file first');
                return;
            }
            
            if (isPlaying) {
                audio.pause();
                playBtn.textContent = 'Play';
                if (isFullwidth && fullscreenPlayBtn) fullscreenPlayBtn.textContent = 'Play';
                isPlaying = false;
            } else {
                await audio.play();
                playBtn.textContent = 'Pause';
                if (isFullwidth && fullscreenPlayBtn) fullscreenPlayBtn.textContent = 'Pause';
                isPlaying = true;
            }
        } catch (error) {
            console.error('Error playing audio:', error);
            alert('Error playing audio. Please try again.');
        }
    });
}

if (micBtn) {
    micBtn.addEventListener('click', async () => {
        if (micStream) {
            stopMicrophone();
        } else {
            await setupMicrophone();
        }
    });
}

if (volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
        if (audio && audioSource === 'file') {
            audio.volume = e.target.value / 100;
        }
    });
}

if (pitchSlider) {
    pitchSlider.addEventListener('input', (e) => {
        if (audio && audioSource === 'file') {
            const rate = parseFloat(e.target.value);
            audio.playbackRate = rate;
            updatePlaybackRateDisplay();
        }
    });
}

if (pitchReset) {
    pitchReset.addEventListener('click', () => {
        if (audio && audioSource === 'file' && pitchSlider) {
            pitchSlider.value = '1';
            audio.playbackRate = 1;
            updatePlaybackRateDisplay();
        }
    });
}

if (reverbSlider) {
    reverbSlider.addEventListener('input', (e) => {
        console.log('Reverb slider changed to:', e.target.value);
        updateReverb();
    });
}

if (reverbToggle) {
    reverbToggle.addEventListener('click', () => {
        reverbEnabled = !reverbEnabled;
        console.log('Reverb toggled:', reverbEnabled);
        
        if (!reverbEnabled && reverbSlider) {
            reverbSlider.value = '0';
        } else if (reverbEnabled && reverbSlider && parseFloat(reverbSlider.value) === 0) {
            reverbSlider.value = '30';
        }
        updateReverb();
    });
}

if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
        downloadVisualization();
    });
}

if (progressBar) {
    progressBar.addEventListener('click', (e) => {
        if (audio && audio.duration && audioSource === 'file') {
            const rect = progressBar.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            audio.currentTime = percent * audio.duration;
        }
    });
}

if (fullwidthBtn) {
    fullwidthBtn.addEventListener('click', () => {
        isFullwidth = !isFullwidth;
        
        if (isFullwidth) {
            if (canvasContainer) canvasContainer.classList.add('fullwidth');
            fullwidthBtn.textContent = 'Exit';
            if (fullscreenTrigger) fullscreenTrigger.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            syncFullscreenControls();
        } else {
            if (canvasContainer) canvasContainer.classList.remove('fullwidth');
            fullwidthBtn.textContent = '🖥️ Fullscreen';
            if (fullscreenTrigger) fullscreenTrigger.classList.add('hidden');
            if (fullscreenControls) fullscreenControls.classList.remove('visible');
            if (fullscreenTrigger) fullscreenTrigger.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
        
        setTimeout(resizeCanvas, 100);
    });
}

if (fullscreenTrigger) {
    fullscreenTrigger.addEventListener('click', () => {
        if (fullscreenControls) fullscreenControls.classList.toggle('visible');
        fullscreenTrigger.classList.toggle('active');
        if (fullscreenControls && fullscreenControls.classList.contains('visible')) {
            syncFullscreenControls();
        }
    });
}

if (fullscreenCloseBtn) {
    fullscreenCloseBtn.addEventListener('click', () => {
        if (fullscreenControls) fullscreenControls.classList.remove('visible');
        if (fullscreenTrigger) fullscreenTrigger.classList.remove('active');
    });
}

if (fullscreenExitBtn) {
    fullscreenExitBtn.addEventListener('click', () => {
        if (fullwidthBtn) fullwidthBtn.click();
    });
}

if (fullscreenPlayBtn) {
    fullscreenPlayBtn.addEventListener('click', () => {
        if (playBtn) playBtn.click();
    });
}

if (fullscreenVolumeSlider) {
    fullscreenVolumeSlider.addEventListener('input', (e) => {
        if (volumeSlider) {
            volumeSlider.value = e.target.value;
            volumeSlider.dispatchEvent(new Event('input'));
        }
        if (fullscreenVolumeValue) fullscreenVolumeValue.textContent = e.target.value + '%';
    });
}

if (fullscreenPitchSlider) {
    fullscreenPitchSlider.addEventListener('input', (e) => {
        if (pitchSlider) {
            pitchSlider.value = e.target.value;
            pitchSlider.dispatchEvent(new Event('input'));
        }
        if (fullscreenPitchValue) fullscreenPitchValue.textContent = parseFloat(e.target.value).toFixed(1) + 'x';
    });
}

if (fullscreenReverbSlider) {
    fullscreenReverbSlider.addEventListener('input', (e) => {
        if (reverbSlider) {
            reverbSlider.value = e.target.value;
            reverbSlider.dispatchEvent(new Event('input'));
        }
        if (fullscreenReverbValue) fullscreenReverbValue.textContent = e.target.value + '%';
    });
}

document.querySelectorAll('#fullscreenControls .mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const parent = btn.closest('.mode-selector');
        if (parent) {
            const activeBtn = parent.querySelector('.mode-btn.active');
            if (activeBtn) activeBtn.classList.remove('active');
            btn.classList.add('active');
        }
        
        const mainBtn = document.querySelector(`[data-mode="${btn.dataset.mode}"], [data-color="${btn.dataset.color}"]`);
        if (mainBtn) {
            const mainParent = mainBtn.closest('.mode-selector');
            if (mainParent) {
                const mainActiveBtn = mainParent.querySelector('.mode-btn.active');
                if (mainActiveBtn) mainActiveBtn.classList.remove('active');
                mainBtn.classList.add('active');
            }
            
            if (btn.dataset.mode) {
                currentMode = btn.dataset.mode;
            }
            if (btn.dataset.color) {
                colorMode = btn.dataset.color;
                if (colorMode === 'rave') {
                    raveStartTime = Date.now();
                }
            }
        }
    });
});

if (fullscreenDownloadBtn) {
    fullscreenDownloadBtn.addEventListener('click', () => {
        downloadVisualization();
    });
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isFullwidth) {
        if (fullscreenControls && fullscreenControls.classList.contains('visible')) {
            fullscreenControls.classList.remove('visible');
            if (fullscreenTrigger) fullscreenTrigger.classList.remove('active');
        } else {
            if (fullwidthBtn) fullwidthBtn.click();
        }
    }
});

document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const parent = btn.closest('.mode-selector');
        if (parent) {
            const activeBtn = parent.querySelector('.mode-btn.active');
            if (activeBtn) activeBtn.classList.remove('active');
            btn.classList.add('active');
        }
        
        if (btn.dataset.mode) {
            currentMode = btn.dataset.mode;
        }
        
        if (btn.dataset.color) {
            colorMode = btn.dataset.color;
            
            if (colorMode === 'rave') {
                raveStartTime = Date.now();
            }
        }
        
        if (btn.dataset.source) {
            switchAudioSource(btn.dataset.source);
            audioSource = btn.dataset.source;
        }
    });
});

let gridOverlayVisible = false;
document.addEventListener('keydown', (e) => {
    if (e.key === 'g' && e.ctrlKey) {
        e.preventDefault();
        gridOverlayVisible = !gridOverlayVisible;
        const overlay = document.getElementById('gridOverlay');
        if (overlay) {
            overlay.classList.toggle('show', gridOverlayVisible);
        }
    }
});

window.addEventListener('resize', resizeCanvas);

// Initialize
init();
