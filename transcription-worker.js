import {
  env,
  pipeline
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = "onnx-community/whisper-small.en";
let activeDevice = self.navigator?.gpu ? "webgpu" : "wasm";

function modelOptions(device) {
  return device === "webgpu" ? {
      device: "webgpu",
      dtype: {
        encoder_model: "fp32",
        decoder_model_merged: "q4"
      }
    } : {
      device: "wasm",
      dtype: "q8"
    };
}

let transcriberPromise = null;
let loadingPromise = null;

function progressCallback(progress) {
  if (progress?.status === "progress") {
    self.postMessage({
      status: "progress",
      progress: progress.progress,
      file: progress.file || ""
    });
  }
}

async function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = createTranscriber(activeDevice).catch(async function (error) {
      if (activeDevice !== "webgpu") {
        throw error;
      }

      activeDevice = "wasm";
      self.postMessage({
        status: "loading",
        message: "Your phone’s GPU path was unavailable. Switching to the compatible CPU model…"
      });
      return createTranscriber(activeDevice);
    });
  }

  return transcriberPromise;
}

function createTranscriber(device) {
  return pipeline(
    "automatic-speech-recognition",
    MODEL_ID,
    {
      ...modelOptions(device),
      progress_callback: progressCallback
    }
  );
}

async function loadModel() {
  if (!loadingPromise) {
    loadingPromise = (async function () {
      self.postMessage({
        status: "loading",
        message: activeDevice === "webgpu"
          ? "Loading the local model on your phone’s GPU…"
          : "Loading the local model on your phone’s CPU…"
      });
      await getTranscriber();
      self.postMessage({ status: "ready", device: activeDevice });
    })().catch(function (error) {
      transcriberPromise = null;
      loadingPromise = null;
      throw error;
    });
  }

  return loadingPromise;
}

async function transcribe(audio) {
  const transcriber = await getTranscriber();
  const startedAt = performance.now();
  self.postMessage({ status: "transcribing" });

  const output = await transcriber(audio, {
    chunk_length_s: 30,
    stride_length_s: 5
  });

  self.postMessage({
    status: "complete",
    text: output?.text || "",
    seconds: (performance.now() - startedAt) / 1000
  });
}

self.addEventListener("message", async function (event) {
  try {
    if (event.data?.type === "load") {
      await loadModel();
      return;
    }

    if (event.data?.type === "transcribe") {
      await loadModel();
      await transcribe(event.data.audio);
    }
  } catch (error) {
    self.postMessage({
      status: "error",
      message: error?.message || error?.name || String(error)
    });
  }
});
