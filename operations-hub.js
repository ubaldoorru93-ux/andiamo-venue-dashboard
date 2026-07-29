"use strict";

const SUPABASE_URL = "https://qqiqcienzphskhqdnzil.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_GZ3FRa_0_36wHKyNtDCyLQ_LiEP-bMk";
const DEFAULT_VENUE_NAME = "Andiamo Trattoria Chippendale";
const MEDIA_BUCKET = "operations-media";

const hubState = {
  user: null,
  venue: null,
  notes: [],
  filter: "open",
  photoFile: null,
  photoUrl: "",
  audioFile: null,
  audioUrl: "",
  mediaRecorder: null,
  mediaStream: null,
  recordingChunks: [],
  speechRecognition: null,
  speechAudioElement: null,
  speechAudioStream: null,
  cancelAudioTranscription: null,
  reviewQueue: [],
  reviewIndex: 0,
  reviewDue: "",
  briefWeekStart: startOfWeek(new Date()),
  loadingSession: false
};

const elements = {};
let supabaseClient;

document.addEventListener("DOMContentLoaded", initialiseOperationsHub);

async function initialiseOperationsHub() {
  cacheElements();
  bindEvents();

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    showAuthMessage("The secure login service could not load. Check your internet connection and refresh the page.", "error");
    return;
  }

  supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  const sessionResult = await supabaseClient.auth.getSession();

  if (sessionResult.error) {
    showAuthMessage(friendlyError(sessionResult.error), "error");
  }

  await handleSession(sessionResult.data.session);

  supabaseClient.auth.onAuthStateChange(function (_event, session) {
    window.setTimeout(function () {
      handleSession(session);
    }, 0);
  });
}

function cacheElements() {
  [
    "accountPanel",
    "accountEmail",
    "signOutButton",
    "authGate",
    "loginForm",
    "loginEmail",
    "sendLoginLink",
    "authMessage",
    "hubApp",
    "venueName",
    "openInboxCount",
    "noteForm",
    "noteBody",
    "noteCategory",
    "notePriority",
    "photoInput",
    "photoPreviewWrap",
    "photoPreview",
    "removePhoto",
    "startRecording",
    "stopRecording",
    "voiceHelp",
    "audioInput",
    "audioPreviewWrap",
    "audioPreview",
    "transcribeAudio",
    "removeAudio",
    "transcriptField",
    "noteTranscript",
    "captureMessage",
    "saveNoteButton",
    "startRapidReview",
    "statusFilters",
    "inboxLoading",
    "inboxList",
    "weeklyBrief",
    "weeklyBriefRange",
    "previousBriefWeek",
    "currentBriefWeek",
    "nextBriefWeek",
    "weeklyBriefSummary",
    "briefOutstandingCount",
    "briefOutstandingList",
    "briefCompletedCount",
    "briefCompletedList",
    "briefFollowUpCount",
    "briefFollowUpList",
    "handoverDraft",
    "copyHandover",
    "pulseDraft",
    "copyPulseDraft",
    "rapidReviewOverlay",
    "closeRapidReview",
    "finishRapidReview",
    "rapidReviewProgress",
    "rapidReviewEmpty",
    "rapidReviewCard",
    "reviewActionTitle",
    "reviewTranscriptWrap",
    "reviewTranscript",
    "reviewBodyWrap",
    "reviewBody",
    "reviewMedia",
    "rapidReviewMessage",
    "hubToast"
  ].forEach(function (id) {
    elements[id] = document.getElementById(id);
  });

  elements.hubOnlyLinks = Array.from(document.querySelectorAll(".hub-only-link"));
}

function bindEvents() {
  elements.loginForm.addEventListener("submit", sendMagicLink);
  elements.signOutButton.addEventListener("click", signOut);
  elements.noteForm.addEventListener("submit", saveImprovementNote);
  elements.photoInput.addEventListener("change", selectPhoto);
  elements.removePhoto.addEventListener("click", clearPhoto);
  elements.startRecording.addEventListener("click", startVoiceRecording);
  elements.stopRecording.addEventListener("click", stopVoiceRecording);
  elements.audioInput.addEventListener("change", selectAudioFile);
  elements.transcribeAudio.addEventListener("click", retryAudioTranscription);
  elements.removeAudio.addEventListener("click", clearAudio);
  elements.startRapidReview.addEventListener("click", startRapidReview);
  elements.statusFilters.addEventListener("click", changeInboxFilter);
  elements.inboxList.addEventListener("click", handleInboxAction);
  elements.weeklyBrief.addEventListener("click", handleInboxAction);
  elements.previousBriefWeek.addEventListener("click", function () {
    changeBriefWeek(-7);
  });
  elements.currentBriefWeek.addEventListener("click", function () {
    hubState.briefWeekStart = startOfWeek(new Date());
    renderWeeklyBrief();
  });
  elements.nextBriefWeek.addEventListener("click", function () {
    changeBriefWeek(7);
  });
  elements.copyHandover.addEventListener("click", function () {
    copyBriefText(elements.handoverDraft, "Handover copied");
  });
  elements.copyPulseDraft.addEventListener("click", function () {
    copyBriefText(elements.pulseDraft, "Pulse notes copied");
  });
  elements.closeRapidReview.addEventListener("click", closeRapidReview);
  elements.finishRapidReview.addEventListener("click", closeRapidReview);
  elements.rapidReviewOverlay.addEventListener("click", function (event) {
    if (event.target === elements.rapidReviewOverlay) {
      closeRapidReview();
    }
  });
  elements.rapidReviewOverlay.addEventListener("click", handleRapidReviewClick);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !elements.rapidReviewOverlay.classList.contains("hidden")) {
      closeRapidReview();
    }
  });
  window.addEventListener("beforeunload", function () {
    stopPostRecordingTranscription();
    stopActiveMediaStream();
  });
}

async function handleSession(session) {
  if (hubState.loadingSession) {
    return;
  }

  if (!session || !session.user) {
    showSignedOutView();
    return;
  }

  if (hubState.user && hubState.user.id === session.user.id && hubState.venue) {
    return;
  }

  hubState.loadingSession = true;

  try {
    hubState.user = session.user;
    hubState.venue = await ensureVenueForUser(session.user);
    showSignedInView();
    await loadInbox();
  } catch (error) {
    showSignedOutView();
    showAuthMessage("The secure Hub opened, but its venue setup could not finish: " + friendlyError(error), "error");
  } finally {
    hubState.loadingSession = false;
  }
}

function showSignedOutView() {
  stopPostRecordingTranscription();
  closeRapidReview();
  hubState.user = null;
  hubState.venue = null;
  hubState.notes = [];
  elements.authGate.classList.remove("hidden");
  elements.hubApp.classList.add("hidden");
  elements.accountPanel.classList.add("hidden");
  elements.hubOnlyLinks.forEach(function (link) {
    link.classList.add("hidden");
  });
}

function showSignedInView() {
  elements.authGate.classList.add("hidden");
  elements.hubApp.classList.remove("hidden");
  elements.accountPanel.classList.remove("hidden");
  elements.accountEmail.textContent = hubState.user.email || "Signed in";
  elements.venueName.textContent = hubState.venue.name;
  elements.hubOnlyLinks.forEach(function (link) {
    link.classList.remove("hidden");
  });
}

async function sendMagicLink(event) {
  event.preventDefault();
  const email = elements.loginEmail.value.trim();

  if (!email) {
    showAuthMessage("Enter your email address first.", "error");
    return;
  }

  setButtonBusy(elements.sendLoginLink, true, "Sending…");
  showAuthMessage("Sending your secure login link…");

  const redirectUrl = new URL("operations-hub.html", window.location.href).href;
  const result = await supabaseClient.auth.signInWithOtp({
    email: email,
    options: {
      emailRedirectTo: redirectUrl,
      shouldCreateUser: true
    }
  });

  setButtonBusy(elements.sendLoginLink, false);

  if (result.error) {
    showAuthMessage(friendlyError(result.error), "error");
    return;
  }

  showAuthMessage("Email sent. Open the message and tap the secure login link.", "success");
}

async function signOut() {
  setButtonBusy(elements.signOutButton, true, "Signing out…");
  const result = await supabaseClient.auth.signOut();
  setButtonBusy(elements.signOutButton, false);

  if (result.error) {
    showToast(friendlyError(result.error));
    return;
  }

  showSignedOutView();
  showAuthMessage("You are safely signed out.");
}

async function ensureVenueForUser(user) {
  const membershipResult = await supabaseClient
    .from("venue_members")
    .select("venue_id, member_role")
    .eq("user_id", user.id)
    .limit(1);

  if (membershipResult.error) {
    throw membershipResult.error;
  }

  if (membershipResult.data.length) {
    return fetchVenue(membershipResult.data[0].venue_id);
  }

  const ownedVenueResult = await supabaseClient
    .from("venues")
    .select("id, name")
    .eq("created_by", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (ownedVenueResult.error) {
    throw ownedVenueResult.error;
  }

  let venue = ownedVenueResult.data[0];

  if (!venue) {
    const createVenueResult = await supabaseClient
      .from("venues")
      .insert({
        name: DEFAULT_VENUE_NAME,
        created_by: user.id
      })
      .select("id, name")
      .single();

    if (createVenueResult.error) {
      throw createVenueResult.error;
    }

    venue = createVenueResult.data;
  }

  const membershipInsert = await supabaseClient
    .from("venue_members")
    .insert({
      venue_id: venue.id,
      user_id: user.id,
      member_role: "owner"
    });

  if (membershipInsert.error && membershipInsert.error.code !== "23505") {
    throw membershipInsert.error;
  }

  return venue;
}

async function fetchVenue(venueId) {
  const result = await supabaseClient
    .from("venues")
    .select("id, name")
    .eq("id", venueId)
    .single();

  if (result.error) {
    throw result.error;
  }

  return result.data;
}

function selectPhoto(event) {
  const file = event.target.files && event.target.files[0];

  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    showCaptureMessage("Please choose an image file.", "error");
    event.target.value = "";
    return;
  }

  if (!fileIsWithinLimit(file)) {
    showCaptureMessage("That photo is larger than 25 MB. Choose a smaller photo.", "error");
    event.target.value = "";
    return;
  }

  clearPhotoPreviewUrl();
  hubState.photoFile = file;
  hubState.photoUrl = URL.createObjectURL(file);
  elements.photoPreview.src = hubState.photoUrl;
  elements.photoPreviewWrap.classList.remove("hidden");
  showCaptureMessage("");
}

function clearPhoto() {
  clearPhotoPreviewUrl();
  hubState.photoFile = null;
  elements.photoInput.value = "";
  elements.photoPreview.removeAttribute("src");
  elements.photoPreviewWrap.classList.add("hidden");
}

function clearPhotoPreviewUrl() {
  if (hubState.photoUrl) {
    URL.revokeObjectURL(hubState.photoUrl);
    hubState.photoUrl = "";
  }
}

async function startVoiceRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
    showCaptureMessage("Live recording is not supported by this browser. Use “choose an audio file” instead.", "error");
    return;
  }

  try {
    clearAudio();
    hubState.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    hubState.recordingChunks = [];

    const preferredType = chooseRecordingMimeType();
    const recorderOptions = preferredType ? { mimeType: preferredType } : undefined;
    hubState.mediaRecorder = new MediaRecorder(hubState.mediaStream, recorderOptions);

    hubState.mediaRecorder.addEventListener("dataavailable", function (event) {
      if (event.data && event.data.size) {
        hubState.recordingChunks.push(event.data);
      }
    });

    elements.startRecording.disabled = true;
    elements.startRecording.classList.add("recording");
    elements.startRecording.textContent = "Recording…";
    elements.stopRecording.classList.remove("hidden");
    elements.voiceHelp.textContent = "Speak now. Tap stop when you are finished.";
    showCaptureMessage("");

    hubState.mediaRecorder.addEventListener("stop", finishVoiceRecording);
    hubState.mediaRecorder.start();
  } catch (error) {
    stopActiveMediaStream();
    showCaptureMessage("Microphone access was not available. You can allow it in your browser or choose an audio file.", "error");
  }
}

function stopVoiceRecording() {
  if (hubState.mediaRecorder && hubState.mediaRecorder.state !== "inactive") {
    elements.stopRecording.disabled = true;
    elements.voiceHelp.textContent = "Finishing recording…";
    hubState.mediaRecorder.stop();
  }
}

async function finishVoiceRecording() {
  const mimeType =
    (hubState.mediaRecorder && hubState.mediaRecorder.mimeType) ||
    (hubState.recordingChunks[0] && hubState.recordingChunks[0].type) ||
    "audio/webm";

  const blob = new Blob(hubState.recordingChunks, { type: mimeType });
  const extension = extensionForMimeType(mimeType);
  const fileName = "voice-note-" + Date.now() + "." + extension;

  hubState.audioFile = new File([blob], fileName, { type: mimeType });
  showAudioPreview(hubState.audioFile);
  stopActiveMediaStream();

  hubState.mediaRecorder = null;
  hubState.recordingChunks = [];
  elements.startRecording.classList.remove("recording");
  elements.startRecording.textContent = "Start recording";
  elements.stopRecording.disabled = false;
  elements.stopRecording.classList.add("hidden");
  elements.transcriptField.classList.remove("hidden");

  await transcribeRecordedAudio(hubState.audioFile);
}

function chooseRecordingMimeType() {
  const options = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus"
  ];

  return options.find(function (type) {
    return MediaRecorder.isTypeSupported(type);
  }) || "";
}

function selectAudioFile(event) {
  const file = event.target.files && event.target.files[0];

  if (!file) {
    return;
  }

  if (!file.type.startsWith("audio/")) {
    showCaptureMessage("Please choose an audio file.", "error");
    event.target.value = "";
    return;
  }

  if (!fileIsWithinLimit(file)) {
    showCaptureMessage("That recording is larger than 25 MB. Choose a shorter recording.", "error");
    event.target.value = "";
    return;
  }

  clearAudio();
  hubState.audioFile = file;
  showAudioPreview(file);
  elements.transcriptField.classList.remove("hidden");
}

function showAudioPreview(file) {
  clearAudioPreviewUrl();
  hubState.audioUrl = URL.createObjectURL(file);
  elements.audioPreview.src = hubState.audioUrl;
  elements.audioPreviewWrap.classList.remove("hidden");
}

function clearAudio() {
  stopPostRecordingTranscription();

  if (hubState.mediaRecorder && hubState.mediaRecorder.state !== "inactive") {
    hubState.mediaRecorder.stop();
  }

  stopActiveMediaStream();
  clearAudioPreviewUrl();
  hubState.audioFile = null;
  elements.audioInput.value = "";
  elements.audioPreview.removeAttribute("src");
  elements.audioPreviewWrap.classList.add("hidden");
  elements.transcribeAudio.classList.add("hidden");
  elements.transcriptField.classList.add("hidden");
  elements.noteTranscript.value = "";
  elements.startRecording.disabled = false;
  elements.startRecording.classList.remove("recording");
  elements.startRecording.textContent = "Start recording";
  elements.stopRecording.disabled = false;
  elements.stopRecording.classList.add("hidden");
  elements.voiceHelp.textContent = "Tap start, speak, then tap stop.";
}

async function retryAudioTranscription() {
  if (!hubState.audioFile) {
    return;
  }

  await transcribeRecordedAudio(hubState.audioFile, true);
}

async function transcribeRecordedAudio(file, userInitiated) {
  const Recognition = speechRecognitionConstructor();

  if (!Recognition || !file) {
    elements.startRecording.disabled = false;
    elements.transcribeAudio.classList.add("hidden");
    elements.voiceHelp.textContent = voiceRecordingReadyMessage("unsupported");
    return;
  }

  stopPostRecordingTranscription();
  setTranscriptionBusy(true);
  elements.transcribeAudio.classList.add("hidden");
  elements.voiceHelp.textContent = "Recording ready. Creating transcript…";

  const existingTranscript = elements.noteTranscript.value.trim();
  let result;

  try {
    result = await recogniseAudioTrack(
      file,
      Recognition,
      existingTranscript,
      Boolean(userInitiated)
    );
  } catch (_error) {
    result = { transcript: "", error: "start-failed" };
  } finally {
    setTranscriptionBusy(false);
  }

  if (result.transcript) {
    elements.noteTranscript.value = joinTranscript(
      existingTranscript,
      result.transcript
    );
    elements.voiceHelp.textContent = "Recording and transcript ready. You can correct the wording before saving.";
    elements.transcribeAudio.classList.add("hidden");
    return;
  }

  elements.transcribeAudio.classList.remove("hidden");
  elements.voiceHelp.textContent = voiceRecordingReadyMessage(result.error);
}

function recogniseAudioTrack(file, Recognition, existingTranscript, userInitiated) {
  return new Promise(function (resolve) {
    const audioElement = new Audio();
    const audioUrl = URL.createObjectURL(file);
    const recognition = new Recognition();
    let capturedStream = null;
    let latestTranscript = "";
    let lastError = "";
    let settled = false;
    let timeout = null;
    let stopTimer = null;

    const finish = function () {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeout);
      window.clearTimeout(stopTimer);
      audioElement.pause();

      if (capturedStream) {
        capturedStream.getTracks().forEach(function (track) {
          track.stop();
        });
      }

      URL.revokeObjectURL(audioUrl);

      if (hubState.speechRecognition === recognition) {
        hubState.speechRecognition = null;
        hubState.speechAudioElement = null;
        hubState.speechAudioStream = null;
      }

      if (hubState.cancelAudioTranscription === cancel) {
        hubState.cancelAudioTranscription = null;
      }

      resolve({
        transcript: latestTranscript.trim(),
        error: lastError
      });
    };

    const cancel = function () {
      try {
        recognition.abort();
      } catch (_error) {
        // Recognition may not have started yet.
      }

      finish();
    };
    hubState.cancelAudioTranscription = cancel;

    audioElement.preload = "auto";
    audioElement.muted = !userInitiated;
    audioElement.src = audioUrl;

    audioElement.addEventListener("error", function () {
      lastError = "audio-load";
      finish();
    }, { once: true });

    audioElement.addEventListener("canplay", function () {
      if (settled) {
        return;
      }

      const captureStream = audioElement.captureStream || audioElement.webkitCaptureStream;

      if (!captureStream) {
        lastError = "track-unsupported";
        finish();
        return;
      }

      capturedStream = captureStream.call(audioElement);
      const audioTrack = capturedStream.getAudioTracks()[0];

      if (!audioTrack || audioTrack.kind !== "audio" || audioTrack.readyState !== "live") {
        lastError = "track-unavailable";
        finish();
        return;
      }

      hubState.speechRecognition = recognition;
      hubState.speechAudioElement = audioElement;
      hubState.speechAudioStream = capturedStream;

      recognition.lang = "en-AU";
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.addEventListener("result", function (event) {
        const transcriptParts = [];

        for (let index = 0; index < event.results.length; index += 1) {
          transcriptParts.push(event.results[index][0].transcript.trim());
        }

        latestTranscript = joinTranscriptParts(transcriptParts);
        elements.noteTranscript.value = joinTranscript(existingTranscript, latestTranscript);
        elements.transcriptField.classList.remove("hidden");
      });

      recognition.addEventListener("error", function (event) {
        lastError = event.error || "unknown";
      });

      recognition.addEventListener("end", finish, { once: true });
      recognition.addEventListener("speechend", function () {
        try {
          recognition.stop();
        } catch (_error) {
          finish();
        }
      }, { once: true });
      audioElement.addEventListener("ended", function () {
        stopTimer = window.setTimeout(function () {
          try {
            recognition.stop();
          } catch (_error) {
            finish();
          }
        }, 700);
      }, { once: true });

      const durationMs = Number.isFinite(audioElement.duration)
        ? audioElement.duration * 1000
        : 60000;
      timeout = window.setTimeout(function () {
        lastError = lastError || "timeout";
        finish();
      }, Math.max(15000, Math.min(durationMs + 10000, 300000)));

      try {
        const playback = audioElement.play();
        recognition.start(audioTrack);

        if (playback && typeof playback.catch === "function") {
          playback.catch(function () {
            lastError = "playback-blocked";
            finish();
          });
        }
      } catch (_error) {
        lastError = "start-failed";
        finish();
      }
    }, { once: true });

    audioElement.load();
  });
}

function stopPostRecordingTranscription() {
  if (hubState.cancelAudioTranscription) {
    const cancel = hubState.cancelAudioTranscription;
    hubState.cancelAudioTranscription = null;
    cancel();
  }
}

function setTranscriptionBusy(isBusy) {
  elements.startRecording.disabled = isBusy;
  elements.removeAudio.disabled = isBusy;
  elements.audioInput.disabled = isBusy;
  elements.saveNoteButton.disabled = isBusy;
  elements.transcribeAudio.disabled = isBusy;
}

function speechRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function voiceRecordingReadyMessage(errorCode) {
  if (elements.noteTranscript.value.trim()) {
    return "Recording and transcript ready. You can correct the wording before saving.";
  }

  if (errorCode === "unsupported") {
    return "Recording ready. Automatic transcription is not supported by this browser, but the audio is safe.";
  }

  const errorLabels = {
    "not-allowed": "permission was denied",
    "service-not-allowed": "the speech service was unavailable",
    "audio-capture": "the saved audio track could not be read",
    "audio-load": "the recording could not be loaded",
    "track-unsupported": "audio-track transcription is unsupported",
    "track-unavailable": "the saved audio track was unavailable",
    "playback-blocked": "Chrome blocked the recording replay",
    "network": "the speech service could not connect",
    "no-speech": "no speech was detected",
    "aborted": "transcription was interrupted",
    "timeout": "transcription timed out",
    "start-failed": "transcription could not start",
    "unknown": "an unknown speech error occurred"
  };
  const detail = errorLabels[errorCode] || "no speech result was returned";

  return "Recording ready, but " + detail + ". Tap “Try transcription again”; Chrome may briefly replay the recording. The audio is safe.";
}

function joinTranscript(first, second) {
  return [first, second].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function joinTranscriptParts(parts) {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function clearAudioPreviewUrl() {
  if (hubState.audioUrl) {
    URL.revokeObjectURL(hubState.audioUrl);
    hubState.audioUrl = "";
  }
}

function stopActiveMediaStream() {
  if (hubState.mediaStream) {
    hubState.mediaStream.getTracks().forEach(function (track) {
      track.stop();
    });
    hubState.mediaStream = null;
  }
}

async function saveImprovementNote(event) {
  event.preventDefault();

  const body = elements.noteBody.value.trim();
  const transcript = elements.noteTranscript.value.trim();
  const hasPhoto = Boolean(hubState.photoFile);
  const hasAudio = Boolean(hubState.audioFile);

  if (!body && !transcript && !hasPhoto && !hasAudio) {
    showCaptureMessage("Write a note, add a photo or record a voice note first.", "error");
    return;
  }

  if (!hubState.user || !hubState.venue) {
    showCaptureMessage("Your secure session has expired. Sign in again.", "error");
    return;
  }

  setButtonBusy(elements.saveNoteButton, true, "Saving securely…");
  showCaptureMessage("Saving your note and private media…");

  const captureType = determineCaptureType(Boolean(body || transcript), hasPhoto, hasAudio);
  const noteResult = await supabaseClient
    .from("improvement_notes")
    .insert({
      venue_id: hubState.venue.id,
      created_by: hubState.user.id,
      capture_type: captureType,
      title: buildNoteTitle(body, transcript, hasPhoto, hasAudio),
      body: body || null,
      transcript: transcript || null,
      category: elements.noteCategory.value || null,
      priority: elements.notePriority.value,
      status: "inbox"
    })
    .select("*")
    .single();

  if (noteResult.error) {
    setButtonBusy(elements.saveNoteButton, false);
    showCaptureMessage(friendlyError(noteResult.error), "error");
    return;
  }

  const attachmentErrors = [];

  if (hasPhoto) {
    try {
      await uploadAttachment(noteResult.data, hubState.photoFile, "photo");
    } catch (error) {
      attachmentErrors.push("photo: " + friendlyError(error));
    }
  }

  if (hasAudio) {
    try {
      await uploadAttachment(noteResult.data, hubState.audioFile, "audio");
    } catch (error) {
      attachmentErrors.push("recording: " + friendlyError(error));
    }
  }

  setButtonBusy(elements.saveNoteButton, false);
  resetCaptureForm();
  await loadInbox();

  if (attachmentErrors.length) {
    showCaptureMessage("The note was saved, but one attachment failed to upload. " + attachmentErrors.join(" "), "error");
    return;
  }

  showCaptureMessage("Saved securely to your Improvement Inbox.", "success");
  showToast("Improvement note saved");
}

async function uploadAttachment(note, file, mediaKind) {
  const extension = safeFileExtension(file);
  const objectName = uniqueId() + "." + extension;
  const storagePath =
    hubState.venue.id +
    "/" +
    hubState.user.id +
    "/" +
    objectName;

  const uploadResult = await supabaseClient.storage
    .from(MEDIA_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: file.type || undefined,
      upsert: false
    });

  if (uploadResult.error) {
    throw uploadResult.error;
  }

  const metadataResult = await supabaseClient
    .from("note_attachments")
    .insert({
      note_id: note.id,
      venue_id: hubState.venue.id,
      uploaded_by: hubState.user.id,
      storage_path: storagePath,
      media_kind: mediaKind,
      file_name: file.name || objectName,
      mime_type: file.type || null,
      size_bytes: file.size
    });

  if (metadataResult.error) {
    await supabaseClient.storage.from(MEDIA_BUCKET).remove([storagePath]);
    throw metadataResult.error;
  }
}

function resetCaptureForm() {
  elements.noteForm.reset();
  clearPhoto();
  clearAudio();
  elements.notePriority.value = "normal";
}

async function loadInbox() {
  elements.inboxLoading.classList.remove("hidden");
  elements.inboxLoading.textContent = "Loading your private inbox…";
  elements.inboxList.innerHTML = "";

  const result = await supabaseClient
    .from("improvement_notes")
    .select("*, note_attachments(*)")
    .eq("venue_id", hubState.venue.id)
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  if (result.error) {
    elements.inboxLoading.textContent = friendlyError(result.error);
    return;
  }

  hubState.notes = await addSignedMediaUrls(result.data || []);
  updateInboxCount();
  renderInbox();
  renderWeeklyBrief();
}

async function addSignedMediaUrls(notes) {
  return Promise.all(
    notes.map(async function (note) {
      const attachments = await Promise.all(
        (note.note_attachments || []).map(async function (attachment) {
          const signedResult = await supabaseClient.storage
            .from(MEDIA_BUCKET)
            .createSignedUrl(attachment.storage_path, 3600);

          return Object.assign({}, attachment, {
            signed_url: signedResult.error ? "" : signedResult.data.signedUrl
          });
        })
      );

      return Object.assign({}, note, { note_attachments: attachments });
    })
  );
}

function renderInbox() {
  const visibleNotes = hubState.notes.filter(function (note) {
    return hubState.filter === "open"
      ? note.status !== "done"
      : note.status === hubState.filter;
  });

  elements.inboxLoading.classList.add("hidden");

  if (!visibleNotes.length) {
    elements.inboxList.innerHTML =
      '<div class="empty-inbox">' +
      (hubState.notes.length
        ? "No notes match this filter."
        : "Your inbox is empty. Your first quick note, photo or recording will appear here.") +
      "</div>";
    return;
  }

  elements.inboxList.innerHTML = groupedNotesHtml(visibleNotes);
}

function groupedNotesHtml(notes) {
  if (hubState.filter !== "open" && hubState.filter !== "action") {
    return notes.map(noteCardHtml).join("");
  }

  const inboxNotes = notes.filter(function (note) {
    return note.status !== "action";
  });
  const actionNotes = notes.filter(function (note) {
    return note.status === "action";
  });
  const mine = actionNotes.filter(function (note) {
    return parseActionData(note.next_action).owner === "me";
  });
  const assistant = actionNotes.filter(function (note) {
    return parseActionData(note.next_action).owner === "assistant";
  });
  const unassigned = actionNotes.filter(function (note) {
    return !parseActionData(note.next_action).owner;
  });
  const sections = [];

  if (hubState.filter === "open" && inboxNotes.length) {
    sections.push(noteGroupHtml("Inbox", inboxNotes));
  }

  if (mine.length) {
    sections.push(noteGroupHtml("Mine", mine));
  }

  if (assistant.length) {
    sections.push(noteGroupHtml("Assistant’s", assistant));
  }

  if (unassigned.length) {
    sections.push(noteGroupHtml("Unassigned", unassigned));
  }

  return sections.join("");
}

function noteGroupHtml(label, notes) {
  return (
    '<section class="note-group">' +
      '<h4 class="note-group-heading">' + escapeHtml(label) +
      '<span>' + notes.length + "</span></h4>" +
      '<div class="note-group-list">' + notes.map(noteCardHtml).join("") + "</div>" +
    "</section>"
  );
}

function noteCardHtml(note) {
  const title = escapeHtml(note.title || "Improvement note");
  const body = note.body
    ? '<p class="note-copy">' + escapeHtml(note.body) + "</p>"
    : "";
  const transcript = note.transcript
    ? '<div class="transcript-copy"><strong>Transcript</strong><span>' +
      escapeHtml(note.transcript) +
      "</span></div>"
    : "";
  const category = note.category
    ? "<span>" + escapeHtml(note.category) + "</span>"
    : "";
  const media = mediaHtml(note.note_attachments || []);
  const action = actionSummaryHtml(note);

  return (
    '<article class="inbox-card priority-' +
    escapeHtml(note.priority) +
    " status-" +
    escapeHtml(note.status) +
    '" data-note-id="' +
    escapeHtml(note.id) +
    '">' +
      '<div class="inbox-card-header">' +
        "<div>" +
          "<h4>" + title + "</h4>" +
          '<div class="note-meta">' +
            category +
            (note.priority !== "normal"
              ? "<span>" + escapeHtml(priorityLabel(note.priority)) + "</span>"
              : "") +
            "<span>" + escapeHtml(formatDateTime(note.occurred_at)) + "</span>" +
          "</div>" +
        "</div>" +
        '<span class="status-pill">' + escapeHtml(statusLabel(note.status)) + "</span>" +
      "</div>" +
      body +
      transcript +
      action +
      media +
      '<div class="note-utility-actions" aria-label="Edit note details">' +
        '<button class="note-utility-button" type="button" data-edit-title="' +
        escapeHtml(note.id) +
        '">Edit title</button>' +
        '<button class="note-utility-button' +
        (isFollowUpFlagged(note) ? " active" : "") +
        '" type="button" data-toggle-follow-up="' +
        escapeHtml(note.id) +
        '">' +
        (isFollowUpFlagged(note) ? "Remove follow-up" : "Flag for follow-up") +
        "</button>" +
      "</div>" +
      '<div class="note-actions" aria-label="Change note status">' +
        statusButtonHtml(note, "inbox", "Keep in Inbox") +
        statusButtonHtml(note, "action", "Move to Action") +
        statusButtonHtml(note, "done", "Mark Done") +
      "</div>" +
    "</article>"
  );
}

function mediaHtml(attachments) {
  if (!attachments.length) {
    return "";
  }

  const items = attachments.map(function (attachment) {
    if (!attachment.signed_url) {
      return '<span class="media-error">Private attachment unavailable. Refresh to try again.</span>';
    }

    if (attachment.media_kind === "photo") {
      return (
        '<a href="' +
        escapeHtml(attachment.signed_url) +
        '" target="_blank" rel="noopener">' +
        '<img src="' +
        escapeHtml(attachment.signed_url) +
        '" alt="Improvement note photo" loading="lazy" />' +
        "</a>"
      );
    }

    return (
      '<audio controls preload="metadata" src="' +
      escapeHtml(attachment.signed_url) +
      '"></audio>'
    );
  });

  return '<div class="note-media-list">' + items.join("") + "</div>";
}

function actionSummaryHtml(note) {
  if (note.status !== "action") {
    return "";
  }

  const actionData = parseActionData(note.next_action);
  const ownerLabel = actionData.owner === "assistant"
    ? "Assistant"
    : actionData.owner === "me"
      ? "Me"
      : "Unassigned";
  const actionTitle = actionData.action || note.title || "Follow up";
  const dueLabel = note.due_date ? " · " + formatDueDate(note.due_date) : "";

  return (
    '<div class="action-summary">' +
      "<span>" + escapeHtml(ownerLabel + dueLabel) + "</span>" +
      "<strong>" + escapeHtml(actionTitle) + "</strong>" +
    "</div>"
  );
}

function parseActionData(value) {
  if (!value) {
    return { action: "", owner: "" };
  }

  try {
    const parsed = JSON.parse(value);

    if (parsed && typeof parsed === "object") {
      return {
        action: typeof parsed.action === "string" ? parsed.action : "",
        owner: parsed.owner === "me" || parsed.owner === "assistant" ? parsed.owner : ""
      };
    }
  } catch (_error) {
    // Older plain-text next actions remain fully supported.
  }

  return { action: String(value), owner: "" };
}

function serialiseActionData(action, owner) {
  return JSON.stringify({
    action: action || "Follow up",
    owner: owner === "assistant" ? "assistant" : "me"
  });
}

function statusButtonHtml(note, status, label) {
  if (note.status === status) {
    return "";
  }

  return (
    '<button class="status-button" type="button" data-status-action="' +
    status +
    '" data-note-id="' +
    escapeHtml(note.id) +
    '">' +
    label +
    "</button>"
  );
}

function changeInboxFilter(event) {
  const button = event.target.closest("[data-status]");

  if (!button) {
    return;
  }

  hubState.filter = button.dataset.status;
  elements.statusFilters.querySelectorAll(".filter-button").forEach(function (filterButton) {
    filterButton.classList.toggle("active", filterButton === button);
  });
  renderInbox();
}

async function handleInboxAction(event) {
  const editButton = event.target.closest("[data-edit-title]");
  const followUpButton = event.target.closest("[data-toggle-follow-up]");

  if (editButton) {
    await editNoteTitle(editButton.dataset.editTitle);
    return;
  }

  if (followUpButton) {
    await toggleFollowUp(followUpButton.dataset.toggleFollowUp, followUpButton);
    return;
  }

  const button = event.target.closest("[data-status-action]");

  if (!button) {
    return;
  }

  const noteId = button.dataset.noteId;
  const newStatus = button.dataset.statusAction;
  const note = hubState.notes.find(function (item) {
    return item.id === noteId;
  });
  const update = { status: newStatus };

  if (newStatus === "action" && note && !note.next_action) {
    update.next_action = serialiseActionData(note.title || "Follow up", "me");
  }

  setButtonBusy(button, true, "Saving…");

  const result = await supabaseClient
    .from("improvement_notes")
    .update(update)
    .eq("id", noteId);

  setButtonBusy(button, false);

  if (result.error) {
    showToast(friendlyError(result.error));
    return;
  }

  if (note) {
    Object.assign(note, update, { updated_at: new Date().toISOString() });
  }

  updateInboxCount();
  renderInbox();
  renderWeeklyBrief();
  showToast("Note moved to " + statusLabel(newStatus));
}

async function editNoteTitle(noteId) {
  const note = hubState.notes.find(function (item) {
    return item.id === noteId;
  });

  if (!note) {
    return;
  }

  const currentTitle = briefItemTitle(note);
  const nextTitle = window.prompt("Give this note a clear title", currentTitle);

  if (nextTitle === null || !nextTitle.trim() || nextTitle.trim() === currentTitle) {
    return;
  }

  const cleanTitle = nextTitle.trim();
  const update = { title: cleanTitle };
  const actionData = parseActionData(note.next_action);

  if (note.next_action) {
    update.next_action = serialiseActionData(cleanTitle, actionData.owner || "me");
  }

  const result = await supabaseClient
    .from("improvement_notes")
    .update(update)
    .eq("id", noteId);

  if (result.error) {
    showToast(friendlyError(result.error));
    return;
  }

  Object.assign(note, update, { updated_at: new Date().toISOString() });
  renderInbox();
  renderWeeklyBrief();
  showToast("Title updated");
}

async function toggleFollowUp(noteId, button) {
  const note = hubState.notes.find(function (item) {
    return item.id === noteId;
  });

  if (!note) {
    return;
  }

  const priority = isFollowUpFlagged(note) ? "normal" : "high";
  setButtonBusy(button, true, "Saving…");

  const result = await supabaseClient
    .from("improvement_notes")
    .update({ priority: priority })
    .eq("id", noteId);

  setButtonBusy(button, false);

  if (result.error) {
    showToast(friendlyError(result.error));
    return;
  }

  Object.assign(note, { priority: priority, updated_at: new Date().toISOString() });
  renderInbox();
  renderWeeklyBrief();
  showToast(priority === "high" ? "Flagged for follow-up" : "Follow-up flag removed");
}

function isFollowUpFlagged(note) {
  return note.priority === "high" || note.priority === "urgent";
}

function updateInboxCount() {
  const openCount = hubState.notes.filter(function (note) {
    return note.status !== "done" && note.status !== "archived";
  }).length;
  const reviewCount = hubState.notes.filter(function (note) {
    return note.status === "inbox";
  }).length;

  elements.openInboxCount.textContent = String(openCount);
  elements.startRapidReview.disabled = reviewCount === 0;
  elements.startRapidReview.textContent = reviewCount
    ? "Review Inbox (" + reviewCount + ")"
    : "Inbox reviewed";
}

function startRapidReview() {
  hubState.reviewQueue = hubState.notes
    .filter(function (note) {
      return note.status === "inbox";
    })
    .slice()
    .reverse();
  hubState.reviewIndex = 0;
  hubState.reviewDue = "";
  elements.rapidReviewOverlay.classList.remove("hidden");
  document.body.classList.add("review-open");
  renderRapidReview();
}

function closeRapidReview() {
  if (!elements.rapidReviewOverlay) {
    return;
  }

  elements.rapidReviewOverlay.classList.add("hidden");
  document.body.classList.remove("review-open");
  hubState.reviewQueue = [];
  hubState.reviewIndex = 0;
  hubState.reviewDue = "";
  setMessage(elements.rapidReviewMessage, "");
}

function renderRapidReview() {
  const note = currentReviewNote();
  const total = hubState.reviewQueue.length;

  if (!note) {
    elements.rapidReviewProgress.textContent = total ? total + " reviewed" : "";
    elements.rapidReviewCard.classList.add("hidden");
    elements.rapidReviewEmpty.classList.remove("hidden");
    return;
  }

  const actionData = parseActionData(note.next_action);
  elements.rapidReviewProgress.textContent =
    "Note " + (hubState.reviewIndex + 1) + " of " + total;
  elements.rapidReviewEmpty.classList.add("hidden");
  elements.rapidReviewCard.classList.remove("hidden");
  elements.reviewActionTitle.value =
    actionData.action || draftActionTitle(note);
  elements.reviewTranscript.textContent = note.transcript || "";
  elements.reviewTranscriptWrap.classList.toggle("hidden", !note.transcript);
  elements.reviewBody.textContent = note.body || "";
  elements.reviewBodyWrap.classList.toggle("hidden", !note.body);
  elements.reviewMedia.innerHTML = mediaHtml(note.note_attachments || []);
  setReviewDue("");
  setMessage(elements.rapidReviewMessage, "");
  window.setTimeout(function () {
    elements.reviewActionTitle.focus();
    elements.reviewActionTitle.select();
  }, 0);
}

function currentReviewNote() {
  return hubState.reviewQueue[hubState.reviewIndex] || null;
}

function handleRapidReviewClick(event) {
  const dueButton = event.target.closest("[data-review-due]");

  if (dueButton) {
    setReviewDue(dueButton.dataset.reviewDue || "");
    return;
  }

  const decisionButton = event.target.closest("[data-review-decision]");

  if (decisionButton) {
    saveRapidReviewDecision(decisionButton.dataset.reviewDecision);
  }
}

function setReviewDue(value) {
  hubState.reviewDue = value;
  elements.rapidReviewOverlay.querySelectorAll("[data-review-due]").forEach(function (button) {
    button.classList.toggle("active", (button.dataset.reviewDue || "") === value);
  });
}

async function saveRapidReviewDecision(decision) {
  const note = currentReviewNote();

  if (!note) {
    return;
  }

  const actionTitle =
    elements.reviewActionTitle.value.trim() || draftActionTitle(note) || "Follow up";
  const update = { title: actionTitle };

  if (decision === "me" || decision === "assistant") {
    update.status = "action";
    update.next_action = serialiseActionData(actionTitle, decision);
    update.due_date = resolveReviewDueDate(hubState.reviewDue);
  } else if (decision === "done") {
    update.status = "done";
  } else {
    update.status = "inbox";
  }

  setRapidReviewBusy(true);
  setMessage(elements.rapidReviewMessage, "Saving…");

  const result = await supabaseClient
    .from("improvement_notes")
    .update(update)
    .eq("id", note.id);

  setRapidReviewBusy(false);

  if (result.error) {
    setMessage(elements.rapidReviewMessage, friendlyError(result.error), "error");
    return;
  }

  Object.assign(note, update);
  const stateNote = hubState.notes.find(function (item) {
    return item.id === note.id;
  });

  if (stateNote) {
    Object.assign(stateNote, update, { updated_at: new Date().toISOString() });
  }

  hubState.reviewIndex += 1;
  updateInboxCount();
  renderInbox();
  renderWeeklyBrief();
  renderRapidReview();
}

function changeBriefWeek(days) {
  const nextWeek = new Date(hubState.briefWeekStart);
  nextWeek.setDate(nextWeek.getDate() + days);
  hubState.briefWeekStart = startOfWeek(nextWeek);
  renderWeeklyBrief();
}

function renderWeeklyBrief() {
  if (!elements.weeklyBriefSummary) {
    return;
  }

  const brief = buildWeeklyBrief(hubState.notes, hubState.briefWeekStart);
  elements.weeklyBriefRange.textContent =
    formatBriefDay(brief.weekStart) + " – " + formatBriefDay(brief.weekEnd);
  elements.briefOutstandingCount.textContent = String(brief.outstanding.length);
  elements.briefCompletedCount.textContent = String(brief.completed.length);
  elements.briefFollowUpCount.textContent = String(brief.followUp.length);
  elements.briefOutstandingList.innerHTML = briefListHtml(brief.outstanding, "Nothing outstanding.");
  elements.briefCompletedList.innerHTML = briefListHtml(brief.completed, "Nothing completed in this week.");
  elements.briefFollowUpList.innerHTML = briefListHtml(brief.followUp, "No follow-up flags.");
  elements.weeklyBriefSummary.innerHTML =
    briefMetricHtml("Outstanding", brief.outstanding.length) +
    briefMetricHtml("Mine", brief.mine.length) +
    briefMetricHtml("Assistant", brief.assistant.length) +
    briefMetricHtml("Completed", brief.completed.length) +
    briefMetricHtml("Overdue", brief.overdue.length);
  elements.handoverDraft.value = buildHandoverDraft(brief);
  elements.pulseDraft.value = buildPulseDraft(brief);
}

function buildWeeklyBrief(notes, weekStartValue) {
  const weekStart = startOfDay(weekStartValue);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  const today = startOfDay(new Date());
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 2);

  const outstanding = notes.filter(function (note) {
    return note.status !== "done" && note.status !== "archived";
  });
  const completed = notes.filter(function (note) {
    const completedAt = new Date(note.updated_at || note.created_at);
    return note.status === "done" && completedAt >= weekStart && completedAt <= weekEnd;
  });
  const mine = outstanding.filter(function (note) {
    return note.status === "action" && parseActionData(note.next_action).owner === "me";
  });
  const assistant = outstanding.filter(function (note) {
    return note.status === "action" && parseActionData(note.next_action).owner === "assistant";
  });
  const overdue = outstanding.filter(function (note) {
    return note.due_date && dateFromIsoDay(note.due_date) < today;
  });
  const followUp = outstanding.filter(function (note) {
    const due = note.due_date ? dateFromIsoDay(note.due_date) : null;
    return (
      overdue.includes(note) ||
      (due && due <= soon) ||
      note.priority === "urgent" ||
      note.priority === "high"
    );
  });

  return {
    weekStart: weekStart,
    weekEnd: weekEnd,
    outstanding: outstanding,
    completed: completed,
    mine: mine,
    assistant: assistant,
    overdue: overdue,
    followUp: followUp
  };
}

function briefMetricHtml(label, value) {
  return (
    '<div class="brief-metric"><span>' + escapeHtml(label) + "</span><strong>" +
    escapeHtml(value) + "</strong></div>"
  );
}

function briefListHtml(notes, emptyMessage) {
  if (!notes.length) {
    return '<p class="brief-empty">' + escapeHtml(emptyMessage) + "</p>";
  }

  return notes.map(function (note) {
    const action = parseActionData(note.next_action);
    const owner = action.owner === "assistant" ? "Assistant" : action.owner === "me" ? "Me" : "";
    const due = note.due_date ? formatDueDate(note.due_date) : "";
    const meta = [owner, due, note.status === "inbox" ? "Inbox" : ""].filter(Boolean).join(" · ");

    return (
      '<div class="brief-item"><strong>' +
      escapeHtml(briefItemTitle(note)) +
      "</strong>" +
      (meta ? "<span>" + escapeHtml(meta) + "</span>" : "") +
      '<div class="brief-item-actions">' +
        '<button type="button" data-edit-title="' + escapeHtml(note.id) + '">Edit title</button>' +
        '<button type="button" data-toggle-follow-up="' + escapeHtml(note.id) + '">' +
        (isFollowUpFlagged(note) ? "Unflag" : "Follow-up") +
        "</button>" +
      "</div>" +
      "</div>"
    );
  }).join("");
}

function buildHandoverDraft(brief) {
  const isFollowUp = function (note) {
    return brief.followUp.includes(note);
  };
  const sections = [
    ["PRIORITIES / FOLLOW-UP", brief.followUp],
    ["MY ACTIONS", brief.mine.filter(function (note) {
      return !isFollowUp(note);
    })],
    ["ASSISTANT ACTIONS", brief.assistant.filter(function (note) {
      return !isFollowUp(note);
    })],
    ["OTHER OUTSTANDING", brief.outstanding.filter(function (note) {
      return !brief.mine.includes(note) && !brief.assistant.includes(note) && !isFollowUp(note);
    })],
    ["COMPLETED THIS WEEK", brief.completed]
  ].filter(function (section) {
    return section[1].length;
  });

  const lines = [
    "ANDIAMO OPERATIONS HANDOVER",
    formatBriefDay(brief.weekStart) + " – " + formatBriefDay(brief.weekEnd)
  ];

  sections.forEach(function (section) {
    lines.push("", section[0], briefTextItems(section[1]));
  });

  return lines.join("\n");
}

function buildPulseDraft(brief) {
  const completedByCategory = groupTitlesByCategory(brief.completed);
  const openByCategory = groupTitlesByCategory(brief.outstanding);

  return [
    "WEEKLY PULSE STARTING POINTS",
    formatBriefDay(brief.weekStart) + " – " + formatBriefDay(brief.weekEnd),
    "",
    "ACHIEVEMENTS / COMPLETED",
    completedByCategory || "• None captured in the Hub for this week",
    "",
    "CHALLENGES / STILL OPEN",
    openByCategory || "• None currently outstanding",
    "",
    "FOLLOW-UP FOR NEXT WEEK",
    briefTextItems(brief.followUp)
  ].join("\n");
}

function groupTitlesByCategory(notes) {
  const groups = {};

  notes.forEach(function (note) {
    const category = note.category || "Unsorted";
    groups[category] = groups[category] || [];
    groups[category].push(note);
  });

  return Object.keys(groups).sort().map(function (category) {
    return category + "\n" + briefTextItems(groups[category]);
  }).join("\n\n");
}

function briefTextItems(notes) {
  if (!notes.length) {
    return "• None";
  }

  return notes.map(function (note) {
    const action = parseActionData(note.next_action);
    const owner = action.owner === "assistant" ? "Assistant" : action.owner === "me" ? "Me" : "";
    const due = note.due_date ? formatDueDate(note.due_date) : "";
    const detail = [owner, due].filter(Boolean).join(", ");
    return "• " + briefItemTitle(note) + (detail ? " — " + detail : "");
  }).join("\n");
}

function briefItemTitle(note) {
  const action = parseActionData(note.next_action);
  const title = action.action || note.title || "";
  const genericTitles = ["Voice note", "Photo note", "Voice and photo note", "Improvement note"];
  const isTruncated = /(?:…|\.\.\.)$/.test(title.trim());

  if ((isTruncated || genericTitles.includes(title)) && note.transcript && note.transcript.trim()) {
    return note.transcript.trim();
  }

  if ((isTruncated || genericTitles.includes(title)) && note.body && note.body.trim()) {
    return note.body.trim();
  }

  return title || "Improvement note";
}

async function copyBriefText(textarea, successMessage) {
  try {
    await navigator.clipboard.writeText(textarea.value);
  } catch (_error) {
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
  }

  showToast(successMessage);
}

function startOfWeek(value) {
  const date = startOfDay(value);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  return date;
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function dateFromIsoDay(value) {
  const parts = String(value).split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatBriefDay(value) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(value);
}

function setRapidReviewBusy(busy) {
  elements.rapidReviewOverlay
    .querySelectorAll("[data-review-decision], [data-review-due], #reviewActionTitle")
    .forEach(function (control) {
      control.disabled = busy;
    });
}

function draftActionTitle(note) {
  const genericTitles = ["Voice note", "Photo note", "Voice and photo note", "Improvement note"];
  const source =
    (genericTitles.includes(note.title) ? "" : note.title) ||
    note.transcript ||
    note.body ||
    note.title ||
    "Follow up";
  const firstThought = source.split(/[.!?\n]/)[0].trim();

  return firstThought.length > 90
    ? firstThought.slice(0, 87).trim() + "…"
    : firstThought;
}

function resolveReviewDueDate(value) {
  if (!value) {
    return null;
  }

  const due = new Date();
  due.setHours(12, 0, 0, 0);

  if (value === "tomorrow") {
    due.setDate(due.getDate() + 1);
  } else if (value === "week") {
    const daysUntilSunday = (7 - due.getDay()) % 7;
    due.setDate(due.getDate() + daysUntilSunday);
  }

  return [
    due.getFullYear(),
    String(due.getMonth() + 1).padStart(2, "0"),
    String(due.getDate()).padStart(2, "0")
  ].join("-");
}

function determineCaptureType(hasText, hasPhoto, hasAudio) {
  const selected = [hasText, hasPhoto, hasAudio].filter(Boolean).length;

  if (selected > 1) {
    return "mixed";
  }

  if (hasAudio) {
    return "voice";
  }

  if (hasPhoto) {
    return "photo";
  }

  return "text";
}

function buildNoteTitle(body, transcript, hasPhoto, hasAudio) {
  const source = body || transcript;

  if (source) {
    const firstLine = source.split(/\r?\n/)[0].trim();
    return firstLine.length > 72 ? firstLine.slice(0, 69) + "…" : firstLine;
  }

  if (hasAudio && hasPhoto) {
    return "Voice and photo note";
  }

  return hasAudio ? "Voice note" : "Photo note";
}

function safeFileExtension(file) {
  const fileName = file.name || "";
  const rawExtension = fileName.includes(".")
    ? fileName.split(".").pop().toLowerCase()
    : "";
  const cleaned = rawExtension.replace(/[^a-z0-9]/g, "");

  if (cleaned && cleaned.length <= 8) {
    return cleaned;
  }

  return extensionForMimeType(file.type);
}

function extensionForMimeType(mimeType) {
  const cleanType = (mimeType || "").split(";")[0].toLowerCase();
  const map = {
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/aac": "aac",
    "audio/wav": "wav",
    "audio/x-m4a": "m4a",
    "audio/ogg": "ogg",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif"
  };

  return map[cleanType] || "bin";
}

function uniqueId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return Date.now() + "-" + Math.random().toString(16).slice(2);
}

function fileIsWithinLimit(file) {
  return file.size <= 26214400;
}

function priorityLabel(priority) {
  const labels = {
    low: "Low",
    normal: "Normal",
    high: "Important",
    urgent: "Urgent"
  };

  return labels[priority] || "Normal";
}

function statusLabel(status) {
  const labels = {
    inbox: "Inbox",
    review: "Review",
    action: "Action",
    done: "Done",
    archived: "Archived"
  };

  return labels[status] || "Inbox";
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDueDate(value) {
  const parts = String(value).split("-").map(Number);

  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return value;
  }

  return "Due " + new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short"
  }).format(new Date(parts[0], parts[1] - 1, parts[2], 12));
}

function showAuthMessage(message, type) {
  setMessage(elements.authMessage, message, type);
}

function showCaptureMessage(message, type) {
  setMessage(elements.captureMessage, message, type);
}

function setMessage(element, message, type) {
  element.textContent = message || "";
  element.classList.remove("error", "success");

  if (type) {
    element.classList.add(type);
  }
}

function setButtonBusy(button, busy, busyText) {
  if (busy) {
    button.dataset.normalText = button.textContent;
    button.disabled = true;
    button.textContent = busyText || "Working…";
    return;
  }

  button.disabled = false;

  if (button.dataset.normalText) {
    button.textContent = button.dataset.normalText;
    delete button.dataset.normalText;
  }
}

function showToast(message) {
  elements.hubToast.textContent = message;
  elements.hubToast.classList.add("visible");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(function () {
    elements.hubToast.classList.remove("visible");
  }, 2600);
}

function friendlyError(error) {
  if (!error) {
    return "Something went wrong. Please try again.";
  }

  const message = error.message || String(error);

  if (/rate limit/i.test(message)) {
    return "Too many login emails were requested. Wait a little while and try again.";
  }

  if (/failed to fetch|network/i.test(message)) {
    return "The internet connection was interrupted. Check the connection and try again.";
  }

  return message;
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
