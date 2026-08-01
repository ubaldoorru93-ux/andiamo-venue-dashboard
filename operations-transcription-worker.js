import {
  env,
  pipeline
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = "onnx-community/whisper-base.en";
let activeDevice = self.navigator?.gpu ? "webgpu" : "wasm";
let activeRequestId = 0;
let transcriberPromise = null;
let loadingPromise = null;

function postStatus(status, detail = {}) {
  self.postMessage({ status, requestId: activeRequestId, ...detail });
}

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

function progressCallback(progress) {
  if (progress?.status === "progress") {
    postStatus("progress", {
      progress: progress.progress,
      file: progress.file || ""
    });
  }
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

async function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = createTranscriber(activeDevice).catch(async function (error) {
      if (activeDevice !== "webgpu") {
        throw error;
      }

      activeDevice = "wasm";
      postStatus("loading", {
        message: "The phone’s GPU path was unavailable. Switching to the compatible CPU model…"
      });
      return createTranscriber(activeDevice);
    });
  }

  return transcriberPromise;
}

async function loadModel() {
  if (!loadingPromise) {
    postStatus("loading", {
      message: activeDevice === "webgpu"
        ? "Loading private Whisper base.en on the phone’s GPU…"
        : "Loading private Whisper base.en on the phone’s CPU…"
    });
    loadingPromise = getTranscriber().catch(function (error) {
      transcriberPromise = null;
      loadingPromise = null;
      throw error;
    });
  }

  await loadingPromise;
  postStatus("ready", { device: activeDevice });
}

async function transcribe(audio) {
  const transcriber = await getTranscriber();
  const startedAt = performance.now();
  postStatus("transcribing");

  const output = await transcriber(audio, {
    chunk_length_s: 30,
    stride_length_s: 5
  });

  postStatus("complete", {
    text: output?.text || "",
    seconds: (performance.now() - startedAt) / 1000,
    device: activeDevice,
    model: MODEL_ID
  });
}

self.addEventListener("message", async function (event) {
  activeRequestId = Number(event.data?.requestId || 0);

  try {
    if (event.data?.type === "transcribe") {
      await loadModel();
      await transcribe(event.data.audio);
    }
  } catch (error) {
    postStatus("error", {
      message: error?.message || error?.name || String(error)
    });
  }
});
