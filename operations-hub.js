"use strict";

const SUPABASE_URL = "https://qqiqcienzphskhqdnzil.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_GZ3FRa_0_36wHKyNtDCyLQ_LiEP-bMk";
const DEFAULT_VENUE_NAME = "Andiamo Trattoria Chippendale";
const MEDIA_BUCKET = "operations-media";

const hubState = {
  user: null,
  venue: null,
  notes: [],
  filter: "all",
  photoFile: null,
  photoUrl: "",
  audioFile: null,
  audioUrl: "",
  mediaRecorder: null,
  mediaStream: null,
  recordingChunks: [],
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
    "removeAudio",
    "transcriptField",
    "noteTranscript",
    "captureMessage",
    "saveNoteButton",
    "statusFilters",
    "inboxLoading",
    "inboxList",
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
  elements.removeAudio.addEventListener("click", clearAudio);
  elements.statusFilters.addEventListener("click", changeInboxFilter);
  elements.inboxList.addEventListener("click", handleInboxAction);
  window.addEventListener("beforeunload", stopActiveMediaStream);
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

    hubState.mediaRecorder.addEventListener("stop", finishVoiceRecording);
    hubState.mediaRecorder.start();

    elements.startRecording.disabled = true;
    elements.startRecording.classList.add("recording");
    elements.startRecording.textContent = "Recording…";
    elements.stopRecording.classList.remove("hidden");
    elements.voiceHelp.textContent = "Speak now. Tap stop when you are finished.";
    showCaptureMessage("");
  } catch (error) {
    stopActiveMediaStream();
    showCaptureMessage("Microphone access was not available. You can allow it in your browser or choose an audio file.", "error");
  }
}

function stopVoiceRecording() {
  if (hubState.mediaRecorder && hubState.mediaRecorder.state !== "inactive") {
    elements.stopRecording.disabled = true;
    hubState.mediaRecorder.stop();
  }
}

function finishVoiceRecording() {
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
  elements.startRecording.disabled = false;
  elements.startRecording.classList.remove("recording");
  elements.startRecording.textContent = "Start recording";
  elements.stopRecording.disabled = false;
  elements.stopRecording.classList.add("hidden");
  elements.voiceHelp.textContent = "Recording ready. You can listen before saving.";
  elements.transcriptField.classList.remove("hidden");
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
  if (hubState.mediaRecorder && hubState.mediaRecorder.state !== "inactive") {
    hubState.mediaRecorder.stop();
  }

  stopActiveMediaStream();
  clearAudioPreviewUrl();
  hubState.audioFile = null;
  elements.audioInput.value = "";
  elements.audioPreview.removeAttribute("src");
  elements.audioPreviewWrap.classList.add("hidden");
  elements.transcriptField.classList.add("hidden");
  elements.noteTranscript.value = "";
  elements.startRecording.disabled = false;
  elements.startRecording.classList.remove("recording");
  elements.startRecording.textContent = "Start recording";
  elements.stopRecording.disabled = false;
  elements.stopRecording.classList.add("hidden");
  elements.voiceHelp.textContent = "Tap start, speak, then tap stop.";
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
    return hubState.filter === "all" || note.status === hubState.filter;
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

  elements.inboxList.innerHTML = visibleNotes.map(noteCardHtml).join("");
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
    : "<span>Unsorted</span>";
  const media = mediaHtml(note.note_attachments || []);

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
            "<span>" + escapeHtml(priorityLabel(note.priority)) + "</span>" +
            "<span>" + escapeHtml(formatDateTime(note.occurred_at)) + "</span>" +
          "</div>" +
        "</div>" +
        '<span class="status-pill">' + escapeHtml(statusLabel(note.status)) + "</span>" +
      "</div>" +
      body +
      transcript +
      media +
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

function statusButtonHtml(note, status, label) {
  return (
    '<button class="status-button' +
    (note.status === status ? " active" : "") +
    '" type="button" data-status-action="' +
    status +
    '" data-note-id="' +
    escapeHtml(note.id) +
    '"' +
    (note.status === status ? " disabled" : "") +
    ">" +
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
  const button = event.target.closest("[data-status-action]");

  if (!button) {
    return;
  }

  const noteId = button.dataset.noteId;
  const newStatus = button.dataset.statusAction;
  setButtonBusy(button, true, "Saving…");

  const result = await supabaseClient
    .from("improvement_notes")
    .update({ status: newStatus })
    .eq("id", noteId);

  setButtonBusy(button, false);

  if (result.error) {
    showToast(friendlyError(result.error));
    return;
  }

  const note = hubState.notes.find(function (item) {
    return item.id === noteId;
  });

  if (note) {
    note.status = newStatus;
  }

  updateInboxCount();
  renderInbox();
  showToast("Note moved to " + statusLabel(newStatus));
}

function updateInboxCount() {
  const openCount = hubState.notes.filter(function (note) {
    return note.status !== "done" && note.status !== "archived";
  }).length;

  elements.openInboxCount.textContent = String(openCount);
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
