"use client";
/* eslint-disable @next/next/no-img-element -- User uploads and arbitrary GIF URLs are runtime media. */

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import { io, Socket } from "socket.io-client";
import { Check, CheckCheck, Clock3, Copy, FileIcon, Film, Image as ImageIcon, MapPin, Maximize2, Mic, MicOff, Minimize2, MoreVertical, Paperclip, Phone, PhoneOff, ScreenShare, ScreenShareOff, Search, Send, Smile, Sparkles, SwitchCamera, Trash2, Video, VideoOff, Volume2, VolumeX, Wifi, WifiOff, X } from "lucide-react";

type User = { id: string; name: string; email: string; lastSeen?: string };
type Attachment = { url: string; name: string; mime: string; size: number; kind?: string };
type Message = { id: string; senderId: string; recipientId: string; body: string; type: string; attachments: Attachment[]; location?: { latitude: number; longitude: number }; status: "sent" | "delivered" | "read"; reactions: Record<string, string[]>; editedAt?: string; deletedForEveryone?: boolean; createdAt: string };
type CallState = { peer: User; incoming: boolean; status: string; type: "voice" | "video"; logId?: string; startedAt: number; connectedAt?: number };
type CallLog = { id: string; peerId: string; type: "voice" | "video"; direction: string; status: string; startedAt: string; durationSeconds: number };
type CallQuality = "Good" | "Fair" | "Poor" | "Connecting";

const reactionOptions = ["❤️", "😂", "👍", "🔥"] as const;
const stickers = ["💖", "🫶", "🌈", "🎁", "☕", "🌻"];
const gifs = [
  "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExMHRuOTRxZms1aGt1dnA1N2EybnF6dWVnMGU2ZzlycDdudGdqbzB2eiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/l0HlBO7eyXzSZkJri/giphy.gif",
  "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZG1ocGI5Y3dzczE0dXZ0cWJsZjN4aXRja2pyMXVheWk4aWp4cWQ5MCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3oriO6qJiXajN0TyDu/giphy.gif",
];

export function ChatRoom({ currentUser }: { currentUser: User }) {
  const [people, setPeople] = useState<User[]>([]);
  const [selected, setSelected] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [composer, setComposer] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [picker, setPicker] = useState<"emoji" | "gif" | "sticker" | "attach" | null>(null);
  const [search, setSearch] = useState("");
  const [activity, setActivity] = useState("");
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickedEmoji, setPickedEmoji] = useState("");
  const [call, setCall] = useState<CallState | null>(null);
  const [pendingOffer, setPendingOffer] = useState<RTCSessionDescriptionInit | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [cameraFacing, setCameraFacing] = useState<"user" | "environment">("user");
  const [sharingScreen, setSharingScreen] = useState(false);
  const [callMinimized, setCallMinimized] = useState(false);
  const [networkState, setNetworkState] = useState<"online" | "reconnecting" | "offline">("online");
  const [callQuality, setCallQuality] = useState<CallQuality>("Connecting");
  const [callHistory, setCallHistory] = useState<CallLog[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const selectedRef = useRef<User | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const finishCallLog = useCallback(async (state: CallState, status: "completed" | "declined" | "missed") => {
    if (!state.logId) return;
    const durationSeconds = state.connectedAt ? Math.max(0, Math.round((Date.now() - state.connectedAt) / 1000)) : 0;
    await fetch(`/api/calls/${state.logId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, durationSeconds }) });
  }, []);

  const stopCall = useCallback((notify = true, status: "completed" | "declined" | "missed" = "completed") => {
    setCall((current) => { if (current) void finishCallLog(current, status); return null; });
    if (notify && selectedRef.current) socketRef.current?.emit("call:end", { targetId: selectedRef.current.id });
    peerRef.current?.close();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenTrackRef.current?.stop(); peerRef.current = null; localStreamRef.current = null; remoteStreamRef.current = null; screenTrackRef.current = null; setPendingOffer(null); setMuted(false); setCameraOff(false); setSpeaker(false); setCallSeconds(0); setCameraFacing("user"); setSharingScreen(false); setCallMinimized(false); setNetworkState("online"); setCallQuality("Connecting");
  }, [finishCallLog]);

  const restartConnection = useCallback(async () => {
    const peer = peerRef.current;
    const targetId = selectedRef.current?.id;
    if (!peer || !targetId || peer.signalingState === "closed") return;
    try {
      setNetworkState("reconnecting");
      setCall((state) => state && { ...state, status: "Reconnecting..." });
      peer.restartIce();
      const offer = await peer.createOffer({ iceRestart: true });
      await peer.setLocalDescription(offer);
      socketRef.current?.emit("call:restart", { targetId, offer });
    } catch { setNetworkState("offline"); }
  }, []);

  useEffect(() => {
    Promise.all([fetch("/api/users"), fetch("/api/friends"), fetch("/api/calls")])
      .then(async ([usersResponse, requestsResponse, callsResponse]) => Promise.all([usersResponse.json(), requestsResponse.json(), callsResponse.json()]))
      .then(([usersData, requestsData, callsData]) => {
        const acceptedIds = new Set<string>((requestsData.requests ?? []).filter((request: { status: string }) => request.status === "accepted").flatMap((request: { senderId: string; recipientId: string }) => [request.senderId, request.recipientId]));
        const friends = (usersData.users ?? []).filter((person: User) => acceptedIds.has(person.id));
        setPeople(friends); setSelected(friends[0] ?? null); setCallHistory(callsData.calls ?? []);
      });
  }, []);

  useEffect(() => {
    if (!selected) return;
    fetch(`/api/messages/${selected.id}`).then((response) => response.json()).then((data) => {
      setMessages(data.messages ?? []);
      socketRef.current?.emit("message:read", { targetId: selected.id });
    });
  }, [selected]);

  useEffect(() => {
    const socket = io(""); socketRef.current = socket;
    socket.on("message:new", (message: Message) => { if (message.senderId === selectedRef.current?.id) { setMessages((items) => [...items, message]); socket.emit("message:read", { targetId: message.senderId }); } });
    socket.on("message:update", (message: Message) => setMessages((items) => items.map((item) => item.id === message.id ? message : item)));
    socket.on("message:status", ({ messageId, status }: { messageId: string; status: Message["status"] }) => setMessages((items) => items.map((item) => item.id === messageId ? { ...item, status } : item)));
    socket.on("message:read", () => setMessages((items) => items.map((item) => item.senderId === currentUser.id ? { ...item, status: "read" } : item)));
    socket.on("presence:update", ({ userId, online: isOnline, lastSeen }: { userId: string; online: boolean; lastSeen?: string }) => { setOnline((items) => { const next = new Set(items); if (isOnline) next.add(userId); else next.delete(userId); return next; }); if (lastSeen) setPeople((items) => items.map((person) => person.id === userId ? { ...person, lastSeen } : person)); });
    socket.on("typing:start", ({ userId, name }: { userId: string; name: string }) => { if (userId === selectedRef.current?.id) setActivity(`${name} is typing...`); });
    socket.on("typing:stop", () => setActivity(""));
    socket.on("recording:start", ({ userId }: { userId: string }) => { if (userId === selectedRef.current?.id) setActivity("🎙️ Recording..."); });
    socket.on("recording:stop", () => setActivity(""));
    socket.on("call:offer", async ({ from, offer, type = "video" }: { from: User; offer: RTCSessionDescriptionInit; type?: "voice" | "video" }) => { selectedRef.current = from; setPendingOffer(offer); setCallSeconds(0); const log = await createCallLog(from.id, type, "incoming"); setCall({ peer: from, incoming: true, status: `Incoming ${type} call`, type, logId: log?.id, startedAt: Date.now() }); });
    socket.on("call:answer", async ({ answer }: { answer: RTCSessionDescriptionInit }) => { await peerRef.current?.setRemoteDescription(answer); const connectedAt = Date.now(); setCallSeconds(0); setCall((state) => state && { ...state, status: "Connected", connectedAt }); });
    socket.on("call:restart", async ({ from, offer }: { from: User; offer: RTCSessionDescriptionInit }) => {
      const peer = peerRef.current;
      if (!peer) return;
      try { await peer.setRemoteDescription(offer); const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); socket.emit("call:answer", { targetId: from.id, answer }); setNetworkState("online"); setCall((state) => state && { ...state, status: "Connected" }); } catch { setNetworkState("offline"); }
    });
    socket.on("call:ice", async ({ candidate }: { candidate: RTCIceCandidateInit }) => { try { await peerRef.current?.addIceCandidate(candidate); } catch {} });
    socket.on("call:end", () => stopCall(false));
    return () => { socket.disconnect(); stopCall(false); };
  }, [currentUser.id, stopCall]);

  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, activity]);
  useEffect(() => {
    if (!call?.connectedAt) return;
    const timer = window.setInterval(() => setCallSeconds(Math.floor((Date.now() - call.connectedAt!) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [call?.connectedAt]);
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    if (remoteVideoRef.current && remoteStreamRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
  }, [call]);
  useEffect(() => {
    function offline() { if (peerRef.current) { setNetworkState("offline"); setCall((state) => state && { ...state, status: "No connection" }); } }
    function online() { if (peerRef.current) void restartConnection(); }
    window.addEventListener("offline", offline); window.addEventListener("online", online);
    return () => { window.removeEventListener("offline", offline); window.removeEventListener("online", online); };
  }, [restartConnection]);
  useEffect(() => {
    if (!call?.connectedAt) return;
    const inspectQuality = window.setInterval(async () => {
      const stats = await peerRef.current?.getStats();
      if (!stats) return;
      let roundTripTime = 0; let packetsLost = 0; let packetsReceived = 0;
      stats.forEach((report) => {
        if (report.type === "candidate-pair" && report.state === "succeeded" && (report.nominated || report.selected)) roundTripTime = report.currentRoundTripTime ?? 0;
        if (report.type === "inbound-rtp" && !report.isRemote) { packetsLost += report.packetsLost ?? 0; packetsReceived += report.packetsReceived ?? 0; }
      });
      const loss = packetsLost / Math.max(1, packetsLost + packetsReceived);
      setCallQuality(roundTripTime > .4 || loss > .08 ? "Poor" : roundTripTime > .15 || loss > .02 ? "Fair" : "Good");
    }, 3000);
    return () => window.clearInterval(inspectQuality);
  }, [call?.connectedAt]);

  async function createCallLog(peerId: string, type: "voice" | "video", direction: "incoming" | "outgoing") {
    const response = await fetch("/api/calls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ peerId, type, direction, status: "missed" }) });
    return response.ok ? (await response.json()).call as CallLog : null;
  }

  async function send(payload: Partial<Message>) {
    if (!selected) return;
    const response = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientId: selected.id, body: payload.body ?? "", type: payload.type ?? "text", attachments: payload.attachments ?? [], location: payload.location }) });
    const data = await response.json();
    if (response.ok) { setMessages((items) => [...items, data.message]); socketRef.current?.emit("message:new", data.message); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!composer.trim()) return;
    if (editingId) { await changeMessage(editingId, { action: "edit", body: composer }); setEditingId(null); }
    else await send({ body: composer, type: "text" });
    setComposer(""); setPicker(null); socketRef.current?.emit("typing:stop", { targetId: selected?.id });
  }

  function type(value: string) {
    setComposer(value);
    if (!selected) return;
    socketRef.current?.emit("typing:start", { targetId: selected.id });
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => socketRef.current?.emit("typing:stop", { targetId: selected.id }), 900);
  }

  function addEmoji(emojiData: EmojiClickData) {
    setComposer((value) => value + emojiData.emoji);
    if (selected) {
      socketRef.current?.emit("typing:start", { targetId: selected.id });
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => socketRef.current?.emit("typing:stop", { targetId: selected.id }), 900);
    }
    setPickedEmoji(emojiData.emoji);
    window.setTimeout(() => setPickedEmoji(""), 450);
  }

  async function upload(files: File[]) {
    if (!files.length) return;
    setUploading(true); const form = new FormData(); files.slice(0, 10).forEach((file) => form.append("files", file));
    const response = await fetch("/api/uploads", { method: "POST", body: form }); const data = await response.json(); setUploading(false);
    if (response.ok) { const attachment = data.attachments[0]; await send({ type: attachment.kind === "image" ? "image" : attachment.kind === "video" ? "video" : attachment.kind === "audio" ? "audio" : "document", attachments: data.attachments }); }
  }

  async function changeMessage(messageId: string, payload: object) {
    const response = await fetch(`/api/messages/item/${messageId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (response.ok && data.message) { setMessages((items) => payload && "action" in payload && payload.action === "deleteMe" ? items.filter((item) => item.id !== messageId) : items.map((item) => item.id === messageId ? data.message : item)); socketRef.current?.emit("message:update", { targetId: selected?.id, message: data.message }); }
    setActiveMenu(null);
  }

  async function shareLocation() {
    navigator.geolocation.getCurrentPosition(async (position) => { await send({ type: "location", body: "Shared location", location: { latitude: position.coords.latitude, longitude: position.coords.longitude } }); setPicker(null); }, () => alert("Location permission is required."));
  }

  async function toggleRecording() {
    if (recording && recorderRef.current) { recorderRef.current.stop(); setRecording(false); socketRef.current?.emit("recording:stop", { targetId: selected?.id }); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); recordingChunksRef.current = [];
      const recorder = new MediaRecorder(stream); recorderRef.current = recorder;
      recorder.ondataavailable = (event) => recordingChunksRef.current.push(event.data);
      recorder.onstop = async () => { const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType }); await upload([new File([blob], `voice-${Date.now()}.webm`, { type: recorder.mimeType })]); stream.getTracks().forEach((track) => track.stop()); };
      recorder.start(); setRecording(true); socketRef.current?.emit("recording:start", { targetId: selected?.id });
    } catch { alert("Microphone permission is required."); }
  }

  async function startCall(type: "voice" | "video") {
    if (!selected) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: type === "video", audio: true }); localStreamRef.current = stream;
      const peer = createPeer(selected, stream); const offer = await peer.createOffer(); await peer.setLocalDescription(offer);
      setCallSeconds(0); const log = await createCallLog(selected.id, type, "outgoing"); setCall({ peer: selected, incoming: false, status: "Ringing...", type, logId: log?.id, startedAt: Date.now() }); socketRef.current?.emit("call:offer", { targetId: selected.id, offer, type });
    } catch { stopCall(false); alert("Microphone and camera permissions are required."); }
  }

  function createPeer(peer: User, stream: MediaStream) {
    const connection = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] }); stream.getTracks().forEach((track) => connection.addTrack(track, stream));
    connection.ontrack = (event) => { remoteStreamRef.current = event.streams[0]; if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0]; setCall((state) => state && state.connectedAt ? state : state && { ...state, status: "Connected", connectedAt: Date.now() }); };
    connection.onicecandidate = (event) => { if (event.candidate) socketRef.current?.emit("call:ice", { targetId: peer.id, candidate: event.candidate.toJSON() }); };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "connected") { setNetworkState("online"); setCall((state) => state && { ...state, status: "Connected" }); }
      if (connection.connectionState === "disconnected") { setNetworkState("reconnecting"); setCall((state) => state && { ...state, status: "Reconnecting..." }); window.setTimeout(() => { if (connection.connectionState === "disconnected") void restartConnection(); }, 1800); }
      if (connection.connectionState === "failed") void restartConnection();
    };
    peerRef.current = connection; return connection;
  }

  async function acceptCall() {
    if (!call || !pendingOffer) return;
    try { const stream = await navigator.mediaDevices.getUserMedia({ video: call.type === "video", audio: true }); localStreamRef.current = stream; const peer = createPeer(call.peer, stream); await peer.setRemoteDescription(pendingOffer); const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); socketRef.current?.emit("call:answer", { targetId: call.peer.id, answer }); const connectedAt = Date.now(); setCallSeconds(0); setCall({ ...call, incoming: false, status: "Connected", connectedAt }); } catch { stopCall(); }
  }

  function toggleTrack(kind: "audio" | "video") { const off = kind === "audio" ? !muted : !cameraOff; const tracks = kind === "audio" ? localStreamRef.current?.getAudioTracks() : localStreamRef.current?.getVideoTracks(); tracks?.forEach((track) => { track.enabled = !off; }); if (kind === "audio") setMuted(off); else setCameraOff(off); }
  async function toggleSpeaker() { const video = remoteVideoRef.current as HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }; if (video.setSinkId) { const devices = await navigator.mediaDevices.enumerateDevices(); const output = devices.find((device) => device.kind === "audiooutput" && device.deviceId !== "default"); await video.setSinkId(speaker ? "default" : output?.deviceId ?? "default"); } setSpeaker(!speaker); }

  async function replaceOutgoingVideo(track: MediaStreamTrack) {
    const sender = peerRef.current?.getSenders().find((item) => item.track?.kind === "video");
    if (sender) await sender.replaceTrack(track);
  }

  async function switchCamera() {
    if (!call || call.type !== "video" || sharingScreen) return;
    const nextFacing = cameraFacing === "user" ? "environment" : "user";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: nextFacing } } });
      const nextTrack = stream.getVideoTracks()[0]; const currentTrack = localStreamRef.current?.getVideoTracks()[0];
      if (!nextTrack || !localStreamRef.current) return;
      await replaceOutgoingVideo(nextTrack); if (currentTrack) { localStreamRef.current.removeTrack(currentTrack); currentTrack.stop(); } localStreamRef.current.addTrack(nextTrack);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current; setCameraFacing(nextFacing); setCameraOff(false);
    } catch { alert("Could not switch camera on this device."); }
  }

  async function stopScreenShare() {
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
    if (cameraTrack) await replaceOutgoingVideo(cameraTrack);
    screenTrackRef.current?.stop(); screenTrackRef.current = null; setSharingScreen(false);
    if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
  }

  async function toggleScreenShare() {
    if (sharingScreen) return void stopScreenShare();
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); const track = display.getVideoTracks()[0];
      if (!track) return; await replaceOutgoingVideo(track); screenTrackRef.current = track; track.onended = () => void stopScreenShare(); setSharingScreen(true);
      if (localVideoRef.current) localVideoRef.current.srcObject = display;
    } catch {}
  }

  async function togglePictureInPicture() {
    if (callMinimized) { if (document.pictureInPictureElement) await document.exitPictureInPicture(); setCallMinimized(false); return; }
    const video = remoteVideoRef.current;
    if (video?.requestPictureInPicture && video.readyState > 0) { try { await video.requestPictureInPicture(); } catch {} }
    setCallMinimized(true);
  }

  const filteredPeople = people.filter((person) => `${person.name} ${person.email}`.toLowerCase().includes(search.toLowerCase()));
  const selectedOnline = selected ? online.has(selected.id) : false;
  const callDuration = `${String(Math.floor(callSeconds / 60)).padStart(2, "0")}:${String(callSeconds % 60).padStart(2, "0")}`;

  return <section className="chat-shell rich-chat">
    <aside className="people-panel">
      <div className="chat-sidebar-head"><div><p>Messages</p><h2>Chats</h2></div><span className="avatar">{currentUser.name[0]}</span></div>
      <label className="chat-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" /></label>
      <div className="conversation-tabs"><button className="active">Chats</button><button onClick={() => document.querySelector(".call-history")?.scrollIntoView()}>Calls</button></div>
      <div className="people-list">{filteredPeople.map((person) => <button key={person.id} className={`person-row ${selected?.id === person.id ? "active" : ""}`} onClick={() => { setActivity(""); setSelected(person); }}><span className="avatar presence-avatar">{person.name[0].toUpperCase()}<i className={online.has(person.id) ? "online" : ""} /></span><span><strong>{person.name}</strong><small>{online.has(person.id) ? "Online" : person.lastSeen ? `Last seen ${new Date(person.lastSeen).toLocaleDateString()}` : "Start a conversation"}</small></span></button>)}</div>
      <div className="call-history"><h3>Recent calls</h3>{callHistory.slice(0, 5).map((item) => <div key={item.id}><span>{item.type === "video" ? <Video size={15} /> : <Phone size={15} />}</span><p>{people.find((person) => person.id === item.peerId)?.name ?? "Contact"}<small>{item.status} · {new Date(item.startedAt).toLocaleDateString()}</small></p></div>)}</div>
    </aside>
    <div className="conversation-panel">
      {selected ? <>
        <header className="conversation-header rich-header"><div className="chat-person"><span className="avatar presence-avatar">{selected.name[0]}<i className={selectedOnline ? "online" : ""} /></span><div><h3>{selected.name}</h3><span>{activity || (selectedOnline ? "Online" : selected.lastSeen ? `Last seen ${new Date(selected.lastSeen).toLocaleString()}` : "Offline")}</span></div></div><div className="header-actions"><button onClick={() => startCall("voice")} title="Voice call"><Phone /></button><button onClick={() => startCall("video")} title="Video call"><Video /></button><button title="Conversation details"><MoreVertical /></button></div></header>
        <div className="message-list rich-message-list">
          <div className="date-divider"><span>Today</span></div>
          {messages.map((message) => <div key={message.id} className={`message-wrap ${message.senderId === currentUser.id ? "mine" : "theirs"}`}>
            <div className={`message rich-message ${message.senderId === currentUser.id ? "mine" : "theirs"}`}>
              {!message.deletedForEveryone && message.attachments?.map((attachment) => attachment.mime.startsWith("image/") ? <img key={attachment.url} src={attachment.url} alt={attachment.name} className="message-media" /> : attachment.mime.startsWith("video/") ? <video key={attachment.url} src={attachment.url} controls className="message-media" /> : attachment.mime.startsWith("audio/") ? <audio key={attachment.url} src={attachment.url} controls /> : <a key={attachment.url} href={attachment.url} download className="document-message"><FileIcon size={20} /><span>{attachment.name}<small>{Math.ceil(attachment.size / 1024)} KB</small></span></a>)}
              {message.type === "gif" && <img src={message.body} alt="GIF" className="message-media" />}
              {message.type === "sticker" ? <span className="sticker-message">{message.body}</span> : message.location ? <a className="location-message" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${message.location.latitude},${message.location.longitude}`}><MapPin /> Open shared location</a> : message.type !== "gif" && message.body && <p className={/^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\u200d|\ufe0f|\s)+$/u.test(message.body) ? "emoji-only-message" : undefined}>{message.body}</p>}
              <div className="message-foot">{message.editedAt && <span>edited</span>}<time>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>{message.senderId === currentUser.id && <span className={`receipt ${message.status}`}>{message.status === "sent" ? <Check /> : <CheckCheck />}</span>}</div>
              <button className="message-menu-button" onClick={() => setActiveMenu(activeMenu === message.id ? null : message.id)}><MoreVertical size={15} /></button>
              {activeMenu === message.id && <div className="message-menu"><div className="reaction-row">{reactionOptions.map((emoji) => <button key={emoji} onClick={() => changeMessage(message.id, { action: "react", emoji })}>{emoji}</button>)}</div><button onClick={() => navigator.clipboard.writeText(message.body)}><Copy /> Copy</button>{message.senderId === currentUser.id && !message.deletedForEveryone && <button onClick={() => { setEditingId(message.id); setComposer(message.body); setActiveMenu(null); }}><Sparkles /> Edit</button>}<button onClick={() => changeMessage(message.id, { action: "deleteMe" })}><Trash2 /> Delete for me</button>{message.senderId === currentUser.id && <button onClick={() => changeMessage(message.id, { action: "deleteEveryone" })}><Trash2 /> Delete for everyone</button>}</div>}
            </div>
            {Object.entries(message.reactions ?? {}).filter(([, users]) => users.length).map(([emoji, users]) => <button key={emoji} className="reaction-pill" onClick={() => changeMessage(message.id, { action: "react", emoji })}>{emoji} {users.length}</button>)}
          </div>)}
          {activity && <div className="typing-bubble"><i /><i /><i /></div>}<div ref={messagesEndRef} />
        </div>
        {editingId && <div className="editing-banner"><Sparkles size={15} /> Editing message<button onClick={() => { setEditingId(null); setComposer(""); }}><X /></button></div>}
        <form className="message-form rich-composer" onSubmit={submit}>
          <div className="composer-tools"><button type="button" onClick={() => setPicker(picker === "attach" ? null : "attach")} title="Attach"><Paperclip /></button><button type="button" onClick={() => setPicker(picker === "emoji" ? null : "emoji")} title="Emoji"><Smile /></button></div>
          <input value={composer} onChange={(event) => type(event.target.value)} placeholder={`Message ${selected.name}`} aria-label="Message" />
          <button type="button" className={`record-button ${recording ? "recording" : ""}`} onClick={toggleRecording} title="Voice message">{recording ? <Clock3 /> : <Mic />}</button>
          <button className="send-button" aria-label="Send message" disabled={uploading}>{uploading ? <Clock3 /> : <Send />}</button>
          {picker && <div className="composer-popover">
            {picker === "emoji" && <div className="emoji-picker-wrap"><EmojiPicker theme={Theme.LIGHT} width="100%" height={390} lazyLoadEmojis searchPlaceHolder="Search emoji" previewConfig={{ showPreview: false }} onEmojiClick={addEmoji} />{pickedEmoji && <span className="picked-emoji" aria-hidden="true">{pickedEmoji}</span>}</div>}
            {picker === "sticker" && <div className="sticker-grid">{stickers.map((sticker) => <button type="button" key={sticker} onClick={() => { void send({ type: "sticker", body: sticker }); setPicker(null); }}>{sticker}</button>)}</div>}
            {picker === "gif" && <div className="gif-grid">{gifs.map((gif) => <button type="button" key={gif} onClick={() => { void send({ type: "gif", body: gif }); setPicker(null); }}><img src={gif} alt="Send GIF" /></button>)}</div>}
            {picker === "attach" && <div className="attach-grid"><button type="button" onClick={() => fileInputRef.current?.click()}><ImageIcon /> Photos & files</button><button type="button" onClick={() => cameraInputRef.current?.click()}><Film /> Camera</button><button type="button" onClick={shareLocation}><MapPin /> Location</button><button type="button" onClick={() => setPicker("gif")}><Sparkles /> GIFs</button><button type="button" onClick={() => setPicker("sticker")}><Smile /> Stickers</button></div>}
          </div>}
          <input ref={fileInputRef} type="file" multiple hidden onChange={(event) => void upload(Array.from(event.target.files ?? []))} />
          <input ref={cameraInputRef} type="file" accept="image/*,video/*" capture="environment" hidden onChange={(event) => void upload(Array.from(event.target.files ?? []))} />
        </form>
      </> : <div className="conversation-empty"><span>Your conversations</span><p>Accept a connection request to start chatting.</p></div>}
    </div>
    {call && <div className={`call-overlay ${call.type} ${call.incoming ? "incoming" : "active-call"} ${callMinimized ? "minimized" : ""}`} role="dialog" aria-label={`${call.type} call with ${call.peer.name}`}>
      <div className="call-topbar"><span>{call.type === "video" ? <Video /> : <Phone />}{call.type === "video" ? "Pairly video call" : "Pairly voice call"}</span><div className={`quality-indicator ${networkState === "online" ? callQuality.toLowerCase() : networkState}`}>{networkState === "offline" ? <WifiOff /> : <Wifi />}<span>{networkState === "reconnecting" ? "Reconnecting" : networkState === "offline" ? "Offline" : callQuality}</span></div><strong>{call.connectedAt ? callDuration : "End-to-end encrypted"}</strong></div>
      <div className="remote-stage"><video ref={remoteVideoRef} autoPlay playsInline /><div className="call-placeholder"><span className="call-avatar">{call.peer.name[0].toUpperCase()}</span><h2>{call.peer.name}</h2><p>{call.status}</p>{!call.connectedAt && !call.incoming && <span className="ringing-dots"><i /><i /><i /></span>}</div></div>
      {call.type === "video" && <video className={`local-video ${cameraOff ? "camera-off" : ""}`} ref={localVideoRef} autoPlay playsInline muted />}
      {!call.incoming && <div className="call-utilities"><button onClick={togglePictureInPicture} title={callMinimized ? "Expand call" : "Minimize call"}>{callMinimized ? <Maximize2 /> : <Minimize2 />}</button>{call.type === "video" && <button onClick={switchCamera} disabled={sharingScreen} title="Switch camera"><SwitchCamera /></button>}</div>}
      {callMinimized ? <div className="mini-call"><span className="call-avatar">{call.peer.name[0].toUpperCase()}</span><p><strong>{call.peer.name}</strong><small>{call.connectedAt ? callDuration : call.status}</small></p><button onClick={togglePictureInPicture} title="Expand call"><Maximize2 /></button><button className="mini-end" onClick={() => stopCall()} title="End call"><PhoneOff /></button></div> : call.incoming ? <div className="incoming-actions"><p>{call.type === "video" ? "Incoming video call" : "Incoming voice call"}</p><div><button className="end-call" onClick={() => stopCall(true, "declined")} aria-label="Decline call"><PhoneOff /></button><button className="accept-call" onClick={acceptCall} aria-label="Accept call">{call.type === "video" ? <Video /> : <Phone />}</button></div><span>Decline <b>Accept</b></span></div> : <div className="call-controls"><button className={muted ? "control-off" : ""} onClick={() => toggleTrack("audio")} title={muted ? "Unmute" : "Mute"}>{muted ? <MicOff /> : <Mic />}<span>{muted ? "Unmute" : "Mute"}</span></button><button className={speaker ? "control-on" : ""} onClick={toggleSpeaker} title="Speaker">{speaker ? <Volume2 /> : <VolumeX />}<span>Speaker</span></button>{call.type === "video" && <button className={sharingScreen ? "control-on" : ""} onClick={toggleScreenShare} title={sharingScreen ? "Stop sharing" : "Share screen"}>{sharingScreen ? <ScreenShareOff /> : <ScreenShare />}<span>{sharingScreen ? "Stop share" : "Share"}</span></button>}{call.type === "video" && <button className={cameraOff ? "control-off" : ""} onClick={() => toggleTrack("video")} title="Camera">{cameraOff ? <VideoOff /> : <Video />}<span>Camera</span></button>}<button className="hangup" onClick={() => stopCall()} title="End call"><PhoneOff /><span>End</span></button></div>}
    </div>}
  </section>;
}