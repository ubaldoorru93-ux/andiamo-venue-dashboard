"use strict";

const WHISPER_SAMPLE_RATE = 16000;
const MAX_RECORDING_SECONDS = 30;

const state = {
  recorder: null,
  stream: null,
  chunks: [],
  file: null,
  objectUrl: "",
  worker: null,
  workerReady: false,
  pendingAudio: null,
  startedAt: 0
};

const elements = {
  start: document.getElementById("startRecording"),
  stop: document.getElementById("stopRecording"),
  preview: document.getElementById("preview"),
  recordingStatus: document.getElementById("recordingStatus"),
  transcriptionCard: document.getElementById("transcriptionCard"),
  transcribe: document.getElementById("transcribeButton"),
  progress: document.getElementById("modelProgress"),
  transcriptionStatus: document.getElementById("transcriptionStatus"),
  result: document.getElementById("transcriptResult"),
  technical: document.getElementById("technicalResult")
};

elements.start.addEventListener("click", startRecording);
elements.stop.addEventListener("click", stopRecording);
elements.transcribe.addEventListener("click", transcribeRecording);
window.addEventListener("beforeunload", cleanup);

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setStatus(elements.recordingStatus, "This browser cannot make a test recording.", "error");
    return;
  }

  try {
    clearRecording();
    state.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.chunks = [];

    const mimeType = chooseMimeType();
    state.recorder = new MediaRecorder(
      state.stream,
      mimeType ? { mimeType } : undefined
    );
    state.recorder.addEventListener("dataavailable", function (event) {
      if (event.data?.size) {
        state.chunks.push(event.data);
      }
    });
    state.recorder.addEventListener("stop", finishRecording, { once: true });
    state.recorder.start();
    state.startedAt = performance.now();

    elements.start.disabled = true;
    elements.stop.classList.remove("hidden");
    setStatus(elements.recordingStatus, "Recording… Speak one clear sentence.");
  } catch (error) {
    stopTracks();
    setStatus(
      elements.recordingStatus,
      "Microphone unavailable: " + friendlyError(error),
      "error"
    );
  }
}

function stopRecording() {
  if (state.recorder && state.recorder.state !== "inactive") {
    elements.stop.disabled = true;
    setStatus(elements.recordingStatus, "Finishing the recording…");
    state.recorder.stop();
  }
}

function finishRecording() {
  const mimeType =
    state.recorder?.mimeType || state.chunks[0]?.type || "audio/webm";
  const blob = new Blob(state.chunks, { type: mimeType });
  const seconds = Math.max(0, (performance.now() - state.startedAt) / 1000);

  state.file = new File([blob], "andiamo-transcription-test", { type: mimeType });
  state.objectUrl = URL.createObjectURL(state.file);
  elements.preview.src = state.objectUrl;
  elements.preview.classList.remove("hidden");
  elements.transcriptionCard.classList.remove("hidden");
  elements.start.disabled = false;
  elements.stop.disabled = false;
  elements.stop.classList.add("hidden");
  elements.transcribe.disabled = false;
  elements.result.textContent = "Your transcript will appear here.";
  elements.technical.textContent = "";
  setStatus(
    elements.recordingStatus,
    "Recording ready: " + seconds.toFixed(1) + " seconds, " + mimeType + ".",
    "success"
  );

  state.recorder = null;
  state.chunks = [];
  stopTracks();
}

async function transcribeRecording() {
  if (!state.file) {
    return;
  }

  elements.transcribe.disabled = true;
  elements.result.textContent = "";
  elements.technical.textContent = "";
  elements.progress.classList.remove("hidden");
  elements.progress.removeAttribute("value");
  setStatus(elements.transcriptionStatus, "Preparing the saved recording…");

  try {
    const audio = await decodeAudio(state.file);

    if (!audio.length) {
      throw new Error("The recording contained no readable audio samples.");
    }

    if (audio.length > WHISPER_SAMPLE_RATE * MAX_RECORDING_SECONDS) {
      throw new Error("Please make the test recording shorter than 30 seconds.");
    }

    state.pendingAudio = audio;
    ensureWorker();

    if (state.workerReady) {
      runTranscription();
    } else {
      setStatus(
        elements.transcriptionStatus,
        "Downloading the private transcription model for first use…"
      );
      state.worker.postMessage({ type: "load" });
    }
  } catch (error) {
    transcriptionFailed(friendlyError(error));
  }
}

function ensureWorker() {
  if (state.worker) {
    return;
  }

  state.worker = new Worker("transcription-worker.js?v=2.2.0", { type: "module" });
  state.worker.addEventListener("message", handleWorkerMessage);
  state.worker.addEventListener("error", function (event) {
    transcriptionFailed(event.message || "The local transcription worker could not start.");
  });
}

function handleWorkerMessage(event) {
  const message = event.data || {};

  if (message.status === "loading") {
    setStatus(elements.transcriptionStatus, message.message || "Loading transcription model…");
    return;
  }

  if (message.status === "progress") {
    updateModelProgress(message);
    return;
  }

  if (message.status === "ready") {
    state.workerReady = true;
    elements.technical.textContent =
      "Engine: local Whisper small.en · " + (message.device === "webgpu" ? "phone GPU" : "phone CPU");
    runTranscription();
    return;
  }

  if (message.status === "transcribing") {
    elements.progress.removeAttribute("value");
    setStatus(elements.transcriptionStatus, "Creating the transcript on this device…");
    return;
  }

  if (message.status === "complete") {
    elements.progress.classList.add("hidden");
    elements.transcribe.disabled = false;
    state.pendingAudio = null;

    const transcript = String(message.text || "").trim();
    if (transcript) {
      elements.result.textContent = transcript;
      elements.technical.textContent += " · " + Number(message.seconds || 0).toFixed(1) + "s processing";
      setStatus(elements.transcriptionStatus, "Transcript created successfully.", "success");
    } else {
      transcriptionFailed("The local model returned an empty transcript. Try one clear sentence again.");
    }
    return;
  }

  if (message.status === "error") {
    transcriptionFailed(message.message || "The local transcription model failed.");
  }
}

function runTranscription() {
  if (!state.workerReady || !state.pendingAudio) {
    return;
  }

  const audio = state.pendingAudio;
  state.pendingAudio = null;
  state.worker.postMessage({ type: "transcribe", audio }, [audio.buffer]);
}

function updateModelProgress(message) {
  const progress = Number(message.progress);

  if (Number.isFinite(progress)) {
    elements.progress.value = Math.max(0, Math.min(100, progress));
    setStatus(
      elements.transcriptionStatus,
      "Downloading the model… " + Math.round(progress) + "%"
    );
  } else {
    elements.progress.removeAttribute("value");
  }
}

async function decodeAudio(file) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;

  if (!AudioContext) {
    throw new Error("This browser cannot decode the saved recording.");
  }

  const context = new AudioContext();

  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const mono = mixToMono(buffer);
    return buffer.sampleRate === WHISPER_SAMPLE_RATE
      ? mono
      : resampleLinear(mono, buffer.sampleRate, WHISPER_SAMPLE_RATE);
  } finally {
    await context.close();
  }
}

function mixToMono(buffer) {
  if (buffer.numberOfChannels === 1) {
    return new Float32Array(buffer.getChannelData(0));
  }

  const mono = new Float32Array(buffer.length);

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const samples = buffer.getChannelData(channel);
    for (let index = 0; index < samples.length; index += 1) {
      mono[index] += samples[index] / buffer.numberOfChannels;
    }
  }

  return mono;
}

function resampleLinear(samples, fromRate, toRate) {
  const outputLength = Math.max(1, Math.round(samples.length * toRate / fromRate));
  const output = new Float32Array(outputLength);
  const ratio = fromRate / toRate;

  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio;
    const leftIndex = Math.floor(sourceIndex);
    const rightIndex = Math.min(leftIndex + 1, samples.length - 1);
    const weight = sourceIndex - leftIndex;
    output[index] = samples[leftIndex] * (1 - weight) + samples[rightIndex] * weight;
  }

  return output;
}

function transcriptionFailed(message) {
  elements.progress.classList.add("hidden");
  elements.transcribe.disabled = false;
  state.pendingAudio = null;
  elements.result.textContent = "No transcript created.";
  setStatus(elements.transcriptionStatus, message, "error");
}

function chooseMimeType() {
  return [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus"
  ].find(function (type) {
    return MediaRecorder.isTypeSupported(type);
  }) || "";
}

function clearRecording() {
  stopTracks();
  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
  }

  state.file = null;
  state.objectUrl = "";
  state.pendingAudio = null;
  elements.preview.removeAttribute("src");
  elements.preview.classList.add("hidden");
  elements.transcriptionCard.classList.add("hidden");
  elements.progress.classList.add("hidden");
  setStatus(elements.recordingStatus, "");
  setStatus(elements.transcriptionStatus, "");
}

function stopTracks() {
  state.stream?.getTracks().forEach(function (track) {
    track.stop();
  });
  state.stream = null;
}

function cleanup() {
  stopTracks();
  state.worker?.terminate();
  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
  }
}

function setStatus(element, message, tone) {
  element.textContent = message;
  element.classList.toggle("error", tone === "error");
  element.classList.toggle("success", tone === "success");
}

function friendlyError(error) {
  return error?.message || error?.name || String(error || "Unknown error");
}
